const state = {
  meta: null,
  room: null,
  playerId: null,
  packEra: 'current',
  positionFilter: 'ALL',
  mobilePanel: 'shop',
  selectedCard: null,
  selectedSlot: null,
  preview: null,
  poller: null,
  pollBusy: false,
  actionBusy: false,
  lastPrepKey: '',
  currentView: '',
  matchFrame: null,
  renderedMatchId: null,
  renderedEventCount: -1,
};

const dom = Object.fromEntries([
  'loadingScreen', 'lobbyScreen', 'gameScreen', 'coachName', 'roomCode', 'createRoomBtn',
  'searchRoomBtn', 'roomPreview', 'roomCodeLabel', 'copyCodeBtn', 'countdownLabel', 'coinsLabel',
  'opponentStatus', 'waitingBanner', 'waitingCode', 'waitingCopyBtn', 'addBotBtn', 'prepView',
  'packGrid', 'formationSelect', 'tacticSelect', 'tacticDescription', 'lineupOverall', 'pitchSlots',
  'selectionHint', 'lineupCount', 'readyHint', 'readyBtn', 'inventoryCount', 'inventoryEmpty',
  'inventoryList', 'matchView', 'resultView', 'matchStage', 'homeName', 'awayName', 'homeFormation',
  'awayFormation', 'matchClock', 'homeScore', 'awayScore', 'penaltyScore', 'skipMatchBtn',
  'matchProgressBar', 'homeBoard', 'awayBoard', 'featuredEvent', 'eventFeed', 'liveStats',
  'packDialog', 'packExperience', 'toastRegion',
].map(id => [id, document.getElementById(id)]));

const STORAGE_KEY = 'legend11-session-v1';
const NAME_KEY = 'legend11-coach-name';
const POS_LABEL = { GK: '门将', DEF: '后卫', MID: '中场', FWD: '锋线' };
const STAT_LABEL = { pac: 'PAC', sho: 'SHO', pas: 'PAS', dri: 'DRI', def: 'DEF', phy: 'PHY', gk: 'GK' };
const TIER_LABEL = { core: '主力', elite: '精英', star: '巨星', legend: '传奇', academy: '青训' };
const EVENT_ICON = {
  goal: '⚽', save: '◇', shot: '↗', card: '!', foul: '×', play: '·', phase: '◆',
  'penalty-goal': '✓', 'penalty-miss': '×',
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function playerById(id) {
  return state.meta.players.find(player => player.id === id);
}

function packById(id) {
  return state.meta.packs.find(pack => pack.id === id);
}

function currentPlayer() {
  return state.room?.players.find(player => player.id === state.playerId);
}

function opponentPlayer() {
  return state.room?.players.find(player => player.id !== state.playerId);
}

function playerOverall(player) {
  const s = player.stats;
  const weights = player.position === 'GK'
    ? [['gk', .68], ['pas', .12], ['phy', .12], ['pac', .08]]
    : player.position === 'DEF'
      ? [['def', .4], ['phy', .22], ['pac', .18], ['pas', .12], ['dri', .08]]
      : player.position === 'MID'
        ? [['pas', .3], ['dri', .25], ['phy', .14], ['def', .13], ['sho', .1], ['pac', .08]]
        : [['sho', .32], ['pac', .24], ['dri', .23], ['phy', .11], ['pas', .1]];
  return Math.round(weights.reduce((total, [key, weight]) => total + s[key] * weight, 0));
}

function stringHash(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return hash;
}

function avatarData(player) {
  const seed = stringHash(player.id);
  const palettes = player.era === 'legend'
    ? [['#5c3a09', '#d4a745', '#fff0b2'], ['#3d2708', '#b77a18', '#f0cb6c'], ['#44310f', '#8f6822', '#ffe6a0']]
    : [['#0b3824', '#2f9c64', '#83e5aa'], ['#103144', '#2c8294', '#78d9dc'], ['#1a3931', '#397d63', '#9be0bc']];
  const [dark, mid, light] = palettes[seed % palettes.length];
  const skin = ['#f2c6a0', '#c98963', '#8c523b', '#e5ad7f'][seed % 4];
  const hair = ['#171513', '#39281f', '#80582d', '#d0b071'][Math.floor(seed / 5) % 4];
  const initial = escapeHTML(player.name.slice(0, 1));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 180"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient><radialGradient id="g"><stop stop-color="${light}" stop-opacity=".25"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient></defs><rect width="160" height="180" fill="url(#b)"/><circle cx="80" cy="65" r="72" fill="url(#g)"/><path d="M22 180c3-41 25-59 58-59s55 18 58 59" fill="${light}" opacity=".88"/><path d="M53 126l27 23 27-23 8 54H45z" fill="${dark}" opacity=".55"/><rect x="68" y="102" width="24" height="31" rx="10" fill="${skin}"/><ellipse cx="80" cy="73" rx="34" ry="43" fill="${skin}"/><path d="M47 70c0-31 16-49 37-49 26 0 38 20 31 54-8-11-12-24-13-35-14 13-32 18-55 17z" fill="${hair}"/><path d="M59 77h13M88 77h13" stroke="#201713" stroke-width="3" stroke-linecap="round" opacity=".7"/><path d="M72 95c6 4 11 4 17 0" stroke="#7d3f37" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="58" cy="84" r="3" fill="${skin}"/><circle cx="102" cy="84" r="3" fill="${skin}"/><text x="80" y="170" text-anchor="middle" fill="${dark}" opacity=".45" font-family="Arial" font-size="19" font-weight="800">${initial}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function showToast(message, type = 'info', duration = 2600) {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'is-error' : type === 'success' ? 'is-success' : ''}`;
  toast.textContent = message;
  dom.toastRegion.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function saveSession(code, playerId) {
  state.playerId = playerId;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ code, playerId }));
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
  state.playerId = null;
  state.room = null;
  state.lastPrepKey = '';
  state.renderedMatchId = null;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`房间号 ${text} 已复制`, 'success');
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    showToast(`房间号 ${text} 已复制`, 'success');
  }
}

