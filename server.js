const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

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

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function makePlayer(socket, name) {
  const player = {
    socketId: socket.id,
    name: String(name || "旅人").slice(0, 16),
    hp: 20,
    mana: 0,
    maxMana: 0,
    evo: 2,
    turns: 0,
    deck: makeDeck(),
    hand: [],
    field: []
  };

  for (let i = 0; i < 4; i++) draw(player);
  return player;
}

function draw(player) {
  if (player.deck.length > 0) {
    player.hand.push(player.deck.pop());
  }
}

function log(room, message) {
  room.logs.unshift(message);
  room.logs = room.logs.slice(0, 12);
}

function publicCard(card) {
  return {
    id: card.id,
    name: card.name,
    cost: card.cost,
    atk: card.atk,
    hp: card.hp,
    icon: card.icon,
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
    code: room.code,
    started: room.started,
    over: room.over,
    winner: room.winner,
    active: room.active,
    turn: room.turn,
    myIndex: index,
    me: {
      name: me.name,
      hp: me.hp,
      mana: me.mana,
      maxMana: me.maxMana,
      evo: me.evo,
      turns: me.turns,
      hand: me.hand.map(publicCard),
      field: me.field.map(publicCard),
      deckCount: me.deck.length
    },
    enemy: enemy ? {
      name: enemy.name,
      hp: enemy.hp,
      mana: enemy.mana,
      maxMana: enemy.maxMana,
      evo: enemy.evo,
      handCount: enemy.hand.length,
      field: enemy.field.map(publicCard),
      deckCount: enemy.deck.length
    } : null,
    logs: room.logs
  };
}

