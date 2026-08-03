// src/game/Matchmaker.js - Quick Match queue handling
const { getRedis } = require('../config/redis');
const { Room } = require('../models');
const { generateRoomCode } = require('../utils/helpers');
const logger = require('../utils/logger');

const QUEUE_KEY = 'qm_queue';
const PLAYERS_NEEDED = 8;
const TICK_RATE = 2000;
let ioInstance = null;
let intervalId = null;

class Matchmaker {
  static init(io) {
    ioInstance = io;
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(Matchmaker.tick, TICK_RATE);
    logger.info('[Matchmaker] Initialized (8 Players Matchmaking)');
  }

  static async broadcastQueueUpdate() {
    const redis = getRedis();
    if (!redis || !ioInstance) return;
    try {
      const items = await redis.lRange(QUEUE_KEY, 0, -1);
      const count = items.length;
      for (const item of items) {
        try {
          const p = JSON.parse(item);
          if (p.socketId) {
            ioInstance.to(p.socketId).emit('quick_match_queue_update', {
              current: count,
              needed: PLAYERS_NEEDED,
            });
          }
        } catch (err) {}
      }
    } catch (err) {
      logger.error('[Matchmaker] Error broadcasting queue update', err);
    }
  }

  static async join(playerData) {
    const redis = getRedis();
    if (!redis) return;
    
    // First try to remove to avoid duplicates
    await Matchmaker.leave(playerData);
    
    await redis.rPush(QUEUE_KEY, JSON.stringify(playerData));
    logger.info(`[Matchmaker] Player joined queue: ${playerData.nickname}`);
    
    await Matchmaker.broadcastQueueUpdate();
  }

  static async leave(playerData) {
    const redis = getRedis();
    if (!redis) return;
    
    // Remove by stringified value
    await redis.lRem(QUEUE_KEY, 0, JSON.stringify(playerData));
    logger.info(`[Matchmaker] Player left queue: ${playerData.nickname}`);

    await Matchmaker.broadcastQueueUpdate();
  }

  static async leaveBySocket(socketId) {
    const redis = getRedis();
    if (!redis) return;
    
    // We need to find the item to remove it
    const items = await redis.lRange(QUEUE_KEY, 0, -1);
    let removed = false;
    for (const item of items) {
      try {
        const p = JSON.parse(item);
        if (p.socketId === socketId) {
          await redis.lRem(QUEUE_KEY, 0, item);
          logger.info(`[Matchmaker] Removed socket ${socketId} from queue`);
          removed = true;
        }
      } catch (err) {}
    }

    if (removed) {
      await Matchmaker.broadcastQueueUpdate();
    }
  }

  static async tick() {
    const redis = getRedis();
    if (!redis) return;

    try {
      const len = await redis.lLen(QUEUE_KEY);
      // Periodically keep queue counts in sync for any active waiting users
      if (len > 0) {
        await Matchmaker.broadcastQueueUpdate();
      }

      if (len >= PLAYERS_NEEDED) {
        // Pop players
        const players = [];
        for (let i = 0; i < PLAYERS_NEEDED; i++) {
          const raw = await redis.lPop(QUEUE_KEY);
          if (raw) players.push(JSON.parse(raw));
        }

        if (players.length === PLAYERS_NEEDED) {
           await Matchmaker.createMatch(players);
           await Matchmaker.broadcastQueueUpdate();
        } else {
           // Rollback if something strange happened
           for (const p of players) {
             await redis.rPush(QUEUE_KEY, JSON.stringify(p));
           }
        }
      }
    } catch (err) {
      logger.error('[Matchmaker] Error during tick', err);
    }
  }

  static async createMatch(players) {
    try {
      const code = generateRoomCode();
      const room = await Room.create({
        name: 'Quick Match ' + Math.floor(Math.random() * 1000),
        code,
        max_players: PLAYERS_NEEDED,
        created_by: players[0].userId, // Arbitrary creator
        player_count: 0,
        status: 'waiting',
      });

      logger.info(`[Matchmaker] Quick match created for 8 players: ${code}`);

      // Notify the players
      for (const p of players) {
        ioInstance.to(p.socketId).emit('match_found', {
          roomId: room.id,
          roomCode: code,
          isQuickMatch: true
        });
      }
    } catch (err) {
      logger.error('[Matchmaker] Failed to create match', err);
    }
  }
}

module.exports = Matchmaker;