function showLobby() {
  stopPolling();
  cancelAnimationFrame(state.matchFrame);
  state.currentView = 'lobby';
  dom.loadingScreen.classList.add('is-hidden');
  dom.gameScreen.classList.add('is-hidden');
  dom.lobbyScreen.classList.remove('is-hidden');
  dom.roomPreview.classList.add('is-hidden');
}

function showGame() {
  dom.loadingScreen.classList.add('is-hidden');
  dom.lobbyScreen.classList.add('is-hidden');
  dom.gameScreen.classList.remove('is-hidden');
}

function setupMetaControls() {
  dom.formationSelect.innerHTML = Object.values(state.meta.formations)
    .map(formation => `<option value="${formation.id}">${escapeHTML(formation.name)}</option>`).join('');
  dom.tacticSelect.innerHTML = Object.values(state.meta.tactics)
    .map(tactic => `<option value="${tactic.id}">${escapeHTML(tactic.name)}</option>`).join('');
}

async function createRoom() {
  if (state.actionBusy) return;
  const name = dom.coachName.value.trim() || `教练${Math.floor(100 + Math.random() * 900)}`;
  localStorage.setItem(NAME_KEY, name);
  state.actionBusy = true;
  dom.createRoomBtn.disabled = true;
  try {
    const data = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ name }) });
    saveSession(data.room.code, data.playerId);
    state.room = data.room;
    showGame();
    renderRoom();
    startPolling();
    showToast('好友房已创建，先开包组建你的11人阵容吧', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.actionBusy = false;
    dom.createRoomBtn.disabled = false;
  }
}

async function searchRoom() {
  const code = dom.roomCode.value.trim().toUpperCase();
  dom.roomCode.value = code;
  if (code.length !== 6) {
    renderPreviewError('请输入完整的 6 位房间号');
    return;
  }
  dom.searchRoomBtn.disabled = true;
  dom.searchRoomBtn.textContent = '搜索中…';
  try {
    const preview = await api(`/api/rooms/${encodeURIComponent(code)}/preview`);
    state.preview = preview;
    dom.roomPreview.className = 'room-preview';
    dom.roomPreview.innerHTML = `
      <div class="room-preview-top">
        <div><strong>${escapeHTML(preview.host)} 的好友房</strong><span>房间号 ${escapeHTML(preview.code)}</span></div>
        <span>${preview.playerCount}/2 · ${preview.status === 'preparing' ? '备战中' : '比赛中'}</span>
      </div>
      <button id="joinPreviewBtn" class="primary-btn" type="button" ${preview.joinable ? '' : 'disabled'}>${preview.joinable ? '加入房间' : '房间暂不可加入'}</button>`;
    dom.roomPreview.classList.remove('is-hidden');
    document.getElementById('joinPreviewBtn')?.addEventListener('click', joinPreviewRoom);
  } catch (error) {
    renderPreviewError(error.message);
  } finally {
    dom.searchRoomBtn.disabled = false;
    dom.searchRoomBtn.textContent = '搜索';
  }
}

function renderPreviewError(message) {
  dom.roomPreview.className = 'room-preview is-error';
  dom.roomPreview.textContent = message;
  dom.roomPreview.classList.remove('is-hidden');
}

async function joinPreviewRoom() {
  if (!state.preview?.joinable || state.actionBusy) return;
  const name = dom.coachName.value.trim() || `教练${Math.floor(100 + Math.random() * 900)}`;
  localStorage.setItem(NAME_KEY, name);
  state.actionBusy = true;
  try {
    const data = await api(`/api/rooms/${state.preview.code}/join`, { method: 'POST', body: JSON.stringify({ name }) });
    saveSession(data.room.code, data.playerId);
    state.room = data.room;
    showGame();
    renderRoom();
    startPolling();
    showToast('已加入房间，3分钟备战开始', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.actionBusy = false;
  }
}

async function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved?.code || !saved?.playerId) return false;
    const data = await api(`/api/rooms/${saved.code}/state?playerId=${encodeURIComponent(saved.playerId)}`);
    state.playerId = saved.playerId;
    state.room = data.room;
    showGame();
    renderRoom();
    startPolling();
    return true;
  } catch {
    clearSession();
    return false;
  }
}

function startPolling() {
  stopPolling();
  state.poller = setInterval(syncRoom, 850);
}

function stopPolling() {
  if (state.poller) clearInterval(state.poller);
  state.poller = null;
}

async function syncRoom() {
  if (!state.room || !state.playerId || state.pollBusy) return;
  state.pollBusy = true;
  try {
    const data = await api(`/api/rooms/${state.room.code}/state?playerId=${encodeURIComponent(state.playerId)}`);
    state.room = data.room;
    renderRoom();
  } catch (error) {
    if (/不在|过期|没有找到/.test(error.message)) {
      showToast(`${error.message}，已返回大厅`, 'error');
      clearSession();
      showLobby();
    }
  } finally {
    state.pollBusy = false;
  }
}

