// src/socket/index.js — Socket.IO server setup and connection handler
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { JWT_SECRET, GAME } = env;
const { User, Player, Room, Match, MatchPlayer, MatchEvent, LeaderboardScore } = require('../models');
const GameManager = require('../game/GameManager');
const Matchmaker = require('../game/Matchmaker');
const { metrics, increment, decrement } = require('../utils/metrics');
const logger = require('../utils/logger');
const { ServiceBusClient } = require('@azure/service-bus');
const { v4: uuidv4 } = require('uuid');
const {
  recordDailyQuestEvent,
} = require('../services/dailyQuestService');
const { getCountryFromIp } = require('../services/mapsService');

// Init Service Bus Client (if configured)
// let sbSender = null;
// if (SERVICE_BUS_CONNECTION_STRING) {
//   try {
//     const sbClient = new ServiceBusClient(SERVICE_BUS_CONNECTION_STRING);
//     sbSender = sbClient.createSender('match-results');
//   } catch (err) {
//     logger.error('Failed to init ServiceBusClient:', err.message);
//   }
// }

// Service Bus sender được khởi tạo sau khi Key Vault đã tải secret.
let sbSender = null;

async function recordPlayerPlaytimeUnlocked(gameRoom, player, reason) {
  if (!gameRoom?.matchId || !player?.playerId) return 0;

  const totalSeconds = player.sessionStartedAt
    ? gameRoom.getPlayerPlaytimeSeconds(player)
    : Math.max(0, Number(player.playtimeSeconds) || 0);
  const reportedSeconds = Math.max(
    0,
    Number(player.playtimeReportedSeconds) || 0
  );
  const deltaSeconds = Math.max(0, totalSeconds - reportedSeconds);

  if (deltaSeconds <= 0) return 0;

  await recordDailyQuestEvent({
    schemaVersion: 1,
    eventId:
      `PLAYTIME:${gameRoom.matchId}:${player.playerId}:`
      + `${reportedSeconds}:${totalSeconds}`,
    eventType: 'PLAYTIME_RECORDED',
    occurredAt: new Date().toISOString(),
    matchId: gameRoom.matchId,
    playerId: player.playerId,
    durationSeconds: deltaSeconds,
    reason,
  });

  player.playtimeReportedSeconds = totalSeconds;
  return deltaSeconds;
}

async function recordPlayerPlaytime(gameRoom, player, reason) {
  if (!player) return 0;

  const previousTask = player.playtimeRecordPromise || Promise.resolve();
  const currentTask = previousTask
    .catch(() => {})
    .then(() => recordPlayerPlaytimeUnlocked(gameRoom, player, reason));

  player.playtimeRecordPromise = currentTask;

  try {
    return await currentTask;
  } finally {
    if (player.playtimeRecordPromise === currentTask) {
      player.playtimeRecordPromise = null;
    }
  }
}

async function persistMatchParticipant(gameRoom, participant) {
  if (!gameRoom?.matchId || !participant?.playerId) return null;

  const [matchPlayer] = await MatchPlayer.findOrCreate({
    where: {
      match_id: gameRoom.matchId,
      player_id: participant.playerId,
    },
    defaults: {
      joined_at: new Date(
        participant.joinedAt || gameRoom.startedAt || Date.now()
      ),
    },
  });

  await matchPlayer.update({
    score: Math.max(0, Math.floor(Number(participant.score) || 0)),
    kills: Math.max(0, Math.floor(Number(participant.kills) || 0)),
    deaths: Math.max(0, Math.floor(Number(participant.deaths) || 0)),
    ...(participant.rank
      ? { rank: Math.max(1, Math.floor(Number(participant.rank))) }
      : {}),
    ...(participant.leftAt
      ? { left_at: new Date(participant.leftAt) }
      : {}),
  });

  return matchPlayer;
}
/**
 * Initialize Socket.IO event handlers.
 * Attaches to an existing Socket.IO server instance.
 */
