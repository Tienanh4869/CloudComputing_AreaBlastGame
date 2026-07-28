// src/game/Physics.js — Collision detection and game math utilities
const { GAME } = require('../config/env');

/**
 * Check collision between two circular objects.
 * All game entities are represented as circles for simplicity.
 */
const circleCollide = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < (a.radius + b.radius);
};

/**
 * Calculate distance between two points.
 */
const distance = (a, b) =>
  Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

/**
 * Clamp a position to stay within map bounds.
 */
const clampToMap = (pos, radius = 16) => ({
  x: Math.min(Math.max(pos.x, radius), GAME.mapWidth - radius),
  y: Math.min(Math.max(pos.y, radius), GAME.mapHeight - radius),
});

/**
 * Normalize movement vector (for diagonal movement speed fix).
 */
const normalizeMovement = (dx, dy) => {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { dx: 0, dy: 0 };
  return { dx: (dx / len) * GAME.playerSpeed, dy: (dy / len) * GAME.playerSpeed };
};

/**
 * Generate a random map position away from edges.
 */
const randomMapPosition = (margin = 50) => ({
  x: margin + Math.random() * (GAME.mapWidth - margin * 2),
  y: margin + Math.random() * (GAME.mapHeight - margin * 2),
});

module.exports = {
  circleCollide,
  distance,
  clampToMap,
  normalizeMovement,
  randomMapPosition,
};
