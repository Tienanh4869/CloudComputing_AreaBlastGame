import client from './client';

export const getDailyQuests = () => client.get('/quests/daily');