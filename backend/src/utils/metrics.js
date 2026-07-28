// src/utils/metrics.js — Basic in-memory metrics for /metrics endpoint
// In production, integrate with Azure Monitor / Application Insights

const metrics = {
  connections: 0,
  totalRequests: 0,
  activeRooms: 0,
  activePlayers: 0,
  matchesPlayed: 0,
  startTime: Date.now(),
};

const increment = (key) => { if (key in metrics) metrics[key]++; };
const decrement = (key) => { if (key in metrics) metrics[key] = Math.max(0, metrics[key] - 1); };
const set = (key, value) => { metrics[key] = value; };

const getMetrics = () => ({
  ...metrics,
  uptimeSeconds: Math.floor((Date.now() - metrics.startTime) / 1000),
  timestamp: new Date().toISOString(),
});

// Express middleware to count requests
const requestCounter = (req, res, next) => {
  metrics.totalRequests++;
  next();
};

module.exports = { increment, decrement, set, getMetrics, requestCounter };
