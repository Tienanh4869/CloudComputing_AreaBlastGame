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

    const leaderboard = await LeaderboardScore.findAll({
      where: { period },
      include: [{
        model: Player,
        as: 'player',
        attributes: ['nickname', 'avatar_color', 'kills', 'wins'],
        include: [{
          model: User,
          as: 'user',
          attributes: ['username'],
        }],
      }],
      order: [['score', 'DESC']],
      limit: parseInt(limit),
    });

    // Update ranks
    const ranked = leaderboard.map((entry, index) => ({
      ...entry.toJSON(),
      rank: index + 1,
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
