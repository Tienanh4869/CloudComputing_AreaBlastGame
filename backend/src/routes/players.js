// src/routes/players.js — Player profile routes
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { Player, User } = require('../models');
const { authenticate } = require('../middleware/auth');
const { BlobServiceClient } = require('@azure/storage-blob');
const ENV = require('../config/env');
const { generateId } = require('../utils/helpers');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

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

// POST /api/players/avatar — Upload avatar to Azure Blob Storage
router.post('/avatar', authenticate, async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Missing imageBase64 data' });

    // Validate base64 image string
    const matches = imageBase64.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 image data string' });
    }

    const extension = matches[1];
    const data = Buffer.from(matches[2], 'base64');
    
    // File size check (max 2MB)
    if (data.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 2MB limit' });
    }

    const player = await Player.findOne({ where: { user_id: req.user.id } });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const fileName = `avatar_${player.id}_${generateId()}.${extension}`;
    let fileUrl = '';

    // Upload to Azure Blob Storage if configured
    if (ENV.AZURE_STORAGE_CONNECTION_STRING) {
      try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(ENV.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient('arenablast-uploads');
        await containerClient.createIfNotExists();
        
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        await blockBlobClient.uploadData(data, {
          blobHTTPHeaders: { blobContentType: `image/${extension}` }
        });
        
        fileUrl = blockBlobClient.url;
        logger.info('[Player] Avatar uploaded to Azure Blob Storage', { fileName });
      } catch (azureErr) {
        logger.error('[Player] Azure Blob upload failed', azureErr);
        return res.status(500).json({ error: 'Failed to upload to cloud storage' });
      }
    } else {
      // Fallback to local storage
      const uploadDir = path.join(__dirname, '..', '..', 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const uploadPath = path.join(uploadDir, fileName);
      fs.writeFileSync(uploadPath, data);
      
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      fileUrl = `${protocol}://${host}/uploads/${fileName}`;
      logger.info('[Player] Avatar saved locally (Fallback)', { fileName });
    }

    // Update database
    await player.update({ avatar_url: fileUrl });
    res.json({ message: 'Avatar updated successfully', player });
  } catch (err) { next(err); }
});

module.exports = router;
