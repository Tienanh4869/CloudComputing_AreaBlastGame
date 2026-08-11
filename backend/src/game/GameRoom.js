// src/game/GameRoom.js — In-memory game room state
// Each room has its own game instance. State is kept in memory (per-instance).
// For multi-instance scalability: move state to Redis (see SCALABILITY.md)

const { GAME } = require('../config/env');
const { circleCollide, circleRectCollide, resolveCircleRectCollision, lineRectCollide, clampToMap, normalizeMovement, randomMapPosition } = require('./Physics');
const { generateId } = require('../utils/helpers');
const logger = require('../utils/logger');

const PLAYER_RADIUS = 16;
const PARTICLE_RADIUS = 8;

class GameRoom {
  constructor(roomId, roomCode, mapConfig) {
    this.roomId = roomId;
    this.roomCode = roomCode;
    this.mapConfig = mapConfig;
    this.players = new Map();      // socketId → player state
    this.departedPlayers = new Map();
    this.particles = new Map();    // particleId → particle state
    this.isRunning = false;
    this.tickInterval = null;
    this.startedAt = null;
    this.matchId = null;
    this.eventLog = [];            // In-memory event log

    // Pre-generate particles
    this._spawnParticles();
  }

  // ── Safe Zone & Spawn Calculation ────────────────────────────

  _getCurrentSafeZone() {
    const cx = this.mapConfig.width / 2;
    const cy = this.mapConfig.height / 2;
    return { cx, cy, radius: 999999 };
  }

