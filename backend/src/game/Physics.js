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
 * Check collision between a circle (player) and a rectangle (obstacle).
 */
const circleRectCollide = (circle, rect) => {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  const distanceX = circle.x - closestX;
  const distanceY = circle.y - closestY;
  return (distanceX * distanceX + distanceY * distanceY) < (circle.radius * circle.radius);
};

/**
 * Check if a line segment intersects a rectangle.
 * Used for Line of Sight / Attack blocking.
 */
const lineRectCollide = (x1, y1, x2, y2, rect) => {
  const rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
  
  // Check if either end of line is inside the rect
  if (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh) return true;
  if (x2 >= rx && x2 <= rx + rw && y2 >= ry && y2 <= ry + rh) return true;

  // Check intersection with 4 sides of rect
  const lineLine = (x1, y1, x2, y2, x3, y3, x4, y4) => {
    const uA = ((x4-x3)*(y1-y3) - (y4-y3)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
    const uB = ((x2-x1)*(y1-y3) - (y2-y1)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
    return (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1);
  };

  const left = lineLine(x1, y1, x2, y2, rx, ry, rx, ry + rh);
  const right = lineLine(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh);
  const top = lineLine(x1, y1, x2, y2, rx, ry, rx + rw, ry);
  const bottom = lineLine(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh);

  return left || right || top || bottom;
};

/**
 * Calculate distance between two points.
 */
const distance = (a, b) =>
  Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

/**
 * Clamp a position to stay within map bounds.
 */
const clampToMap = (pos, mapWidth, mapHeight, radius = 16) => ({
  x: Math.min(Math.max(pos.x, radius), mapWidth - radius),
  y: Math.min(Math.max(pos.y, radius), mapHeight - radius),
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
const randomMapPosition = (mapWidth, mapHeight, margin = 50) => ({
  x: margin + Math.random() * (mapWidth - margin * 2),
  y: margin + Math.random() * (mapHeight - margin * 2),
});

module.exports = {
  circleCollide,
  circleRectCollide,
  lineRectCollide,
  distance,
  clampToMap,
  normalizeMovement,
  randomMapPosition,
};