const initSocket = (io) => {
  // Khởi tạo sau khi bootstrap đã tải secret từ Azure Key Vault.
  if (!sbSender && env.SERVICE_BUS_CONNECTION_STRING) {
    try {
      const sbClient = new ServiceBusClient(
        env.SERVICE_BUS_CONNECTION_STRING
      );

      sbSender = sbClient.createSender('match-results');

      logger.info(
        '[ServiceBus] Sender match-results initialized'
      );
    } catch (err) {
      logger.error(
        '[ServiceBus] Failed to initialize match-results sender:',
        err.message
      );
    }
  }

  // Initialize Matchmaker with io instance
  Matchmaker.init(io);

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
    socket.on('join_room', async ({ roomId, roomCode, password }) => {
      try {
        const room = await Room.findByPk(roomId);
        if (!room) return socket.emit('error', { message: 'Room not found' });
        if (room.status === 'finished') return socket.emit('error', { message: 'Room has ended' });
        if (room.player_count >= room.max_players) {
          return socket.emit('error', { message: 'Room is full' });
        }

        // Mark this as the latest room the socket wants to join
        socket.latestRequestedRoomId = roomId;

        // Get or create in-memory game room (this is async and may take time)
        const isQuickMatch = room.name.startsWith('Quick Match ');
        const gameRoom = await GameManager.getOrCreate(
          roomId,
          roomCode || room.code,
          { isQuickMatch }
        );

        // Keep existing in-memory rooms consistent with the database room type.
        gameRoom.isQuickMatch = isQuickMatch;

        // If the user clicked join on ANOTHER room while we were waiting, ABORT this stale request!
        if (socket.latestRequestedRoomId !== roomId) {
          logger.warn(`[Socket] Aborted stale join_room for ${roomId} because user moved to ${socket.latestRequestedRoomId}`);
          return;
        }

        // Join Socket.IO room ONLY after we confirm this is still the requested room
        const strRoomId = String(roomId);
        socket.join(strRoomId);
        socket.currentRoomId = strRoomId;

        // Check if THIS socket is already in the room (e.g. duplicate join request from spamming click)
        if (gameRoom.players.has(socket.id)) {
          // Just resend the state and return gracefully
          socket.emit('room_joined', {
            roomId: roomCode || room.code,
            state: gameRoom.getState(),
            matchStatus: room.status,
            mapWidth: gameRoom.mapConfig.width,
            mapHeight: gameRoom.mapConfig.height,
            mapUrl: gameRoom.mapConfig.url,
            mapTheme: gameRoom.mapConfig.theme,
          });
          return;
        }

        // Prevent same account from playing against itself from ANOTHER tab/browser
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

        // A player joining after the match started must also be persisted.
        // Without this record, their score and match history are lost.
        if (
          gameRoom.isRunning &&
          gameRoom.matchId &&
          socket.playerId
        ) {
          try {
            const [, created] = await MatchPlayer.findOrCreate({
              where: {
                match_id: gameRoom.matchId,
                player_id: socket.playerId,
              },
              defaults: {
                joined_at: new Date(playerState.joinedAt || Date.now()),
              },
            });

            if (created) {
              await Match.increment('player_count', {
                where: { id: gameRoom.matchId },
              });
            }
          } catch (matchPlayerError) {
            logger.error(
              '[LateJoin] Failed to create MatchPlayer:',
              matchPlayerError.message
            );
          }
        }

        // Update room player count
        await room.increment('player_count');

        socket.isHost = (room.created_by === socket.userId);

        const newPlayer = gameRoom.players.get(socket.id);
        // Notify everyone in the room
        io.to(String(roomId)).emit('player_joined', {
          socketId: newPlayer.socketId,
          playerId: newPlayer.playerId,
          nickname: newPlayer.nickname,
          color: newPlayer.color,
          x: newPlayer.x,
          y: newPlayer.y,
          level: newPlayer.level,
          xp: newPlayer.xp,
          maxXp: newPlayer.maxXp,
          alive: newPlayer.alive,
          respawning: newPlayer.respawning,
          facingX: newPlayer.facingX,
          facingY: newPlayer.facingY,
          isBoosting: newPlayer.isBoosting,
          scale: Math.min(1 + newPlayer.level * GAME.sizeIncreasePerLevel, GAME.maxPlayerSizeMultiplier),
          avatarUrl: newPlayer.avatarUrl,
          weaponUrl: newPlayer.weaponUrl,
          radius: newPlayer.radius,
          score: newPlayer.score,
          kills: newPlayer.kills,
          playerCount: gameRoom.getPlayerCount(),
          isHost: socket.isHost,
        });

        // Send current state to the newly joined player
        socket.emit('room_joined', {
          roomId: roomCode || room.code,
          state: gameRoom.getState(),
          matchStatus: room.status, // pass status so frontend knows if it's playing
          mapWidth: gameRoom.mapConfig.width,
          mapHeight: gameRoom.mapConfig.height,
          mapUrl: gameRoom.mapConfig.url,
          mapTheme: gameRoom.mapConfig.theme,
          isHost: socket.isHost,
        });
        
        socket.emit('sync_particles', Array.from(gameRoom.particles.values()));

        logger.gameEvent('player_joined_room', {
          nickname: socket.nickname,
          roomId,
          playerCount: gameRoom.getPlayerCount(),
        });

        // Quick Match auto-start logic
        if (gameRoom.isQuickMatch && !gameRoom.isRunning) {
          // Send countdown event to newly joined player if timer is active
          if (gameRoom.autoStartTimer) {
             socket.emit('match_countdown', { seconds: 3 });
          } else {
             // First player joining triggers the 3-second countdown for the room
             io.to(String(roomId)).emit('match_countdown', { seconds: 3 });
             gameRoom.autoStartTimer = setTimeout(() => {
                startMatch(io, roomId, gameRoom);
             }, 3000);
          }
        }

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

      // ONLY host can start the match
      if (!socket.isHost) {
        socket.emit('error', { message: 'Chỉ có Chủ phòng mới có quyền bắt đầu trận!' });
        return;
      }

      if (gameRoom.isRunning) {
        // Already started — send current state
        socket.emit('match_started', {
          matchId: gameRoom.matchId,
          mapWidth: gameRoom.mapConfig.width,
          mapHeight: gameRoom.mapConfig.height,
          mapUrl: gameRoom.mapConfig.url,
          mapTheme: gameRoom.mapConfig.theme,
        });
        return;
      }

      logger.info('[Socket] Ready received', { nickname: socket.nickname, roomId });
      await startMatch(io, roomId, gameRoom, socket);
    });

    // ── player_move: Handle movement input ──────────────────────
    socket.on('player_move', ({ dx, dy, boosting }) => {
      const roomId = socket.currentRoomId;
      if (!roomId) {
        logger.warn(`[Socket] player_move ignored: no currentRoomId for socket ${socket.id}`);
        return;
      }

      const gameRoom = GameManager.get(roomId);
      if (!gameRoom) {
        logger.warn(`[Socket] player_move ignored: gameRoom not found for roomId ${roomId}`);
        return;
      }

      // cdx and cdy must be between -1 and 1.
      const cdx = Math.max(-1, Math.min(1, Number(dx) || 0));
      const cdy = Math.max(-1, Math.min(1, Number(dy) || 0));
      const isBoosting = Boolean(boosting);

      gameRoom.setPlayerMovement(socket.id, cdx, cdy, isBoosting);
    });

    // ── player_attack: Handle attack input ──────────────────────
    socket.on('player_attack', () => {
      const roomId = socket.currentRoomId;
      if (!roomId) {
        logger.warn(`[Socket] player_attack ignored: no currentRoomId for socket ${socket.id}`);
        return;
      }

      const gameRoom = GameManager.get(roomId);
      if (!gameRoom || !gameRoom.isRunning) {
        logger.warn(`[Socket] player_attack ignored: gameRoom not found or not running for roomId ${roomId}`);
        return;
      }

      const attacker = gameRoom.players.get(socket.id);
      if (!attacker || !attacker.alive) return;

      // Try to execute attack
      const hits = gameRoom.playerAttack(socket.id);
      if (hits === null) return; // Cooldown or dead

      // Broadcast attack action for visual effect (even if missed)
      io.to(String(roomId)).emit('player_attack_action', {
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
        io.to(String(roomId)).emit('player_hit', {
          attackerSocketId: socket.id,
          targetSocketId: hit.targetSocketId,
          damage: hit.event.damage,
          targetHp: hit.target.hp,
          killed: hit.killed,
        });

        if (hit.killed) {
          io.to(String(roomId)).emit('player_died', {
            targetSocketId: hit.targetSocketId,
            killerSocketId: socket.id,
            killerNickname: socket.nickname,
            targetNickname: hit.target.nickname,
          });
          if (socket.playerId && gameRoom.matchId) {
            recordDailyQuestEvent({
              schemaVersion: 1,
              eventId: uuidv4(),
              eventType: 'PLAYER_KILL',
              occurredAt: new Date().toISOString(),
              matchId: gameRoom.matchId,
              playerId: socket.playerId,
              targetPlayerId: hit.target.playerId || null,
            }).catch((eventError) => {
              logger.warn('[DailyQuest] Failed to publish kill event', {
                error: eventError.message,
                playerId: socket.playerId,
                matchId: gameRoom.matchId,
              });
            });
          }
        }

        // Log to DB asynchronously (don't block socket handler)
        if (gameRoom.matchId) {
          saveMatchEvent(gameRoom.matchId, hit.killed ? 'player_died' : 'player_hit', {
            playerId: socket.playerId,
            targetId: hit.target.playerId,
            data: { damage: hit.event.damage, killed: hit.killed },
          }).catch((e) => logger.warn('Event save failed:', e.message));
        }
      }
    });

    // ── global_chat_message: World chat ──────────────────────────
    socket.on('global_chat_message', async (msg) => {
      if (!msg || typeof msg !== 'string' || msg.trim().length === 0) return;

      const { moderateText } = require('../services/contentSafetyService');
      const { isSafe, censoredText } = await moderateText(msg.trim().substring(0, 150));

      io.emit('global_chat_message', {
        socketId: socket.id,
        nickname: socket.nickname,
        message: censoredText,
        timestamp: Date.now(),
      });
    });

    // ── join_quick_match ─────────────────────────────────────────
    socket.on('join_quick_match', async () => {
      // Get IP and use Azure Maps to get Region
      let xff = socket.handshake.headers['x-forwarded-for'];
      if (Array.isArray(xff)) xff = xff[0];
      const ip = (xff?.split(',')[0]) || socket.handshake.address;
      const region = await getCountryFromIp(ip);

      await Matchmaker.join({
        socketId: socket.id,
        userId: socket.userId,
        nickname: socket.nickname,
        region: region,
      });
    });

    // ── leave_quick_match ─────────────────────────────────────────
    socket.on('leave_quick_match', async () => {
      await Matchmaker.leaveBySocket(socket.id);
    });

    // ── leave_room: Player manually leaves ──────────────────────
    socket.on('leave_room', async () => {
      await handlePlayerLeave(socket, io);
    });

    // ── disconnect ───────────────────────────────────────────────
    socket.on('disconnect', async () => {
      decrement('connections');
      logger.info('[Socket] Client disconnected', { socketId: socket.id, username: socket.username });
      await Matchmaker.leaveBySocket(socket.id);
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
      io.to(String(roomId)).emit('match_started', {
        matchId: match.id,
        mapWidth: gameRoom.mapConfig.width,
        mapHeight: gameRoom.mapConfig.height,
        mapUrl: gameRoom.mapConfig.url,
        mapTheme: gameRoom.mapConfig.theme,
      });
      io.to(String(roomId)).emit('sync_particles', Array.from(gameRoom.particles.values()));

      logger.gameEvent('match_started', { matchId: match.id, roomId });

      // Game loop: broadcast state at configured tick rate
      const tickMs = Math.floor(1000 / GAME.tickRate);
      gameRoom.tickInterval = setInterval(async () => {
        if (!gameRoom.isRunning) return;

        const { collected, spawned } = gameRoom.tick();

        // Broadcast full game state to the entire room at once (massively reduces Azure REST API calls)
        io.to(String(roomId)).emit('game_state', gameRoom.getStateFor(null));

        // Emit particle events
        if (collected && collected.length > 0) {
          io.to(String(roomId)).emit('particles_collected', collected);
        }
        if (spawned && spawned.length > 0) {
          io.to(String(roomId)).emit('particles_spawned', spawned);
        }

        // Leaderboard broadcast logic
        gameRoom.leaderboardTick = (gameRoom.leaderboardTick || 0) + 1;
        if (gameRoom.leaderboardTick >= GAME.tickRate * 2) {
          gameRoom.leaderboardTick = 0;
          const scores = Array.from(gameRoom.players.values())
            .sort((a, b) => b.score - a.score)
            .map((p, i) => ({ rank: i + 1, nickname: p.nickname, score: p.score, kills: p.kills }));
          io.to(String(roomId)).emit('leaderboard_update', { scores });
        }
      }, tickMs);

      // Record playtime while the player is still in the match. This makes
      // quest progress visible without waiting for leave/end-match and also
      // protects the accumulated time if the container restarts unexpectedly.
      gameRoom.playtimeInterval = setInterval(() => {
        if (!gameRoom.isRunning || gameRoom.isEnding) return;

        for (const player of gameRoom.players.values()) {
          recordPlayerPlaytime(gameRoom, player, 'heartbeat').catch(
            (eventError) => {
              logger.warn('[DailyQuest] Playtime heartbeat failed', {
                error: eventError.message,
                playerId: player.playerId,
                matchId: gameRoom.matchId,
              });
            }
          );
        }
      }, 10000);

      // Auto-end match after configured duration
      setTimeout(() => endMatch(io, roomId, gameRoom), gameRoom.matchDuration);

    } catch (err) {
      logger.error('[Socket] startMatch error:', err.message, err.stack);
      emitError(`Failed to start match: ${err.message}`);
    }
  }

  /**
   * End the match: save results to DB, update leaderboard.
   */
  async function endMatch(io, roomId, gameRoom) {
    if (!gameRoom.isRunning || gameRoom.isEnding) return;

    gameRoom.isEnding = true;

    // Let an in-flight heartbeat finish before taking the final snapshot.
    // Otherwise the heartbeat and match-end flush could count overlapping time.
    await Promise.allSettled(
      Array.from(gameRoom.players.values())
        .map((player) => player.playtimeRecordPromise)
        .filter(Boolean)
    );

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

      // Update match_players stats & directly increment Player profile stats
      for (const ranking of results.rankings) {
        if (!ranking.playerId) continue;
        await persistMatchParticipant(gameRoom, ranking);

        // const isWin = ranking.rank === 1 ? 1 : 0;
        // const isLoss = ranking.rank > 1 ? 1 : 0;

        // await Player.increment({
        //   total_score: ranking.score || 0,
        //   kills: ranking.kills || 0,
        //   deaths: ranking.deaths || 0,
        //   wins: isWin,
        //   losses: isLoss,
        // }, { where: { id: ranking.playerId } }).catch((err) => {
        //   logger.error('[Socket] Failed to increment player stats', err);
        // });

        // Also update leaderboard_scores for all_time
        // try {
        //   const lb = await LeaderboardScore.findOne({
        //     where: { player_id: ranking.playerId, period: 'all_time' },
        //   });
        //   if (lb) {
        //     await lb.increment({
        //       score: ranking.score || 0,
        //       kills: ranking.kills || 0,
        //     });
        //   }
        // } catch (e) {}
      }

      // Save event log to DB
      for (const event of results.events) {
        await saveMatchEvent(match.id, event.type, event.data).catch(() => {});
      }

      await Room.update({ status: 'finished' }, { where: { id: roomId } });


      // Gửi thời gian chơi của từng người để cập nhật nhiệm vụ hằng ngày
      await Promise.allSettled(
        results.rankings.map((ranking) =>
          recordPlayerPlaytime(gameRoom, ranking, 'match_end')
        )
      );
      // Gửi kết quả lên Azure Service Bus để Function (Worker) tính toán bảng xếp hạng bất đồng bộ
      if (sbSender) {
        const messages = results.rankings.map(ranking => ({
          body: {
            event: 'match_ended',
            eventId: `MATCH_RESULT:${match.id}:${ranking.playerId}`,
            matchId: match.id,
            playerId: ranking.playerId,
            score: ranking.score,
            kills: ranking.kills,
            deaths: ranking.deaths,
            rank: ranking.rank,
          }
        }));
        try {
          await sbSender.sendMessages(messages);
          logger.info('[ServiceBus] Đã gửi thông báo kết thúc trận lên hàng đợi match-results');
        } catch (e) {
          logger.warn('[ServiceBus] Lỗi gửi thông báo:', e.message);
        }
      } else if (process.env.LEADERBOARD_UPDATER_URL) {
        // Fallback webhook
        for (const ranking of results.rankings) {
          try {
            fetch(process.env.LEADERBOARD_UPDATER_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventId: `MATCH_RESULT:${match.id}:${ranking.playerId}`,
                matchId: match.id,
                event: 'match_ended',
                playerId: ranking.playerId,
                score: ranking.score,
                kills: ranking.kills,
                deaths: ranking.deaths,
                rank: ranking.rank
              })
            }).catch(() => {});
          } catch (e) {}
        }
      }

      // Notify clients
      io.to(String(roomId)).emit('match_ended', {
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
      const leavingPlayer = gameRoom.players.get(socket.id);

      // Ghi nhận thời gian nếu người chơi rời khi trận vẫn đang chạy
      if (
        gameRoom.isRunning &&
        leavingPlayer?.playerId &&
        gameRoom.matchId &&
        gameRoom.startedAt
      ) {
        try {
          await recordPlayerPlaytime(
            gameRoom,
            leavingPlayer,
            'player_leave'
          );
        } catch (eventError) {
          logger.warn(
            '[DailyQuest] Failed to publish leave playtime event',
            {
              error: eventError.message,
              playerId: leavingPlayer.playerId,
              matchId: gameRoom.matchId,
            }
          );
        }
      }

      // Chỉ xóa người chơi sau khi đã gửi sự kiện thời gian
      gameRoom.removePlayer(socket.id);

      // Save score/history immediately for players who leave before the room
      // finishes. endMatch safely updates the same row again with final rank.
      if (gameRoom.isRunning && leavingPlayer?.playerId) {
        const participant = gameRoom.departedPlayers.get(
          leavingPlayer.playerId
        );

        if (participant) {
          try {
            await persistMatchParticipant(gameRoom, participant);
          } catch (persistError) {
            logger.error('[Match] Failed to persist leaving player', {
              error: persistError.message,
              playerId: leavingPlayer.playerId,
              matchId: gameRoom.matchId,
            });
          }
        }
      }

      // Update DB player count
      try {
        const room = await Room.findByPk(roomId);

        if (room && room.player_count > 0) {
          await room.decrement('player_count');
        }
      } catch (e) {
        /* non-critical */
      }

      io.to(String(roomId)).emit('player_left', {
        socketId: socket.id,
        nickname: socket.nickname,
        playerCount: gameRoom.getPlayerCount(),
      });

      // End match or destroy room if it is empty
      if (gameRoom.getPlayerCount() === 0) {
        if (gameRoom.isRunning) {
          await endMatch(io, roomId, gameRoom);
        } else {
          // Room hasn't started yet, but is now empty. Destroy it to save resources.
          try {
            await Room.update({ status: 'finished' }, { where: { id: roomId } });
          } catch(e) {}
          GameManager.destroy(roomId);
        }
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
