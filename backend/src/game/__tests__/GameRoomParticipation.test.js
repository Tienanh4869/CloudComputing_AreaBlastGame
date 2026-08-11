jest.mock('../../utils/logger', () => ({
  gameEvent: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const GameRoom = require('../GameRoom');

describe('GameRoom participation tracking', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-11T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createRoom() {
    return new GameRoom(
      'room-1',
      'ABC123',
      {
        width: 1000,
        height: 1000,
        url: null,
        theme: { obstacles: [], bushes: [] },
      },
      { isQuickMatch: true }
    );
  }

  test('counts a late joiner from their actual join time', () => {
    const room = createRoom();
    room.addPlayer('early-socket', {
      playerId: 'early-player',
      nickname: 'Early',
    });
    room.start('match-1');

    jest.advanceTimersByTime(20000);

    const latePlayer = room.addPlayer('late-socket', {
      playerId: 'late-player',
      nickname: 'Late',
    });
    latePlayer.score = 25;

    jest.advanceTimersByTime(10000);

    const results = room.getResults();
    const early = results.rankings.find(
      (player) => player.playerId === 'early-player'
    );
    const late = results.rankings.find(
      (player) => player.playerId === 'late-player'
    );

    expect(early.playtimeSeconds).toBe(30);
    expect(late.playtimeSeconds).toBe(10);
    expect(late.score).toBe(25);
  });

  test('preserves score and accumulates time when a player rejoins', () => {
    const room = createRoom();
    room.start('match-2');

    const firstSession = room.addPlayer('socket-1', {
      playerId: 'player-1',
      nickname: 'Player',
    });
    firstSession.score = 40;

    jest.advanceTimersByTime(12000);
    room.removePlayer('socket-1');

    jest.advanceTimersByTime(5000);
    const secondSession = room.addPlayer('socket-2', {
      playerId: 'player-1',
      nickname: 'Player',
    });

    expect(secondSession.score).toBe(40);

    secondSession.score += 10;
    jest.advanceTimersByTime(8000);

    const result = room.getResults().rankings.find(
      (player) => player.playerId === 'player-1'
    );

    expect(result.score).toBe(50);
    expect(result.playtimeSeconds).toBe(20);
  });
});
