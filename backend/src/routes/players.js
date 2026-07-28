// src/routes/players.js — Player profile routes
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { Player, User } = require('../models');
const { authenticate } = require('../middleware/auth');

// GET /api/players — List all players (public)
router.get('/', async (req, res, next) => {
  try {
    const players = await Player.findAll({
      include: [{ model: User, as: 'user', attributes: ['username'] }],
      order: [['total_score', 'DESC']],
      limit: 50,
    });
    res.json({ players });
  } catch (err) { next(err); }
});

// GET /api/players/:id — Get player by ID
router.get('/:id', async (req, res, next) => {
  try {
    const player = await Player.findByPk(req.params.id, {
      include: [{ model: User, as: 'user', attributes: ['username', 'created_at'] }],
    });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    res.json({ player });
  } catch (err) { next(err); }
});

// PUT /api/players/me/nickname — Update own nickname
router.put('/me/nickname',
  authenticate,
  [body('nickname').trim().isLength({ min: 2, max: 30 }).withMessage('Nickname: 2-30 chars')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { nickname } = req.body;
      const existing = await Player.findOne({ where: { nickname } });
      if (existing) return res.status(409).json({ error: 'Nickname already taken' });

      const player = await Player.findOne({ where: { user_id: req.user.id } });
      if (!player) return res.status(404).json({ error: 'Player profile not found' });

      await player.update({ nickname });
      res.json({ player });
    } catch (err) { next(err); }
  }
);

// PUT /api/players/me/color — Update avatar color
router.put('/me/color', authenticate, async (req, res, next) => {
  try {
    const { color } = req.body;
    if (!color || !/^#[0-9A-F]{6}$/i.test(color)) {
      return res.status(400).json({ error: 'Invalid color format (use #RRGGBB)' });
    }

    const player = await Player.findOne({ where: { user_id: req.user.id } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    await player.update({ avatar_color: color });
    res.json({ player });
  } catch (err) { next(err); }
});

module.exports = router;
