// src/middleware/errorHandler.js — Global error handler
const logger = require('../utils/logger');

/**
 * Centralized error handler. Must be registered last in Express.
 */
const errorHandler = (err, req, res, next) => {
  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors.map((e) => ({ field: e.path, message: e.message })),
    });
  }

  // Sequelize unique constraint
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path || 'field';
    return res.status(409).json({
      error: 'Conflict',
      message: `${field} already exists`,
    });
  }

  // Known HTTP errors
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  // Unknown error — log and return 500
  logger.error('[ErrorHandler]', { message: err.message, stack: err.stack });
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
  });
};

/**
 * 404 handler for unknown routes
 */
const notFound = (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
};

module.exports = { errorHandler, notFound };
