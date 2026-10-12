const crypto = require("crypto");
const { buildDeckFromSelection } = require("./gameData");
const {
  rooms,
  setIo,
  makePlayer,
  draw,
  log,
  getSummonSound,
  getAttackSound,
  getSpellSound,
  publish,
  emitRoomSound,
  getRoom,
  reject,
  activePlayer,
  finishIfNeeded,
  enemyOf,
  resetDeckBuilding,
  startGame,
  applyFollowerSummonEffect,
  applySpellEffect,
  resolveAttack
} = require("./roomState");

function registerSocketHandlers(io) {
  setIo(io);

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

    socket.on("playCard", ({ index, targetId } = {}) => {
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
        emitRoomSound(room, ["heal", "heal3"].includes(card.effect) ? "heal" : getSummonSound(card));
        if (card.effect === "zeus") {
          log(room, `${player.name}は${card.name}を召喚！ 敵リーダーと全ての敵フォロワーに5ダメージ。`);
        } else {
          log(room, `${player.name}は${card.name}を召喚！`);
        }
      } else {
        let target = null;

        if (card.effect === "death-dance") {
          if (!targetId || targetId === "leader") {
            return reject(socket, "死の舞踏は相手のフォロワーを選択してください。");
          }
          target = enemy.field.find(f => f.id === targetId);
          if (!target) {
            return reject(socket, "対象のフォロワーが見つかりません。");
          }
          target.hp = 0;
          enemy.field = enemy.field.filter(f => f.hp > 0);
          enemy.hp = Math.max(0, enemy.hp - 2);
          log(room, `${player.name}は死の舞踏！ ${target.name}を破壊し、敵リーダーに2ダメージ。`);
        } else if (card.effect === "angel-snipe") {
          if (!targetId) {
            return reject(socket, "天使の狙撃は対象を選択してください。");
          }
          if (targetId === "leader") {
            enemy.hp = Math.max(0, enemy.hp - 1);
            log(room, `${player.name}は天使の狙撃！ 敵リーダーに1ダメージ。`);
          } else {
            target = enemy.field.find(f => f.id === targetId);
            if (!target) {
              return reject(socket, "対象のフォロワーが見つかりません。");
            }
            target.hp -= 1;
            log(room, `${player.name}は天使の狙撃！ ${target.name}に1ダメージ。`);
            enemy.field = enemy.field.filter(f => f.hp > 0);
          }
        } else {
          applySpellEffect(card, player, enemy, target);
          if (card.effect === "bolt") {
            if (enemy.field.length) {
              const hit = enemy.field.reduce((a, b) => a.hp <= b.hp ? a : b);
              hit.hp -= 3;
              log(room, `${player.name}の雷撃！ ${hit.name}に3ダメージ。`);
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
        emitRoomSound(room, getSpellSound(card));
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
        if (attacker.effect === "reonidas") {
          enemy.hp -= 1;
          log(room, `${attacker.name}が敵リーダーに${attacker.atk + 1}ダメージ！`);
        } else {
          log(room, `${attacker.name}が敵リーダーに${attacker.atk}ダメージ！`);
        }
        emitRoomSound(room, "LifeDamege");
      } else {
        const target = enemy.field.find(f => f.id === targetId);
        if (!target) return reject(socket, "攻撃対象が見つかりません。");

        const attack = resolveAttack(attacker, target);
        target.hp -= attack.targetDamage;
        attacker.hp -= attack.attackerDamage;

        if (attacker.effect === "reonidas") {
          enemy.field.forEach(card => {
            card.hp -= 1;
          });
          enemy.hp = Math.max(0, enemy.hp - 1);
        }

        enemy.field = enemy.field.filter(f => f.hp > 0);
        player.field = player.field.filter(f => f.hp > 0);

        log(room, `${attacker.name}が${target.name}に${attack.targetDamage}ダメージ、反撃で${attack.attackerDamage}ダメージを受けた。`);
      }

      const stillAlive = player.field.find(f => f.id === attackerId);
      if (stillAlive) stillAlive.canAttack = false;

      emitRoomSound(room, getAttackSound(attacker));
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

      emitRoomSound(room, "evolve");
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
      emitRoomSound(room, "turn");
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
}

module.exports = {
  registerSocketHandlers
};
