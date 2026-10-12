function applyDamageToField(field, amount) {
  if (!Array.isArray(field)) return [];
  field.forEach(card => {
    card.hp -= amount;
  });
  return field.filter(card => card.hp > 0);
}

function applyFollowerSummonEffect(card, player, enemy) {
  if (!card || !card.effect) return;

  if (card.effect === 'heal') {
    player.hp = Math.min(20, player.hp + 2);
    return;
  }

  if (card.effect === 'heal3') {
    player.hp = Math.min(20, player.hp + 3);
    return;
  }

  if (card.effect === 'blast') {
    enemy.hp -= 2;
    return;
  }

  if (card.effect === 'zeus') {
    enemy.hp = Math.max(0, enemy.hp - 5);
    enemy.field = applyDamageToField(enemy.field, 5);
    return;
  }
}

function applySpellEffect(card, player, enemy, target = null) {
  if (!card || !card.effect) return;

  if (card.effect === 'heal4') {
    player.hp = Math.min(20, player.hp + 4);
    return;
  }

  if (card.effect === 'meteor') {
    enemy.hp -= 4;
    return;
  }

  if (card.effect === 'demon-hand') {
    enemy.field = applyDamageToField(enemy.field, 4);
    return;
  }

  if (card.effect === 'angel-snipe') {
    if (!target) return;
    if (target === 'leader') {
      enemy.hp = Math.max(0, enemy.hp - 1);
      return;
    }
    target.hp -= 1;
    return;
  }

  if (card.effect === 'death-dance') {
    if (!target) return;
    target.hp = 0;
    enemy.field = enemy.field.filter(f => f.hp > 0);
    enemy.hp = Math.max(0, enemy.hp - 2);
    return;
  }
}

module.exports = {
  applyFollowerSummonEffect,
  applySpellEffect
};
