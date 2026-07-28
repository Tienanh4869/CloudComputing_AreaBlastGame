// src/models/LeaderboardScore.js — Aggregated leaderboard
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LeaderboardScore = sequelize.define('LeaderboardScore', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  player_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'players', key: 'id' },
  },
  score: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  rank: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Period: all_time | daily | weekly
  period: {
    type: DataTypes.ENUM('all_time', 'daily', 'weekly'),
    defaultValue: 'all_time',
  },
  kills:  { type: DataTypes.INTEGER, defaultValue: 0 },
  wins:   { type: DataTypes.INTEGER, defaultValue: 0 },
}, {
  tableName: 'leaderboard_scores',
  indexes: [
    { fields: ['period', 'score'] },        // Fast leaderboard query
    { unique: true, fields: ['player_id', 'period'] },
  ],
});

module.exports = LeaderboardScore;
