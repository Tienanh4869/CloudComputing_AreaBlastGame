// database/seed.js — Seed data script for demo/testing
// Run: npm run seed   (from D:\Game\backend)
// Or:  node seed.js  (from D:\Game\backend, seed.js is a symlink/copy)

const path = require('path');
const fs = require('fs');
let BACKEND = path.resolve(__dirname, '../backend');
if (!fs.existsSync(BACKEND)) {
  BACKEND = path.resolve(__dirname, '.'); // if running inside /app
}

// Resolve all modules from backend's node_modules (since deps live there)
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  try {
    return originalResolve.call(this, request, parent, isMain, options);
  } catch (e) {
    // Fallback: try resolving from backend's node_modules
    return originalResolve.call(this, request, {
      ...parent,
      filename: path.join(BACKEND, 'dummy.js'),
      paths: [path.join(BACKEND, 'node_modules')],
    }, isMain, options);
  }
};

require('dotenv').config({ path: path.join(BACKEND, '.env') });
const { sequelize, connectDB } = require(path.join(BACKEND, 'src/config/database'));
const {
  User, Player, Room, Match, MatchPlayer, MatchEvent, LeaderboardScore
} = require(path.join(BACKEND, 'src/models'));
const bcrypt = require('bcryptjs');
const { generateRoomCode } = require(path.join(BACKEND, 'src/utils/helpers'));

const COLORS = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#E91E63'];

// ── Seed data definitions ────────────────────────────────────────

const USERS = [
  { username: 'admin',   email: 'admin@arenablast.dev',   password: 'admin123',   role: 'admin',  nickname: 'Administrator' },
  { username: 'player1', email: 'player1@arenablast.dev', password: 'player123',  role: 'player', nickname: 'DragonSlayer' },
  { username: 'player2', email: 'player2@arenablast.dev', password: 'player123',  role: 'player', nickname: 'ShadowWolf' },
  { username: 'player3', email: 'player3@arenablast.dev', password: 'player123',  role: 'player', nickname: 'BlazeFist' },
  { username: 'player4', email: 'player4@arenablast.dev', password: 'player123',  role: 'player', nickname: 'IceQueen' },
  { username: 'player5', email: 'player5@arenablast.dev', password: 'player123',  role: 'player', nickname: 'ThunderBolt' },
  { username: 'demo',    email: 'demo@arenablast.dev',    password: 'demo123',    role: 'player', nickname: 'DemoPlayer' },
];