async function roomAction(type, payload = {}, options = {}) {
  if (!state.room || state.actionBusy) return null;
  state.actionBusy = true;
  if (options.button) options.button.disabled = true;
  try {
    const data = await api(`/api/rooms/${state.room.code}/action`, {
      method: 'POST',
      body: JSON.stringify({ playerId: state.playerId, type, payload }),
    });
    state.room = data.room;
    state.lastPrepKey = '';
    renderRoom();
    return data;
  } catch (error) {
    showToast(error.message, 'error');
    return null;
  } finally {
    state.actionBusy = false;
    if (options.button) options.button.disabled = false;
  }
}

async function addBot() {
  if (!state.room || state.actionBusy) return;
  state.actionBusy = true;
  dom.addBotBtn.disabled = true;
  try {
    const data = await api(`/api/rooms/${state.room.code}/bot`, {
      method: 'POST', body: JSON.stringify({ playerId: state.playerId }),
    });
    state.room = data.room;
    state.lastPrepKey = '';
    renderRoom();
    showToast('传奇教头 AI 已入场，倒计时开始', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.actionBusy = false;
    dom.addBotBtn.disabled = false;
  }
}

function renderRoom() {
  if (!state.room) return;
  showGame();
  const me = currentPlayer();
  const opponent = opponentPlayer();
  dom.roomCodeLabel.textContent = state.room.code;
  dom.waitingCode.textContent = state.room.code;
  dom.coinsLabel.textContent = formatNumber(me?.coins);
  dom.countdownLabel.textContent = formatTime(state.room.remainingSeconds);
  dom.countdownLabel.parentElement.classList.toggle('is-urgent', state.room.remainingSeconds <= 30);
  dom.waitingBanner.classList.toggle('is-hidden', !state.room.canAddBot);

  if (opponent) {
    dom.opponentStatus.className = `opponent-status is-online ${opponent.ready ? 'is-ready' : ''}`;
    dom.opponentStatus.innerHTML = `<i></i><span>${escapeHTML(opponent.name)} · ${opponent.ready ? '已准备' : '备战中'}</span>`;
  } else {
    dom.opponentStatus.className = 'opponent-status';
    dom.opponentStatus.innerHTML = '<i></i><span>等待对手</span>';
  }

  const countdownStatus = document.querySelector('.countdown-status');
  const mobileTabs = document.querySelector('.mobile-tabs');
  if (state.room.status === 'preparing') {
    state.currentView = 'preparing';
    countdownStatus.classList.remove('is-hidden');
    mobileTabs.classList.remove('is-hidden');
    dom.prepView.classList.remove('is-hidden');
    dom.matchView.classList.add('is-hidden');
    dom.resultView.classList.add('is-hidden');
    renderPreparation();
  } else if (state.room.status === 'playing') {
    state.currentView = 'playing';
    countdownStatus.classList.add('is-hidden');
    mobileTabs.classList.add('is-hidden');
    dom.waitingBanner.classList.add('is-hidden');
    dom.prepView.classList.add('is-hidden');
    dom.resultView.classList.add('is-hidden');
    dom.matchView.classList.remove('is-hidden');
    renderMatch();
  } else if (state.room.status === 'finished') {
    state.currentView = 'finished';
    countdownStatus.classList.add('is-hidden');
    mobileTabs.classList.add('is-hidden');
    dom.waitingBanner.classList.add('is-hidden');
    dom.prepView.classList.add('is-hidden');
    dom.matchView.classList.add('is-hidden');
    dom.resultView.classList.remove('is-hidden');
    cancelAnimationFrame(state.matchFrame);
    renderResult();
  }
}

function preparationKey(me) {
  return JSON.stringify({
    coins: me.coins,
    formation: me.formation,
    tactic: me.tactic,
    ready: me.ready,
    lineup: me.lineup,
    inventory: me.inventory,
    opponent: opponentPlayer() ? { id: opponentPlayer().id, ready: opponentPlayer().ready } : null,
    era: state.packEra,
    filter: state.positionFilter,
    selectedCard: state.selectedCard,
    selectedSlot: state.selectedSlot,
    mobile: state.mobilePanel,
  });
}

function renderPreparation() {
  const me = currentPlayer();
  if (!me) return;
  const key = preparationKey(me);
  if (key === state.lastPrepKey) return;
  state.lastPrepKey = key;
  dom.formationSelect.value = me.formation;
  dom.tacticSelect.value = me.tactic;
  dom.formationSelect.disabled = me.ready;
  dom.tacticSelect.disabled = me.ready;
  dom.tacticDescription.textContent = state.meta.tactics[me.tactic].desc;
  dom.lineupOverall.textContent = me.teamOverall ?? '--';
  renderPacks();
  renderPitch();
  renderInventory();
  renderReadyState();
  updateMobilePanels();
}

function renderPacks() {
  const me = currentPlayer();
  const packs = state.meta.packs.filter(pack => pack.era === state.packEra);
  dom.packGrid.innerHTML = packs.map(pack => {
    const affordable = me.coins >= pack.price;
    const disabled = !affordable || me.ready;
    return `<article class="pack-item ${pack.era}">
      <div class="pack-top"><span class="pack-position">${pack.position}</span><span class="pack-count">${pack.cardCount} CARDS</span></div>
      <div class="pack-art" aria-hidden="true"><i></i><i></i><i></i></div>
      <h3>${escapeHTML(pack.name)}</h3><p>${escapeHTML(pack.tag)} · ${pack.playerIds.length}人卡池</p>
      <button class="buy-pack-btn" type="button" data-buy-pack="${pack.id}" ${disabled ? 'disabled' : ''}>
        <span><i>G</i>${formatNumber(pack.price)}</span><b>${affordable ? '购买开启' : `差 ${formatNumber(pack.price - me.coins)}`}</b>
      </button>
    </article>`;
  }).join('');
}

function renderPitch() {
  const me = currentPlayer();
  const formation = state.meta.formations[me.formation];
  dom.pitchSlots.innerHTML = formation.slots.map((slot, index) => {
    const item = me.lineup[index];
    const player = item ? playerById(item.cardId) : null;
    const selected = state.selectedSlot === index;
    return `<button class="pitch-slot ${item ? 'has-player' : ''} ${selected ? 'is-target' : ''}" type="button"
      data-slot="${index}" data-role="${slot.label}" style="left:${slot.x}%;top:${slot.y}%" ${me.ready ? 'aria-disabled="true"' : ''}>
      ${player ? `<span class="pitch-player ${player.era}" draggable="${!me.ready}" data-drag-slot="${index}">
        <span class="pitch-player-avatar"><img src="${avatarData(player)}" alt="${escapeHTML(player.name)}"></span>
        <span class="pitch-player-name">${escapeHTML(player.name)}</span>
        <span class="pitch-player-meta">${slot.label} · ${playerOverall(player)}</span>
        <span class="slot-remove" role="button" aria-label="移出${escapeHTML(player.name)}" data-remove-slot="${index}">×</span>
      </span>` : ''}
    </button>`;
  }).join('');

  if (state.selectedCard) {
    const player = playerById(state.selectedCard.cardId);
    dom.selectionHint.className = 'selection-hint is-selecting';
    dom.selectionHint.innerHTML = `<span>已选 ${escapeHTML(player.name)}</span> 点击一个场上位置完成放置`;
  } else if (state.selectedSlot !== null) {
    const item = me.lineup[state.selectedSlot];
    const player = item ? playerById(item.cardId) : null;
    dom.selectionHint.className = 'selection-hint is-selecting';
    dom.selectionHint.innerHTML = `<span>正在移动 ${escapeHTML(player?.name || '球员')}</span> 点击另一个位置完成交换`;
  } else {
    dom.selectionHint.className = 'selection-hint';
    dom.selectionHint.innerHTML = '<span>操作提示</span> 从右侧拖入球员，或先点球员再点场上位置。';
  }
}

function renderReadyState() {
  const me = currentPlayer();
  const count = me.lineup.filter(Boolean).length;
  dom.lineupCount.textContent = `首发 ${count} / 11`;
  if (me.ready) {
    dom.readyHint.textContent = opponentPlayer()?.ready ? '双方已确认，正在进入赛场' : '阵容已锁定，等待对方确认';
    dom.readyBtn.textContent = '取消准备';
    dom.readyBtn.disabled = false;
    dom.readyBtn.classList.add('is-ready');
  } else {
    dom.readyHint.textContent = count === 11 ? '阵容完整，可以确认出战' : '安排满11名不同球员后即可确认';
    dom.readyBtn.textContent = '确认阵容';
    dom.readyBtn.disabled = count !== 11 || !opponentPlayer();
    dom.readyBtn.classList.remove('is-ready');
  }
}

function statEntries(player) {
  const stats = player.stats;
  const keys = player.position === 'GK' ? ['gk', 'pas', 'phy', 'pac', 'def', 'dri'] : ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
  return keys.map(key => `<span>${STAT_LABEL[key]}<b>${stats[key]}</b></span>`).join('');
}

function renderInventory() {
  const me = currentPlayer();
  const items = (me.inventory || []).filter(item => state.positionFilter === 'ALL' || playerById(item.cardId).position === state.positionFilter);
  dom.inventoryCount.textContent = `${me.inventoryCount} 张 · ${me.uniqueCount} 人`;
  dom.inventoryEmpty.classList.toggle('is-hidden', me.inventoryCount > 0);
  dom.inventoryList.classList.toggle('is-hidden', me.inventoryCount === 0);
  dom.inventoryList.innerHTML = items.map(item => {
    const player = playerById(item.cardId);
    const overall = playerOverall(player);
    const onPitch = me.lineup.some(slot => slot?.cardId === item.cardId);
    const selected = state.selectedCard?.cardId === item.cardId;
    return `<article class="inventory-card ${player.era} tier-${player.tier} ${selected ? 'is-selected' : ''}" draggable="${!me.ready}" data-card-id="${player.id}">
      <div class="card-portrait"><span class="card-rating">${overall}</span><span class="card-position">${player.position}</span><span class="card-tier ${player.tier}">${TIER_LABEL[player.tier]}</span><img src="${avatarData(player)}" alt="${escapeHTML(player.name)}"></div>
      <div class="card-info"><h3>${escapeHTML(player.name)}</h3><p>${escapeHTML(player.club)} · ${escapeHTML(player.league)}</p><div class="mini-stats">${statEntries(player)}</div></div>
      <div class="inventory-actions"><span class="quantity-badge">× ${item.quantity}</span>
        ${onPitch ? '<span class="on-pitch-label">● 首发中</span>' : ''}
      </div>
    </article>`;
  }).join('');
}

async function buyPack(packId, button) {
  const data = await roomAction('buyPack', { packId }, { button });
  if (data?.reveal) openPackDialog(data.reveal);
}

function openPackDialog(reveal) {
  const pack = packById(reveal.packId);
  state.packReveal = { ...reveal, flipped: new Set() };
  dom.packExperience.innerHTML = `<div class="opening-stage">
    <p class="eyebrow">SCOUT DELIVERY</p><h2>${escapeHTML(pack.name)}</h2><p>${pack.cardCount}名球员已经签收，开启查看本次引援。</p>
    <div class="sealed-pack ${pack.era}"><div class="sealed-pack-logo">11</div><b>${escapeHTML(pack.name)}</b><small>LEGEND ELEVEN</small></div>
    <button id="openPackAction" class="primary-btn open-pack-action" type="button">撕开卡包</button>
  </div>`;
  if (!dom.packDialog.open) dom.packDialog.showModal();
  document.getElementById('openPackAction').addEventListener('click', event => {
    event.currentTarget.disabled = true;
    document.querySelector('.sealed-pack')?.classList.add('is-opening');
    setTimeout(() => renderPackReveal(reveal), 700);
  });
}

function renderPackReveal(reveal) {
  const pack = packById(reveal.packId);
  dom.packExperience.innerHTML = `<div class="reveal-stage cards-${reveal.cards.length}-stage">
    <div class="reveal-header"><div><p class="eyebrow">NEW SIGNINGS</p><h2>${escapeHTML(pack.name)} · 引援结果</h2></div><span id="revealProgress" class="reveal-progress">0 / ${reveal.cards.length}</span></div>
    <div class="reveal-cards cards-${reveal.cards.length}">${reveal.cards.map((item, index) => {
      const player = playerById(item.cardId);
      return `<button class="reveal-card" type="button" data-reveal-index="${index}" aria-label="翻开第${index + 1}张球员卡">
        <span class="reveal-face reveal-back"></span>
        <span class="reveal-face reveal-front ${player.era}">
          <span class="reveal-card-rating">${playerOverall(player)}</span><span class="reveal-card-position">${player.position} · ${escapeHTML(player.league)}</span>
          <span class="reveal-avatar"><img src="${avatarData(player)}" alt="${escapeHTML(player.name)}"></span>
          <span class="reveal-player-name">${escapeHTML(player.name)}</span><span class="reveal-player-en">${escapeHTML(player.club)}</span>
          <span class="reveal-stats">${statEntries(player)}</span>
        </span>
      </button>`;
    }).join('')}</div>
    <div class="reveal-actions"><button id="revealAllBtn" class="secondary-btn" type="button">全部翻开</button><button id="finishRevealBtn" class="primary-btn" type="button" disabled>收入待定区</button></div>
  </div>`;

  dom.packExperience.querySelectorAll('[data-reveal-index]').forEach(card => card.addEventListener('click', () => flipRevealCard(Number(card.dataset.revealIndex))));
  document.getElementById('revealAllBtn').addEventListener('click', () => {
    reveal.cards.forEach((_, index) => setTimeout(() => flipRevealCard(index), index * 120));
  });
  document.getElementById('finishRevealBtn').addEventListener('click', () => dom.packDialog.close());
}

function flipRevealCard(index) {
  const revealState = state.packReveal;
  if (!revealState || revealState.flipped.has(index)) return;
  revealState.flipped.add(index);
  dom.packExperience.querySelector(`[data-reveal-index="${index}"]`)?.classList.add('is-flipped');
  const count = revealState.flipped.size;
  const progress = document.getElementById('revealProgress');
  const total = revealState.cards.length;
  if (progress) progress.textContent = `${count} / ${total}`;
  if (count === total) {
    const finish = document.getElementById('finishRevealBtn');
    if (finish) finish.disabled = false;
    showToast(`${total}张球员卡已进入阵容待定区`, 'success');
  }
}

async function placeSelectedAt(slotIndex) {
  const me = currentPlayer();
  if (me.ready) {
    showToast('请先取消准备，再调整阵容');
    return;
  }
  if (state.selectedSlot !== null) {
    if (state.selectedSlot === slotIndex) {
      state.selectedSlot = null;
      state.lastPrepKey = '';
      renderPreparation();
      return;
    }
    const from = state.selectedSlot;
    state.selectedSlot = null;
    await roomAction('swapLineup', { from, to: slotIndex });
  } else if (state.selectedCard) {
    const selected = state.selectedCard;
    state.selectedCard = null;
    await roomAction('setLineup', { slotIndex, cardId: selected.cardId });
  } else if (me.lineup[slotIndex]) {
    state.selectedSlot = slotIndex;
    state.lastPrepKey = '';
    renderPreparation();
  }
}

function selectInventoryCard(cardId) {
  const me = currentPlayer();
  if (me.ready) {
    showToast('请先取消准备，再调整阵容');
    return;
  }
  const onPitch = me.lineup.findIndex(item => item?.cardId === cardId);
  if (onPitch >= 0) {
    state.selectedSlot = state.selectedSlot === onPitch ? null : onPitch;
    state.selectedCard = null;
  } else if (state.selectedCard?.cardId === cardId) {
    state.selectedCard = null;
  } else {
    state.selectedCard = { cardId };
    state.selectedSlot = null;
  }
  state.lastPrepKey = '';
  renderPreparation();
}

function updateMobilePanels() {
  document.querySelectorAll('[data-mobile-panel]').forEach(button => button.classList.toggle('is-active', button.dataset.mobilePanel === state.mobilePanel));
  document.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('is-mobile-active', panel.dataset.panel === state.mobilePanel));
}

