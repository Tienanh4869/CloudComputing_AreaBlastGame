const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ProcessedEvent = sequelize.define(
  'ProcessedEvent',
  {
    event_id: {
      type: DataTypes.STRING(160),
      primaryKey: true,
    },

    event_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },

    processed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'processed_events',
    timestamps: false,
  }
);

module.exports = ProcessedEvent;