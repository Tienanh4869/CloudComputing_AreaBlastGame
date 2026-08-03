// src/routes/leaderboard.js — Leaderboard routes
const router = require('express').Router();
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { LeaderboardScore, Player, User } = require('../models');
const { authenticate } = require('../middleware/auth');
const { cache } = require('../config/redis');
const { QUEST_DEFINITIONS } = require('../utils/dailyQuests');

const ALLOWED_PERIODS = new Set([
  'all_time',
  'weekly',
  'daily',
]);

const QUEST_REWARDS = Object.fromEntries(
  QUEST_DEFINITIONS.map((quest) => [
    quest.code,
    Number(quest.reward) || 0,
  ])
);

// GET /api/leaderboard — Top players
router.get('/', async (req, res, next) => {
  try {
    const period = req.query.period || 'all_time';
    const requestedLimit = Number.parseInt(req.query.limit, 10);

    const safeLimit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 20;

    if (!ALLOWED_PERIODS.has(period)) {
      return res.status(400).json({
        error: 'Invalid leaderboard period',
        allowedPeriods: Array.from(ALLOWED_PERIODS),
      });
    }

    // Check Redis cache first (5 minute TTL)
    const cacheKey = `leaderboard:v2:${period}:${safeLimit}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json({ leaderboard: cached, cached: true });
    }

    // Query top players directly from Player table
  let ranked;

  if (period === 'all_time') {
    const players = await Player.findAll({
      attributes: [
        'id',
        'nickname',
        'avatar_color',
        'total_score',
        'kills',
        'wins',
      ],
      include: [{
        model: User,
        as: 'user',
        attributes: ['username'],
      }],
      order: [
        ['total_score', 'DESC'],
        ['kills', 'DESC'],
        ['nickname', 'ASC'],
      ],
      limit: safeLimit,
    });

    ranked = players.map((player, index) => ({
      id: player.id,
      period,
      score: player.total_score,
      kills: player.kills,
      wins: player.wins,
      rank: index + 1,
      player: {
        nickname: player.nickname,
        avatar_color: player.avatar_color,
        kills: player.kills,
        wins: player.wins,
        user: player.user,
      },
    }));
  } else {
    const rows = await sequelize.query(
      `
        WITH local_now AS (
          SELECT
            CURRENT_TIMESTAMP AT TIME ZONE
              'Asia/Ho_Chi_Minh' AS value
        ),

        bounds AS (
          SELECT
            CASE
              WHEN :period = 'daily'
                THEN date_trunc('day', value)
              ELSE date_trunc('week', value)
            END AS start_local,

            CASE
              WHEN :period = 'daily'
                THEN date_trunc('day', value)
                  + INTERVAL '1 day'
              ELSE date_trunc('week', value)
                  + INTERVAL '1 week'
            END AS end_local
          FROM local_now
        ),

        activity AS (
          SELECT
            mp.player_id,
            SUM(mp.score) AS score,
            SUM(mp.kills) AS kills,
            COUNT(*) FILTER (WHERE mp.rank = 1) AS wins
          FROM match_players AS mp
          INNER JOIN matches AS m
            ON m.id = mp.match_id
          CROSS JOIN bounds AS b
          WHERE m.status = 'finished'
            AND m.ended_at >= (
              b.start_local AT TIME ZONE
                'Asia/Ho_Chi_Minh'
            )
            AND m.ended_at < (
              b.end_local AT TIME ZONE
                'Asia/Ho_Chi_Minh'
            )
          GROUP BY mp.player_id

          UNION ALL

          SELECT
            q.player_id,

            SUM(
              CASE q.quest_code
                WHEN 'DAILY_LOGIN' THEN :loginReward
                WHEN 'DAILY_KILL_5' THEN :killReward
                WHEN 'DAILY_PLAY_30_MIN' THEN :playReward
                ELSE 0
              END
            ) AS score,

            0 AS kills,
            0 AS wins

          FROM daily_quest_progress AS q
          CROSS JOIN bounds AS b
          WHERE q.completed = TRUE
            AND q.quest_date >= b.start_local::date
            AND q.quest_date < b.end_local::date
          GROUP BY q.player_id
        ),

        totals AS (
          SELECT
            player_id,
            SUM(score) AS score,
            SUM(kills) AS kills,
            SUM(wins) AS wins
          FROM activity
          GROUP BY player_id
        )

        SELECT
          p.id AS player_id,
          p.nickname,
          p.avatar_color,
          u.username,
          totals.score,
          totals.kills,
          totals.wins

        FROM totals
        INNER JOIN players AS p
          ON p.id = totals.player_id
        INNER JOIN users AS u
          ON u.id = p.user_id

        ORDER BY
          totals.score DESC,
          totals.kills DESC,
          p.nickname ASC

        LIMIT :limit
      `,
      {
        replacements: {
          period,
          limit: safeLimit,
          loginReward:
            QUEST_REWARDS.DAILY_LOGIN || 0,
          killReward:
            QUEST_REWARDS.DAILY_KILL_5 || 0,
          playReward:
            QUEST_REWARDS.DAILY_PLAY_30_MIN || 0,
        },
        type: QueryTypes.SELECT,
      }
    );

    ranked = rows.map((row, index) => ({
      id: row.player_id,
      period,
      score: Number(row.score) || 0,
      kills: Number(row.kills) || 0,
      wins: Number(row.wins) || 0,
      rank: index + 1,
      player: {
        nickname: row.nickname,
        avatar_color: row.avatar_color,
        kills: Number(row.kills) || 0,
        wins: Number(row.wins) || 0,
        user: {
          username: row.username,
        },
      },
    }));
  }

    // Cache for 30 seconds
    await cache.set(cacheKey, ranked, 30);

    res.json({ leaderboard: ranked, cached: false });
  } catch (err) { next(err); }
});

// GET /api/leaderboard/me — Current player's rank
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const player = await Player.findOne({ where: { user_id: req.user.id } });
    if (!player) return res.status(404).json({ error: 'Player profile not found' });

    const score = await LeaderboardScore.findOne({
      where: { player_id: player.id, period: 'all_time' },
    });

    res.json({
      player: player.toJSON(),
      leaderboard: score?.toJSON() || null,
    });
  } catch (err) { next(err); }
});

module.exports = router;
