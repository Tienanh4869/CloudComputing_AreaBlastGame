jest.mock('../../config/appConfiguration', () => ({
  getMapRotation: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { getMapRotation } = require('../../config/appConfiguration');
const GameManager = require('../GameManager');

describe('GameManager dynamic map rotation', () => {
  const createdRoomIds = [];

  beforeEach(() => {
    getMapRotation.mockReset();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
  });

  afterEach(() => {
    for (const roomId of createdRoomIds.splice(0)) {
      GameManager.destroy(roomId);
    }
    delete global.fetch;
  });

  test('uses the current Azure map rotation for a new room', async () => {
    getMapRotation.mockReturnValue(['ice_map.json']);
    const roomId = 'map-rotation-ice';
    createdRoomIds.push(roomId);

    const room = await GameManager.getOrCreate(roomId, 'ICE');

    expect(room.mapConfig.url).toMatch(/\/ice_map\.json$/);
  });

  test('keeps an existing room stable and applies changes to a new room', async () => {
    getMapRotation.mockReturnValue(['ice_map.json']);
    const existingRoomId = 'map-rotation-existing';
    const newRoomId = 'map-rotation-fire';
    createdRoomIds.push(existingRoomId, newRoomId);

    const existingRoom = await GameManager.getOrCreate(existingRoomId, 'OLD');

    getMapRotation.mockReturnValue(['fire_map.json']);
    const sameRoom = await GameManager.getOrCreate(existingRoomId, 'OLD');
    const newRoom = await GameManager.getOrCreate(newRoomId, 'FIRE');

    expect(sameRoom).toBe(existingRoom);
    expect(sameRoom.mapConfig.url).toMatch(/\/ice_map\.json$/);
    expect(newRoom.mapConfig.url).toMatch(/\/fire_map\.json$/);
  });
});
