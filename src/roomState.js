const { makeDeck, buildDeckFromSelection } = require("./gameData");
const { applyFollowerSummonEffect, applySpellEffect } = require("./cardEffects");
const { resolveAttack } = require("./attackLogic");

const rooms = new Map();
let io = null;

function setIo(socketServer) {
  io = socketServer;
}

function makePlayer(socket, name, deckSelection = null) {
  const deck = deckSelection ? buildDeckFromSelection(deckSelection) : [];
  return {
    socketId: socket.id,
    name: String(name || "旅人").slice(0, 16),
    hp: 20,
    mana: 0,
    maxMana: 0,
    evo: 2,
    turns: 0,
    deck,
    hand: [],
    field: [],
    deckReady: Boolean(deckSelection)
  };
}

function draw(player, room = null) {
  if (player.deck.length === 0) {
    if (room) {
      const loserIndex = room.players.findIndex(p => p.socketId === player.socketId);
      const winnerIndex = loserIndex === 0 ? 1 : 0;
      room.over = true;
      room.winner = winnerIndex;
      log(room, `${player.name}はデッキの21枚目を引き、敗北した。${room.players[winnerIndex].name}の勝利！`);
    }
    return false;
  }

  player.hand.push(player.deck.pop());
  return true;
}

function log(room, message) {
  room.logs.unshift(message);
  room.logs = room.logs.slice(0, 12);
}

function getSummonSound(card) {
  if (!card) return "summonSound";
  return "summonSound";
}

function getAttackSound(attacker) {
  if (!attacker) return "SordAttack";

  const name = attacker.name;
  if (["ゼウス", "覚醒の竜", "炎竜の幼体", "月光の巫女", "森の守護者", "古代の巨人"].includes(name)) {
    return "dengekiAttack";
  }
  if (["星屑の剣士", "蒼天の騎士"].includes(name)) {
    return "SordAttack";
  }
  if (name === "深淵の魔術師") {
    return "spellcard";
  }
  return "SordAttack";
}

function getSpellSound(card) {
  if (!card) return "spellcard";
  if (["雷撃", "流星群", "大悪魔の腕"].includes(card.name)) {
    return "spellcard";
  }
  if (["魂の契約", "癒やしの光", "癒しの光"].includes(card.name) || ["heal", "heal3", "heal4"].includes(card.effect)) {
    return "heal";
  }
  return "spellcard";
}

function publicCard(card) {
  return {
    id: card.id,
    name: card.name,
    cost: card.cost,
    atk: card.atk,
    hp: card.hp,
    icon: card.icon,
    image: card.image || null,
    type: card.type,
    effect: card.effect,
    canAttack: card.canAttack,
    evolved: card.evolved
  };
}

function snapshot(room, index) {
  const me = room.players[index];
  const enemy = room.players[1 - index];

  return {
    phase: room.phase,
    code: room.code,
    started: room.started,
    over: room.over,
    winner: room.winner,
    active: room.active,
    turn: room.turn,
    players: room.players.map(player => ({ name: player.name, socketId: player.socketId })),
    myIndex: index,
    rematchVotes: room.rematchVotes ? room.rematchVotes.slice() : [],
    me: {
      name: me.name,
      hp: me.hp,
      mana: me.mana,
      maxMana: me.maxMana,
      evo: me.evo,
      turns: me.turns,
      hand: me.hand.map(publicCard),
      handCount: me.hand.length,
      field: me.field.map(publicCard),
      deckCount: me.deck.length,
      deckSelection: me.deck.map(card => card.id),
      deckReady: me.deckReady
    },
    enemy: enemy ? {
      name: enemy.name,
      hp: enemy.hp,
      mana: enemy.mana,
      maxMana: enemy.maxMana,
      evo: enemy.evo,
      handCount: enemy.hand.length,
      field: enemy.field.map(publicCard),
      deckCount: enemy.deck.length,
      deckSelection: enemy.deck.map(card => card.id),
      deckReady: enemy.deckReady
    } : null,
    logs: room.logs
  };
}

function publish(room) {
  if (!io) return;
  room.players.forEach((player, index) => {
    io.to(player.socketId).emit("state", snapshot(room, index));
  });
}

function emitRoomSound(room, kind) {
  if (!room || !room.players || !io) return;
  room.players.forEach(player => {
    io.to(player.socketId).emit("sound", { kind });
  });
}

function getRoom(socket) {
  return rooms.get(socket.data.roomCode);
}

function reject(socket, message) {
  socket.emit("notice", message);
}

function activePlayer(room, socket) {
  if (!room || !room.started || room.over) return null;
  if (room.players[room.active].socketId !== socket.id) return null;
  return room.players[room.active];
}

function finishIfNeeded(room) {
  const [a, b] = room.players;
  if (a.hp <= 0 || b.hp <= 0) {
    room.over = true;
    room.winner = a.hp <= 0 && b.hp <= 0 ? -1 : a.hp > 0 ? 0 : 1;
    log(room, room.winner === -1
      ? "引き分け！"
      : `${room.players[room.winner].name}の勝利！`);

    if (room.players.length) {
      room.players.forEach((player, index) => {
        emitRoomSound(room, room.winner === -1 ? "draw" : index === room.winner ? "victory" : "defeat");
      });
    }
    return true;
  }
  return false;
}

function enemyOf(room, player) {
  return room.players.find(p => p !== player);
}

function resetDeckBuilding(room) {
  room.phase = "deck-building";
  room.started = false;
  room.over = false;
  room.winner = null;
  room.active = 0;
  room.turn = 1;
  room.rematchVotes = [];

  room.players.forEach(player => {
    player.hp = 20;
    player.mana = 0;
    player.maxMana = 0;
    player.evo = 2;
    player.turns = 0;
    player.field = [];
    player.hand = [];
    player.deck = [];
    player.deckReady = false;
  });

  log(room, "再戦のためにデッキ構築画面に戻りました。");
}

function startGame(room) {
  room.started = true;
  room.phase = "battle";
  room.active = 0;
  room.turn = 1;
  room.rematchVotes = [];

  room.players.forEach(player => {
    player.hp = 20;
    player.mana = 0;
    player.maxMana = 0;
    player.evo = 2;
    player.turns = 0;
    player.field = [];
    player.hand = [];
    if (!player.deck.length) player.deck = makeDeck();
    for (let i = 0; i < 4; i++) draw(player, room);
  });

  const first = room.players[0];
  first.maxMana = 1;
  first.mana = 1;
  first.turns = 1;

  log(room, "対戦開始！ " + first.name + "が先攻です。");
  publish(room);
}

module.exports = {
  rooms,
  setIo,
  makePlayer,
  draw,
  log,
  getSummonSound,
  getAttackSound,
  getSpellSound,
  publicCard,
  snapshot,
  publish,
  emitRoomSound,
  getRoom,
  reject,
  activePlayer,
  finishIfNeeded,
  enemyOf,
  resetDeckBuilding,
  startGame,
  resolveAttack,
  applyFollowerSummonEffect,
  applySpellEffect
};
