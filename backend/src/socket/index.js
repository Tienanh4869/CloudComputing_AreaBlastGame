// src/socket/index.js — Socket.IO server setup and connection handler
const jwt = require('jsonwebtoken');
const { JWT_SECRET, GAME } = require('../config/env');
const { User, Player, Room, Match, MatchPlayer, MatchEvent } = require('../models');
const GameManager = require('../game/GameManager');
const { metrics, increment, decrement } = require('../utils/metrics');
const logger = require('../utils/logger');

/**
 * Initialize Socket.IO event handlers.
 * Attaches to an existing Socket.IO server instance.
 */
const initSocket = (io) => {

  // ── Middleware: Authenticate socket connections ───────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findByPk(decoded.userId, {
        attributes: ['id', 'username', 'role'],
      });

      if (!user) return next(new Error('User not found'));

      const player = await Player.findOne({ where: { user_id: user.id } });

      socket.userId = user.id;
      socket.username = user.username;
      socket.playerId = player?.id;
      socket.nickname = player?.nickname || user.username;
      socket.avatarColor = player?.avatar_color || '#4A90D9';
      socket.avatarUrl = player?.avatar_url || null;
      socket.weaponUrl = player?.weapon_url || null;

      logger.info('[Socket] Client authenticated', { username: user.username, socketId: socket.id });
      next();
    } catch (err) {
      logger.warn('[Socket] Auth failed:', err.message);
      next(new Error('Invalid token'));
    }
  });

  // ── Connection Handler ────────────────────────────────────────
  io.on('connection', (socket) => {
    increment('connections');
    logger.info('[Socket] Client connected', { socketId: socket.id, username: socket.username });

    // ── join_room: Player requests to join a game room ──────────
    socket.on('join_room', async ({ roomId, roomCode }) => {
      try {
        const room = await Room.findByPk(roomId);
        if (!room) return socket.emit('error', { message: 'Room not found' });
        if (room.status === 'finished') return socket.emit('error', { message: 'Room has ended' });
        if (room.player_count >= room.max_players) {
          return socket.emit('error', { message: 'Room is full' });
        }

        // Join Socket.IO room
        socket.join(roomId);
        socket.currentRoomId = roomId;

        // Get or create in-memory game room
        const gameRoom = GameManager.getOrCreate(roomId, roomCode || room.code);

        // Prevent same account from playing against itself in the same room
        if (socket.playerId) {
          const isAlreadyInRoom = Array.from(gameRoom.players.values()).some(p => p.playerId === socket.playerId);
          if (isAlreadyInRoom) {
            socket.emit('error', { message: 'Tài khoản này đang ở trong phòng rồi (Có thể đang mở ở tab/trình duyệt khác).' });
            return;
          }
        }

        // Add player to game state
        const playerState = gameRoom.addPlayer(socket.id, {
          playerId: socket.playerId,
          nickname: socket.nickname,
          color: socket.avatarColor,
          avatarUrl: socket.avatarUrl,
          weaponUrl: socket.weaponUrl,
        });

        // Update room player count
        await room.increment('player_count');

        // Notify everyone in the room
        io.to(roomId).emit('player_joined', {
          socketId: socket.id,
          playerId: socket.playerId,
          nickname: socket.nickname,
          color: socket.avatarColor,
          playerCount: gameRoom.getPlayerCount(),
        });

        // Send current state to the newly joined player
        socket.emit('room_joined', {
          roomId,
          state: gameRoom.getState(),
          mapWidth: GAME.mapWidth,
          mapHeight: GAME.mapHeight,
        });

        logger.gameEvent('player_joined_room', {
          nickname: socket.nickname,
          roomId,
          playerCount: gameRoom.getPlayerCount(),
        });
      } catch (err) {
        logger.error('[Socket] join_room error:', err.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ── ready: Player signals ready to start ────────────────────
    socket.on('ready', async () => {
      const roomId = socket.currentRoomId;
      if (!roomId) {
        // Not joined any room yet
        socket.emit('error', { message: 'Not in a room. Please rejoin.' });
        return;
      }

      const gameRoom = GameManager.get(roomId);
      if (!gameRoom) {
        socket.emit('error', { message: 'Game room not found.' });
        return;
      }
      if (gameRoom.isRunning) {
        // Already started — send current state
        socket.emit('match_started', {
          matchId: gameRoom.matchId,
          mapWidth: GAME.mapWidth,
          mapHeight: GAME.mapHeight,
        });
        return;
      }

      logger.info('[Socket] Ready received', { nickname: socket.nickname, roomId });
      await startMatch(io, roomId, gameRoom, socket);
    });

    // ── player_move: Handle movement input ──────────────────────
    socket.on('player_move', ({ dx, dy }) => {
      const roomId = socket.currentRoomId;
      if (!roomId) return;

      const gameRoom = GameManager.get(roomId);
      if (!gameRoom) return;

      // Clamp input values to [-1, 1]
      const cdx = Math.max(-1, Math.min(1, dx || 0));
      const cdy = Math.max(-1, Math.min(1, dy || 0));
      gameRoom.setPlayerMovement(socket.id, cdx, cdy);
    });

    // ── player_attack: Handle attack input ──────────────────────
    socket.on('player_attack', () => {
      const roomId = socket.currentRoomId;
      if (!roomId) return;

      const gameRoom = GameManager.get(roomId);
      if (!gameRoom || !gameRoom.isRunning) return;

      const attacker = gameRoom.players.get(socket.id);
      if (!attacker) return;

      // Try to execute attack
      const hits = gameRoom.playerAttack(socket.id);
      if (hits === null) return; // Cooldown or dead

      // Broadcast attack action for visual effect (even if missed)
      io.to(roomId).emit('player_attack_action', {
        attackerSocketId: socket.id,
        x: attacker.x,
        y: attacker.y,
        facingX: attacker.facingX,
        facingY: attacker.facingY,
        radius: attacker.radius,
      });

      if (!hits || hits.length === 0) return;

      // Notify all players about the hits
      for (const hit of hits) {
        io.to(roomId).emit('player_hit', {
          attackerSocketId: socket.id,
          targetSocketId: hit.targetSocketId,
          damage: GAME.attackDamage,
          targetHp: hit.target.hp,
          killed: hit.killed,
        });

        if (hit.killed) {
          io.to(roomId).emit('player_died', {
            targetSocketId: hit.targetSocketId,
            killerSocketId: socket.id,
            killerNickname: socket.nickname,
            targetNickname: hit.target.nickname,
          });
        }

        // Log to DB asynchronously (don't block socket handler)
        if (gameRoom.matchId) {
          saveMatchEvent(gameRoom.matchId, hit.killed ? 'player_died' : 'player_hit', {
            playerId: socket.playerId,
            targetId: hit.target.playerId,
            data: { damage: GAME.attackDamage, killed: hit.killed },
          }).catch((e) => logger.warn('Event save failed:', e.message));
        }
      }
    });

    // ── leave_room: Player manually leaves ──────────────────────
    socket.on('leave_room', async () => {
      await handlePlayerLeave(socket, io);
    });

    // ── disconnect ───────────────────────────────────────────────
    socket.on('disconnect', async () => {
      decrement('connections');
      logger.info('[Socket] Client disconnected', { socketId: socket.id, username: socket.username });
      await handlePlayerLeave(socket, io);
    });

    // ── ping: Health check from client ──────────────────────────
    socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));
  });

  // ── Game Loop Broadcaster ─────────────────────────────────────

  /**
   * Start the match: create DB record, start game loop, broadcast state at tick rate.
   */
  async function startMatch(io, roomId, gameRoom, triggerSocket = null) {
    const emitError = (msg) => {
      if (triggerSocket) triggerSocket.emit('error', { message: msg });
      logger.error('[startMatch] Error:', msg);
    };

    try {
      // Create match record in DB
      const match = await Match.create({
        room_id: roomId,
        status: 'playing',
        player_count: gameRoom.getPlayerCount(),
      });

      gameRoom.start(match.id);

      // Create MatchPlayer records — skip if playerId missing (guest/debug case)
      for (const player of gameRoom.players.values()) {
        if (!player.playerId) {
          logger.warn('[startMatch] Player has no playerId, skipping MatchPlayer record', {
            nickname: player.nickname,
          });
          continue;
        }
        try {
          await MatchPlayer.create({
            match_id: match.id,
            player_id: player.playerId,
          });
        } catch (mpErr) {
          logger.warn('[startMatch] MatchPlayer create failed:', mpErr.message);
          // Non-fatal — continue
        }
      }

      // Update room status
      await Room.update({ status: 'playing' }, { where: { id: roomId } });

      // Broadcast match start to ALL clients in the room
      io.to(roomId).emit('match_started', {
        matchId: match.id,
        mapWidth: GAME.mapWidth,
        mapHeight: GAME.mapHeight,
      });

      logger.gameEvent('match_started', { matchId: match.id, roomId });

      // Game loop: broadcast state at configured tick rate
      const tickMs = Math.floor(1000 / GAME.tickRate);
      gameRoom.tickInterval = setInterval(async () => {
        if (!gameRoom.isRunning) return;

        const { collected } = gameRoom.tick();

        // Broadcast full game state to all players
        const state = gameRoom.getState();
        io.to(roomId).emit('game_state', state);

        // Emit particle collection events
        if (collected && collected.length > 0) {
          io.to(roomId).emit('particles_collected', collected);
          // Broadcast leaderboard update
          const scores = state.players
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map((p, i) => ({ rank: i + 1, nickname: p.nickname, score: p.score, kills: p.kills }));
          io.to(roomId).emit('leaderboard_update', { scores });
        }
      }, tickMs);

      // Auto-end match after 3 minutes
      setTimeout(() => endMatch(io, roomId, gameRoom), 3 * 60 * 1000);

    } catch (err) {
      logger.error('[Socket] startMatch error:', err.message, err.stack);
      emitError(`Failed to start match: ${err.message}`);
    }
  }

  /**
   * End the match: save results to DB, update leaderboard.
   */
  async function endMatch(io, roomId, gameRoom) {
    if (!gameRoom.isRunning) return;

    const results = gameRoom.getResults();
    gameRoom.stop();

    try {
      const match = await Match.findByPk(gameRoom.matchId);
      if (!match) return;

      const winnerData = results.rankings[0];
      const winner = winnerData
        ? await Player.findByPk(winnerData.playerId)
        : null;

      // Update match record
      await match.update({
        status: 'finished',
        ended_at: new Date(),
        winner_id: winner?.id || null,
        duration_seconds: results.duration,
      });

      // Update match_players stats and player profiles
      for (const ranking of results.rankings) {
        await MatchPlayer.update(
          { score: ranking.score, kills: ranking.kills, deaths: ranking.deaths, rank: ranking.rank },
          { where: { match_id: match.id, player_id: ranking.playerId } }
        );

        // Update global player stats
        const player = await Player.findByPk(ranking.playerId);
        if (player) {
          await player.increment({
            total_score: ranking.score,
            kills: ranking.kills,
            deaths: ranking.deaths,
            wins: ranking.rank === 1 ? 1 : 0,
            losses: ranking.rank !== 1 ? 1 : 0,
          });
        }
      }

      // Save event log to DB
      for (const event of results.events) {
        await saveMatchEvent(match.id, event.type, event.data).catch(() => {});
      }

      await Room.update({ status: 'finished' }, { where: { id: roomId } });

      // Notify clients
      io.to(roomId).emit('match_ended', {
        results: results.rankings,
        winner: winner ? { nickname: winner.nickname } : null,
        duration: results.duration,
      });

      logger.gameEvent('match_ended', { matchId: match.id, winner: winner?.nickname });

      // Clean up room after 10 seconds
      setTimeout(() => GameManager.destroy(roomId), 10000);

    } catch (err) {
      logger.error('[Socket] endMatch error:', err.message);
    }
  }

  /**
   * Handle player leaving a room (disconnect or explicit leave).
   */
  async function handlePlayerLeave(socket, io) {
    const roomId = socket.currentRoomId;
    if (!roomId) return;

    socket.currentRoomId = null;
    socket.leave(roomId);

    const gameRoom = GameManager.get(roomId);
    if (gameRoom) {
      gameRoom.removePlayer(socket.id);

      // Update DB player count
      try {
        const room = await Room.findByPk(roomId);
        if (room && room.player_count > 0) {
          await room.decrement('player_count');
        }
      } catch (e) { /* non-critical */ }

      io.to(roomId).emit('player_left', {
        socketId: socket.id,
        nickname: socket.nickname,
        playerCount: gameRoom.getPlayerCount(),
      });

      // End match if room is empty
      if (gameRoom.isRunning && gameRoom.getPlayerCount() === 0) {
        await endMatch(io, roomId, gameRoom);
      }
    }
  }

  /**
   * Save a match event to database.
   */
  async function saveMatchEvent(matchId, eventType, { playerId, targetId, data } = {}) {
    await MatchEvent.create({
      match_id: matchId,
      event_type: eventType,
      player_id: playerId || null,
      target_id: targetId || null,
      data: data || {},
    });
  }
};

module.exports = { initSocket };
