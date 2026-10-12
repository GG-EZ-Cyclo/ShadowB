import { audioManager } from "./audio.js";
import { CARD_LIBRARY, getDeckArray } from "./deckState.js";

const socket = io();
let game = null;
let attackerId = null;
let lastNotice = "";
let selectedDeck = {};
let selectedCardPreviewIndex = null;
let pendingSpellTarget = null;
let forcedHomeNotice = "";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

window.addEventListener("pointerdown", () => audioManager.unlock(), { once: true });
window.addEventListener("keydown", () => audioManager.unlock(), { once: true });

function getSelectedDeckArray() {
  return getDeckArray(selectedDeck);
}

function setSelectedDeckFromServer(deck) {
  const nextDeck = {};
  for (const item of deck || []) {
    nextDeck[item] = (nextDeck[item] || 0) + 1;
  }
  selectedDeck = nextDeck;
}

function addCard(cardId) {
  const total = getSelectedDeckArray().length;
  if (total >= 20) return;
  const current = selectedDeck[cardId] || 0;
  if (current >= 2) return;
  selectedDeck[cardId] = current + 1;
  audioManager.playEffect("/audio/cardtap1.mp3", 0.45);
  renderDeckBuilder();
}

function removeCard(cardId) {
  const current = selectedDeck[cardId] || 0;
  if (current <= 0) return;
  selectedDeck[cardId] = current - 1;
  if (selectedDeck[cardId] === 0) delete selectedDeck[cardId];
  audioManager.playEffect("/audio/cardtap1.mp3", 0.45);
  renderDeckBuilder();
}

function renderDeckBuilder() {
  const deck = getDeckArray(selectedDeck);
  const selfReady = Boolean(game?.me?.deckReady);
  const enemyReady = Boolean(game?.enemy?.deckReady);

  $("deckSummary").textContent = `${deck.length} / 20 枚`;
  $("deckReadyStatus").textContent = `自分: ${selfReady ? "準備完了" : "準備中"}`;
  $("enemyReadyStatus").textContent = `相手: ${game?.enemy ? (enemyReady ? "準備完了" : "作成中") : "待機中"}`;

  const submitButton = $("submitDeckBtn");
  if (submitButton) {
    const canSubmit = deck.length === 20;
    submitButton.disabled = !canSubmit || selfReady;
    submitButton.classList.toggle("confirmed", selfReady);
    submitButton.textContent = selfReady ? "デッキを確定しました" : "このデッキで対戦開始";
  }

  $("deckLibrary").innerHTML = CARD_LIBRARY.map(card => {
    const count = selectedDeck[card.id] || 0;
    return `
      <div class="deck-card">
        <div class="art"><img src="${esc(card.image || card.icon)}" alt="${esc(card.name)}" class="card-art-img"></div>
        <div class="name">${esc(card.name)}</div>
        <div class="desc">${esc(card.type === "spell" ? "スペル" : "フォロワー")}</div>
        ${card.type === "follower" ? `<div class="stats"><span class="atk">⚔ ${card.atk}</span><span class="def">♥ ${card.hp}</span></div>` : ""}
        <div class="qty">
          <button ${count === 0 ? "disabled" : ""} onclick="removeCard('${card.id}')">−</button>
          <span class="count">${count}</span>
          <button ${count >= 2 || deck.length >= 20 ? "disabled" : ""} onclick="addCard('${card.id}')">＋</button>
        </div>
      </div>
    `;
  }).join("");
}

function submitDeck() {
  const deck = getDeckArray(selectedDeck);
  if (deck.length !== 20) {
    $("notice").textContent = "デッキは20枚で組んでください。";
    return;
  }

  $("notice").textContent = "デッキを確定しました。相手の準備完了を待っています…";
  const submitButton = $("submitDeckBtn");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "デッキを確定しました";
    submitButton.classList.add("confirmed");
  }
  socket.emit("setDeck", { deck });
}

socket.on("connect", () => $("connection").textContent = "サーバー接続済み");
socket.on("disconnect", () => $("connection").textContent = "接続が切れました");
socket.on("connect_error", () => $("connection").textContent = "接続エラー");

socket.on("roomCreated", code => {
  $("code").value = code;
  $("roomCode").textContent = code;
  $("notice").textContent = "デッキを組んで対戦相手を待ちましょう。";
  selectedDeck = {};
  renderDeckBuilder();
});