function publish(room) {
  room.players.forEach((player, index) => {
    io.to(player.socketId).emit("state", snapshot(room, index));
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
    return true;
  }
  return false;
}

function enemyOf(room, player) {
  return room.players.find(p => p !== player);
}

function startGame(room) {
  room.started = true;
  room.active = 0;
  room.turn = 1;

  const first = room.players[0];
  first.maxMana = 1;
  first.mana = 1;
  first.turns = 1;

  log(room, "対戦開始！ " + first.name + "が先攻です。");
  publish(room);
}

io.on("connection", socket => {
  socket.on("createRoom", ({ name } = {}) => {
    let code;
    do {
      code = crypto.randomBytes(3).toString("hex").toUpperCase();
    } while (rooms.has(code));

    const room = {
      code,
      players: [makePlayer(socket, name)],
      started: false,
      over: false,
      winner: null,
      active: 0,
      turn: 1,
      logs: []
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;

    socket.emit("roomCreated", code);
    log(room, "ルームを作成しました。友達の参加を待っています。");
    publish(room);
  });

  socket.on("joinRoom", ({ code, name } = {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) return reject(socket, "ルームが見つかりません。コードを確認してください。");
    if (room.started || room.players.length >= 2) {
      return reject(socket, "このルームはすでに満員です。");
    }

    room.players.push(makePlayer(socket, name));
    socket.join(code);
    socket.data.roomCode = code;

    log(room, "対戦相手が参加しました！");
    startGame(room);
  });

  socket.on("playCard", ({ index } = {}) => {
    const room = getRoom(socket);
    const player = activePlayer(room, socket);
    if (!player) return reject(socket, "今はあなたのターンではありません。");

    const card = player.hand[index];
    if (!card) return reject(socket, "そのカードはありません。");
    if (card.cost > player.mana) return reject(socket, "マナが足りません。");

    if (card.type === "follower" && player.field.length >= 5) {
      return reject(socket, "場のフォロワーは5体までです。");
    }

    const enemy = enemyOf(room, player);
    player.mana -= card.cost;
    player.hand.splice(index, 1);

    if (card.type === "follower") {
      player.field.push({ ...card, canAttack: false });

      if (card.effect === "heal") player.hp = Math.min(20, player.hp + 2);
      if (card.effect === "heal3") player.hp = Math.min(20, player.hp + 3);
      if (card.effect === "blast") enemy.hp -= 2;

      log(room, `${player.name}は${card.name}を召喚！`);
    } else {
      if (card.effect === "heal4") player.hp = Math.min(20, player.hp + 4);
      if (card.effect === "meteor") enemy.hp -= 4;

      if (card.effect === "bolt") {
        if (enemy.field.length) {
          const target = enemy.field.reduce((a, b) => a.hp <= b.hp ? a : b);
          target.hp -= 3;
          log(room, `${player.name}の雷撃！ ${target.name}に3ダメージ。`);
          enemy.field = enemy.field.filter(f => f.hp > 0);
        } else {
          enemy.hp -= 3;
          log(room, `${player.name}の雷撃！ 敵リーダーに3ダメージ。`);
        }
      } else if (card.effect === "draw") {
        draw(player);
        draw(player);
        log(room, `${player.name}は魂の契約を使用。2枚引いた。`);
      } else {
        log(room, `${player.name}は${card.name}を使用！`);
      }
    }

    finishIfNeeded(room);
    publish(room);
  });

  socket.on("attack", ({ attackerId, targetId } = {}) => {
    const room = getRoom(socket);
    const player = activePlayer(room, socket);
    if (!player) return reject(socket, "今は攻撃できません。");

    const enemy = enemyOf(room, player);
    const attacker = player.field.find(f => f.id === attackerId);

    if (!attacker || !attacker.canAttack) {
      return reject(socket, "そのフォロワーは攻撃できません。");
    }

    if (targetId === "leader") {
      if (enemy.field.length) {
        return reject(socket, "敵フォロワーがいる間はリーダーを攻撃できません。");
      }

      enemy.hp -= attacker.atk;
      log(room, `${attacker.name}が敵リーダーに${attacker.atk}ダメージ！`);
    } else {
      const target = enemy.field.find(f => f.id === targetId);
      if (!target) return reject(socket, "攻撃対象が見つかりません。");

      target.hp -= attacker.atk;
      attacker.hp -= target.atk;

      enemy.field = enemy.field.filter(f => f.hp > 0);
      player.field = player.field.filter(f => f.hp > 0);

      log(room, `${attacker.name}と${target.name}が交戦！`);
    }

    const stillAlive = player.field.find(f => f.id === attackerId);
    if (stillAlive) stillAlive.canAttack = false;

    finishIfNeeded(room);
    publish(room);
  });

  socket.on("evolve", ({ cardId } = {}) => {
    const room = getRoom(socket);
    const player = activePlayer(room, socket);
    if (!player) return reject(socket, "今は進化できません.");
    if (player.turns < 2) return reject(socket, "進化できるのは自分の2ターン目以降です。");
    if (player.evo <= 0) return reject(socket, "進化ポイントがありません。");

    const card = player.field.find(f => f.id === cardId);
    if (!card) return reject(socket, "フォロワーが見つかりません。");
    if (card.evolved) return reject(socket, "このフォロワーは進化済みです。");

    card.evolved = true;
    card.atk += 2;
    card.hp += 2;
    card.canAttack = true;
    player.evo--;

    log(room, `${player.name}は${card.name}を進化させた！`);
    publish(room);
  });

  socket.on("endTurn", () => {
    const room = getRoom(socket);
    const player = activePlayer(room, socket);
    if (!player) return reject(socket, "今はターンを終了できません。");

    room.active = 1 - room.active;
    room.turn++;

    const next = room.players[room.active];
    next.turns++;
    next.maxMana = Math.min(10, next.maxMana + 1);
    next.mana = next.maxMana;
    next.field.forEach(f => { f.canAttack = true; });
    draw(next);

    log(room, `${next.name}のターン！`);
    publish(room);
  });

  socket.on("disconnect", () => {
    const room = getRoom(socket);
    if (!room) return;

    // 切断中のルームは一時保持。再接続機能は次の段階で追加する。
    log(room, "プレイヤーの接続が切れました。");
    publish(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`ECLIPSE DUEL is running on port ${PORT}`);
});