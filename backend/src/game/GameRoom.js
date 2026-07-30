// src/game/GameRoom.js — In-memory game room state
// Each room has its own game instance. State is kept in memory (per-instance).
// For multi-instance scalability: move state to Redis (see SCALABILITY.md)

const { GAME } = require('../config/env');
const { circleCollide, circleRectCollide, lineRectCollide, clampToMap, normalizeMovement, randomMapPosition } = require('./Physics');
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

  // ── Particle Management ──────────────────────────────────────

  _spawnParticles() {
    while (this.particles.size < GAME.particleCount) {
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
    const pos = randomMapPosition(this.mapConfig.width, this.mapConfig.height, 60);
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
      hp: GAME.playerHp,
      maxHp: GAME.playerHp,
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
    logger.gameEvent('player_joined', { roomId: this.roomId, nickname: playerData.nickname });
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
    if (!attacker || !attacker.alive) return null;

    const now = Date.now();
    if (now - attacker.lastAttack < ATTACK_COOLDOWN) return null;
    attacker.lastAttack = now;

    // Return empty array instead of null so caller knows attack happened (even if no hit)
    const hits = [];
    for (const [sid, target] of this.players) {
      if (sid === socketId || !target.alive) continue;

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

        target.hp -= GAME.attackDamage;

        const event = { attacker: attacker.nickname, target: target.nickname, damage: GAME.attackDamage };

        if (target.hp <= 0) {
          target.hp = 0;
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

          // Respawn after 3 seconds
          setTimeout(() => this._respawnPlayer(sid), 3000);
        } else {
          this._logEvent('player_hit', { playerId: target.playerId, damage: GAME.attackDamage });
        }

        hits.push({ targetSocketId: sid, target, killed: target.hp <= 0, event });
      }
    }

    return hits;
  }

  _respawnPlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;
    const pos = randomMapPosition(this.mapConfig.width, this.mapConfig.height, 60);
    player.x = pos.x;
    player.y = pos.y;
    player.hp = GAME.playerHp;
    player.alive = true;
    logger.gameEvent('player_respawned', { nickname: player.nickname });
  }

  // ── Game Tick ────────────────────────────────────────────────

  tick() {
    if (!this.isRunning) return;

    // Move all alive players
    for (const player of this.players.values()) {
      if (!player.alive) continue;

      // Tự động hồi máu (Auto health regeneration) - Hồi 0.1 HP mỗi tick, không vượt quá maxHp
      if (player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + 0.1);
      }

      // Cứ mỗi 50 điểm sẽ bự lên từ từ thêm 5 đơn vị radius (rất mượt mà)
      player.radius = 16 + Math.min((player.score / 50) * 5, 40);

      let newPos = clampToMap({
        x: player.x + player.dx,
        y: player.y + player.dy,
      }, this.mapConfig.width, this.mapConfig.height, player.radius);

      // Check collision with obstacles
      if (this.mapConfig.theme?.obstacles) {
        for (const obs of this.mapConfig.theme.obstacles) {
          if (circleRectCollide({ x: newPos.x, y: newPos.y, radius: player.radius }, obs)) {
            // Collision detected! Revert to old position
            newPos = { x: player.x, y: player.y };
            break;
          }
        }
      }

      player.x = newPos.x;
      player.y = newPos.y;
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
    return {
      roomId: this.roomId,
      mapUrl: this.mapConfig.url,
      players: Array.from(this.players.values()).map((p) => ({
        socketId: p.socketId,
        playerId: p.playerId,
        nickname: p.nickname,
        color: p.color,
        x: Math.round(p.x),
        y: Math.round(p.y),
        hp: p.hp,
        maxHp: p.maxHp,
        score: p.score,
        kills: p.kills,
        alive: p.alive,
        avatarUrl: p.avatarUrl,
        weaponUrl: p.weaponUrl,
        facingX: p.facingX,
        facingY: p.facingY,
        radius: p.radius,
      })),
      particles: Array.from(this.particles.values()),
      timestamp: Date.now(),
    };
  }

  // ── Start / Stop ─────────────────────────────────────────────

  start(matchId) {
    this.matchId = matchId;
    this.isRunning = true;
    this.startedAt = Date.now();
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
