const {
  ATTACK_DAMAGE_KEY,
  MAP_ROTATION_KEY,
  DEFAULT_MAP_ROTATION,
  getMapRotation,
  parseAttackDamage,
  parseMapRotation,
} = require('../appConfiguration');

describe('Azure App Configuration gameplay validation', () => {
  test('accepts the current 25 HP attack damage', () => {
    expect(parseAttackDamage(25)).toBe(25);
    expect(parseAttackDamage('25')).toBe(25);
  });

  test.each([0, -1, 101, 12.5, 'invalid', '', null, undefined])(
    'rejects invalid attack damage %p',
    (value) => {
      expect(() => parseAttackDamage(value)).toThrow(ATTACK_DAMAGE_KEY);
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
