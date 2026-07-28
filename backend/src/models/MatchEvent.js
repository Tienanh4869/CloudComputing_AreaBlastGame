// src/models/MatchEvent.js — Event log for each match (for event-driven arch demo)
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MatchEvent = sequelize.define('MatchEvent', {
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
  // Event types: player_joined | player_left | particle_collected |
  //              player_hit | player_died | match_started | match_ended | score_updated
  event_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  // Player who triggered the event
  player_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'players', key: 'id' },
  },
  // Target player (for hit/kill events)
  target_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'players', key: 'id' },
  },
  // Extra data (score, position, etc.) as JSON
  data: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
}, {
  tableName: 'match_events',
  updatedAt: false,     // Events are immutable, no need for updatedAt
});

module.exports = MatchEvent;
