// src/routes/auth.js — Authentication routes
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const { generateId } = require('../utils/helpers');
const { User, Player } = require('../models');
const { signToken, authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const { BlobServiceClient } = require('@azure/storage-blob');
const ENV = require('../config/env');

// Input validation rules
const registerRules = [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username: 3-50 chars'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password: min 6 chars'),
  body('nickname').trim().isLength({ min: 2, max: 30 }).withMessage('Nickname: 2-30 chars'),
];

const loginRules = [
  body('username').trim().notEmpty(),
  body('password').notEmpty(),
];

// POST /api/auth/register
router.post('/register', registerRules, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { username, email, password, nickname, avatar_url, weapon_url } = req.body;

    // Check if nickname is taken (separate from username)
    const existingNick = await Player.findOne({ where: { nickname } });
    if (existingNick) {
      return res.status(409).json({ error: 'Nickname already taken' });
    }

    // Create user (password hashed via model hook)
    const user = await User.create({
      username,
      email,
      password_hash: password,  // Hook will hash this
    });

    // Create player profile
    const colors = ['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    const player = await Player.create({
      user_id: user.id,
      nickname,
      avatar_color: req.body.avatar_color || avatarColor,
      avatar_url: avatar_url || null,
      weapon_url: weapon_url || null,
    });

    const token = signToken(user.id);

    logger.info('[Auth] New user registered', { username, userId: user.id });

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: user.toSafeJSON(),
      player: player.toJSON(),
    });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', loginRules, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed' });
    }

    const { username, password } = req.body;

    const user = await User.findOne({ where: { username } });
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await user.validatePassword(password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Load player profile
    const player = await Player.findOne({ where: { user_id: user.id } });

    const token = signToken(user.id);
    logger.info('[Auth] User logged in', { username, userId: user.id });

    res.json({
      message: 'Login successful',
      token,
      user: user.toSafeJSON(),
      player: player?.toJSON() || null,
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me — Get current user
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const player = await Player.findOne({ where: { user_id: req.user.id } });
    res.json({
      user: req.user.toSafeJSON ? req.user.toSafeJSON() : req.user,
      player: player?.toJSON() || null,
    });
  } catch (err) { next(err); }
});

// PUT /api/auth/profile — Update user profile
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { avatar_url, weapon_url } = req.body;
    const player = await Player.findOne({ where: { user_id: req.user.id } });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    
    player.avatar_url = avatar_url || null;
    player.weapon_url = weapon_url || null;
    await player.save();

    res.json({ player: player.toJSON() });
  } catch (err) { next(err); }
});

// POST /api/auth/logout — Client-side logout (JWT is stateless)
router.post('/logout', authenticate, (req, res) => {
  // JWT is stateless — logout is handled client-side by deleting the token
  // In production: add token to a Redis blacklist
  logger.info('[Auth] User logged out', { userId: req.user.id });
  res.json({ message: 'Logged out successfully' });
});

// POST /api/auth/upload — Upload base64 image and return URL
router.post('/upload', async (req, res, next) => {
  try {
    const { imageBase64, type } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Missing imageBase64 data' });

    // Ensure it's an image
    const matches = imageBase64.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 image data string' });
    }

    const extension = matches[1];
    const data = Buffer.from(matches[2], 'base64');
    
    // File size check (e.g., 2MB)
    if (data.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 2MB limit' });
    }

    const fileName = `${generateId()}.${extension}`;
    
    // Azure Blob Storage Fallback Logic
    let fileUrl = '';
    if (ENV.AZURE_STORAGE_CONNECTION_STRING) {
      try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(ENV.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient('arenablast-uploads');
        // Create container if it doesn't exist (no public access required at container level)
        await containerClient.createIfNotExists();
        
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        // Upload data with correct content type
        await blockBlobClient.uploadData(data, {
          blobHTTPHeaders: { blobContentType: `image/${extension}` }
        });
        // Trả về trực tiếp đường link Public của ảnh trên Azure
        fileUrl = blockBlobClient.url;
        logger.info('[Upload] File uploaded to Azure Blob', { fileName });
      } catch (azureErr) {
        logger.error('[Upload] Azure Blob upload failed', azureErr);
        return res.status(500).json({ error: 'Failed to upload to cloud storage' });
      }
    } else {
      // Fallback to local storage
      const uploadPath = path.join(__dirname, '..', '..', 'uploads', fileName);
      fs.writeFileSync(uploadPath, data);
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      fileUrl = `${protocol}://${host}/uploads/${fileName}`;
      logger.info('[Upload] File saved locally (Fallback)', { fileName });
    }

    res.json({ url: fileUrl });
  } catch (err) { next(err); }
});

module.exports = router;