  _getRandomSafeSpawnPosition() {
    const { cx, cy, radius } = this._getCurrentSafeZone();
    const obstacles = this.mapConfig?.theme?.obstacles || [];
    const playerRadius = PLAYER_RADIUS + 14; // Buffer margin

    // 1. Try up to 60 attempts to find a position inside safe zone & not in obstacle
    for (let attempt = 0; attempt < 60; attempt++) {
      const maxDist = Math.max(20, radius * 0.8);
      const r = Math.random() * maxDist;
      const angle = Math.random() * Math.PI * 2;
      
      const x = Math.min(Math.max(cx + r * Math.cos(angle), 60), this.mapConfig.width - 60);
      const y = Math.min(Math.max(cy + r * Math.sin(angle), 60), this.mapConfig.height - 60);

      const collides = obstacles.some(obs => circleRectCollide({ x, y, radius: playerRadius }, obs));
      if (!collides) {
        return { x, y };
      }
    }

    // 2. Spiral search around center if random tries all hit obstacles
    for (let step = 0; step < 250; step += 25) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        const x = Math.min(Math.max(cx + step * Math.cos(a), 60), this.mapConfig.width - 60);
        const y = Math.min(Math.max(cy + step * Math.sin(a), 60), this.mapConfig.height - 60);
        const collides = obstacles.some(obs => circleRectCollide({ x, y, radius: playerRadius }, obs));
        if (!collides) {
          return { x, y };
        }
      }
    }

    return { x: cx, y: cy };
  }

  // ── Particle Management ──────────────────────────────────────

  _spawnParticles() {
    const totalParticles = this.isQuickMatch ? 30 : 750; 
    while (this.particles.size < totalParticles) {
      this._addParticle();
    }
  }

  _addParticle() {
    const id = require('crypto').randomUUID(); // slightly faster than uuidv4 in node
    const x = Math.random() * (this.mapConfig.width - 40) + 20;
    const y = Math.random() * (this.mapConfig.height - 40) + 20;
    const isBig = Math.random() > 0.95;
    
    const radius = isBig ? 12 : 5;
    const value = isBig ? GAME.particleScore * 5 : GAME.particleScore;
    
    // Vibrant colors
    const colors = ['#FF3366', '#33CCFF', '#FFCC00', '#00FF66', '#FF9933'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const particle = { id, x, y, radius, value, color };
    this.particles.set(id, particle);
    
    if (this.newlySpawnedParticles) {
      this.newlySpawnedParticles.push(particle);
    }
    return id;
  }

  _randomParticleColor() {
    const colors = ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  _dropLoot(x, y, score) {
    if (score <= 0) return;
    
    // Drop 100% of score, max 30 particles to avoid lag
    const maxParticles = 30;
    const particleCount = Math.min(Math.ceil(score / GAME.particleScore), maxParticles);
    
    // Distribute score evenly among particles
    const valuePerParticle = Math.floor(score / particleCount);
    
    for (let i = 0; i < particleCount; i++) {
      const id = generateId();
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 40 + 20;
      
      const px = Math.min(Math.max(x + Math.cos(angle) * dist, PARTICLE_RADIUS), GAME.mapWidth - PARTICLE_RADIUS);
      const py = Math.min(Math.max(y + Math.sin(angle) * dist, PARTICLE_RADIUS), GAME.mapHeight - PARTICLE_RADIUS);
      
      this.particles.set(id, {
        id,
        x: px,
        y: py,
        radius: PARTICLE_RADIUS + (valuePerParticle > GAME.particleScore ? 4 : 0),
        value: valuePerParticle,
        color: this._randomParticleColor(),
      });
    }
  }

  // ── Player Management ────────────────────────────────────────

  addPlayer(socketId, playerData) {
    const pos = this._getRandomSafeSpawnPosition();
    const player = {
      socketId,
      playerId: playerData.playerId,
      nickname: playerData.nickname,
      color: playerData.color || '#4A90D9',
      avatarUrl: playerData.avatarUrl || null,
      weaponUrl: playerData.weaponUrl || null,
      x: pos.x,
      y: pos.y,
      radius: PLAYER_RADIUS,
      level: 1,
      xp: 0,
      maxXp: 10,
      score: 0,
      kills: 0,
      deaths: 0,
      alive: true,
      lastAttack: 0,
      dx: 0,
      dy: 0,
      facingX: 1, // default facing right
      facingY: 0,
      isBoosting: false,
      inBushId: null,
    };
    this.players.set(socketId, player);
    logger.gameEvent('player_joined', { roomId: this.roomId, nickname: playerData.nickname, x: pos.x, y: pos.y });
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);

    if (player && this.isRunning) {
      const participantKey = player.playerId || socketId;

      this.departedPlayers.set(participantKey, {
        ...player,
      });
    }

    this.players.delete(socketId);

    if (player) {
      logger.gameEvent('player_left', {
        roomId: this.roomId,
        nickname: player.nickname,
      });
    }

    return player;
  }

  getPlayerCount() {
    return this.players.size;
  }

  // ── Input Handling ───────────────────────────────────────────

  setPlayerMovement(socketId, dx, dy, boosting = false) {
    const player = this.players.get(socketId);
    if (!player || !player.alive) return;
    const normalized = normalizeMovement(dx, dy);
    player.dx = normalized.dx;
    player.dy = normalized.dy;
    player.isBoosting = boosting;

    // Update facing direction if moving
    if (normalized.dx !== 0 || normalized.dy !== 0) {
      player.facingX = normalized.dx;
      player.facingY = normalized.dy;
    }
  }

  playerAttack(socketId) {
    const attacker = this.players.get(socketId);
    if (!attacker || !attacker.alive || attacker.respawning) return null;

    const now = Date.now();
    if (now - attacker.lastAttack < GAME.slashCooldownMs) return null;
    attacker.lastAttack = now;

    // Return empty array instead of null so caller knows attack happened (even if no hit)
    const hits = [];
    for (const [sid, target] of this.players) {
      if (sid === socketId || !target.alive || target.respawning) continue;

      const dist = Math.sqrt(
        Math.pow(attacker.x - target.x, 2) + Math.pow(attacker.y - target.y, 2)
      );

      // Dynamic attack range based on level (increases range)
      const dynamicAttackRange = 50 + (attacker.level - 1) * 8;

      // Hit if the distance between centers is less than the attack range plus the target's radius
      if (dist <= dynamicAttackRange + (target.radius || 20)) {
        // Check line of sight (cover/hiding)
        let hasLoS = true;
        if (this.mapConfig.theme?.obstacles) {
          for (const obs of this.mapConfig.theme.obstacles) {
            if (lineRectCollide(attacker.x, attacker.y, target.x, target.y, obs)) {
              hasLoS = false;
              break;
            }
          }
        }

        if (!hasLoS) continue; // Attack blocked by obstacle!

        // One hit kill!
        const event = { attacker: attacker.nickname, target: target.nickname, damage: 9999 };
        
        target.alive = false;
        target.deaths++;
          attacker.kills++;
          attacker.score += 50;  // Bonus score for kill
          event.killed = true;

          // Drop particles based on victim's score
          this._dropLoot(target.x, target.y, target.score);
          
          // Penalize target score (lose 30%) after dropping
          target.score = Math.floor(target.score * 0.7);

          this._logEvent('player_died', {
            playerId: target.playerId,
            killerId: attacker.playerId,
            nickname: target.nickname,
          });
          logger.gameEvent('player_killed', { killer: attacker.nickname, victim: target.nickname });

          target.respawning = true;
          target.respawnTimer = 5;
          
          // Punish level
          target.level = Math.max(1, target.level - 1);
          target.xp = 0;
          target.maxXp = 10 * Math.pow(1.5, target.level - 1);

        hits.push({ targetSocketId: sid, target, killed: true, event });
      }
    }

    return hits;
  }

  _respawnPlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;
    const pos = this._getRandomSafeSpawnPosition();
    player.x = pos.x;
    player.y = pos.y;
    player.alive = true;
    player.respawning = false;
    logger.gameEvent('player_respawned', { nickname: player.nickname, x: pos.x, y: pos.y });
  }

  // ── Game Tick ────────────────────────────────────────────────

  tick() {
    if (!this.isRunning) return { collected: [], spawned: [] };

    this.tickCount++;
    const now = Date.now();
    
    const collected = [];
    this.newlySpawnedParticles = [];
    
    // Move all alive players
    for (const player of this.players.values()) {
      // Skip fully dead players that aren't respawning
      if (!player.alive && !player.respawning) continue;

      if (player.respawning) {
        // Handle Respawn countdown
        if (this.tickCount % 30 === 0) {
          player.respawnTimer--;
          if (player.respawnTimer <= 0) {
            player.respawning = false;
            player.alive = true; // MUST SET ALIVE TO TRUE!
            const pos = this._getRandomSafeSpawnPosition();
            player.x = pos.x;
            player.y = pos.y;
            logger.gameEvent('player_respawned', { nickname: player.nickname, x: pos.x, y: pos.y });
          }
        }
        continue;
      }

      // Hitbox radius scales with level
      const scale = Math.min(1 + player.level * GAME.sizeIncreasePerLevel, GAME.maxPlayerSizeMultiplier);
      player.radius = 20 * scale;

      // Handle Boost XP Drain
      if (player.isBoosting) {
        // ~20 XP per sec (at 30 TPS -> 0.67 XP per tick)
        const xpDrain = 0.67;
        const scoreDrain = 2; // ~60 points per sec
        player.xp -= xpDrain;
        player.score = Math.max(0, player.score - scoreDrain);

        if (player.xp <= 0) {
          if (player.level > 1) {
            // Drop a level
            player.level--;
            player.maxXp = 10 * Math.pow(1.5, player.level - 1);
            player.xp = player.maxXp - xpDrain; // wrap around
          } else {
            // Cannot drop below Level 1
            player.xp = 0;
            player.isBoosting = false; // Force stop
          }
        }
      }

      // 1. If player grew bigger and penetrates an obstacle, gently push them away so they NEVER get stuck
      if (this.mapConfig.theme?.obstacles) {
        for (const obs of this.mapConfig.theme.obstacles) {
          const resolved = resolveCircleRectCollision({ x: player.x, y: player.y, radius: player.radius }, obs);
          player.x = resolved.x;
          player.y = resolved.y;
        }
      }

      // 2. Smooth movement with separate X/Y slide against obstacles
      if (player.dx !== 0 || player.dy !== 0) {
        // Calculate speed dynamically
        // Reduce base speed further for better control (multiplier 0.55)
        let speedMultiplier = Math.max(0.5, 1 - (player.level * 0.005)) * 0.55;
        if (player.isBoosting) speedMultiplier *= 1.4;
        const currentSpeed = GAME.playerSpeed * speedMultiplier;

        // Try X movement
        let nextX = player.x + player.dx * currentSpeed;
        let collideX = false;
        if (this.mapConfig.theme?.obstacles) {
          for (const obs of this.mapConfig.theme.obstacles) {
            if (circleRectCollide({ x: nextX, y: player.y, radius: player.radius }, obs)) {
              collideX = true;
              break;
            }
          }
        }
        if (!collideX) {
          player.x = nextX;
        }

        // Try Y movement
        let nextY = player.y + player.dy * currentSpeed;
        let collideY = false;
        if (this.mapConfig.theme?.obstacles) {
          for (const obs of this.mapConfig.theme.obstacles) {
            if (circleRectCollide({ x: player.x, y: nextY, radius: player.radius }, obs)) {
              collideY = true;
              break;
            }
          }
        }
        if (!collideY) {
          player.y = nextY;
        }

        // Post-move safety pushout
        if (this.mapConfig.theme?.obstacles) {
          for (const obs of this.mapConfig.theme.obstacles) {
            const resolved = resolveCircleRectCollision({ x: player.x, y: player.y, radius: player.radius }, obs);
            player.x = resolved.x;
            player.y = resolved.y;
          }
        }
      }

      // 3. Keep within map boundaries
      const clamped = clampToMap({ x: player.x, y: player.y }, this.mapConfig.width, this.mapConfig.height, player.radius);
      player.x = clamped.x;
      player.y = clamped.y;

      // Update Bushes logic
      player.inBushId = null;
      if (this.mapConfig.theme?.bushes) {
        for (let i = 0; i < this.mapConfig.theme.bushes.length; i++) {
          const bush = this.mapConfig.theme.bushes[i];
          if (circleRectCollide({ x: player.x, y: player.y, radius: player.radius }, bush)) {
            player.inBushId = i;
            break;
          }
        }
      }
    }

    // Check particle collisions
    for (const [pid, particle] of this.particles) {
      for (const player of this.players.values()) {
        if (!player.alive) continue;

        const dist = Math.sqrt(
          Math.pow(player.x - particle.x, 2) + Math.pow(player.y - particle.y, 2)
        );

        if (dist < player.radius + particle.radius) {
          player.score += particle.value;
          player.xp += particle.value;
          
          if (player.xp >= player.maxXp) {
            player.level += 1;
            player.xp = player.xp - player.maxXp;
            player.maxXp = Math.floor(player.maxXp * 1.5);
          }
          
          this.particles.delete(pid);
          collected.push({ particleId: pid, playerId: player.playerId, score: player.score });

          this._logEvent('particle_collected', {
            playerId: player.playerId,
            particleId: pid,
            score: player.score,
          });

          // Instantly respawn a new particle elsewhere to maintain high density
          if (this.isRunning) this._addParticle();
          break;
        }
      }
    }

    const spawned = [...this.newlySpawnedParticles];
    this.newlySpawnedParticles = [];
    return { collected, spawned };
  }

  // ── State Snapshot (Legacy, replaced by Array Loops) ────────
  // We keep this for `room_joined` payload so they get the initial state
  getState() {
    return this.getStateFor(null);
  }

  getStateFor(viewerSocketId) {
    const now = Date.now();
    const playersArray = Array.from(this.players.values()).map((p) => ({
      socketId: p.socketId,
      playerId: p.playerId,
      nickname: p.nickname,
      color: p.color,
      x: Math.round(p.x),
      y: Math.round(p.y),
      level: p.level,
      xp: p.xp,
      maxXp: p.maxXp,
      alive: p.alive,
      respawning: p.respawning,
      respawnTimer: p.respawnTimer,
      facingX: p.facingX,
      facingY: p.facingY,
      isBoosting: p.isBoosting,
      scale: Math.min(1 + p.level * GAME.sizeIncreasePerLevel, GAME.maxPlayerSizeMultiplier),
      avatarUrl: p.avatarUrl,
      weaponUrl: p.weaponUrl,
      radius: p.radius,
      score: p.score,
      kills: p.kills,
    }));

    return {
      roomId: this.roomId,
      mapUrl: this.mapConfig.url,
      mapTheme: this.mapConfig.theme,
      players: playersArray,
      particles: [], // Omitted to save bandwidth
      startTime: this.startedAt,
      matchDuration: this.matchDuration,
      timeLeft: this.startedAt ? Math.max(0, Math.floor((this.matchDuration - (now - this.startedAt)) / 1000)) : 0,
      timestamp: now,
    };
  }

  // ── Broadcast Loops (Spatial Partitioning & Array Compression) ──

  _broadcastCombatTick(io) {
    // 1. Group players into their Grid Cells
    const { getCell } = require('./GridManager');
    const cellsData = {};
    
    for (const p of this.players.values()) {
      if (!p.alive && !p.respawning) continue;
      
      const cellId = getCell(p.x, p.y).id;
      if (!cellsData[cellId]) cellsData[cellId] = [];
      
      // Pack Data: [socketId (substring for size?), x, y, angle, state, scale]
      // Since socketId is string, we'll keep it but array is smaller than object
      // state: 0=idle, 1=moving, 2=attacking, 3=boosting
      let state = 0;
      if (p.isBoosting) state = 3;
      else if (p.isAttacking) state = 2; // Assuming we add this flag during attack
      else if (p.dx || p.dy) state = 1;
      
      const angle = Math.atan2(p.facingY || 0, p.facingX || 1);
      const scale = Math.min(1 + p.level * GAME.sizeIncreasePerLevel, GAME.maxPlayerSizeMultiplier);

      cellsData[cellId].push([
        p.socketId,
        Math.round(p.x),
        Math.round(p.y),
        Math.round(angle * 100) / 100, // compressed float
        state,
        Math.round(scale * 100) / 100,
      ]);
    }

    // 2. Broadcast to each grid room
    for (const [cellId, data] of Object.entries(cellsData)) {
      io.to(`room_${this.roomId}_grid_${cellId}`).emit('u', data); // 'u' = update
    }
  }

  _broadcastSlowData(io) {
    // Top 10 Leaderboard
    const top10 = Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(p => [p.nickname, p.score, p.kills]);

    // Minimap relative dots
    const mapW = this.mapConfig.width;
    const mapH = this.mapConfig.height;
    const minimapDots = Array.from(this.players.values())
      .filter(p => p.alive)
      .map(p => [
        p.socketId,
        Math.round((p.x / mapW) * 100), // % X
        Math.round((p.y / mapH) * 100), // % Y
      ]);

    io.to(String(this.roomId)).emit('slow_sync', { top: top10, map: minimapDots });
  }

  // ── Start / Stop ─────────────────────────────────────────────

  start(matchId) {
    this.departedPlayers.clear();
    this.matchId = matchId;
    this.isRunning = true;
    this.startedAt = Date.now();
    this.matchDuration = 4 * 60 * 1000; // 4 minutes
    this.tickCount = 0;

    this._logEvent('match_started', { matchId });
    logger.gameEvent('match_started', { roomId: this.roomId, matchId });
  }

  stop() {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this._logEvent('match_ended', {
      duration: Math.floor((Date.now() - this.startedAt) / 1000),
    });
  }

  // ── Results ──────────────────────────────────────────────────

  getResults() {
    const participants = new Map();

    for (const player of this.departedPlayers.values()) {
      participants.set(player.playerId || player.socketId, player);
    }

    for (const player of this.players.values()) {
      participants.set(player.playerId || player.socketId, player);
    }

    const rankings = Array.from(participants.values())
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({
        playerId: p.playerId,
        nickname: p.nickname,
        score: p.score,
        kills: p.kills,
        deaths: p.deaths,
        rank: i + 1,
      }));

    return {
      rankings,
      winner: rankings[0] || null,
      duration: Math.floor((Date.now() - this.startedAt) / 1000),
      events: this.eventLog,
    };
  }

  // ── Event Log ────────────────────────────────────────────────

  _logEvent(type, data = {}) {
    this.eventLog.push({
      type,
      data,
      timestamp: Date.now(),
    });
  }
}

module.exports = GameRoom;
