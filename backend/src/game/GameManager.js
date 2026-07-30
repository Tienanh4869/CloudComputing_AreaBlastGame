// src/game/GameManager.js — Manages all active game rooms
const GameRoom = require('./GameRoom');
const logger = require('../utils/logger');
const { metrics } = require('../utils/metrics');

// Map of roomId → GameRoom instance
const activeRooms = new Map();

const GameManager = {
  /**
   * Create or return existing game room.
   */
  async getOrCreate(roomId, roomCode) {
    if (!activeRooms.has(roomId)) {
      // Fetch dynamic map from Azure Blob Storage (CDN)
      const maps = ['ice_map.json', 'fire_map.json'];
      const randomMap = maps[Math.floor(Math.random() * maps.length)];
      const mapUrl = `https://arenablaststore13178.blob.core.windows.net/arenablast-maps/${randomMap}`;
      
      let mapConfig = { width: 1200, height: 800, url: mapUrl, theme: null };
      try {
        const response = await fetch(mapUrl);
        if (response.ok) {
          const data = await response.json();
          mapConfig = { ...mapConfig, ...data, url: mapUrl };
          logger.info(`[GameManager] Loaded map ${randomMap} for room ${roomId}`);
        }
      } catch (err) {
        logger.warn(`[GameManager] Failed to fetch map JSON, using fallback`, err.message);
      }

      const room = new GameRoom(roomId, roomCode, mapConfig);
      activeRooms.set(roomId, room);
      logger.info('[GameManager] Room created', { roomId });
    }
    return activeRooms.get(roomId);
  },

  /**
   * Get existing room.
   */
  get(roomId) {
    return activeRooms.get(roomId);
  },

  /**
   * Remove room after it ends.
   */
  destroy(roomId) {
    const room = activeRooms.get(roomId);
    if (room) {
      room.stop();
      activeRooms.delete(roomId);
      logger.info('[GameManager] Room destroyed', { roomId });
    }
  },

  /**
   * Get count of active rooms.
   */
  getActiveCount() {
    return activeRooms.size;
  },

  /**
   * Get all active room IDs.
   */
  getAllRoomIds() {
    return Array.from(activeRooms.keys());
  },
};

module.exports = GameManager;
