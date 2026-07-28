// src/middleware/auth.js — JWT authentication middleware
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * Verifies JWT token from Authorization header.
 * Attaches decoded user to req.user.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Load fresh user from DB (check if still active)
    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'username', 'email', 'role', 'is_active'],
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    logger.error('[Auth] Middleware error:', err.message);
    next(err);
  }
};

/**
 * Optional auth — attaches user if token present, but does not require it.
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();
  return authenticate(req, res, next);
};

/**
 * Sign a new JWT token
 */
const signToken = (userId) =>
  jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });

module.exports = { authenticate, optionalAuth, signToken };
