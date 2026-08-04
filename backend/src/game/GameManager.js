// src/game/GameManager.js — Manages all active game rooms
const GameRoom = require('./GameRoom');
const logger = require('../utils/logger');
const { metrics } = require('../utils/metrics');
const { getMapRotation } = require('../config/appConfiguration');

// Map of roomId → GameRoom instance
const activeRooms = new Map();
// Prevent race conditions during async room creation
const pendingRooms = new Map();
// Cache fetched maps to avoid hitting Azure Blob Storage repeatedly
const mapCache = new Map();

function generateProceduralTerrain(width = 24000, height = 24000) {
  // Evowars mode: no obstacles, wide open map
  const obstacles = [];
  const bushes = [];
  return { obstacles, bushes };
}

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
      // Read the current rotation only when creating a room. Existing rooms
      // keep their map so a configuration refresh cannot disrupt a match.
      const maps = getMapRotation();
      const randomMap = maps[Math.floor(Math.random() * maps.length)];
      const isIceMap = randomMap === 'ice_map.json';
      
      // Use environment variable if available, else fallback to hardcoded
      const baseUrl = process.env.MAPS_BASE_URL || 'https://arenablaststore13178.blob.core.windows.net/arenablast-maps';
      const mapUrl = `${baseUrl}/${randomMap}`;
      
      let mapConfig = { width: 8000, height: 8000, url: mapUrl, theme: null };
      
      try {
        let data = mapCache.get(mapUrl);
        
        if (!data) {
          const response = await fetch(mapUrl);
          if (response.ok) {
            data = await response.json();
            mapCache.set(mapUrl, data); // Cache it in memory!
            logger.info(`[GameManager] Fetched and cached map ${randomMap} from Azure Blob Storage`);
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
        }
        
        if (data) {
          // Deep clone the cached data so modifying theme does not pollute cache or other rooms
          const clonedData = JSON.parse(JSON.stringify(data));
          mapConfig = { ...mapConfig, ...clonedData, url: mapUrl };
        }
      } catch (err) {
        logger.warn(`[GameManager] Failed to fetch map JSON from Azure Blob, using fallback`, err.message);
        mapConfig.theme = {
          background: isIceMap ? "#001a33" : "#330000",
          gridColor: isIceMap ? "rgba(0, 150, 255, 0.2)" : "rgba(255, 100, 0, 0.2)",
          borderGlow: isIceMap ? "rgba(0, 200, 255, 0.8)" : "rgba(255, 50, 0, 0.8)",
          particleColor: isIceMap ? "#80d4ff" : "#ff9933",
          obstacleColor: isIceMap ? "rgba(0, 200, 255, 0.4)" : "rgba(255, 100, 0, 0.4)",
          obstacleBorder: isIceMap ? "rgba(0, 255, 255, 0.8)" : "rgba(255, 200, 0, 0.8)",
          bushColor: isIceMap ? "rgba(100, 255, 100, 0.4)" : "rgba(200, 200, 50, 0.4)",
          bushBorder: isIceMap ? "rgba(50, 200, 50, 0.6)" : "rgba(150, 150, 20, 0.6)",
        };
      }

      // Force massive map size for EvoWars mode to support 30+ players
      mapConfig.width = 24000;
      mapConfig.height = 24000;
      const MAP_WIDTH = 24000;
      const MAP_HEIGHT = 24000;
      const { obstacles, bushes } = generateProceduralTerrain(MAP_WIDTH, MAP_HEIGHT);
      if (!mapConfig.theme) {
        mapConfig.theme = {
          background: isIceMap ? "#001a33" : "#330000",
          gridColor: isIceMap ? "rgba(0, 150, 255, 0.2)" : "rgba(255, 100, 0, 0.2)",
          borderGlow: isIceMap ? "rgba(0, 200, 255, 0.8)" : "rgba(255, 50, 0, 0.8)",
          particleColor: isIceMap ? "#80d4ff" : "#ff9933",
          obstacleColor: isIceMap ? "rgba(0, 200, 255, 0.4)" : "rgba(255, 100, 0, 0.4)",
          obstacleBorder: isIceMap ? "rgba(0, 255, 255, 0.8)" : "rgba(255, 200, 0, 0.8)",
          bushColor: isIceMap ? "rgba(100, 255, 100, 0.4)" : "rgba(200, 200, 50, 0.4)",
          bushBorder: isIceMap ? "rgba(50, 200, 50, 0.6)" : "rgba(150, 150, 20, 0.6)",
        };
      } else {
        // Deep clone existing theme to ensure complete room isolation
        mapConfig.theme = JSON.parse(JSON.stringify(mapConfig.theme));
      }
      mapConfig.theme.obstacles = obstacles;
      mapConfig.theme.bushes = bushes;

      const room = new GameRoom(roomId, roomCode, mapConfig);
      activeRooms.set(roomId, room);
      pendingRooms.delete(roomId);
      logger.info('[GameManager] Room created with procedural terrain', { 
        roomId, 
        map: randomMap,
        obstacleCount: obstacles.length,
        bushCount: bushes.length 
      });
      
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
