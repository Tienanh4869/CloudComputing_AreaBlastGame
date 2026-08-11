jest.mock('../../config/database', () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(async (callback) => callback({ id: 'transaction' })),
  },
}));

jest.mock('../../config/serviceBus', () => ({
  publishGameEvent: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

const { sequelize } = require('../../config/database');
const {
  applyDailyQuestEvent,
} = require('../dailyQuestService');

describe('dailyQuestService write-through processing', () => {
  beforeEach(() => {
    sequelize.query.mockReset();
    sequelize.transaction.mockClear();
  });

  test('completes a login quest and grants its reward once', async () => {
    sequelize.query
      .mockResolvedValueOnce([[{ event_id: 'login-event' }], {}])
      .mockResolvedValueOnce([{ progress: 1, completed: true }])
      .mockResolvedValueOnce([[{ event_id: 'reward-event' }], {}])
      .mockResolvedValueOnce([[{ id: 'player-1' }], {}]);

    const result = await applyDailyQuestEvent({
      eventId: 'login-event',
      eventType: 'PLAYER_LOGIN',
      occurredAt: '2026-08-11T00:00:00.000Z',
      playerId: 'player-1',
    });

    expect(result).toMatchObject({
      questCode: 'DAILY_LOGIN',
      progress: 1,
      completed: true,
      rewarded: true,
    });
    expect(sequelize.query).toHaveBeenCalledTimes(4);
  });

  test('does not increment progress for a duplicate event', async () => {
    sequelize.query
      .mockResolvedValueOnce([[], {}])
      .mockResolvedValueOnce([{ progress: 2, completed: false }]);

    const result = await applyDailyQuestEvent({
      eventId: 'kill-event',
      eventType: 'PLAYER_KILL',
      occurredAt: '2026-08-11T00:00:00.000Z',
      playerId: 'player-1',
    });

    expect(result).toMatchObject({
      duplicate: true,
      questCode: 'DAILY_KILL_5',
      progress: 2,
      completed: false,
      rewarded: false,
    });
    expect(sequelize.query).toHaveBeenCalledTimes(2);
  });
});
