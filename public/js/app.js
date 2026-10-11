const socket = io();
let game = null;
let attackerId = null;
let lastNotice = "";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

socket.on("connect", () => $("connection").textContent = "サーバー接続済み");
socket.on("disconnect", () => $("connection").textContent = "接続が切れました");
socket.on("connect_error", () => $("connection").textContent = "接続エラー");

socket.on("roomCreated", code => {
  $("code").value = code;
  $("roomCode").textContent = code;
  $("notice").textContent = "友達にルームコードを共有してください。";
});

socket.on("notice", message => {
  lastNotice = message;
  $("notice").textContent = message;
});

socket.on("state", state => {
  game = state;
  attackerId = null;
  render();
});

function createRoom() {
  socket.emit("createRoom", { name: $("name").value.trim() || "旅人" });
}

function joinRoom() {
  socket.emit("joinRoom", {
    code: $("code").value.trim(),
    name: $("name").value.trim() || "旅人"
  });
}

function myTurn() {
  return game && game.started && !game.over && game.active === game.myIndex;
}

function cardMarkup(card, side) {
  const isFollower = card.type === "follower";
  const selected = side === "me" && card.id === attackerId;
  const ready = isFollower && card.canAttack;
  const description = card.effect === "heal" ? "召喚時：自分を2回復"
    : card.effect === "heal3" ? "召喚時：自分を3回復"
    : card.effect === "blast" ? "召喚時：敵リーダーに2ダメージ"
    : card.effect === "bolt" ? "敵フォロワーに3ダメージ"
    : card.effect === "heal4" ? "自分を4回復"
    : card.effect === "meteor" ? "敵リーダーに4ダメージ"
    : card.effect === "draw" ? "カードを2枚引く"
    : "ファンタジーの力を解き放て！";

  return `<div class="card ${selected ? "selected" : ""} ${ready ? "ready" : ""}">
    <span class="cost">${card.cost}</span>
    <div class="art">${esc(card.icon)}</div>
    <div class="name">${esc(card.name)}${card.evolved ? " ✨" : ""}</div>
    <div class="desc">${esc(description)}</div>
    ${isFollower ? `<div class="stats"><span class="atk">⚔ ${card.atk}</span><span class="def">♥ ${card.hp}</span></div>` : ""}
    ${side === "me" && isFollower ? `<div class="card-actions">
      <button ${!myTurn() || !ready ? "disabled" : ""} onclick="selectAttacker('${card.id}')">攻撃</button>
      <button ${!myTurn() || !game || game.me.evo <= 0 || game.me.turns < 2 || card.evolved ? "disabled" : ""} onclick="evolve('${card.id}')">進化</button>
    </div>` : ""}
    ${side === "enemy" && attackerId ? `<div class="card-actions"><button onclick="attack('${card.id}')">攻撃対象</button></div>` : ""}
  </div>`;
}

function render() {
  if (!game) return;

  $("roomCode").textContent = game.code;
  $("lobby").style.display = game.started ? "none" : "block";
  $("turn").textContent = !game.started ? "対戦相手を待っています"
    : game.over ? "対戦終了"
    : myTurn() ? `TURN ${game.turn} · あなたのターン`
    : `TURN ${game.turn} · 相手のターン`;

  $("myName").textContent = game.me.name;
  $("myHp").textContent = game.me.hp + " HP";
  $("myMana").textContent = `マナ ${game.me.mana} / ${game.me.maxMana}`;
  $("myEvo").textContent = `進化ポイント ${game.me.evo}`;
  $("deckCount").textContent = `デッキ残り ${game.me.deckCount} 枚`;

  $("enemyName").textContent = game.enemy?.name || "対戦相手を待っています";
  $("enemyHp").textContent = game.enemy ? game.enemy.hp + " HP" : "-- HP";
  $("enemyMana").textContent = game.enemy ? `マナ ${game.enemy.mana} / ${game.enemy.maxMana}` : "マナ --";
  $("enemyHand").textContent = game.enemy ? `手札 ${game.enemy.handCount} 枚` : "手札 -- 枚";

  $("myField").innerHTML = game.me.field.length
    ? game.me.field.map(c => cardMarkup(c, "me")).join("")
    : '<span class="small">フォロワーがいません</span>';

  $("enemyField").innerHTML = game.enemy?.field.length
    ? game.enemy.field.map(c => cardMarkup(c, "enemy")).join("")
    : '<span class="small">敵フォロワーがいません</span>';

  $("hand").innerHTML = game.me.hand.map((c, i) => `
    <button class="card" onclick="playCard(${i})" ${!myTurn() || c.cost > game.me.mana ? "disabled" : ""}>
      <span class="cost">${c.cost}</span>
      <div class="art">${esc(c.icon)}</div>
      <div class="name">${esc(c.name)}</div>
      <div class="desc">${esc(c.type === "spell" ? "スペル" : "フォロワー")}</div>
      ${c.type === "follower" ? `<div class="stats"><span class="atk">⚔ ${c.atk}</span><span class="def">♥ ${c.hp}</span></div>` : ""}
    </button>`).join("");

  $("logs").innerHTML = game.logs.map(x => `<div>${esc(x)}</div>`).join("");
  $("end").disabled = !myTurn();

  if (game.over) {
    $("notice").textContent = game.winner === -1 ? "引き分け！"
      : game.winner === game.myIndex ? "勝利！ おめでとう！" : "敗北……再戦しよう！";
  } else if (game.started) {
    $("notice").textContent = myTurn()
      ? "あなたのターンです。戦略を立てよう！"
      : "相手の行動を待っています。";
  }
}

function playCard(index) {
  if (myTurn()) socket.emit("playCard", { index });
}

function selectAttacker(id) {
  if (!myTurn()) return;
  const card = game.me.field.find(c => c.id === id);
  if (!card?.canAttack) return;
  attackerId = id;
  $("notice").textContent = "攻撃先を選択してください。";
}

function attack(targetId) {
  if (!myTurn() || !attackerId) return;
  socket.emit("attack", { attackerId, targetId });
  attackerId = null;
}

function evolve(cardId) {
  if (!myTurn()) return;
  socket.emit("evolve", { cardId });
}

function cancelAttack() {
  attackerId = null;
  $("notice").textContent = lastNotice || "攻撃をキャンセルしました。";
}

function endTurn() {
  attackerId = null;
  if (myTurn()) socket.emit("endTurn");
}

window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.playCard = playCard;
window.selectAttacker = selectAttacker;
window.attack = attack;
window.evolve = evolve;
window.cancelAttack = cancelAttack;
window.endTurn = endTurn;

$("enemyHp").parentElement.style.cursor = "pointer";
$("enemyHp").parentElement.onclick = () => {
  if (attackerId && game?.enemy?.field.length === 0) attack("leader");
};

render();
