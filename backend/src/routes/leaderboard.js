// src/routes/leaderboard.js — Leaderboard routes
const router = require('express').Router();
const { LeaderboardScore, Player, User } = require('../models');
const { authenticate } = require('../middleware/auth');
const { cache } = require('../config/redis');

// GET /api/leaderboard — Top players
router.get('/', async (req, res, next) => {
  try {
    const { period = 'all_time', limit = 20 } = req.query;

    // Check Redis cache first (5 minute TTL)
    const cacheKey = `leaderboard:${period}:${limit}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json({ leaderboard: cached, cached: true });
    }

    // Query top players directly from Player table
    const players = await Player.findAll({
      attributes: ['id', 'nickname', 'avatar_color', 'total_score', 'kills', 'wins'],
      include: [{
        model: User,
        as: 'user',
        attributes: ['username'],
      }],
      order: [['total_score', 'DESC']],
      limit: parseInt(limit),
    });

    // Format to match old leaderboard structure
    const ranked = players.map((player, index) => ({
      id: player.id, // Mock leaderboard entry ID
      period: period,
      score: player.total_score,
      kills: player.kills,
      rank: index + 1,
      player: {
        nickname: player.nickname,
        avatar_color: player.avatar_color,
        kills: player.kills,
        wins: player.wins,
        user: player.user
      }
    }));

    // Cache for 5 minutes
    await cache.set(cacheKey, ranked, 300);

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
