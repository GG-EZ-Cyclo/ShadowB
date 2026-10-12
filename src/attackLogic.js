function resolveAttack(attacker, target) {
  const targetDamage = Number(attacker?.atk ?? 0);
  const attackerDamage = Number(target?.atk ?? 0);

  return {
    targetDamage,
    attackerDamage
  };
}

module.exports = {
  resolveAttack
};