async function seedData() {
  console.log('🌱 Starting seed...');

  await connectDB();

  // Clear existing data (in correct order to respect FK)
  await MatchEvent.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true }).catch(() => {});
  await LeaderboardScore.destroy({ where: {}, truncate: true, cascade: true }).catch(() => {});
  await MatchPlayer.destroy({ where: {}, truncate: true, cascade: true }).catch(() => {});
  await Match.destroy({ where: {}, truncate: true, cascade: true }).catch(() => {});
  await Room.destroy({ where: {}, truncate: true, cascade: true }).catch(() => {});
  await Player.destroy({ where: {}, truncate: true, cascade: true }).catch(() => {});
  await User.destroy({ where: {}, truncate: true, cascade: true }).catch(() => {});

  console.log('✅ Cleared existing data');

  // ── Create Users + Players ──────────────────────────────────────
  const createdPlayers = [];

  for (let i = 0; i < USERS.length; i++) {
    const u = USERS[i];
    const user = await User.create({
      username: u.username,
      email: u.email,
      password_hash: u.password,  // Will be hashed by model hook
      role: u.role,
    });

    const scoreBase = (USERS.length - i) * 1500;
    const player = await Player.create({
      user_id: user.id,
      nickname: u.nickname,
      avatar_color: COLORS[i % COLORS.length],
      total_score: scoreBase + Math.floor(Math.random() * 500),
      wins:   Math.floor(Math.random() * 20) + (i < 3 ? 10 : 0),
      losses: Math.floor(Math.random() * 15) + 2,
      kills:  Math.floor(Math.random() * 80) + (i < 3 ? 20 : 0),
      deaths: Math.floor(Math.random() * 40) + 3,
    });

    createdPlayers.push({ user, player });
    console.log(`  ✅ Created user: ${u.username} / player: ${u.nickname}`);
  }

  // ── Create Rooms ─────────────────────────────────────────────────
  const rooms = [
    { name: 'Beginners Arena',  max_players: 4, status: 'waiting'  },
    { name: 'Pro Battle Zone',  max_players: 6, status: 'waiting'  },
    { name: 'Chaos Chamber',    max_players: 8, status: 'finished' },
    { name: 'Training Ground',  max_players: 2, status: 'waiting'  },
  ];

  const createdRooms = [];
  for (const r of rooms) {
    const room = await Room.create({
      name: r.name,
      code: generateRoomCode(),
      status: r.status,
      max_players: r.max_players,
      player_count: r.status === 'waiting' ? Math.floor(Math.random() * r.max_players) : r.max_players,
      created_by: createdPlayers[1].user.id,
    });
    createdRooms.push(room);
    console.log(`  ✅ Created room: ${r.name} [${room.code}]`);
  }

  // ── Create Sample Matches ─────────────────────────────────────────
  console.log('  Creating sample matches...');

  for (let m = 0; m < 5; m++) {
    const room = createdRooms[m % createdRooms.length];
    const matchPlayers = createdPlayers.slice(1, 5);  // Skip admin
    const winner = matchPlayers[Math.floor(Math.random() * matchPlayers.length)];
    const duration = 120 + Math.floor(Math.random() * 60);

    const startedAt = new Date(Date.now() - (m + 1) * 24 * 60 * 60 * 1000);
    const endedAt   = new Date(startedAt.getTime() + duration * 1000);

    const match = await Match.create({
      room_id: room.id,
      status: 'finished',
      started_at: startedAt,
      ended_at: endedAt,
      winner_id: winner.player.id,
      duration_seconds: duration,
      player_count: matchPlayers.length,
    });

    // Create match player records
    for (let rank = 0; rank < matchPlayers.length; rank++) {
      const mp = matchPlayers[rank];
      await MatchPlayer.create({
        match_id: match.id,
        player_id: mp.player.id,
        score: (matchPlayers.length - rank) * 300 + Math.floor(Math.random() * 100),
        kills: Math.floor(Math.random() * 8),
        deaths: Math.floor(Math.random() * 5),
        rank: rank + 1,
        joined_at: startedAt,
        left_at: endedAt,
      });
    }

    // Add some sample events
    await MatchEvent.create({
      match_id: match.id,
      event_type: 'match_started',
      data: { playerCount: matchPlayers.length },
    });
    await MatchEvent.create({
      match_id: match.id,
      event_type: 'player_died',
      player_id: matchPlayers[1].player.id,
      target_id: winner.player.id,
      data: { damage: 100 },
    });
    await MatchEvent.create({
      match_id: match.id,
      event_type: 'match_ended',
      data: { winner: winner.player.nickname, duration },
    });
  }
  console.log('  ✅ Created 5 sample matches');

  // ── Create Leaderboard Scores ────────────────────────────────────
  console.log('  Creating leaderboard scores...');

  const periods = ['all_time', 'weekly', 'daily'];
  for (const period of periods) {
    // Sort players by total_score for ranking
    const sorted = [...createdPlayers]
      .filter((cp) => cp.user.role !== 'admin')
      .sort((a, b) => b.player.total_score - a.player.total_score);

    for (let i = 0; i < sorted.length; i++) {
      const cp = sorted[i];
      const scoreMultiplier = period === 'all_time' ? 1 : period === 'weekly' ? 0.3 : 0.1;

      await LeaderboardScore.create({
        player_id: cp.player.id,
        score: Math.floor(cp.player.total_score * scoreMultiplier),
        rank: i + 1,
        period,
        kills: Math.floor(cp.player.kills * scoreMultiplier),
        wins:  Math.floor(cp.player.wins * scoreMultiplier),
      });
    }
  }
  console.log('  ✅ Created leaderboard scores (all_time, weekly, daily)');

  console.log('');
  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('📋 Test accounts:');
  console.log('  Admin:  admin / admin123');
  console.log('  Demo:   demo / demo123');
  console.log('  Others: player1..5 / player123');
}

// Run if called directly
if (require.main === module) {
  seedData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seed failed:', err.message);
      process.exit(1);
    });
}

module.exports = { seedData };
