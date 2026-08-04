// src/game/GameRoom.js — In-memory game room state
// Each room has its own game instance. State is kept in memory (per-instance).
// For multi-instance scalability: move state to Redis (see SCALABILITY.md)

const { GAME } = require('../config/env');
const { circleCollide, circleRectCollide, resolveCircleRectCollision, lineRectCollide, clampToMap, normalizeMovement, randomMapPosition } = require('./Physics');
const { generateId } = require('../utils/helpers');
const logger = require('../utils/logger');

const PLAYER_RADIUS = 16;
const PARTICLE_RADIUS = 8;
const ATTACK_COOLDOWN = 800;   // ms between attacks

class GameRoom {
  constructor(roomId, roomCode, mapConfig) {
    this.roomId = roomId;
    this.roomCode = roomCode;
    this.mapConfig = mapConfig;
    this.players = new Map();      // socketId → player state
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
    const maxR = this.maxSafeZoneRadius || (Math.max(this.mapConfig.width, this.mapConfig.height) / 1.8);
    let safeZoneRadius = maxR;
    if (this.startedAt && this.matchDuration) {
      const progress = (Date.now() - this.startedAt) / this.matchDuration;
      safeZoneRadius = Math.max(80, maxR * (1 - progress));
    }
    return { cx, cy, radius: safeZoneRadius };
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
    const totalParticles = GAME.particleCount * 8; // More particles for larger map
    while (this.particles.size < totalParticles) {
      this._addParticle();
    }
  }

