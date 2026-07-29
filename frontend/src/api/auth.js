// src/api/auth.js
import client from './client';
export const register = (data) => client.post('/auth/register', data);
export const login    = (data) => client.post('/auth/login', data);
export const logout   = ()     => client.post('/auth/logout');
export const getMe    = ()     => client.get('/auth/me');
export const updateProfile = (data) => client.put('/auth/profile', data);
export const updateNickname = (data) => client.put('/players/me/nickname', data);
export const uploadImage  = (imageBase64, type) => client.post('/auth/upload', { imageBase64, type });
