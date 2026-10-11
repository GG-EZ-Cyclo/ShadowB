const crypto = require("crypto");

const CARDS = [
  { name: "星屑の剣士", cost: 1, atk: 2, hp: 2, icon: "⚔️", type: "follower" },
  { name: "森の守護者", cost: 2, atk: 2, hp: 4, icon: "🌿", type: "follower" },
  { name: "月光の巫女", cost: 2, atk: 1, hp: 3, icon: "🌙", type: "follower", effect: "heal" },
  { name: "炎竜の幼体", cost: 3, atk: 4, hp: 3, icon: "🐉", type: "follower" },
  { name: "蒼天の騎士", cost: 4, atk: 4, hp: 4, icon: "🛡️", type: "follower" },
  { name: "深淵の魔術師", cost: 5, atk: 3, hp: 5, icon: "🔮", type: "follower", effect: "blast" },
  { name: "古代の巨人", cost: 6, atk: 6, hp: 7, icon: "🗿", type: "follower" },
  { name: "雷撃", cost: 2, icon: "⚡", type: "spell", effect: "bolt" },
  { name: "癒やしの光", cost: 2, icon: "✨", type: "spell", effect: "heal4" },
  { name: "流星群", cost: 4, icon: "☄️", type: "spell", effect: "meteor" },
  { name: "魂の契約", cost: 3, icon: "💠", type: "spell", effect: "draw" },
  { name: "覚醒の竜", cost: 7, atk: 7, hp: 7, icon: "🐲", type: "follower", effect: "heal3" }
];

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function makeDeck() {
  const deck = [];
  for (const card of CARDS) {
    for (let i = 0; i < (card.cost <= 3 ? 2 : 1); i++) {
      deck.push({
        ...card,
        id: crypto.randomUUID(),
        canAttack: false,
        evolved: false
      });
    }
  }
  return shuffle(deck);
}

module.exports = {
  CARDS,
  makeDeck,
  shuffle
};
