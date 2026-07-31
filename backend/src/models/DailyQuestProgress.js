const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DailyQuestProgress = sequelize.define(
  'DailyQuestProgress',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    player_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'players',
        key: 'id',
      },
    },

    quest_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    quest_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },

    progress: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    target: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    unit: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },

    completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'daily_quest_progress',

    indexes: [
      {
        unique: true,
        name: 'uq_daily_quest_player_date_code',
        fields: [
          'player_id',
          'quest_date',
          'quest_code',
        ],
      },
    ],
  }
);

module.exports = DailyQuestProgress;