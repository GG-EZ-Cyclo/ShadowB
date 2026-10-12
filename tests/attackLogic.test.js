const assert = require('node:assert/strict');
const { resolveAttack } = require('../src/attackLogic');

{
  const result = resolveAttack({ atk: 2 }, { atk: 1 });
  assert.deepEqual(result, { targetDamage: 2, attackerDamage: 1 }, 'A 2-ATK attacker should deal 2 damage and take 1 in return');
}

{
  const result = resolveAttack({ atk: 2 }, { atk: 3 });
  assert.deepEqual(result, { targetDamage: 2, attackerDamage: 3 }, 'Retaliation damage should match the defender ATK value');
}

console.log('attack logic checks passed');
