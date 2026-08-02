// src/routes/admin.js — Admin-only routes
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { User, Player, Room, Match, MatchPlayer, LeaderboardScore } = require('../models');
const {
  getAppConfigurationStatus,
  refreshAppConfiguration,
} = require('../config/appConfiguration');
const logger = require('../utils/logger');

// All admin routes require authentication + admin role
router.use(authenticate, requireRole('admin'));

// GET /api/admin/config - Show the active dynamic gameplay configuration
router.get('/config', (req, res) => {
  res.json({ appConfiguration: getAppConfigurationStatus() });
});

// POST /api/admin/config/refresh - Pull the latest value from Azure on demand
router.post('/config/refresh', async (req, res) => {
  try {
    const result = await refreshAppConfiguration();
    res.json({
      message: 'Azure App Configuration refreshed successfully',
      changed: result.changed,
      appConfiguration: result.status,
    });
  } catch (error) {
    logger.error('[Admin] App Configuration refresh failed', {
      code: error.code,
      error: error.message,
    });
    res.status(503).json({
      code: error.code || 'APPCONFIG_REFRESH_FAILED',
      error: error.message,
      appConfiguration: getAppConfigurationStatus(),
    });
  }
});

// GET /api/admin/users — List all users
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password_hash'] },
      include: [{ model: Player, as: 'profile', attributes: ['nickname', 'total_score'] }],
      order: [['created_at', 'DESC']],
    });
    res.json({ users });
  } catch (err) { next(err); }
});

// GET /api/admin/rooms — List all rooms
router.get('/rooms', async (req, res, next) => {
  try {
    const rooms = await Room.findAll({
      include: [{ model: User, as: 'creator', attributes: ['username'] }],
      order: [['created_at', 'DESC']],
    });
    res.json({ rooms });
  } catch (err) { next(err); }
});

// GET /api/admin/matches — List all matches
router.get('/matches', async (req, res, next) => {
  try {
    const matches = await Match.findAll({
      include: [
        {
          model: MatchPlayer,
          as: 'matchPlayers',
          include: [{ model: Player, as: 'player', attributes: ['nickname'] }],
        },
        { model: Player, as: 'winner', attributes: ['nickname'] },
      ],
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    res.json({ matches });
  } catch (err) { next(err); }
});

// GET /api/admin/stats — Dashboard stats
router.get('/stats', async (req, res, next) => {
  try {
    const [totalUsers, totalPlayers, totalRooms, totalMatches] = await Promise.all([
      User.count(),
      Player.count(),
      Room.count(),
      Match.count(),
    ]);

    res.json({
      stats: { totalUsers, totalPlayers, totalRooms, totalMatches },
      timestamp: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// POST /api/admin/seed — Run seed data (for demo purposes)
router.post('/seed', async (req, res, next) => {
  try {
    // Try to import seed from project root database folder
    const seedPath = require('path').join(__dirname, '../../../database/seed');
    const { seedData } = require(seedPath);
    await seedData();
    logger.info('[Admin] Seed data executed');
    res.json({ message: 'Seed data inserted successfully' });
  } catch (err) {
    logger.warn('[Admin] Seed failed:', err.message);
    res.status(500).json({ error: 'Seed failed: ' + err.message });
  }
});

// DELETE /api/admin/rooms/:id — Delete a room
router.delete('/rooms/:id', async (req, res, next) => {
  try {
    const room = await Room.findByPk(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status === 'playing') {
      return res.status(400).json({ error: 'Cannot delete a room that is currently playing' });
    }
    await room.destroy();
    res.json({ message: 'Room deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
