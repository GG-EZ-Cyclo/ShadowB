const crypto = require("crypto");

const CARDS = [
  { id: "star-swordsman", name: "星屑の剣士", cost: 1, atk: 2, hp: 2, icon: "⚔️", image: "/images/cards/sord_man.png", type: "follower" },
  { id: "forest-guardian", name: "森の守護者", cost: 2, atk: 2, hp: 4, icon: "🌿", image: "/images/cards/elf.jpeg", type: "follower" },
  { id: "moon-priestess", name: "月光の巫女", cost: 2, atk: 1, hp: 3, icon: "🌙", image: "/images/cards/miko.jpeg", type: "follower", effect: "heal" },
  { id: "flame-drake", name: "炎竜の幼体", cost: 3, atk: 4, hp: 3, icon: "🐉", image: "/images/cards/baby_doragon.png", type: "follower" },
  { id: "heaven-knight", name: "蒼天の騎士", cost: 4, atk: 4, hp: 4, icon: "🛡️", image: "/images/cards/night.jpeg", type: "follower" },
  { id: "abyss-mage", name: "深淵の魔術師", cost: 5, atk: 3, hp: 5, icon: "🔮", image: "/images/cards/witch.jpeg", type: "follower", effect: "blast" },
  { id: "ancient-giant", name: "古代の巨人", cost: 6, atk: 6, hp: 7, icon: "🗿", image: "/images/cards/titan.jpeg", type: "follower" },
  { id: "thunder-strike", name: "雷撃", cost: 2, icon: "⚡", image: "/images/cards/lightning.jpeg", type: "spell", effect: "bolt" },
  { id: "healing-light", name: "癒やしの光", cost: 2, icon: "✨", image: "/images/cards/heal_light.jpeg", type: "spell", effect: "heal4" },
  { id: "meteor-fall", name: "流星群", cost: 4, icon: "☄️", image: "/images/cards/meteo.png", type: "spell", effect: "meteor" },
  { id: "soul-pact", name: "魂の契約", cost: 3, icon: "💠", image: "/images/cards/drow.jpeg", type: "spell", effect: "draw" },
  { id: "awakening-dragon", name: "覚醒の竜", cost: 7, atk: 7, hp: 7, icon: "🐲", image: "/images/cards/dragon.jpeg", type: "follower", effect: "heal3" },
  { id: "zeus", name: "ゼウス", cost: 10, atk: 10, hp: 10, icon: "⚡", image: "/images/cards/zeus.jpg", type: "follower", effect: "zeus" },
  { id: "demon_hand", name: "大悪魔の腕", cost: 6, icon: "👿", image: "/images/cards/demon_hand.jpg", type: "spell", effect: "demon-hand" },
  { id: "bell_engel", name: "鐘の天使", cost: 2, atk: 1, hp: 5,icon: "👼", image: "/images/cards/bell_engel.jpg", type: "follower"},
  { id: "engel_snipe", name: "天使の狙撃", cost: 1, icon: "🏹", image: "/images/cards/engel_snipe.jpg", type: "spell", effect: "angel-snipe" },
  { id: "dethe_dance", name: "死の舞踏", cost: 7, icon: "💃", image: "/images/cards/dethe_dance.jpg", type: "spell", effect: "death-dance" },
  { id: "reonidas", name: "レオニダス", cost: 8, atk: 7, hp: 8, icon: "🤴", image: "/images/cards/reonidas.jpg", type: "follower", effect: "reonidas" }

];

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function buildDeckFromSelection(selection = []) {
  const knownCards = new Map(CARDS.map(card => [card.id, card]));
  if (!Array.isArray(selection) || selection.length !== 20) {
    return [];
  }

  const counts = new Map();
  const deck = [];

  for (const cardId of selection) {
    const card = knownCards.get(cardId);
    if (!card) return [];

    const count = counts.get(cardId) || 0;
    if (count >= 2) return [];
    counts.set(cardId, count + 1);

    deck.push({
      ...card,
      id: crypto.randomUUID(),
      canAttack: false,
      evolved: false
    });
  }

  return shuffle(deck);
}

function makeDeck() {
  const deck = [];
  const cardMap = new Map(CARDS.map(card => [card.id, card]));
  const pool = [];

  for (const card of CARDS) {
    for (let i = 0; i < 2; i++) {
      pool.push(card.id);
    }
  }

  const cardPool = shuffle(pool);
  for (let i = 0; i < 20; i++) {
    const card = cardMap.get(cardPool[i]);
    deck.push({
      ...card,
      id: crypto.randomUUID(),
      canAttack: false,
      evolved: false
    });
  }

  return shuffle(deck);
}

module.exports = {
  CARDS,
  makeDeck,
  buildDeckFromSelection,
  shuffle
};