function setMobilePanel(panel) {
  state.mobilePanel = panel;
  state.lastPrepKey = '';
  renderPreparation();
}

function renderMatch() {
  const match = state.room.match;
  if (!match) return;
  if (state.renderedMatchId !== match.id) {
    state.renderedMatchId = match.id;
    state.renderedEventCount = -1;
    renderMatchBase();
  }
  cancelAnimationFrame(state.matchFrame);
  updateMatchFrame();
}

function renderMatchBase() {
  const [home, away] = state.room.players;
  const match = state.room.match;
  dom.homeName.textContent = home.name;
  dom.awayName.textContent = away.name;
  dom.homeFormation.textContent = `${state.meta.formations[home.formation].name} · ${state.meta.tactics[home.tactic].name}`;
  dom.awayFormation.textContent = `${state.meta.formations[away.formation].name} · ${state.meta.tactics[away.tactic].name}`;
  dom.homeBoard.innerHTML = miniBoardMarkup(home, 0, match.teams[0]);
  dom.awayBoard.innerHTML = miniBoardMarkup(away, 1, match.teams[1]);
}

function miniBoardMarkup(player, side, team) {
  const formation = state.meta.formations[player.formation];
  return `<div class="mini-board-header"><strong>${escapeHTML(player.name)}</strong><span>${escapeHTML(state.meta.formations[player.formation].name)}</span></div>
    <div class="mini-pitch">${player.lineup.map((item, index) => {
      const card = playerById(item.cardId);
      const slot = formation.slots[index];
      return `<div class="mini-player" style="left:${slot.x}%;top:${slot.y}%"><img src="${avatarData(card)}" alt=""><span>${escapeHTML(card.name)}</span></div>`;
    }).join('')}</div>
    <div class="mini-team-summary"><div><span>进攻</span><strong>${Math.round(team.attack)}</strong></div><div><span>中场</span><strong>${Math.round(team.midfield)}</strong></div><div><span>防守</span><strong>${Math.round(team.defense)}</strong></div></div>`;
}

