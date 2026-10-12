const assert = require('node:assert/strict');
const { applyFollowerSummonEffect, applySpellEffect } = require('../src/cardEffects');

const makePlayer = (name, hp = 20) => ({ name, hp, field: [], hand: [], deck: [] });
const makeEnemy = () => ({ hp: 20, field: [] });

{
  const player = makePlayer('Alice');
  const enemy = makeEnemy();
  enemy.field = [{ id: 'f1', name: '守護者', hp: 6 }, { id: 'f2', name: '侍', hp: 3 }];

  applyFollowerSummonEffect({ id: 'zeus', name: 'ゼウス', effect: 'zeus' }, player, enemy, { logs: [] }, () => {});

  assert.equal(enemy.hp, 15, 'Zeus should hit the enemy leader for 5 damage');
  assert.deepEqual(enemy.field.map(f => f.hp), [1], 'Zeus should hit all enemy followers for 5 damage');
}

{
  const player = makePlayer('Alice');
  const enemy = makeEnemy();
  enemy.field = [{ id: 'f1', name: '守護者', hp: 7 }, { id: 'f2', name: '侍', hp: 4 }];

  applySpellEffect({ id: 'demon_hand', name: '大悪魔の腕', effect: 'demon-hand' }, player, enemy, { logs: [] }, () => {});

  assert.deepEqual(enemy.field.map(f => f.hp), [3], 'Demon arm should deal 4 damage to every enemy follower');
}

console.log('card effect checks passed');
