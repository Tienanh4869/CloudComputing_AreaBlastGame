// src/models/index.js — Setup associations between models
const User = require('./User');
const Player = require('./Player');
const Room = require('./Room');
const Match = require('./Match');
const MatchPlayer = require('./MatchPlayer');
const MatchEvent = require('./MatchEvent');
const LeaderboardScore = require('./LeaderboardScore');
const DailyQuestProgress = require('./DailyQuestProgress');
const ProcessedEvent = require('./ProcessedEvent');

// ── Associations ──────────────────────────────────────────────

// User ↔ Player (1-to-1)
User.hasOne(Player, { foreignKey: 'user_id', as: 'profile' });
Player.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User → Rooms created
User.hasMany(Room, { foreignKey: 'created_by', as: 'createdRooms' });
Room.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// Room → Matches
Room.hasMany(Match, { foreignKey: 'room_id', as: 'matches' });
Match.belongsTo(Room, { foreignKey: 'room_id', as: 'room' });

// Match ↔ Players (many-to-many through MatchPlayer)
Match.belongsToMany(Player, { through: MatchPlayer, foreignKey: 'match_id', as: 'players' });
Player.belongsToMany(Match, { through: MatchPlayer, foreignKey: 'player_id', as: 'matches' });

Match.hasMany(MatchPlayer, { foreignKey: 'match_id', as: 'matchPlayers' });
MatchPlayer.belongsTo(Match, { foreignKey: 'match_id' });
MatchPlayer.belongsTo(Player, { foreignKey: 'player_id', as: 'player' });

// Match winner
Match.belongsTo(Player, { foreignKey: 'winner_id', as: 'winner' });

// Match → Events
Match.hasMany(MatchEvent, { foreignKey: 'match_id', as: 'events' });
MatchEvent.belongsTo(Match, { foreignKey: 'match_id' });
MatchEvent.belongsTo(Player, { foreignKey: 'player_id', as: 'player' });
MatchEvent.belongsTo(Player, { foreignKey: 'target_id', as: 'target' });

// Player → Leaderboard
Player.hasMany(LeaderboardScore, { foreignKey: 'player_id', as: 'scores' });
LeaderboardScore.belongsTo(Player, { foreignKey: 'player_id', as: 'player' });

// Player → Daily quest progress
Player.hasMany(DailyQuestProgress, { foreignKey: 'player_id', as: 'dailyQuests'});

DailyQuestProgress.belongsTo(Player, { foreignKey: 'player_id', as: 'player'});

module.exports = {
  User,
  Player,
  Room,
  Match,
  MatchPlayer,
  MatchEvent,
  LeaderboardScore,
  DailyQuestProgress,
  ProcessedEvent,
};