function updateMatchFrame() {
  if (state.currentView !== 'playing' || !state.room?.match) return;
  const match = state.room.match;
  const elapsed = Math.max(0, Date.now() - match.startedAt);
  const progress = Math.min(1, elapsed / match.durationMs);
  const revealed = match.events.filter(event => event.revealAt <= elapsed);
  const last = revealed.at(-1);
  const score = last?.score || [0, 0];
  const penalty = last?.penalty || [0, 0];
  dom.matchProgressBar.style.width = `${progress * 100}%`;
  dom.homeScore.textContent = score[0];
  dom.awayScore.textContent = score[1];
  dom.matchClock.textContent = last?.clock || '0′';
  dom.penaltyScore.textContent = penalty[0] || penalty[1] ? `点球 ${penalty[0]} - ${penalty[1]}` : '';
  dom.matchStage.textContent = matchStageLabel(last, progress, match);

  if (revealed.length !== state.renderedEventCount) {
    state.renderedEventCount = revealed.length;
    renderRevealedEvents(revealed);
  }
  if (progress < 1) state.matchFrame = requestAnimationFrame(updateMatchFrame);
}

function matchStageLabel(last, progress, match) {
  if (last?.clock?.startsWith('点球')) return '点球大战';
  const minute = Number.parseInt(last?.clock || '0', 10);
  if (minute > 90) return '加时赛';
  if (minute > 45) return '下半场';
  if (progress >= 1 && match.decision === 'regular') return '比赛结束';
  return '上半场';
}

