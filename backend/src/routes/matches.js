// src/routes/matches.js — Match history routes
const router = require('express').Router();
const { Match, MatchPlayer, Player, Room, User } = require('../models');
const { authenticate } = require('../middleware/auth');
const { Op } = require('sequelize');

// GET /api/matches — Get match history (global or per player)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { playerId, limit = 20, page = 1 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { status: 'finished' };

    // If filtering by player, find matches they participated in
    if (playerId) {
      const playerMatchIds = await MatchPlayer.findAll({
        where: { player_id: playerId },
        attributes: ['match_id'],
        raw: true,
      }).then((rows) => rows.map((r) => r.match_id));

      whereClause.id = { [Op.in]: playerMatchIds };
    }

    const { count, rows: matches } = await Match.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: MatchPlayer,
          as: 'matchPlayers',
          include: [{ model: Player, as: 'player', attributes: ['nickname', 'avatar_color'] }],
        },
        { model: Player, as: 'winner', attributes: ['nickname'] },
        { model: Room, as: 'room', attributes: ['name', 'code'] },
      ],
      order: [['ended_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      matches,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
    });
  } catch (err) { next(err); }
});

// GET /api/matches/:id — Get single match details
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const match = await Match.findByPk(req.params.id, {
      include: [
        {
          model: MatchPlayer,
          as: 'matchPlayers',
          include: [{ model: Player, as: 'player', attributes: ['nickname', 'avatar_color'] }],
          order: [['score', 'DESC']],
        },
        { model: Player, as: 'winner', attributes: ['nickname', 'avatar_color'] },
        { model: Room, as: 'room', attributes: ['name', 'code'] },
      ],
    });
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json({ match });
  } catch (err) { next(err); }
});

// GET /api/matches/my/history — Current user's match history
router.get('/my/history', authenticate, async (req, res, next) => {
  try {
    const player = await Player.findOne({ where: { user_id: req.user.id } });
    if (!player) return res.status(404).json({ error: 'Player profile not found' });

    const matchPlayers = await MatchPlayer.findAll({
      where: { player_id: player.id },
      include: [{
        model: Match,
        include: [
          { model: Player, as: 'winner', attributes: ['nickname'] },
          { model: Room, as: 'room', attributes: ['name'] },
        ],
      }],
      order: [[Match, 'ended_at', 'DESC']],
      limit: 30,
    });

    res.json({
      matches: matchPlayers.map((mp) => ({
        ...mp.Match?.toJSON(),
        myStats: { score: mp.score, kills: mp.kills, deaths: mp.deaths, rank: mp.rank },
      })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
