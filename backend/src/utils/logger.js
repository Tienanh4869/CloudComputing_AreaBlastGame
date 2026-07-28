// src/utils/logger.js — Winston logger with structured output
const winston = require('winston');
const { NODE_ENV } = require('../config/env');

const { combine, timestamp, colorize, printf, json } = winston.format;

// Custom format for development
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

// JSON format for production (for Azure Monitor ingestion)
const prodFormat = combine(timestamp(), json());

const logger = winston.createLogger({
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  format: NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
  ],
});

// Log important game events with structured data
logger.gameEvent = (event, data = {}) => {
  logger.info(`[GAME_EVENT] ${event}`, { event, ...data });
};

module.exports = logger;