function renderRevealedEvents(events) {
  const latestImportant = [...events].reverse().find(event => event.important) || events.at(-1);
  if (latestImportant) {
    dom.featuredEvent.className = `featured-event ${latestImportant.type === 'goal' ? 'is-goal' : ''}`;
    dom.featuredEvent.innerHTML = `<span>${escapeHTML(latestImportant.clock)}</span><p>${escapeHTML(latestImportant.text)}</p>`;
  }
  dom.eventFeed.innerHTML = [...events].reverse().map(event => `<div class="event-row ${event.type} ${event.important ? 'is-important' : ''}">
    <time>${escapeHTML(event.clock)}</time><span class="event-icon">${EVENT_ICON[event.type] || '·'}</span><p>${escapeHTML(event.text)}</p>
  </div>`).join('');
  renderLiveStats(events);
}

function renderLiveStats(events) {
  const stats = [
    { shots: 0, onTarget: 0, goals: 0 },
    { shots: 0, onTarget: 0, goals: 0 },
  ];
  events.forEach(event => {
    if (event.side === null || event.side === undefined) return;
    if (['goal', 'save', 'shot'].includes(event.type)) stats[event.type === 'save' ? 1 - event.side : event.side].shots += 1;
    if (['goal', 'save'].includes(event.type)) stats[event.type === 'save' ? 1 - event.side : event.side].onTarget += 1;
    if (event.type === 'goal') stats[event.side].goals += 1;
  });
  const final = state.room.match.stats;
  const rows = [
    ['控球', final[0].possession, final[1].possession, '%'],
    ['射门', stats[0].shots, stats[1].shots, ''],
    ['射正', stats[0].onTarget, stats[1].onTarget, ''],
  ];
  dom.liveStats.innerHTML = rows.map(([label, a, b, unit]) => compareMarkup(label, a, b, unit, 'stat-compare')).join('');
}