  _addParticle() {
    const id = generateId();
    const pos = randomMapPosition(this.mapConfig.width, this.mapConfig.height, 30);
    this.particles.set(id, {
      id,
      x: pos.x,
      y: pos.y,
      radius: PARTICLE_RADIUS,
      value: GAME.particleScore,
      color: this._randomParticleColor(),
    });
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
    };
    this.players.set(socketId, player);
    logger.gameEvent('player_joined', { roomId: this.roomId, nickname: playerData.nickname, x: pos.x, y: pos.y });
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    this.players.delete(socketId);
    if (player) {
      logger.gameEvent('player_left', { roomId: this.roomId, nickname: player.nickname });
    }
    return player;
  }

  getPlayerCount() {
    return this.players.size;
  }

  // ── Input Handling ───────────────────────────────────────────

  setPlayerMovement(socketId, dx, dy) {
    const player = this.players.get(socketId);
    if (!player || !player.alive) return;
    const normalized = normalizeMovement(dx, dy);
    player.dx = normalized.dx;
    player.dy = normalized.dy;

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
    if (now - attacker.lastAttack < ATTACK_COOLDOWN) return null;
    attacker.lastAttack = now;

    // Return empty array instead of null so caller knows attack happened (even if no hit)
    const hits = [];
    for (const [sid, target] of this.players) {
      if (sid === socketId || !target.alive || target.respawning) continue;

      const dist = Math.sqrt(
        Math.pow(attacker.x - target.x, 2) + Math.pow(attacker.y - target.y, 2)
      );

      const dynamicAttackRange = GAME.attackRange + (attacker.radius - 16) * 1.5;

      if (dist <= dynamicAttackRange) {
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
          
          // Reset target score after dropping
          target.score = 0;

          this._logEvent('player_died', {
            playerId: target.playerId,
            killerId: attacker.playerId,
            nickname: target.nickname,
          });
          logger.gameEvent('player_killed', { killer: attacker.nickname, victim: target.nickname });

          target.respawning = true;
          target.respawnTimer = 3;
          
          // Punish level
          target.level = Math.max(1, target.level - 1);
          target.xp = 0;
          target.maxXp = 10 * Math.pow(1.5, target.level - 1);

        hits.push({ targetSocketId: sid, target, killed: target.hp <= 0, event });
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
    if (!this.isRunning) return;

    this.tickCount++;
    const now = Date.now();

    // Calculate Safe Zone
    let safeZoneRadius = this.maxSafeZoneRadius;
    if (this.startedAt) {
      const progress = (now - this.startedAt) / this.matchDuration;
      safeZoneRadius = Math.max(0, this.maxSafeZoneRadius * (1 - progress));
    }
    const cx = this.mapConfig.width / 2;
    const cy = this.mapConfig.height / 2;

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

      // Safe zone damage (every 1 second = 30 ticks)
      if (this.tickCount % 30 === 0) {
        const distToCenter = Math.sqrt(Math.pow(player.x - cx, 2) + Math.pow(player.y - cy, 2));
        if (distToCenter > safeZoneRadius) {
          // Instant death by zone instead of slow HP loss
          player.deaths++;
          player.respawning = true;
          player.respawnTimer = 3;
          // Level reduction
          player.level = Math.max(1, player.level - 1);
          player.xp = 0;
          player.maxXp = 10 * Math.pow(1.5, player.level - 1);
          
          this._dropLoot(player.x, player.y, player.score);
          player.score = 0;
          this._logEvent('player_died_zone', { playerId: player.playerId, nickname: player.nickname });
        }
      }

      if (player.respawning) continue; // died to zone

      // Grow radius based on Level!
      player.radius = 16 + (player.level - 1) * 6;

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
        // Try X movement
        let nextX = player.x + player.dx;
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
        let nextY = player.y + player.dy;
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
    const collected = [];
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

          // Spawn replacement
          setTimeout(() => this._addParticle(), 2000);
          break;
        }
      }
    }

    return { collected };
  }

  // ── State Snapshot ───────────────────────────────────────────

  getState() {
    // Fallback for logic that doesn't need per-player fog of war
    return this.getStateFor(null);
  }

  getStateFor(viewerSocketId) {
    const viewer = viewerSocketId ? this.players.get(viewerSocketId) : null;
    
    // Calculate current safe zone
    let safeZoneRadius = this.maxSafeZoneRadius;
    const now = Date.now();
    if (this.startedAt) {
      const progress = (now - this.startedAt) / this.matchDuration;
      safeZoneRadius = Math.max(0, this.maxSafeZoneRadius * (1 - progress));
    }
    const cx = this.mapConfig.width / 2;
    const cy = this.mapConfig.height / 2;

    const playersArray = Array.from(this.players.values())
      .filter(p => {
        if (!viewer) return true;
        if (p.socketId === viewerSocketId) return true; // always see self
        // Fog of war: hide if in a different bush
        if (p.inBushId !== null && p.inBushId !== viewer.inBushId) return false;
        return true;
      })
      .map((p) => ({
        socketId: p.socketId,
        playerId: p.playerId,
        nickname: p.nickname,
        color: p.color,
        x: Math.round(p.x),
        y: Math.round(p.y),
        level: p.level,
        xp: p.xp,
        maxXp: p.maxXp,
        score: p.score,
        kills: p.kills,
        alive: p.alive,
        respawning: p.respawning,
        respawnTimer: p.respawnTimer,
        avatarUrl: p.avatarUrl,
        weaponUrl: p.weaponUrl,
        facingX: p.facingX,
        facingY: p.facingY,
        radius: p.radius,
        inBushId: p.inBushId,
      }));

    return {
      roomId: this.roomId,
      mapUrl: this.mapConfig.url,
      mapTheme: this.mapConfig.theme,
      players: playersArray,
      particles: Array.from(this.particles.values()),
      safeZone: { x: cx, y: cy, radius: safeZoneRadius },
      startTime: this.startedAt,
      matchDuration: this.matchDuration,
      timestamp: now,
    };
  }

  // ── Start / Stop ─────────────────────────────────────────────

  start(matchId) {
    this.matchId = matchId;
    this.isRunning = true;
    this.startedAt = Date.now();
    this.matchDuration = 120 * 1000; // 2 minutes
    this.maxSafeZoneRadius = Math.max(this.mapConfig.width, this.mapConfig.height) / 1.8; // Starts smaller so corners are poisoned early
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
    const rankings = Array.from(this.players.values())
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
