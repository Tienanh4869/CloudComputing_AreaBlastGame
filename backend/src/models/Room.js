// src/models/Room.js — Game room/lobby model
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Room = sequelize.define('Room', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  code: {
    type: DataTypes.STRING(6),
    allowNull: false,
    unique: true,         // Short joinable code like "AB1234"
  },
  // Status: waiting → playing → finished
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'waiting',
  },
  max_players: {
    type: DataTypes.INTEGER,
    defaultValue: 4,
    validate: { min: 2, max: 8 },
  },
  created_by: {
    type: DataTypes.UUID,
    references: { model: 'users', key: 'id' },
  },
  // Current player count (denormalized for quick listing)
  player_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'rooms',
});

module.exports = Room;
