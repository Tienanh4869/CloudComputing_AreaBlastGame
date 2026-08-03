// src/routes/rooms.js — Room/Lobby management routes
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { Room, User, Player } = require('../models');
const { authenticate } = require('../middleware/auth');
const { generateRoomCode } = require('../utils/helpers');
const { Op } = require('sequelize');

// GET /api/rooms — List available rooms with pagination and search
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    const whereClause = { status: { [Op.in]: ['waiting', 'playing'] } };
    if (search) {
      whereClause.name = { [Op.iLike]: `%${search}%` };
    }

    const { count, rows: rooms } = await Room.findAndCountAll({
      where: whereClause,
      include: [{ model: User, as: 'creator', attributes: ['username'] }],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    res.json({
      rooms,
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    });
  } catch (err) { next(err); }
});

// POST /api/rooms — Create new room
router.post('/',
  authenticate,
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Room name: 2-100 chars'),
    body('max_players').optional().isInt({ min: 2, max: 50 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { name, max_players = 4 } = req.body;
      
      const { moderateText } = require('../services/contentSafetyService');
      const { isSafe } = await moderateText(name);
      if (!isSafe) {
        return res.status(400).json({ error: 'Tên phòng chứa từ ngữ không phù hợp.' });
      }

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

// POST /api/rooms/join — Validate join
router.post('/join',
  authenticate,
  [
    body('code').trim().isLength({ min: 6, max: 6 }).withMessage('Code must be 6 chars'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { code } = req.body;
      const room = await Room.findOne({
        where: { code: code.toUpperCase() },
      });

      if (!room) return res.status(404).json({ error: 'Room not found' });
      if (room.status === 'finished') return res.status(400).json({ error: 'Room has already ended' });
      if (room.player_count >= room.max_players) return res.status(400).json({ error: 'Room is full' });

      res.json({ success: true, room });
    } catch (err) { next(err); }
  }
);

module.exports = router;
