// src/api/leaderboard.js
import client from './client';
export const getLeaderboard = (period = 'all_time', limit = 20) =>
  client.get(`/leaderboard?period=${period}&limit=${limit}`);
export const getMyRank = () => client.get('/leaderboard/me');