function compareMarkup(label, a, b, unit = '', className = 'stat-compare') {
  const total = Math.max(1, Number(a) + Number(b));
  const aWidth = Math.max(3, Number(a) / total * 100);
  const bWidth = Math.max(3, Number(b) / total * 100);
  return `<div class="${className}"><b>${a}${unit}</b><span class="compare-track"><i style="width:${aWidth}%"></i></span><span>${label}</span><span class="compare-track away"><i style="width:${bWidth}%"></i></span><b>${b}${unit}</b></div>`;
}

function renderResult() {
  const match = state.room.match;
  if (!match) return;
  const [home, away] = state.room.players;
  const viewerWon = match.winnerId === state.playerId;
  const decisionText = match.decision === 'penalties'
    ? `加时赛 ${match.extraScore[0]} - ${match.extraScore[1]} · 点球 ${match.penalties[0]} - ${match.penalties[1]}`
    : match.decision === 'extra' ? '加时赛决胜' : '常规时间决胜';
  const motmPlayer = playerById(match.manOfMatch.cardId);
  const importantEvents = match.events.filter(event => event.important);
  const statsRows = [
    ['控球率', match.stats[0].possession, match.stats[1].possession, '%'],
    ['射门', match.stats[0].shots, match.stats[1].shots, ''],
    ['射正', match.stats[0].onTarget, match.stats[1].onTarget, ''],
    ['角球', match.stats[0].corners, match.stats[1].corners, ''],
    ['传球成功率', match.stats[0].passAccuracy, match.stats[1].passAccuracy, '%'],
    ['扑救', match.stats[0].saves, match.stats[1].saves, ''],
  ];

  dom.resultView.innerHTML = `<div class="result-hero">
    <span class="result-outcome">${viewerWon ? 'MATCH VICTORY' : 'MATCH COMPLETE'}</span><h1>${viewerWon ? '胜利属于你' : '惜败，再战一场'}</h1>
    <div class="result-scoreline"><div class="result-team"><strong>${escapeHTML(home.name)}</strong><span>${escapeHTML(state.meta.formations[home.formation].name)}</span></div>
      <div class="result-score"><b>${match.score[0]}</b><i>:</i><b>${match.score[1]}</b></div>
      <div class="result-team"><strong>${escapeHTML(away.name)}</strong><span>${escapeHTML(state.meta.formations[away.formation].name)}</span></div></div>
    <p class="result-decision">${decisionText}</p>
    <div class="result-actions"><button id="rematchBtn" class="primary-btn" type="button">再来一局</button><button id="backLobbyBtn" class="secondary-btn" type="button">返回大厅</button></div>
  </div>
  <div class="result-grid">
    <section class="result-panel"><h2>全场数据</h2>
      <div class="motm"><div class="motm-avatar"><img src="${avatarData(motmPlayer)}" alt="${escapeHTML(motmPlayer.name)}"></div><div class="motm-copy"><small>PLAYER OF THE MATCH</small><strong>${escapeHTML(motmPlayer.name)}</strong><span>${escapeHTML(state.room.players[match.manOfMatch.side].name)} · ${escapeHTML(motmPlayer.position)}</span><div class="rating-value">${match.manOfMatch.rating}</div></div></div>
      <div class="result-stats">${statsRows.map(([label, a, b, unit]) => compareMarkup(label, a, b, unit, 'result-stat-row')).join('')}</div>
    </section>
    <section class="result-panel"><h2>关键事件</h2><div class="timeline">${importantEvents.map(event => `<div class="timeline-row ${event.type}"><time>${escapeHTML(event.clock)}</time><span class="timeline-dot"></span><p>${escapeHTML(event.text)}</p></div>`).join('')}</div></section>
  </div>
  <section class="result-panel rating-panel"><div class="rating-heading"><h2>双方球员评分</h2><span>阵型、能力与赛场表现综合评分</span></div><div class="ratings-grid">${ratingTeamMarkup(home, match.playerRatings[0], 0)}${ratingTeamMarkup(away, match.playerRatings[1], 1)}</div></section>`;

  document.getElementById('rematchBtn').addEventListener('click', async event => {
    const data = await roomAction('rematch', {}, { button: event.currentTarget });
    if (data && state.room.status === 'finished') showToast('已申请再来一局，等待对方确认');
  });
  document.getElementById('backLobbyBtn').addEventListener('click', () => {
    clearSession();
    showLobby();
  });
}

function ratingTeamMarkup(player, ratings, side) {
  const formation = state.meta.formations[player.formation];
  const sorted = ratings.map((rating, index) => ({ ...rating, slot: formation.slots[index] })).sort((a, b) => b.rating - a.rating);
  return `<div class="rating-team ${side ? 'away' : ''}"><h3>${escapeHTML(player.name)} <span>${escapeHTML(state.meta.tactics[player.tactic].name)}</span></h3>${sorted.map(item => {
    const card = playerById(item.cardId);
    return `<div class="rating-row"><img src="${avatarData(card)}" alt=""><div><strong>${escapeHTML(card.name)}</strong><span>${item.slot.label}${item.goals ? ` · ${item.goals}球` : ''}${item.assists ? ` · ${item.assists}助` : ''}</span></div><b class="${item.rating >= 8 ? 'is-high' : ''}">${item.rating}</b></div>`;
  }).join('')}</div>`;
}

