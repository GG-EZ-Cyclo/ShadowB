const CARD_LIBRARY = [
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
  { id: "demon_hand", name: "大悪魔の腕", cost: 6, icon: "👿", image: "/images/cards/demon_hand.jpg", type: "spell", effect: "demon-hand" }
];

const socket = io();
let game = null;
let attackerId = null;
let lastNotice = "";
let selectedDeck = {};
let selectedCardPreviewIndex = null;
let forcedHomeNotice = "";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

const audioManager = (() => {
  const homeBgm = new Audio("/audio/homeBGM1.mp3");
  const battleBgm = new Audio("/audio/BattleBGM(Lowen).mp3");
  let unlocked = false;
  let active = "home";

  [homeBgm, battleBgm].forEach(audio => {
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.25;
  });

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    setBgm(active);
  }

  function setBgm(mode) {
    active = mode;
    const target = mode === "battle" ? battleBgm : homeBgm;
    [homeBgm, battleBgm].forEach(audio => {
      if (audio !== target) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    if (!unlocked) return;
    target.play().catch(() => {});
  }

  function playEffect(path, volume = 0.6) {
    const audio = new Audio(path);
    audio.volume = volume;
    audio.preload = "auto";
    audio.play().catch(() => {});
  }

  return { unlock, setBgm, playEffect };
})();

window.addEventListener("pointerdown", audioManager.unlock, { once: true });
window.addEventListener("keydown", audioManager.unlock, { once: true });

function getDeckArray() {
  const result = [];
  Object.entries(selectedDeck).forEach(([cardId, count]) => {
    for (let i = 0; i < count; i++) result.push(cardId);
  });
  return result;
}

function setSelectedDeckFromServer(deck) {
  const nextDeck = {};
  for (const item of deck || []) {
    nextDeck[item] = (nextDeck[item] || 0) + 1;
  }
  selectedDeck = nextDeck;
}

function addCard(cardId) {
  const total = getDeckArray().length;
  if (total >= 20) return;
  const current = selectedDeck[cardId] || 0;
  if (current >= 2) return;
  selectedDeck[cardId] = current + 1;
  renderDeckBuilder();
}

function removeCard(cardId) {
  const current = selectedDeck[cardId] || 0;
  if (current <= 0) return;
  selectedDeck[cardId] = current - 1;
  if (selectedDeck[cardId] === 0) delete selectedDeck[cardId];
  renderDeckBuilder();
}

function renderDeckBuilder() {
  const deck = getDeckArray();
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
  const deck = getDeckArray();
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

  if (game?.phase === "deck-building" && !game.started) {
    selectedDeck = {};
    renderDeckBuilder();
  } else if (game?.me?.deckReady) {
    setSelectedDeckFromServer(game.me.deckSelection || getDeckArray());
  }

  render();
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
    ${side === "enemy" && attackerId ? `<div class="card-actions"><button onclick="attack('${card.id}')">攻撃対象</button></div>` : ""}
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

  renderEffectPreview();

  $("roomCode").textContent = game.code;
  $("lobby").style.display = game.started ? "none" : "block";
  $("deckBuilder").style.display = isDeckBuilding ? "block" : "none";
  $("enemyLeaderTarget").style.display = canTargetLeader ? "inline-flex" : "none";
  $("enemyLeaderTarget").disabled = !canTargetLeader;

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
  renderEffectPreview();
  render();
}

function confirmSelectedCardUse() {
  if (selectedCardPreviewIndex === null) return;
  if (myTurn()) {
    const card = game.me.hand[selectedCardPreviewIndex];
    if (card) audioManager.playEffect(card.type === "spell" ? "/audio/spellcard1.mp3" : "/audio/cardput1.mp3", 0.7);
    socket.emit("playCard", { index: selectedCardPreviewIndex });
  }
  selectedCardPreviewIndex = null;
  render();
}

function playCard(index) {
  if (!myTurn()) return;
  const card = game.me.hand[index];
  if (card) audioManager.playEffect(card.type === "spell" ? "/audio/spellcard1.mp3" : "/audio/cardput1.mp3", 0.7);
  socket.emit("playCard", { index });
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
  audioManager.playEffect("/audio/dagekiAttack1.mp3", 0.8);
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
    audioManager.playEffect("/audio/cardtap1.mp3", 0.45);
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
  if (attackerId && game?.enemy?.field.length === 0) attack("leader");
};
$("enemyLeaderTarget").onclick = () => {
  if (attackerId && game?.enemy?.field.length === 0) attack("leader");
};

applyPhoneLandscapeLock();
window.addEventListener("resize", applyPhoneLandscapeLock);
window.addEventListener("orientationchange", applyPhoneLandscapeLock);
audioManager.setBgm("home");
showHomeScreen();
renderDeckBuilder();
render();
