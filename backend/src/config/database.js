// src/config/database.js — Sequelize PostgreSQL connection
const { Sequelize } = require('sequelize');
const { DB, NODE_ENV } = require('./env');
const logger = require('../utils/logger');

const sequelize = new Sequelize(DB.name, DB.user, DB.password, {
  host: DB.host,
  port: DB.port,
  dialect: 'postgres',
  logging: NODE_ENV === 'development' ? (msg) => logger.debug(msg) : false,
  pool: {
    max: 10,
    min: 2,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    underscored: true,        // Use snake_case column names
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
});

// Test connection
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    logger.info('[DB] PostgreSQL connected successfully');
  } catch (error) {
    logger.error('[DB] Connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