function bindEvents() {
  dom.createRoomBtn.addEventListener('click', createRoom);
  dom.searchRoomBtn.addEventListener('click', searchRoom);
  dom.roomCode.addEventListener('input', () => { dom.roomCode.value = dom.roomCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  dom.roomCode.addEventListener('keydown', event => { if (event.key === 'Enter') searchRoom(); });
  dom.coachName.addEventListener('keydown', event => { if (event.key === 'Enter') createRoom(); });
  dom.copyCodeBtn.addEventListener('click', () => copyText(state.room?.code || ''));
  dom.waitingCopyBtn.addEventListener('click', () => copyText(state.room?.code || ''));
  dom.addBotBtn.addEventListener('click', addBot);

  document.querySelectorAll('[data-pack-era]').forEach(button => button.addEventListener('click', () => {
    state.packEra = button.dataset.packEra;
    document.querySelectorAll('[data-pack-era]').forEach(item => item.classList.toggle('is-active', item === button));
    state.lastPrepKey = '';
    renderPreparation();
  }));

  document.querySelectorAll('[data-position]').forEach(button => button.addEventListener('click', () => {
    state.positionFilter = button.dataset.position;
    document.querySelectorAll('[data-position]').forEach(item => item.classList.toggle('is-active', item === button));
    state.lastPrepKey = '';
    renderPreparation();
  }));

  document.querySelectorAll('[data-mobile-panel]').forEach(button => button.addEventListener('click', () => setMobilePanel(button.dataset.mobilePanel)));

  dom.packGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-buy-pack]');
    if (button) buyPack(button.dataset.buyPack, button);
  });

  dom.inventoryList.addEventListener('click', event => {
    const card = event.target.closest('[data-card-id]');
    if (card) selectInventoryCard(card.dataset.cardId);
  });

  dom.inventoryList.addEventListener('dragstart', event => {
    const card = event.target.closest('[data-card-id]');
    if (!card || currentPlayer()?.ready) return;
    event.dataTransfer.setData('application/json', JSON.stringify({ type: 'card', cardId: card.dataset.cardId }));
    event.dataTransfer.effectAllowed = 'copy';
  });

  dom.pitchSlots.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-slot]');
    if (remove) {
      event.stopPropagation();
      if (!currentPlayer()?.ready) roomAction('removeLineup', { slotIndex: Number(remove.dataset.removeSlot) });
      return;
    }
    const slot = event.target.closest('[data-slot]');
    if (slot) placeSelectedAt(Number(slot.dataset.slot));
  });

  dom.pitchSlots.addEventListener('dragstart', event => {
    const player = event.target.closest('[data-drag-slot]');
    if (!player || currentPlayer()?.ready) return;
    event.dataTransfer.setData('application/json', JSON.stringify({ type: 'slot', from: Number(player.dataset.dragSlot) }));
    event.dataTransfer.effectAllowed = 'move';
  });

  dom.pitchSlots.addEventListener('dragover', event => {
    const slot = event.target.closest('[data-slot]');
    if (!slot || currentPlayer()?.ready) return;
    event.preventDefault();
    slot.classList.add('is-target');
  });
  dom.pitchSlots.addEventListener('dragleave', event => event.target.closest('[data-slot]')?.classList.remove('is-target'));
  dom.pitchSlots.addEventListener('drop', async event => {
    const slot = event.target.closest('[data-slot]');
    if (!slot || currentPlayer()?.ready) return;
    event.preventDefault();
    slot.classList.remove('is-target');
    try {
      const data = JSON.parse(event.dataTransfer.getData('application/json'));
      const slotIndex = Number(slot.dataset.slot);
      if (data.type === 'card') await roomAction('setLineup', { slotIndex, cardId: data.cardId });
      if (data.type === 'slot' && data.from !== slotIndex) await roomAction('swapLineup', { from: data.from, to: slotIndex });
    } catch {
      showToast('无法识别这张球员卡', 'error');
    }
  });

  dom.formationSelect.addEventListener('change', () => roomAction('setFormation', { formation: dom.formationSelect.value }));
  dom.tacticSelect.addEventListener('change', () => roomAction('setTactic', { tactic: dom.tacticSelect.value }));
  document.getElementById('autoLineupBtn').addEventListener('click', event => roomAction('autoLineup', {}, { button: event.currentTarget }));
  dom.readyBtn.addEventListener('click', event => roomAction('setReady', { ready: !currentPlayer()?.ready }, { button: event.currentTarget }));
  dom.skipMatchBtn.addEventListener('click', event => roomAction('skipMatch', {}, { button: event.currentTarget }));
  dom.packDialog.addEventListener('cancel', event => {
    if (state.packReveal && state.packReveal.flipped.size < state.packReveal.cards.length) event.preventDefault();
  });
}

async function init() {
  bindEvents();
  dom.coachName.value = localStorage.getItem(NAME_KEY) || '';
  try {
    state.meta = await api('/api/meta');
    setupMetaControls();
    const restored = await restoreSession();
    if (!restored) showLobby();
  } catch (error) {
    dom.loadingScreen.innerHTML = `<div class="brand-mark brand-mark-large"><span>!</span></div><p>无法连接游戏服务：${escapeHTML(error.message)}</p><small>请通过 <b>npm start</b> 启动后访问本页面。</small>`;
  }
}

init();
