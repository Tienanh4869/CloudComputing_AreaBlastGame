// src/config/redis.js — Redis client for game state cache
const { createClient } = require('redis');
const { REDIS } = require('./env');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
  const url = REDIS.password
    ? `redis://:${REDIS.password}@${REDIS.host}:${REDIS.port}`
    : `redis://${REDIS.host}:${REDIS.port}`;

  redisClient = createClient({ url });

  redisClient.on('error', (err) => logger.error('[Redis] Error:', err.message));
  redisClient.on('connect', () => logger.info('[Redis] Connected successfully'));
  redisClient.on('reconnecting', () => logger.warn('[Redis] Reconnecting...'));

  try {
    await redisClient.connect();
  } catch (err) {
    logger.warn('[Redis] Could not connect, running without Redis cache:', err.message);
    redisClient = null;
  }
};

const getRedis = () => redisClient;

// Simple cache helpers
const cache = {
  async get(key) {
    if (!redisClient) return null;
    try {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },

  async set(key, value, ttlSeconds = 60) {
    if (!redisClient) return;
    try {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch { /* silent fail */ }
  },

  async del(key) {
    if (!redisClient) return;
    try { await redisClient.del(key); } catch { /* silent */ }
  },

  async hSet(hash, field, value) {
    if (!redisClient) return;
    try {
      await redisClient.hSet(hash, field, JSON.stringify(value));
    } catch { /* silent */ }
  },

  async hGet(hash, field) {
    if (!redisClient) return null;
    try {
      const val = await redisClient.hGet(hash, field);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },

  async hGetAll(hash) {
    if (!redisClient) return {};
    try {
      const data = await redisClient.hGetAll(hash);
      return Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, JSON.parse(v)])
      );
    } catch { return {}; }
  },

  async hDel(hash, field) {
    if (!redisClient) return;
    try { await redisClient.hDel(hash, field); } catch { /* silent */ }
  },
};

module.exports = { connectRedis, getRedis, cache };
