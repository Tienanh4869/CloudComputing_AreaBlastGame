// src/game/Matchmaker.js - Quick Match queue handling (Min 4, Max 8 players with Memory Fallback)
const { getRedis } = require('../config/redis');
const { Room } = require('../models');
const { generateRoomCode } = require('../utils/helpers');
const logger = require('../utils/logger');

const QUEUE_KEY = 'qm_queue';
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;
const MIN_WAIT_TIMEOUT_MS = 6000; // 6s wait time once min 4 players reached before launching match
const TICK_RATE = 1000; // Check every 1s for responsive matchmaking

let ioInstance = null;
let intervalId = null;
let memoryQueue = []; // Fallback in-memory queue when Redis is not connected

class Matchmaker {
  static init(io) {
    ioInstance = io;
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(Matchmaker.tick, TICK_RATE);
    logger.info(`[Matchmaker] Initialized (Min ${MIN_PLAYERS}, Max ${MAX_PLAYERS} Players Matchmaking)`);
  }

  // Helper to get queue items from Redis or in-memory fallback
  static async getQueueItems() {
    const redis = getRedis();
    if (redis) {
      try {
        const items = await redis.lRange(QUEUE_KEY, 0, -1);
        return items.map((it) => (typeof it === 'string' ? JSON.parse(it) : it));
      } catch (err) {
        logger.error('[Matchmaker] Redis lRange error, falling back to memory queue', err);
      }
    }
    return [...memoryQueue];
  }

  static async broadcastQueueUpdate() {
    if (!ioInstance) return;
    try {
      const items = await Matchmaker.getQueueItems();
      const count = items.length;
      
      let startingIn = null;
      if (count >= MIN_PLAYERS && count < MAX_PLAYERS && items.length > 0) {
        const firstPlayer = items[0];
        const elapsed = Date.now() - (firstPlayer.joinedAt || Date.now());
        startingIn = Math.max(0, Math.ceil((MIN_WAIT_TIMEOUT_MS - elapsed) / 1000));
      }

      for (const p of items) {
        if (p.socketId) {
          ioInstance.to(p.socketId).emit('quick_match_queue_update', {
            current: count,
            min: MIN_PLAYERS,
            max: MAX_PLAYERS,
            needed: MAX_PLAYERS,
            startingIn: startingIn,
          });
        }
      }
    } catch (err) {
      logger.error('[Matchmaker] Error broadcasting queue update', err);
    }
  }

  static async join(playerData) {
    // 1. Remove existing entry first to prevent duplicates
    await Matchmaker.leaveBySocket(playerData.socketId);
    if (playerData.userId) {
      await Matchmaker.leaveByUserId(playerData.userId);
    }
    
    const entry = {
      ...playerData,
      joinedAt: Date.now(),
    };

    const redis = getRedis();
    if (redis) {
      try {
        await redis.rPush(QUEUE_KEY, JSON.stringify(entry));
      } catch (err) {
        logger.error('[Matchmaker] Redis rPush error', err);
        memoryQueue.push(entry);
      }
    } else {
      memoryQueue.push(entry);
    }

    logger.info(`[Matchmaker] Player joined queue: ${playerData.nickname} (${playerData.socketId})`);
    await Matchmaker.broadcastQueueUpdate();
  }

  static async leave(playerData) {
    if (playerData.socketId) {
      await Matchmaker.leaveBySocket(playerData.socketId);
    } else if (playerData.userId) {
      await Matchmaker.leaveByUserId(playerData.userId);
    }
  }

  static async leaveByUserId(userId) {
    if (!userId) return;
    const redis = getRedis();
    if (redis) {
      try {
        const items = await redis.lRange(QUEUE_KEY, 0, -1);
        for (const item of items) {
          try {
            const p = JSON.parse(item);
            if (p.userId === userId) {
              await redis.lRem(QUEUE_KEY, 0, item);
              logger.info(`[Matchmaker] Removed userId ${userId} from Redis queue`);
            }
          } catch (err) {}
        }
      } catch (err) {}
    }
    memoryQueue = memoryQueue.filter((p) => p.userId !== userId);
  }

