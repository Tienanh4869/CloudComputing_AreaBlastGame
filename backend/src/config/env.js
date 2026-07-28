// src/config/env.js — Centralized environment config with validation
require('dotenv').config();

const required = (key) => {
  const val = process.env[key];
  if (!val) {
    console.warn(`[Config] Warning: ${key} is not set, using default.`);
  }
  return val;
};

module.exports = {
  // Server
  PORT: parseInt(process.env.PORT) || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD: process.env.NODE_ENV === 'production',

  // Database
  DB: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'arenablast',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  },

  // Redis
  REDIS: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-prod',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Game settings
  GAME: {
    tickRate: parseInt(process.env.GAME_TICK_RATE) || 30,
    mapWidth: parseInt(process.env.MAP_WIDTH) || 1200,
    mapHeight: parseInt(process.env.MAP_HEIGHT) || 800,
    particleCount: parseInt(process.env.PARTICLE_COUNT) || 30,
    playerSpeed: parseFloat(process.env.PLAYER_SPEED) || 2,
    playerHp: parseInt(process.env.PLAYER_HP) || 100,
    attackDamage: parseInt(process.env.ATTACK_DAMAGE) || 25,
    attackRange: parseInt(process.env.ATTACK_RANGE) || 60,
    particleScore: parseInt(process.env.PARTICLE_SCORE) || 10,
  },

  // Azure Application Insights
  APP_INSIGHTS_CONNECTION: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || null,

  // Azure Storage
  AZURE_STORAGE_CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING || null,
};
