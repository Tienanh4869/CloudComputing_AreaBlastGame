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
  getOrCreate(roomId, roomCode) {
    if (!activeRooms.has(roomId)) {
      const room = new GameRoom(roomId, roomCode);
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
