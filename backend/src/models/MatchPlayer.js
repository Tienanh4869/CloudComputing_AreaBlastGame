// src/models/MatchPlayer.js — Player stats per match
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MatchPlayer = sequelize.define('MatchPlayer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  match_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'matches', key: 'id' },
  },
  player_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'players', key: 'id' },
  },
  score:  { type: DataTypes.INTEGER, defaultValue: 0 },
  kills:  { type: DataTypes.INTEGER, defaultValue: 0 },
  deaths: { type: DataTypes.INTEGER, defaultValue: 0 },
  // Rank in this match (1 = winner)
  rank:   { type: DataTypes.INTEGER, allowNull: true },
  joined_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  left_at:   { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'match_players',
});

module.exports = MatchPlayer;
