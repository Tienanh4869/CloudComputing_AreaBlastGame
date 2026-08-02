const {
  ATTACK_DAMAGE_KEY,
  parseAttackDamage,
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
});
