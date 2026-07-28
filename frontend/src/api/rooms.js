// src/api/rooms.js
import client from './client';
export const getRooms     = ()           => client.get('/rooms');
export const createRoom   = (data)       => client.post('/rooms', data);
export const getRoom      = (id)         => client.get(`/rooms/${id}`);
export const getRoomByCode = (code)      => client.get(`/rooms/code/${code}`);
