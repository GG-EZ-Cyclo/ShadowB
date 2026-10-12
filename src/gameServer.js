const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");
const { makeDeck, buildDeckFromSelection } = require("./gameData");
const { applyFollowerSummonEffect, applySpellEffect } = require("./cardEffects");
const { resolveAttack } = require("./attackLogic");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "../public")));

const rooms = new Map();

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
      field: me.field.map(publicCard),
      deckCount: me.deck.length,
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
      deckReady: enemy.deckReady
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
      phase: "deck-building",
      rematchVotes: [],
      logs: []
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;

    socket.emit("roomCreated", code);
    log(room, "ルームを作成しました。デッキを構築して対戦相手を待ってください。");
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
    publish(room);
  });

  socket.on("setDeck", ({ deck } = {}) => {
    const room = getRoom(socket);
    if (!room) return reject(socket, "ルームが見つかりません。");

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return reject(socket, "プレイヤーが見つかりません。");

    if (!Array.isArray(deck) || deck.length !== 20) {
      return reject(socket, "デッキは20枚で組んでください。");
    }

    const builtDeck = buildDeckFromSelection(deck);
    if (!builtDeck.length) {
      return reject(socket, "デッキの構成が無効です。重複は2枚までで組んでください。");
    }

    player.deck = builtDeck;
    player.deckReady = true;
    log(room, `${player.name}のデッキを構築しました。`);

    if (room.players.length === 2 && room.players.every(p => p.deckReady)) {
      startGame(room);
      return;
    }

    publish(room);
  });

  socket.on("requestRematch", () => {
    const room = getRoom(socket);
    if (!room) return reject(socket, "ルームが見つかりません。");
    if (!room.over) return reject(socket, "決着後にだけ再戦できます。");

    if (!room.rematchVotes.includes(socket.id)) {
      room.rematchVotes.push(socket.id);
    }

    if (room.rematchVotes.length >= room.players.length) {
      resetDeckBuilding(room);
      publish(room);
      return;
    }

    log(room, `${room.players.find(p => p.socketId === socket.id)?.name || "相手"}が再戦を希望しました。`);
    publish(room);
  });

  socket.on("leaveRoom", () => {
    const room = getRoom(socket);
    if (!room) {
      socket.emit("roomLeft", { self: true, message: "ホームに戻りました。" });
      return;
    }

    const leavingPlayer = room.players.find(player => player.socketId === socket.id);
    const remainingPlayers = room.players.filter(player => player.socketId !== socket.id);

    socket.leave(room.code);
    socket.data.roomCode = null;

    room.players = remainingPlayers;
    room.rematchVotes = room.rematchVotes.filter(id => room.players.some(player => player.socketId === id));

    if (room.players.length === 0) {
      rooms.delete(room.code);
      socket.emit("roomLeft", { self: true, message: "ホームに戻りました。" });
      return;
    }

    if (room.players.length === 1) {
      room.started = false;
      room.over = false;
      room.phase = "deck-building";
      room.winner = null;
      room.active = 0;
      room.turn = 1;
      room.logs = ["対戦相手が退出したため、デッキ構築に戻りました。"];
    }

    if (leavingPlayer) {
      socket.emit("roomLeft", { self: true, message: "ホームに戻りました。対戦を終了しました。" });
    }
    if (room.players[0]) {
      io.to(room.players[0].socketId).emit("roomLeft", {
        self: false,
        message: "対戦相手が終了を選択したためホームに戻ります。"
      });
    }

    publish(room);
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
      applyFollowerSummonEffect(card, player, enemy);
      if (card.effect === "zeus") {
        log(room, `${player.name}は${card.name}を召喚！ 敵リーダーと全ての敵フォロワーに5ダメージ。`);
      } else {
        log(room, `${player.name}は${card.name}を召喚！`);
      }
    } else {
      applySpellEffect(card, player, enemy);

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
      } else if (card.effect === "demon-hand") {
        log(room, `${player.name}の大悪魔の腕！ 相手の場のフォロワー全体に4ダメージ。`);
      } else if (card.effect === "draw") {
        draw(player, room);
        draw(player, room);
        if (room.over) {
          publish(room);
          return;
        }
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

      const attack = resolveAttack(attacker, target);
      target.hp -= attack.targetDamage;
      attacker.hp -= attack.attackerDamage;

      enemy.field = enemy.field.filter(f => f.hp > 0);
      player.field = player.field.filter(f => f.hp > 0);

      log(room, `${attacker.name}が${target.name}に${attack.targetDamage}ダメージ、反撃で${attack.attackerDamage}ダメージを受けた。`);
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
    draw(next, room);
    if (room.over) {
      publish(room);
      return;
    }

    log(room, `${next.name}のターン！`);
    publish(room);
  });

  socket.on("disconnect", () => {
    const room = getRoom(socket);
    if (!room) return;

    log(room, "プレイヤーの接続が切れました。");
    publish(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`ECLIPSE DUEL is running on port ${PORT}`);
});
