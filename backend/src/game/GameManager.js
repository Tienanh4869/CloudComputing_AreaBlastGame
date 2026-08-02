// src/game/GameManager.js — Manages all active game rooms
const GameRoom = require('./GameRoom');
const logger = require('../utils/logger');
const { metrics } = require('../utils/metrics');

// Map of roomId → GameRoom instance
const activeRooms = new Map();
// Prevent race conditions during async room creation
const pendingRooms = new Map();
// Cache fetched maps to avoid hitting Azure Blob Storage repeatedly
const mapCache = new Map();

const GameManager = {
  /**
   * Create or return existing game room.
   */
  async getOrCreate(rawRoomId, roomCode) {
    const roomId = String(rawRoomId);
    // 1. If room exists, return immediately
    if (activeRooms.has(roomId)) {
      return activeRooms.get(roomId);
    }
    
    // 2. If room is currently being created by another concurrent request, await that promise
    if (pendingRooms.has(roomId)) {
      return pendingRooms.get(roomId);
    }

    // 3. Create the promise for room creation
    const creationPromise = (async () => {
      const maps = ['ice_map.json', 'fire_map.json'];
      const randomMap = maps[Math.floor(Math.random() * maps.length)];
      
      // Use environment variable if available, else fallback to hardcoded
      const baseUrl = process.env.MAPS_BASE_URL || 'https://arenablaststore13178.blob.core.windows.net/arenablast-maps';
      const mapUrl = `${baseUrl}/${randomMap}`;
      
      let mapConfig = { width: 1200, height: 800, url: mapUrl, theme: null };
      
      try {
        let data = mapCache.get(mapUrl);
        
        if (!data) {
          const response = await fetch(mapUrl);
          if (response.ok) {
            data = await response.json();
            mapCache.set(mapUrl, data); // Cache it in memory!
            logger.info(`[GameManager] Fetched and cached map ${randomMap}`);
          }
        }
        
        if (data) {
          mapConfig = { ...mapConfig, ...data, url: mapUrl };
        }
      } catch (err) {
        logger.warn(`[GameManager] Failed to fetch map JSON, using fallback`, err.message);
      }

      const room = new GameRoom(roomId, roomCode, mapConfig);
      activeRooms.set(roomId, room);
      pendingRooms.delete(roomId);
      logger.info('[GameManager] Room created', { roomId, map: randomMap });
      
      return room;
    })();

    // Store the promise so concurrent calls wait for it
    pendingRooms.set(roomId, creationPromise);
    
    return creationPromise;
  },

  /**
   * Get existing room.
   */
  get(rawRoomId) {
    return activeRooms.get(String(rawRoomId));
  },

  /**
   * Remove room after it ends.
   */
  destroy(rawRoomId) {
    const roomId = String(rawRoomId);
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