socket.on("notice", message => {
  lastNotice = message;
  $("notice").textContent = message;
});

socket.on("state", state => {
  game = state;
  attackerId = null;

  if (!game || (!game.started && game.phase !== "battle")) {
    audioManager.setBgm("home");
  } else if (game.started && !game.over) {
    audioManager.setBgm("battle");
  } else if (!game.started || game.over) {
    audioManager.setBgm("home");
  }

  if (game?.phase === "deck-building" && !game.started && !game.me?.deckReady) {
    renderDeckBuilder();
  } else if (game?.me?.deckReady) {
    setSelectedDeckFromServer(game.me.deckSelection || getDeckArray(selectedDeck));
  }

  render();
});

socket.on("sound", ({ kind } = {}) => {
  const soundMap = {
    summonSound: "/audio/cardput1.mp3",
    cardtap: "/audio/cardtap1.mp3",
    dengekiAttack: "/audio/dagekiAttack1.mp3",
    LifeDamege: "/audio/LifeDamege1.mp3",
    SordAttack: "/audio/sordAttack1.mp3",
    spellcard: "/audio/spellcard1.mp3",
    syoukan: "/audio/syoukan1.mp3",
    heal: "/audio/syoukan1.mp3",
    victory: "/audio/syoukan1.mp3",
    victry: "/audio/syoukan1.mp3",
    defeat: "/audio/LifeDamege1.mp3",
    evolve: "/audio/evolve1.mp3",
    summon: "/audio/cardput1.mp3",
    attack: "/audio/dagekiAttack1.mp3",
    spell: "/audio/spellcard1.mp3",
    turn: "/audio/cardtap1.mp3"
  };

  const file = soundMap[kind];
  if (file) {
    const volume = ["LifeDamege", "SordAttack", "dengekiAttack", "attack"].includes(kind) ? 0.8 : 0.6;
    audioManager.playEffect(file, volume);
  }
});

