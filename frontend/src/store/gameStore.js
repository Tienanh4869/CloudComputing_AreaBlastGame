// src/store/gameStore.js — Zustand store for in-game state
import { create } from 'zustand';

const useGameStore = create((set, get) => ({
  // Current room
  currentRoom: null,
  matchId: null,
  matchStatus: 'idle',   // idle | waiting | playing | finished
  matchCountdown: 0,

  // Game state from server
  players: [],
  particles: [],
  mapWidth: 1200,
  mapHeight: 800,
  mapUrl: null,

  // My player data
  mySocketId: null,
  myScore: 0,
  myKills: 0,
  myLevel: 1,
  myXp: 0,
  myMaxXp: 10,
  myAlive: true,
  isHost: false,
  myRespawning: false,
  myRespawnTimer: 0,

  // Safe zone and timer
  safeZone: null,
  startTime: null,
  matchDuration: 600000,

  // Leaderboard (in-match)
  matchLeaderboard: [],

  // Visual effects
  slashes: [],

  // Kill feed
  killFeed: [],

  // Results
  matchResults: null,

  // ── Actions ───────────────────────────────────────────────────

  setRoom: (room) => set({ currentRoom: room }),
  setIsHost: (isHost) => set({ isHost }),

  setMySocketId: (id) => set({ mySocketId: id }),

  setMatchStatus: (status) => set({ matchStatus: status }),

  setMatchCountdown: (seconds) => set({ matchCountdown: seconds }),

  setMatchId: (id) => set({ matchId: id }),

  setMapDimensions: (width, height, url, theme) => set({ mapWidth: width, mapHeight: height, mapUrl: url, mapTheme: theme }),

  addPlayer: (player) => set((state) => {
    // Only add if not already in the list
    if (state.players.some(p => p.socketId === player.socketId)) return state;
    return { players: [...state.players, player] };
  }),

  removePlayer: (socketId) => set((state) => ({
    players: state.players.filter(p => p.socketId !== socketId)
  })),

  // Called on every game_state tick from server
  updateGameState: (state) => {
    const myId = get().mySocketId;
    const me = state.players.find((p) => p.socketId === myId);

    set({
      players:  state.players,
      mapTheme: state.mapTheme || get().mapTheme,
      myLevel: me?.level ?? get().myLevel,
      myXp:    me?.xp    ?? get().myXp,
      myMaxXp: me?.maxXp ?? get().myMaxXp,
      myScore: me?.score ?? get().myScore,
      myKills: me?.kills ?? get().myKills,
      myAlive: me?.alive ?? get().myAlive,
      myRespawning: me?.respawning ?? false,
      myRespawnTimer: me?.respawnTimer ?? 0,
      safeZone: state.safeZone ?? null,
      startTime: state.startTime ?? null,
      matchDuration: state.matchDuration ?? 600000,
    });
  },

  // Update live leaderboard
  updateLeaderboard: (scores) => set({ matchLeaderboard: scores }),

  // Add kill event to feed (auto-expires)
  addKillFeed: (kill) => {
    const id = Date.now();
    set((state) => ({ killFeed: [...state.killFeed, { ...kill, id }] }));
    // Auto remove after 3s
    setTimeout(() => {
      set((state) => ({ killFeed: state.killFeed.filter((k) => k.id !== id) }));
    }, 3000);
  },

  addSlash: (slash) => {
    const id = Date.now() + Math.random();
    set((state) => ({ slashes: [...state.slashes, { ...slash, id, createdAt: Date.now() }] }));
    // Slashes exist for ~200ms
    setTimeout(() => {
      set((state) => ({ slashes: state.slashes.filter((s) => s.id !== id) }));
    }, 200);
  },

  // ── Optimized Broadcast Handlers ──────────────────────────────
  updatePlayersFast: (playersData) => {
    // playersData: [ [socketId, x, y, angle, state, scale], ... ]
    set((state) => {
      const newPlayers = [...state.players];
      for (const pData of playersData) {
        const [socketId, x, y, angle, pState, scale] = pData;
        const idx = newPlayers.findIndex((p) => p.socketId === socketId);
        if (idx !== -1) {
          const p = { ...newPlayers[idx] };
          p.x = x;
          p.y = y;
          p.facingX = Math.cos(angle);
          p.facingY = Math.sin(angle);
          p.isBoosting = pState === 3;
          p.isAttacking = pState === 2;
          p.scale = scale;
          newPlayers[idx] = p;
        }
      }
      return { players: newPlayers };
    });
  },

  updatePlayersSlow: (playersSlowData) => {
    // playersSlowData: [ [socketId, score, kills, level, xp, alive, respawning], ... ]
    set((state) => {
      const newPlayers = [...state.players];
      let myScore = state.myScore;
      let myKills = state.myKills;
      let myLevel = state.myLevel;
      let myXp = state.myXp;
      let myAlive = state.myAlive;

      for (const pData of playersSlowData) {
        const [socketId, score, kills, level, xp, alive, respawning] = pData;
        const idx = newPlayers.findIndex((p) => p.socketId === socketId);
        if (idx !== -1) {
          const p = { ...newPlayers[idx] };
          p.score = score;
          p.kills = kills;
          p.level = level;
          p.xp = xp;
          p.alive = alive === 1;
          p.respawning = respawning === 1;
          newPlayers[idx] = p;

          if (socketId === state.mySocketId) {
            myScore = score;
            myKills = kills;
            myLevel = level;
            myXp = xp;
            myAlive = alive === 1;
          }
        }
      }
      return { players: newPlayers, myScore, myKills, myLevel, myXp, myAlive };
    });
  },

  // Particles optimizations
  setParticles: (particles) => set({ particles }),
  addParticles: (spawned) => set((state) => ({ particles: [...state.particles, ...spawned] })),
  removeParticles: (collectedIds) => set((state) => {
    const idSet = new Set(collectedIds);
    return { particles: state.particles.filter(p => !idSet.has(p.id)) };
  }),

  // Set final match results
  setMatchResults: (results) => set({ matchResults: results, matchStatus: 'finished' }),

  // Reset for new game
  resetGame: () => set({
    currentRoom: null,
    isHost: false,
    matchId: null,
    matchStatus: 'idle',
    matchCountdown: 0,
    players: [],
    particles: [],
    myScore: 0,
    myKills: 0,
    myLevel: 1,
    myXp: 0,
    myMaxXp: 10,
    myAlive: true,
    killFeed: [],
    matchResults: null,
    matchLeaderboard: [],
  }),
}));

export default useGameStore;
