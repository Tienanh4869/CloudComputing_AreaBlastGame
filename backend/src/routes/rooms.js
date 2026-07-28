// src/routes/rooms.js — Room/Lobby management routes
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { Room, User, Player } = require('../models');
const { authenticate } = require('../middleware/auth');
const { generateRoomCode } = require('../utils/helpers');
const { Op } = require('sequelize');

// GET /api/rooms — List available rooms
router.get('/', authenticate, async (req, res, next) => {
  try {
    const rooms = await Room.findAll({
      where: { status: { [Op.in]: ['waiting', 'playing'] } },
      include: [{ model: User, as: 'creator', attributes: ['username'] }],
      order: [['created_at', 'DESC']],
      limit: 20,
    });
    res.json({ rooms });
  } catch (err) { next(err); }
});

// POST /api/rooms — Create new room
router.post('/',
  authenticate,
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Room name: 2-100 chars'),
    body('max_players').optional().isInt({ min: 2, max: 8 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { name, max_players = 4 } = req.body;
      const code = generateRoomCode();

      const room = await Room.create({
        name,
        code,
        max_players,
        created_by: req.user.id,
        player_count: 0,
      });

      res.status(201).json({ room });
    } catch (err) { next(err); }
  }
);

// GET /api/rooms/:id — Get room details
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const room = await Room.findByPk(req.params.id, {
      include: [{ model: User, as: 'creator', attributes: ['username'] }],
    });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ room });
  } catch (err) { next(err); }
});

// GET /api/rooms/code/:code — Find room by code
router.get('/code/:code', authenticate, async (req, res, next) => {
  try {
    const room = await Room.findOne({
      where: { code: req.params.code.toUpperCase() },
    });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ room });
  } catch (err) { next(err); }
});

module.exports = router;
