export const CARD_LIBRARY = [
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
  { id: "bell_engel", name: "鐘の天使", cost: 2, atk: 1, hp: 5, icon: "👼", image: "/images/cards/bell_engel.jpg", type: "follower" },
  { id: "engel_snipe", name: "天使の狙撃", cost: 1, icon: "🏹", image: "/images/cards/engel_snipe.jpg", type: "spell", effect: "angel-snipe" },
  { id: "dethe_dance", name: "死の舞踏", cost: 7, icon: "💃", image: "/images/cards/dethe_dance.jpg", type: "spell", effect: "death-dance" },
  { id: "reonidas", name: "レオニダス", cost: 8, atk: 7, hp: 8, icon: "🤴", image: "/images/cards/reonidas.jpg", type: "follower", effect: "reonidas" }
];

export function getDeckArray(selectedDeck) {
  const result = [];
  Object.entries(selectedDeck || {}).forEach(([cardId, count]) => {
    for (let i = 0; i < count; i++) result.push(cardId);
  });
  return result;
}

export function setSelectedDeckFromServer(deck, selectedDeckRef) {
  const nextDeck = {};
  for (const item of deck || []) {
    nextDeck[item] = (nextDeck[item] || 0) + 1;
  }
  selectedDeckRef.value = nextDeck;
}
