// src/models/Player.js — Player profile (game stats)
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Player = sequelize.define('Player', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,         // One player profile per user
    references: { model: 'users', key: 'id' },
  },
  nickname: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true,
    validate: { len: [2, 30] },
  },
  // Lifetime stats
  total_score: { type: DataTypes.INTEGER, defaultValue: 0 },
  wins:        { type: DataTypes.INTEGER, defaultValue: 0 },
  losses:      { type: DataTypes.INTEGER, defaultValue: 0 },
  kills:       { type: DataTypes.INTEGER, defaultValue: 0 },
  deaths:      { type: DataTypes.INTEGER, defaultValue: 0 },
  // Avatar color (hex) — simple color-based avatar, no file upload needed
  avatar_color: {
    type: DataTypes.STRING(7),
    defaultValue: '#4A90D9',
  },
  avatar_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  weapon_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: 'players',
});

module.exports = Player;