socket.on("roomLeft", ({ message, self = false } = {}) => {
  const notice = message || (self ? "ホームに戻りました。" : "対戦相手が終了を選択したためホームに戻ります。");
  if (self) {
    showHomeScreen("ホームに戻りました。対戦を終了しました。");
    return;
  }
  showHomeScreen("対戦相手が終了を選択したためホームに戻ります。");
  if ($("notice")) $("notice").textContent = notice;
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

function isSmartPhone() {
  const ua = navigator.userAgent || "";
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const narrowWidth = window.innerWidth <= 900;
  return isMobileUA || (coarsePointer && narrowWidth);
}

function applyPhoneLandscapeLock() {
  const mobile = isSmartPhone();
  const landscape = window.matchMedia ? window.matchMedia("(orientation: landscape)").matches : true;
  document.body.classList.toggle("mobile-device", mobile);
  document.body.classList.toggle("need-landscape", mobile && !landscape);
}

function showHomeScreen(message = "ルームを作成するか、友達のルームに参加してください。") {
  game = null;
  attackerId = null;
  selectedDeck = {};
  selectedCardPreviewIndex = null;
  pendingSpellTarget = null;
  forcedHomeNotice = message;
  if ($("lobby")) $("lobby").style.display = "block";
  if ($("deckBuilder")) $("deckBuilder").style.display = "none";
  if ($("battleArea")) $("battleArea").style.display = "none";
  if ($("handArea")) $("handArea").style.display = "none";
  if ($("roomCode")) $("roomCode").textContent = "------";
  if ($("turn")) $("turn").textContent = "対戦相手を待っています";
  if ($("notice")) $("notice").textContent = message;
  if ($("battleResultBanner")) {
    $("battleResultBanner").classList.remove("visible", "win", "lose", "draw");
    $("battleResultBanner").textContent = "";
  }
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
    : card.effect === "zeus" ? "召喚時：敵リーダーと全フォロワーに5ダメージ"
    : card.effect === "bolt" ? "敵フォロワーに3ダメージ"
    : card.effect === "demon-hand" ? "相手の場のフォロワー全体に4ダメージ"
    : card.effect === "heal4" ? "自分を4回復"
    : card.effect === "meteor" ? "敵リーダーに4ダメージ"
    : card.effect === "draw" ? "カードを2枚引く"
    : card.effect === "angel-snipe" ? "相手リーダーまたはフォロワーに1ダメージ"
    : card.effect === "death-dance" ? "相手のフォロワーを破壊し、リーダーに2ダメージ"
    : card.effect === "reonidas" ? "攻撃時：相手全体に1ダメージ"
    : "ファンタジーの力を解き放て！";

  return `<div class="card ${selected ? "selected" : ""} ${ready ? "ready" : ""}">
    <span class="cost">${card.cost}</span>
    <div class="art"><img src="${esc(card.image || card.icon)}" alt="${esc(card.name)}" class="card-art-img"></div>
    <div class="name">${esc(card.name)}${card.evolved ? " ✨" : ""}</div>
    <div class="desc">${esc(description)}</div>
    ${isFollower ? `<div class="stats"><span class="atk">⚔ ${card.atk}</span><span class="def">♥ ${card.hp}</span></div>` : ""}
    ${side === "me" && isFollower ? `<div class="card-actions">
      <button ${!myTurn() || !ready ? "disabled" : ""} onclick="selectAttacker('${card.id}')">攻撃</button>
      <button ${!myTurn() || !game || game.me.evo <= 0 || game.me.turns < 2 || card.evolved ? "disabled" : ""} onclick="evolve('${card.id}')">進化</button>
    </div>` : ""}
    ${side === "enemy" && (attackerId || pendingSpellTarget) ? `<div class="card-actions"><button onclick="${attackerId ? `attack('${card.id}')` : `selectSpellTarget('${card.id}')`}">${attackerId ? "攻撃対象" : "対象選択"}</button></div>` : ""}
  </div>`;
}

function getSelectedPreviewCard() {
  if (selectedCardPreviewIndex === null || !game?.me?.hand) return null;
  return game.me.hand[selectedCardPreviewIndex] || null;
}

function renderEffectPreview() {
  const preview = $("effectPreview");
  if (!preview) return;

  const card = getSelectedPreviewCard();
  if (!card) {
    preview.className = "effect-preview empty";
    preview.textContent = "カードを選択すると効果を確認できます。";
    return;
  }

  const description = card.effect === "heal" ? "召喚時：自分を2回復"
    : card.effect === "heal3" ? "召喚時：自分を3回復"
    : card.effect === "blast" ? "召喚時：敵リーダーに2ダメージ"
    : card.effect === "zeus" ? "召喚時：敵リーダーと全フォロワーに5ダメージ"
    : card.effect === "bolt" ? "敵フォロワーに3ダメージ"
    : card.effect === "demon-hand" ? "相手の場のフォロワー全体に4ダメージ"
    : card.effect === "heal4" ? "自分を4回復"
    : card.effect === "meteor" ? "敵リーダーに4ダメージ"
    : card.effect === "draw" ? "カードを2枚引く"
    : card.effect === "angel-snipe" ? "相手リーダーまたはフォロワーに1ダメージ"
    : card.effect === "death-dance" ? "相手のフォロワーを破壊し、リーダーに2ダメージ"
    : card.effect === "reonidas" ? "攻撃時：相手全体に1ダメージ"
    : card.type === "follower" ? `${card.name}は戦場に出て攻撃できるフォロワーです。`
    : `${card.name}は戦術カードです。`;

  const canUse = myTurn() && card.cost <= game.me.mana;

  preview.className = "effect-preview";
  preview.innerHTML = `
    <div class="effect-card">
      <div class="art"><img src="${esc(card.image || card.icon)}" alt="${esc(card.name)}" class="card-art-img"></div>
      <div class="effect-name">${esc(card.name)}</div>
      <div class="effect-desc">${esc(description)}</div>
      <div class="effect-stats">
        <span>コスト ${card.cost}</span>
        ${card.type === "follower" ? `<span>⚔ ${card.atk} / ♥ ${card.hp}</span>` : `<span>スペル</span>`}
      </div>
      <div class="effect-actions">
        <button ${canUse ? "" : "disabled"} onclick="confirmSelectedCardUse()">このカードを使用する</button>
      </div>
    </div>
  `;
}

function render() {
  if (!game) {
    syncHomeVisibility();
    return;
  }

  syncHomeVisibility();

  const isDeckBuilding = game.phase === "deck-building" && !game.started;
  const canTargetLeader = !!attackerId && game?.enemy && game.enemy.field.length === 0 && myTurn();
  const canTargetLeaderForSpell = !!pendingSpellTarget && game?.enemy && myTurn();

  renderEffectPreview();

  $("roomCode").textContent = game.code;
  $("lobby").style.display = game.started ? "none" : "block";
  $("deckBuilder").style.display = isDeckBuilding ? "block" : "none";
  $("enemyLeaderTarget").style.display = canTargetLeader || canTargetLeaderForSpell ? "inline-flex" : "none";
  $("enemyLeaderTarget").disabled = !(canTargetLeader || canTargetLeaderForSpell);

  const resultBanner = $("battleResultBanner");
  if (resultBanner) {
    const isDraw = game.winner === -1;
    const isWin = game.winner === game.myIndex;
    const isLose = game.over && !isDraw && !isWin;
    resultBanner.classList.toggle("visible", game.over);
    resultBanner.classList.toggle("win", isWin);
    resultBanner.classList.toggle("lose", isLose);
    resultBanner.classList.toggle("draw", isDraw);
    resultBanner.textContent = game.over
      ? (isDraw ? "DRAW — 引き分け" : isWin ? "VICTORY — 勝利" : "DEFEAT — 敗北")
      : "";
  }

  $("turn").textContent = !game.started ? (isDeckBuilding ? "デッキ構築中" : "対戦相手を待っています")
    : game.over ? "対戦終了"
    : myTurn() ? `TURN ${game.turn} · あなたのターン`
    : `TURN ${game.turn} · 相手のターン`;

  $("myName").textContent = game.me.name;
  $("myHp").textContent = game.me.hp + " HP";
  $("myMana").textContent = `マナ ${game.me.mana} / ${game.me.maxMana}`;
  $("myEvo").textContent = `進化ポイント ${game.me.evo}`;
  $("myHandCount").textContent = `手札 ${game.me.hand.length} 枚`;
  $("deckCount").textContent = `デッキ残り ${game.me.deckCount} 枚`;

  $("enemyName").textContent = game.enemy?.name || "対戦相手を待っています";
  $("enemyHp").textContent = game.enemy ? game.enemy.hp + " HP" : "-- HP";
  $("enemyMana").textContent = game.enemy ? `マナ ${game.enemy.mana} / ${game.enemy.maxMana}` : "マナ --";
  $("enemyEvo").textContent = game.enemy ? `進化ポイント ${game.enemy.evo}` : "進化 0";
  $("enemyHand").textContent = game.enemy ? `手札 ${game.enemy.handCount} 枚` : "手札 -- 枚";

  $("myField").innerHTML = game.me.field.length
    ? game.me.field.map(c => cardMarkup(c, "me")).join("")
    : '<span class="small">フォロワーがいません</span>';

  $("enemyField").innerHTML = game.enemy?.field.length
    ? game.enemy.field.map(c => cardMarkup(c, "enemy")).join("")
    : '<span class="small">敵フォロワーがいません</span>';

  $("hand").innerHTML = game.me.hand.map((c, i) => `
    <div class="card ${selectedCardPreviewIndex === i ? "selected" : ""}" onclick="previewCard(${i})" ${!myTurn() ? "aria-disabled='true'" : ""}>
      <span class="cost">${c.cost}</span>
      <div class="art"><img src="${esc(c.image || c.icon)}" alt="${esc(c.name)}" class="card-art-img"></div>
      <div class="name">${esc(c.name)}</div>
      <div class="desc">${esc(c.type === "spell" ? "スペル" : "フォロワー")}</div>
      ${c.type === "follower" ? `<div class="stats"><span class="atk">⚔ ${c.atk}</span><span class="def">♥ ${c.hp}</span></div>` : ""}
      <button type="button" class="card-use" onclick="event.stopPropagation(); playCard(${i})" ${!myTurn() || c.cost > game.me.mana ? "disabled" : ""}>使用</button>
    </div>`).join("");

  $("logs").innerHTML = game.logs.map(x => `<div>${esc(x)}</div>`).join("");
  $("end").disabled = !myTurn();
  $("postGameActions").style.display = game.over ? "flex" : "none";
  $("postGameStatus").textContent = game.over
    ? `${game.rematchVotes?.length || 0} / ${game.players?.length || 0} が再戦を希望`
    : "";

  if (game.over) {
    $("notice").textContent = game.winner === -1 ? "引き分け！"
      : game.winner === game.myIndex ? "勝利！ おめでとう！" : "敗北……再戦しよう！";
  } else if (game.started) {
    $("notice").textContent = myTurn()
      ? (attackerId ? "攻撃対象を選択してください。敵フォロワーまたは敵リーダーを選んでください。" : "あなたのターンです。戦略を立てよう！")
      : "相手の行動を待っています。";
  }
}

function previewCard(index) {
  if (!myTurn()) return;
  selectedCardPreviewIndex = index;
  audioManager.playEffect("/audio/cardtap1.mp3", 0.45);
  renderEffectPreview();
  render();
}

function confirmSelectedCardUse() {
  if (selectedCardPreviewIndex === null) return;
  const card = getSelectedPreviewCard();
  if (!card) return;

  if (["angel-snipe", "death-dance"].includes(card.effect)) {
    pendingSpellTarget = { index: selectedCardPreviewIndex };
    const enemyHasField = !!(game?.enemy && game.enemy.field.length > 0);
    $("notice").textContent = card.effect === "death-dance"
      ? (enemyHasField ? "相手のフォロワーを選択してください。" : "死の舞踏は相手のフォロワーがいるときに使えます。")
      : "相手リーダーまたはフォロワーを選択してください。";
    selectedCardPreviewIndex = null;
    render();
    return;
  }

  if (myTurn()) {
    socket.emit("playCard", { index: selectedCardPreviewIndex });
  }
  selectedCardPreviewIndex = null;
  pendingSpellTarget = null;
  render();
}

function selectSpellTarget(targetId) {
  if (!pendingSpellTarget) return;
  if (!myTurn()) return;
  socket.emit("playCard", { index: pendingSpellTarget.index, targetId });
  pendingSpellTarget = null;
  selectedCardPreviewIndex = null;
  render();
}

function playCard(index, targetId = null) {
  if (!myTurn()) return;
  socket.emit("playCard", { index, targetId });
}

function selectAttacker(id) {
  if (!myTurn()) return;
  const card = game.me.field.find(c => c.id === id);
  if (!card?.canAttack) return;
  attackerId = id;
  $("notice").textContent = game.enemy?.field.length
    ? "攻撃対象を選択してください。敵フォロワーまたは敵リーダーを選んでください。"
    : "敵リーダーが攻撃可能です。ここをクリックしてダメージを与えられます。";
  render();
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
  if (myTurn()) {
    socket.emit("endTurn");
  }
}

function requestRematch() {
  selectedDeck = {};
  renderDeckBuilder();
  socket.emit("requestRematch");
}

function leaveRoom() {
  socket.emit("leaveRoom");
  showHomeScreen("ホームに戻りました。対戦を終了しました。");
}

function syncHomeVisibility() {
  const onHome = !game || !game.started;
  if ($("lobby")) $("lobby").style.display = onHome ? "block" : "none";
  if ($("deckBuilder")) $("deckBuilder").style.display = (onHome && (!game || game.phase === "deck-building")) ? "block" : "none";
  if ($("battleArea")) $("battleArea").style.display = onHome ? "none" : "grid";
  if ($("handArea")) $("handArea").style.display = onHome ? "none" : "block";
}

window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.playCard = playCard;
window.previewCard = previewCard;
window.confirmSelectedCardUse = confirmSelectedCardUse;
window.selectAttacker = selectAttacker;
window.attack = attack;
window.evolve = evolve;
window.cancelAttack = cancelAttack;
window.endTurn = endTurn;
window.requestRematch = requestRematch;
window.leaveRoom = leaveRoom;
window.addCard = addCard;
window.removeCard = removeCard;
window.submitDeck = submitDeck;

$("enemyHp").parentElement.style.cursor = "pointer";
$("enemyHp").parentElement.onclick = () => {
if (pendingSpellTarget) {
      selectSpellTarget("leader");
      return;
    }
    if (attackerId && game?.enemy?.field.length === 0) attack("leader");
};
$("enemyLeaderTarget").onclick = () => {
  if (pendingSpellTarget) {
    selectSpellTarget("leader");
    return;
  }
  if (attackerId && game?.enemy?.field.length === 0) attack("leader");
};

applyPhoneLandscapeLock();
window.addEventListener("resize", applyPhoneLandscapeLock);
window.addEventListener("orientationchange", applyPhoneLandscapeLock);
audioManager.setBgm("home");
showHomeScreen();
renderDeckBuilder();
render();
