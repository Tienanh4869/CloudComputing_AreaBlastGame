// src/api/matches.js
import client from './client';
export const getMatches    = (params = {}) => client.get('/matches', { params });
export const getMatch      = (id)          => client.get(`/matches/${id}`);
export const getMyHistory  = ()            => client.get('/matches/my/history');
