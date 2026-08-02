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
  myHp: 100,
  myMaxHp: 100,
  myAlive: true,
  isHost: false,
  myRespawning: false,
  myRespawnTimer: 0,

  // Safe zone and timer
  safeZone: null,
  startTime: null,
  matchDuration: 120000,

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
      particles: state.particles,
      myHp:    me?.hp    ?? get().myHp,
      myMaxHp: me?.maxHp ?? get().myMaxHp,
      myScore: me?.score ?? get().myScore,
      myKills: me?.kills ?? get().myKills,
      myAlive: me?.alive ?? get().myAlive,
      myRespawning: me?.respawning ?? false,
      myRespawnTimer: me?.respawnTimer ?? 0,
      safeZone: state.safeZone ?? null,
      startTime: state.startTime ?? null,
      matchDuration: state.matchDuration ?? 120000,
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
    myHp: 100,
    myAlive: true,
    killFeed: [],
    matchResults: null,
    matchLeaderboard: [],
  }),
}));

export default useGameStore;
