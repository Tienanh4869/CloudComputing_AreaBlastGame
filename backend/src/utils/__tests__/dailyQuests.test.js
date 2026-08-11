const { getQuestUpdate } = require('../dailyQuests');

describe('daily quest event mapping', () => {
  test('maps login and kill events', () => {
    expect(getQuestUpdate({ eventType: 'PLAYER_LOGIN' })).toMatchObject({
      questCode: 'DAILY_LOGIN',
      amount: 1,
      reward: 100,
    });
    expect(getQuestUpdate({ eventType: 'PLAYER_KILL' })).toMatchObject({
      questCode: 'DAILY_KILL_5',
      amount: 1,
      reward: 200,
    });
  });

  test('normalizes playtime to non-negative whole seconds', () => {
    expect(
      getQuestUpdate({
        eventType: 'PLAYTIME_RECORDED',
        durationSeconds: 12.9,
      })
    ).toMatchObject({
      questCode: 'DAILY_PLAY_30_MIN',
      amount: 12,
      target: 1800,
      reward: 300,
    });

    expect(
      getQuestUpdate({
        eventType: 'PLAYTIME_RECORDED',
        durationSeconds: -10,
      }).amount
    ).toBe(0);
  });
});