  static async leaveBySocket(socketId) {
    if (!socketId) return;
    const redis = getRedis();
    let removed = false;

    if (redis) {
      try {
        const items = await redis.lRange(QUEUE_KEY, 0, -1);
        for (const item of items) {
          try {
            const p = JSON.parse(item);
            if (p.socketId === socketId) {
              await redis.lRem(QUEUE_KEY, 0, item);
              logger.info(`[Matchmaker] Removed socket ${socketId} from Redis queue`);
              removed = true;
            }
          } catch (err) {}
        }
      } catch (err) {
        logger.error('[Matchmaker] Error removing socket from Redis queue', err);
      }
    }

    const prevMemLen = memoryQueue.length;
    memoryQueue = memoryQueue.filter((p) => p.socketId !== socketId);
    if (memoryQueue.length !== prevMemLen) {
      removed = true;
    }

    if (removed) {
      await Matchmaker.broadcastQueueUpdate();
    }
  }

  static async tick() {
    try {
      const redis = getRedis();
      let rawItems = [];

      if (redis) {
        rawItems = await redis.lRange(QUEUE_KEY, 0, -1);
      } else {
        rawItems = memoryQueue.map((it) => JSON.stringify(it));
      }

      if (!rawItems || rawItems.length === 0) return;

      // 1. Purge disconnected sockets
      const validPlayers = [];
      for (const item of rawItems) {
        try {
          const p = JSON.parse(item);
          if (ioInstance && ioInstance.sockets && ioInstance.sockets.sockets) {
            const socket = ioInstance.sockets.sockets.get(p.socketId);
            if (!socket || !socket.connected) {
              if (redis) await redis.lRem(QUEUE_KEY, 0, item);
              memoryQueue = memoryQueue.filter((m) => m.socketId !== p.socketId);
              logger.info(`[Matchmaker] Cleaned up disconnected socket: ${p.socketId}`);
              continue;
            }
          }
          validPlayers.push(p);
        } catch (err) {
          if (redis) await redis.lRem(QUEUE_KEY, 0, item);
        }
      }

      const count = validPlayers.length;
      if (count === 0) return;

      // Keep clients updated with real count & starting countdown
      await Matchmaker.broadcastQueueUpdate();

      // 2. Check if we can launch a match
      let shouldLaunch = false;
      let playersToLaunch = 0;

      if (count >= MAX_PLAYERS) {
        // Max 8 players reached -> Launch immediately!
        shouldLaunch = true;
        playersToLaunch = MAX_PLAYERS;
      } else if (count >= MIN_PLAYERS) {
        // Between 4 and 7 players: check wait timeout
        const oldestJoinedAt = validPlayers[0].joinedAt || Date.now();
        const waitTime = Date.now() - oldestJoinedAt;
        if (waitTime >= MIN_WAIT_TIMEOUT_MS) {
          shouldLaunch = true;
          playersToLaunch = Math.min(count, MAX_PLAYERS);
        }
      }

      if (shouldLaunch && playersToLaunch >= MIN_PLAYERS) {
        const launchedPlayers = [];
        
        if (redis) {
          for (let i = 0; i < playersToLaunch; i++) {
            const raw = await redis.lPop(QUEUE_KEY);
            if (raw) launchedPlayers.push(JSON.parse(raw));
          }
        } else {
          launchedPlayers.push(...memoryQueue.splice(0, playersToLaunch));
        }

        if (launchedPlayers.length >= MIN_PLAYERS) {
          await Matchmaker.createMatch(launchedPlayers);
          await Matchmaker.broadcastQueueUpdate();
        } else {
          // Rollback if pop failed
          if (redis) {
            for (const p of launchedPlayers) {
              await redis.rPush(QUEUE_KEY, JSON.stringify(p));
            }
          } else {
            memoryQueue.unshift(...launchedPlayers);
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
        max_players: MAX_PLAYERS,
        created_by: players[0].userId || null,
        player_count: 0,
        status: 'waiting',
      });

      logger.info(`[Matchmaker] Quick match created for ${players.length} players: ${code}`);

      // Notify the matched players
      for (const p of players) {
        if (ioInstance) {
          ioInstance.to(p.socketId).emit('match_found', {
            roomId: room.id,
            roomCode: code,
            isQuickMatch: true
          });
        }
      }
    } catch (err) {
      logger.error('[Matchmaker] Failed to create match', err);
    }
  }
}

module.exports = Matchmaker;
