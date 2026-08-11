const {
  SLASH_COOLDOWN_KEY,
  MOVEMENT_SPEED_KEY,
  MAP_ROTATION_KEY,
  DEFAULT_MAP_ROTATION,
  getMapRotation,
  parsePositiveInt,
  parsePositiveFloat,
  parseMapRotation,
} = require('../appConfiguration');

describe('Azure App Configuration gameplay validation', () => {
  test('accepts valid slash cooldown', () => {
    expect(parsePositiveInt(800, SLASH_COOLDOWN_KEY, 100, 5000)).toBe(800);
    expect(parsePositiveInt('800', SLASH_COOLDOWN_KEY, 100, 5000)).toBe(800);
  });

  test.each([0, 50, 5001, 12.5, 'invalid', '', null, undefined])(
    'rejects invalid slash cooldown %p',
    (value) => {
      expect(() => parsePositiveInt(value, SLASH_COOLDOWN_KEY, 100, 5000)).toThrow(SLASH_COOLDOWN_KEY);
    }
  );

  test('accepts valid movement speed', () => {
    expect(parsePositiveFloat(3.5, MOVEMENT_SPEED_KEY, 0.5, 15.0)).toBe(3.5);
    expect(parsePositiveFloat('3.5', MOVEMENT_SPEED_KEY, 0.5, 15.0)).toBe(3.5);
  });

  test.each([0, 0.4, 15.1, 'invalid', '', null, undefined])(
    'rejects invalid movement speed %p',
    (value) => {
      expect(() => parsePositiveFloat(value, MOVEMENT_SPEED_KEY, 0.5, 15.0)).toThrow(MOVEMENT_SPEED_KEY);
    }
  );

  test('accepts one map or a comma-separated rotation', () => {
    expect(parseMapRotation('ice_map.json')).toEqual(['ice_map.json']);
    expect(parseMapRotation('ice_map.json,fire_map.json')).toEqual([
      'ice_map.json',
      'fire_map.json',
    ]);
  });

  test('trims map names and removes duplicates', () => {
    expect(
      parseMapRotation(' ice_map.json, fire_map.json, ice_map.json ')
    ).toEqual(['ice_map.json', 'fire_map.json']);
  });

  test.each([
    '',
    '   ',
    'unknown_map.json',
    'ice_map.json,unknown_map.json',
    'https://example.com/map.json',
    null,
    undefined,
  ])('rejects invalid map rotation %p', (value) => {
    expect(() => parseMapRotation(value)).toThrow(MAP_ROTATION_KEY);
  });

  test('uses a defensive copy of the default map rotation', () => {
    const rotation = getMapRotation();
    rotation.pop();

    expect(getMapRotation()).toEqual(DEFAULT_MAP_ROTATION);
  });
});
