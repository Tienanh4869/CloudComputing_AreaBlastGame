// src/store/gameStore.js — Zustand store for in-game state
import { create } from 'zustand';

const useGameStore = create((set, get) => ({
  // Current room
  currentRoom: null,
  matchId: null,
  matchStatus: 'idle',   // idle | waiting | playing | finished

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

  setMySocketId: (id) => set({ mySocketId: id }),

  setMatchStatus: (status) => set({ matchStatus: status }),

  setMatchId: (id) => set({ matchId: id }),

  setMapDimensions: (width, height, url) => set({ mapWidth: width, mapHeight: height, mapUrl: url }),

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
    matchId: null,
    matchStatus: 'idle',
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
