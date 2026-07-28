// src/utils/helpers.js — Shared helper functions
const { v4: uuidv4 } = require('uuid');

// Generate unique room code (6 chars uppercase)
const generateRoomCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

// Generate UUID
const generateId = () => uuidv4();

// Calculate distance between two points
const distance = (a, b) =>
  Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

// Clamp value between min and max
const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

// Random integer between min and max (inclusive)
const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Random float between min and max
const randomFloat = (min, max) =>
  Math.random() * (max - min) + min;

// Format date for display
const formatDate = (date) =>
  new Date(date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

// Paginate array
const paginate = (arr, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  return {
    data: arr.slice(offset, offset + limit),
    total: arr.length,
    page,
    totalPages: Math.ceil(arr.length / limit),
  };
};

module.exports = {
  generateRoomCode,
  generateId,
  distance,
  clamp,
  randomInt,
  randomFloat,
  formatDate,
  paginate,
};
