// src/models/Match.js — Match record model
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Match = sequelize.define('Match', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  room_id: {
    type: DataTypes.UUID,
    references: { model: 'rooms', key: 'id' },
  },
  // Status: playing → finished
  status: {
    type: DataTypes.ENUM('playing', 'finished'),
    defaultValue: 'playing',
  },
  started_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  ended_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  winner_id: {
    type: DataTypes.UUID,
    allowNull: true,        // null = draw or ongoing
    references: { model: 'players', key: 'id' },
  },
  duration_seconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  player_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'matches',
});

module.exports = Match;
