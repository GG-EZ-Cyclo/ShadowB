function resolveAttack(attacker, target) {
  let targetDamage = Number(attacker?.atk ?? 0);
  const attackerDamage = Number(target?.atk ?? 0);

  if (attacker?.effect === "reonidas") {
    targetDamage += 1;
  }

  return {
    targetDamage,
    attackerDamage
  };
}

module.exports = {
  resolveAttack
};
