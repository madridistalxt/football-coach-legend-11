const state = {
  meta: null,
  room: null,
  playerId: null,
  sessionToken: null,
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
  renderedMatchSignature: '',
  lastVisualEventId: null,
  goalCinematicTimer: null,
  roomSyncedAt: Date.now(),
  interventionDraft: null,
};

const dom = Object.fromEntries([
  'loadingScreen', 'lobbyScreen', 'gameScreen', 'coachName', 'roomCode', 'createRoomBtn',
  'searchRoomBtn', 'roomPreview', 'roomCodeLabel', 'copyCodeBtn', 'countdownLabel', 'coinsLabel',
  'opponentStatus', 'waitingBanner', 'waitingCode', 'waitingCopyBtn', 'addBotBtn', 'prepView',
  'packGrid', 'formationSelect', 'tacticSelect', 'tacticDescription', 'lineupOverall',
  'positionFitScore', 'chemistryScore', 'pitchSlots',
  'selectionHint', 'lineupCount', 'readyHint', 'readyBtn', 'inventoryCount', 'inventoryEmpty',
  'inventoryList', 'matchView', 'resultView', 'matchStage', 'homeName', 'awayName', 'homeFormation',
  'awayFormation', 'matchClock', 'homeScore', 'awayScore', 'penaltyScore', 'skipMatchBtn',
  'matchProgressBar', 'tacticalMatchupBanner', 'homeBoard', 'awayBoard', 'featuredEvent', 'eventFeed', 'liveStats',
  'livePitchScene', 'livePitchActors', 'livePitchMinute', 'livePitchCaption', 'liveBall',
  'livePitchPulse', 'goalCinematic', 'goalCinematicTitle', 'goalCinematicText', 'goalCinematicScore',
  'packDialog', 'packExperience', 'interventionDialog', 'interventionBody', 'toastRegion',
].map(id => [id, document.getElementById(id)]));

const STORAGE_KEY = 'legend11-session-v2';
const NAME_KEY = 'legend11-coach-name';
const POS_LABEL = { GK: '门将', DEF: '后卫', MID: '中场', FWD: '锋线' };
const STAT_LABEL = { pac: '速度', sho: '射门', pas: '传球', dri: '盘带', def: '防守', phy: '身体', gk: '守门' };
const DETAIL_POSITION_LABEL = {
  GK: '门将', SW: '清道夫', CB: '中后卫', LB: '左后卫', RB: '右后卫',
  LWB: '左翼卫', RWB: '右翼卫', WB: '翼卫', DEF: '后卫', DM: '后腰', CDM: '后腰',
  CM: '中前卫', AM: '前腰', CAM: '前腰', LM: '左中场', RM: '右中场', MID: '中场',
  LW: '左边锋', RW: '右边锋', LF: '左前锋', RF: '右前锋', CF: '影锋', SS: '影子前锋',
  ST: '中锋', FWD: '前锋',
  FB: '边后卫', 'FB/WB': '边后卫/翼卫', WM: '边前卫', W: '边锋', 'WM/W': '边前卫/边锋',
};
const TIER_LABEL = { core: '主力', elite: '精英', star: '巨星', legend: '传奇', academy: '青训' };
const EVENT_ICON = {
  goal: '⚽', save: '◇', shot: '↗', card: '!', foul: '×', play: '·', phase: '◆',
  tactical: '◇', intervention: '↺', 'penalty-goal': '✓', 'penalty-miss': '×',
};
const EVENT_LABEL = {
  goal: '进球', save: '神扑', shot: '射门', card: '黄牌', foul: '犯规', play: '推进', phase: '赛程节点',
  tactical: '战术克制', intervention: '教练调整', 'penalty-goal': '点球命中', 'penalty-miss': '点球罚失',
};
const KEY_EVENT_TYPES = new Set(['goal', 'save', 'card', 'phase', 'tactical', 'intervention', 'penalty-goal', 'penalty-miss']);

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

function positionTokens(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\/|,，、·]+/)
      : value ? [value] : [];
  return source.map(item => {
    if (typeof item === 'string') return item.trim();
    if (!item || typeof item !== 'object') return '';
    return String(item.label || item.name || item.code || item.position || '').trim();
  }).filter(Boolean);
}

function translatePosition(value) {
  const token = String(value || '').trim();
  const code = token.toUpperCase().replace(/[\s_-]+/g, '');
  return DETAIL_POSITION_LABEL[code] || token;
}

function preferredPositionText(player) {
  const explicit = positionTokens(player?.preferredPositionLabel);
  const preferred = explicit.length ? explicit : positionTokens(player?.preferredPositions);
  const labels = [...new Set(preferred.map(translatePosition).filter(Boolean))];
  return labels.length ? labels.join(' / ') : (POS_LABEL[player?.position] || '多位置');
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

function saveSession(code, playerId, sessionToken) {
  state.playerId = playerId;
  state.sessionToken = sessionToken;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ code, playerId, sessionToken }));
}

function adoptRoom(room) {
  state.room = room;
  state.roomSyncedAt = Date.now();
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
  state.playerId = null;
  state.sessionToken = null;
  state.room = null;
  state.lastPrepKey = '';
  state.renderedMatchId = null;
  state.renderedMatchSignature = '';
  state.interventionDraft = null;
  if (dom.interventionDialog?.open) dom.interventionDialog.close();
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
  closeInterventionDialog();
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
    saveSession(data.room.code, data.playerId, data.sessionToken);
    adoptRoom(data.room);
    showGame();
    renderRoom();
    startPolling();
    showToast('基础11人已就位，开卡补强后即可迎战', 'success');
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
    saveSession(data.room.code, data.playerId, data.sessionToken);
    adoptRoom(data.room);
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
    if (!saved?.code || !saved?.playerId || !saved?.sessionToken) return false;
    const data = await api(`/api/rooms/${saved.code}/state?playerId=${encodeURIComponent(saved.playerId)}&sessionToken=${encodeURIComponent(saved.sessionToken)}`);
    state.playerId = saved.playerId;
    state.sessionToken = saved.sessionToken;
    adoptRoom(data.room);
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
  if (!state.room || !state.playerId || !state.sessionToken || state.pollBusy) return;
  state.pollBusy = true;
  try {
    const data = await api(`/api/rooms/${state.room.code}/state?playerId=${encodeURIComponent(state.playerId)}&sessionToken=${encodeURIComponent(state.sessionToken)}`);
    adoptRoom(data.room);
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
      body: JSON.stringify({ playerId: state.playerId, sessionToken: state.sessionToken, type, payload }),
    });
    adoptRoom(data.room);
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
      method: 'POST', body: JSON.stringify({ playerId: state.playerId, sessionToken: state.sessionToken }),
    });
    adoptRoom(data.room);
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
    closeInterventionDialog();
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
    closeInterventionDialog();
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
    positionFit: me.positionFit,
    chemistry: me.chemistry,
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
  dom.positionFitScore.textContent = me.positionFit?.score ?? '--';
  dom.chemistryScore.textContent = me.chemistry?.score ?? '--';
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
    const fit = me.positionFit?.slots?.find(entry => entry.slotIndex === index);
    const fitClass = fit?.grade ? `fit-${fit.grade}` : '';
    const fitText = fit?.grade === 'natural' ? '原位' : fit?.grade === 'adapted' ? '客串' : fit?.grade === 'out-of-position' ? '失位' : '';
    const selected = state.selectedSlot === index;
    return `<button class="pitch-slot ${item ? 'has-player' : ''} ${selected ? 'is-target' : ''} ${fitClass}" type="button"
      data-slot="${index}" data-role="${slot.label}" style="left:${slot.x}%;top:${slot.y}%" ${me.ready ? 'aria-disabled="true"' : ''}>
      ${player ? `<span class="pitch-player ${player.era}" draggable="${!me.ready}" data-drag-slot="${index}">
        <span class="pitch-player-avatar"><img src="${avatarData(player)}" alt="${escapeHTML(player.name)}"></span>
        <span class="pitch-player-name">${escapeHTML(player.name)}</span>
        <span class="pitch-player-meta" title="擅长位置：${escapeHTML(preferredPositionText(player))}">${escapeHTML(preferredPositionText(player))} · ${playerOverall(player)}</span>
        ${fitText ? `<span class="position-fit-badge">${fitText} ${Math.round((fit.fit || 0) * 100)}%</span>` : ''}
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
  return keys.map(key => `<span><em>${STAT_LABEL[key]}</em><b>${stats[key] ?? '--'}</b></span>`).join('');
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
      <div class="card-info"><h3>${escapeHTML(player.name)}</h3><p>${escapeHTML(player.club)} · ${escapeHTML(player.league)}</p><span class="preferred-position-label"><i>擅长</i>${escapeHTML(preferredPositionText(player))}</span><div class="mini-stats">${statEntries(player)}</div></div>
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
          <span class="reveal-card-rating">${playerOverall(player)}</span><span class="reveal-card-position">${escapeHTML(preferredPositionText(player))}</span><span class="reveal-card-league">${escapeHTML(player.league)}</span>
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
    state.renderedMatchSignature = '';
    state.interventionDraft = null;
    state.lastVisualEventId = null;
    clearTimeout(state.goalCinematicTimer);
  }
  const signature = JSON.stringify({
    segment: match.playback?.segment,
    lineups: state.room.players.map(player => player.lineup),
    mentalities: state.room.players.map(player => player.mentality),
    teams: match.teams?.map(team => [team.attack, team.midfield, team.defense, team.positionFit?.score, team.chemistry?.score]),
  });
  if (signature !== state.renderedMatchSignature) {
    state.renderedMatchSignature = signature;
    renderMatchBase();
  }
  renderInterventionWindow();
  cancelAnimationFrame(state.matchFrame);
  updateMatchFrame();
}

function renderMatchBase() {
  const [home, away] = state.room.players;
  const match = state.room.match;
  dom.homeName.textContent = home.name;
  dom.awayName.textContent = away.name;
  dom.homeFormation.textContent = `${state.meta.formations[home.formation].name} · ${state.meta.tactics[home.tactic].name} · ${mentalityLabel(home.mentality)}`;
  dom.awayFormation.textContent = `${state.meta.formations[away.formation].name} · ${state.meta.tactics[away.tactic].name} · ${mentalityLabel(away.mentality)}`;
  dom.homeBoard.innerHTML = miniBoardMarkup(home, 0, match.teams[0]);
  dom.awayBoard.innerHTML = miniBoardMarkup(away, 1, match.teams[1]);
  if (match.tacticalMatchup) {
    const winner = state.room.players[match.tacticalMatchup.winnerSide];
    dom.tacticalMatchupBanner.className = 'tactical-matchup-banner has-advantage';
    dom.tacticalMatchupBanner.innerHTML = `<strong>${escapeHTML(match.tacticalMatchup.title)}</strong><span>${escapeHTML(winner.name)}获得战术优势 · ${escapeHTML(match.tacticalMatchup.explanation)}</span>`;
  } else {
    dom.tacticalMatchupBanner.className = 'tactical-matchup-banner is-neutral';
    dom.tacticalMatchupBanner.innerHTML = '<strong>战术均势</strong><span>双方战术没有形成直接克制，阵容质量与临场调整将决定走势。</span>';
  }
  if (dom.livePitchActors) dom.livePitchActors.innerHTML = `${livePitchActorsMarkup(home, 0)}${livePitchActorsMarkup(away, 1)}`;
  if (dom.livePitchMinute) dom.livePitchMinute.textContent = '0′';
  if (dom.livePitchCaption) dom.livePitchCaption.textContent = '双方正在中圈列队';
  if (dom.goalCinematic) {
    dom.goalCinematic.classList.remove('is-active');
    dom.goalCinematic.setAttribute('aria-hidden', 'true');
  }
}

function miniBoardMarkup(player, side, team) {
  const formation = state.meta.formations[player.formation];
  const matchup = team?.tacticalMatchup?.status === 'advantage' ? '战术占优' : team?.tacticalMatchup?.status === 'disadvantage' ? '受到克制' : '战术均势';
  return `<div class="mini-board-header"><strong>${escapeHTML(player.name)}</strong><span>${escapeHTML(state.meta.formations[player.formation].name)}</span></div>
    <div class="mini-pitch">${player.lineup.map((item, index) => {
      const card = playerById(item.cardId);
      const slot = formation.slots[index];
      return `<div class="mini-player" style="left:${slot.x}%;top:${slot.y}%"><img src="${avatarData(card)}" alt=""><span>${escapeHTML(card.name)}</span></div>`;
    }).join('')}</div>
    <div class="mini-team-summary"><div><span>进攻</span><strong>${Math.round(team.attack)}</strong></div><div><span>中场</span><strong>${Math.round(team.midfield)}</strong></div><div><span>防守</span><strong>${Math.round(team.defense)}</strong></div><div><span>位置适配</span><strong>${team.positionFit?.score ?? '--'}</strong></div><div><span>球队默契</span><strong>${team.chemistry?.score ?? '--'}</strong></div><div class="matchup-${team?.tacticalMatchup?.status || 'neutral'}"><span>对局关系</span><strong>${matchup}</strong></div></div>`;
}

function mentalityLabel(value) {
  return ({ attacking: '全力进攻', balanced: '攻守平衡', defensive: '稳守反击' })[value] || '攻守平衡';
}

function closeInterventionDialog() {
  if (dom.interventionDialog?.open) dom.interventionDialog.close();
  state.interventionDraft = null;
}

function interventionRemainingSeconds(window) {
  const serverRemaining = Number(window?.remainingMs);
  const remainingMs = Number.isFinite(serverRemaining)
    ? serverRemaining - Math.max(0, Date.now() - state.roomSyncedAt)
    : Number(window?.deadlineAt || 0) - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function renderInterventionWindow() {
  const match = state.room?.match;
  const window = match?.interventionWindow;
  const viewer = match?.viewerIntervention;
  if (!window || !viewer) {
    closeInterventionDialog();
    return;
  }

  if (state.interventionDraft?.windowId !== window.id) {
    state.interventionDraft = {
      windowId: window.id,
      mentality: viewer.currentMentality || 'balanced',
      outSlot: '',
      inCardId: '',
    };
  }
  const draft = state.interventionDraft;
  const me = currentPlayer();
  const formation = state.meta.formations[me.formation];
  const seconds = interventionRemainingSeconds(window);
  const canSubstitute = viewer.substitutionsRemaining > 0 && viewer.bench.some(card => card.eligible);
  const lineupOptions = me.lineup.map((item, index) => {
    const card = item ? playerById(item.cardId) : null;
    if (!card) return '';
    return `<option value="${index}" ${String(draft.outSlot) === String(index) ? 'selected' : ''}>${escapeHTML(formation.slots[index].label)} · ${escapeHTML(card.name)} · ${playerOverall(card)}</option>`;
  }).join('');
  const benchOptions = viewer.bench.filter(card => card.eligible).map(card => {
    const details = preferredPositionText(card);
    return `<option value="${escapeHTML(card.cardId)}" ${draft.inCardId === card.cardId ? 'selected' : ''}>${escapeHTML(card.name)} · ${escapeHTML(details)} · ${card.overall}</option>`;
  }).join('');
  const submitted = viewer.submitted;

  dom.interventionBody.innerHTML = `<div class="intervention-heading">
      <div><p>LIVE COACHING · ${window.minute}′</p><h2>${window.minute === 45 ? '半场战术调整' : '决胜阶段调整'}</h2></div>
      <div class="intervention-countdown"><span>剩余</span><strong id="interventionCountdown">${seconds}s</strong></div>
    </div>
    <p class="intervention-lead">调整将真实影响后续比赛。选择攻守倾向，并可使用一次换人机会。</p>
    <section class="mentality-choice"><h3>攻守倾向</h3><div class="mentality-grid">
      ${viewer.allowedMentalities.map(item => `<button type="button" data-mentality="${item.id}" class="${draft.mentality === item.id ? 'is-selected' : ''}" ${submitted ? 'disabled' : ''}><strong>${escapeHTML(item.name)}</strong><span>${item.id === 'attacking' ? '加强进攻，防线风险上升' : item.id === 'defensive' ? '稳固防守，减少进攻投入' : '保持三线稳定与体能'}</span></button>`).join('')}
    </div></section>
    <section class="substitution-choice ${canSubstitute ? '' : 'is-disabled'}"><div class="substitution-title"><h3>临场换人</h3><span>已用 ${viewer.substitutionsUsed} / ${viewer.maxSubstitutions}</span></div>
      ${canSubstitute ? `<div class="substitution-selects"><label>换下<select id="interventionOutSlot" ${submitted ? 'disabled' : ''}><option value="">暂不换人</option>${lineupOptions}</select></label><span>→</span><label>换上<select id="interventionInCard" ${submitted ? 'disabled' : ''}><option value="">选择替补</option>${benchOptions}</select></label></div>` : '<p>当前没有可用替补，仍可调整攻守倾向。</p>'}
    </section>
    <div class="intervention-actions">
      <span>${submitted ? '调整已提交，正在等待对手…' : `双方提交后立即继续；超时将沿用当前设置。`}</span>
      <button id="submitInterventionBtn" class="primary-btn" type="button" ${submitted || !viewer.canSubmit ? 'disabled' : ''}>${submitted ? '已提交' : '确认调整'}</button>
    </div>`;
  if (!dom.interventionDialog.open) dom.interventionDialog.showModal();
}

async function submitIntervention() {
  const draft = state.interventionDraft;
  if (!draft) return;
  const hasOutgoing = draft.outSlot !== '';
  const hasIncoming = draft.inCardId !== '';
  if (hasOutgoing !== hasIncoming) {
    showToast('换人需要同时选择换下和换上的球员', 'error');
    return;
  }
  const button = document.getElementById('submitInterventionBtn');
  const data = await roomAction('matchIntervention', {
    mentality: draft.mentality,
    outSlot: hasOutgoing ? Number(draft.outSlot) : null,
    inCardId: hasIncoming ? draft.inCardId : null,
  }, { button });
  if (data) showToast('临场调整已提交', 'success');
}

function livePitchActorsMarkup(player, side) {
  const formation = state.meta.formations[player.formation];
  return player.lineup.map((item, index) => {
    if (!item) return '';
    const card = playerById(item.cardId);
    const slot = formation.slots[index];
    if (!card || !slot) return '';
    const advance = 10 + (100 - slot.y) * .4;
    const lane = 10 + slot.x * .8;
    const x = side === 0 ? advance : 100 - advance;
    const y = side === 0 ? lane : 100 - lane;
    return `<span class="live-actor ${side === 0 ? 'home' : 'away'} role-${card.position.toLowerCase()}" data-live-player="${escapeHTML(card.id)}" style="left:${x}%;top:${y}%" title="${escapeHTML(card.name)} · ${escapeHTML(preferredPositionText(card))}"><i>${index + 1}</i></span>`;
  }).join('');
}

function eventPitchMotion(event) {
  const hasSide = Number.isInteger(event.side);
  const seed = stringHash(`${event.id || ''}-${event.type || ''}-${event.clock || ''}`);
  const lane = 24 + seed % 53;
  const attackingSide = event.type === 'save' && hasSide ? 1 - event.side : event.side;
  const attacksRight = attackingSide === 0;
  const direction = attacksRight ? 1 : -1;
  let fromX = hasSide ? (attacksRight ? 48 : 52) : 50;
  let toX = fromX;
  let fromY = Math.max(15, Math.min(85, lane + ((seed >> 3) % 17) - 8));
  let toY = lane;

  if (['goal', 'save', 'shot', 'penalty-goal', 'penalty-miss'].includes(event.type)) {
    fromX = attacksRight ? (event.type.startsWith('penalty') ? 76 : 58) : (event.type.startsWith('penalty') ? 24 : 42);
    toX = attacksRight ? 94 : 6;
    toY = 38 + seed % 25;
  } else if (['card', 'foul'].includes(event.type)) {
    fromX = hasSide ? (event.side === 0 ? 38 : 62) : 50;
    toX = fromX + direction * 4;
  } else if (event.type === 'play') {
    fromX = attacksRight ? 32 : 68;
    toX = attacksRight ? 59 : 41;
  } else if (event.type === 'phase') {
    fromX = 47;
    toX = 53;
    fromY = 50;
    toY = 50;
  }
  return { fromX, fromY, toX, toY };
}

function animateLivePitch(event) {
  if (!event || !dom.livePitchScene) return;
  const motion = eventPitchMotion(event);
  const typeClass = `event-${String(event.type || 'play').replace(/[^a-z-]/gi, '')}`;
  dom.livePitchScene.className = `live-pitch-scene ${typeClass} ${KEY_EVENT_TYPES.has(event.type) ? 'is-key-event' : ''}`;
  dom.livePitchMinute.textContent = event.clock || '—';
  dom.livePitchCaption.textContent = event.text || EVENT_LABEL[event.type] || '比赛继续';

  dom.livePitchActors?.querySelectorAll('.is-involved').forEach(actor => actor.classList.remove('is-involved'));
  if (event.playerId) {
    [...(dom.livePitchActors?.querySelectorAll('[data-live-player]') || [])]
      .find(actor => actor.dataset.livePlayer === String(event.playerId))?.classList.add('is-involved');
  }

  if (dom.liveBall) {
    dom.liveBall.style.setProperty('--from-x', `${motion.fromX}%`);
    dom.liveBall.style.setProperty('--from-y', `${motion.fromY}%`);
    dom.liveBall.style.setProperty('--to-x', `${motion.toX}%`);
    dom.liveBall.style.setProperty('--to-y', `${motion.toY}%`);
    dom.liveBall.classList.remove('is-moving');
    void dom.liveBall.offsetWidth;
    dom.liveBall.classList.add('is-moving');
  }
  if (dom.livePitchPulse) {
    dom.livePitchPulse.style.left = `${motion.toX}%`;
    dom.livePitchPulse.style.top = `${motion.toY}%`;
    dom.livePitchPulse.className = `live-pitch-pulse pulse-${String(event.type || 'play').replace(/[^a-z-]/gi, '')}`;
    void dom.livePitchPulse.offsetWidth;
    dom.livePitchPulse.classList.add('is-active');
  }
  if (event.type === 'goal' || event.type === 'penalty-goal') showGoalCinematic(event);
}

function showGoalCinematic(event) {
  if (!dom.goalCinematic) return;
  const team = Number.isInteger(event.side) ? state.room.players[event.side] : null;
  const isPenalty = event.type === 'penalty-goal';
  dom.goalCinematicTitle.textContent = team ? `${team.name}${isPenalty ? ' 点球命中' : ' 破门'}` : (isPenalty ? '点球命中' : '进球');
  dom.goalCinematicScore.textContent = isPenalty && event.penalty
    ? `点球 ${event.penalty[0]} : ${event.penalty[1]}`
    : `${event.score?.[0] ?? 0} : ${event.score?.[1] ?? 0}`;
  dom.goalCinematicText.textContent = event.text || '';
  dom.goalCinematic.setAttribute('aria-hidden', 'false');
  dom.goalCinematic.classList.remove('is-active');
  void dom.goalCinematic.offsetWidth;
  dom.goalCinematic.classList.add('is-active');
  clearTimeout(state.goalCinematicTimer);
  state.goalCinematicTimer = setTimeout(() => {
    dom.goalCinematic?.classList.remove('is-active');
    dom.goalCinematic?.setAttribute('aria-hidden', 'true');
  }, 2200);
}

function matchElapsedMs(match) {
  if (!match.playback) return Math.max(0, Date.now() - match.startedAt);
  const liveAdvance = match.playback.state === 'playing' ? Math.max(0, Date.now() - state.roomSyncedAt) : 0;
  return Math.max(0, Math.min(match.playback.totalMs || match.durationMs, match.playback.elapsedMs + liveAdvance));
}

function updateMatchFrame() {
  if (state.currentView !== 'playing' || !state.room?.match) return;
  const match = state.room.match;
  const elapsed = matchElapsedMs(match);
  const totalMs = match.playback?.totalMs || match.durationMs;
  const progress = Math.min(1, elapsed / Math.max(1, totalMs));
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
  const countdown = document.getElementById('interventionCountdown');
  if (countdown && match.interventionWindow) countdown.textContent = `${interventionRemainingSeconds(match.interventionWindow)}s`;

  if (revealed.length !== state.renderedEventCount) {
    state.renderedEventCount = revealed.length;
    renderRevealedEvents(revealed);
  }
  if (state.room.status === 'playing') state.matchFrame = requestAnimationFrame(updateMatchFrame);
}

function matchStageLabel(last, progress, match) {
  if (match.interventionWindow) return `${match.interventionWindow.minute}′ 教练调整`;
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
    dom.featuredEvent.className = `featured-event is-${String(latestImportant.type).replace(/[^a-z-]/gi, '')}`;
    dom.featuredEvent.innerHTML = `<span>${escapeHTML(latestImportant.clock)}</span><div><small>${escapeHTML(EVENT_LABEL[latestImportant.type] || '关键事件')}</small><p>${escapeHTML(latestImportant.text)}</p></div>`;
  }
  dom.eventFeed.innerHTML = [...events].reverse().map(event => `<div class="event-row ${event.type} ${event.important ? 'is-important' : ''} ${KEY_EVENT_TYPES.has(event.type) ? 'key-event' : ''}">
    <time>${escapeHTML(event.clock)}</time><span class="event-icon">${EVENT_ICON[event.type] || '·'}</span><p>${escapeHTML(event.text)}</p>${KEY_EVENT_TYPES.has(event.type) ? `<span class="event-kind">${escapeHTML(EVENT_LABEL[event.type] || '关键')}</span>` : ''}
  </div>`).join('');
  const newest = events.at(-1);
  if (newest && newest.id !== state.lastVisualEventId) {
    state.lastVisualEventId = newest.id;
    animateLivePitch(newest);
  }
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
  const aNumber = Math.max(0, resultNumber(a, 0));
  const bNumber = Math.max(0, resultNumber(b, 0));
  const total = aNumber + bNumber;
  const aWidth = total > 0 ? aNumber / total * 100 : 0;
  const bWidth = total > 0 ? bNumber / total * 100 : 0;
  return `<div class="${className}"><b>${a}${unit}</b><span class="compare-track"><i style="width:${aWidth}%"></i></span><span>${label}</span><span class="compare-track away"><i style="width:${bWidth}%"></i></span><b>${b}${unit}</b></div>`;
}

function resultNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resultSideValue(source, side) {
  if (Array.isArray(source)) return source[side];
  if (!source || typeof source !== 'object') return undefined;
  const keys = side === 0 ? ['0', 'home', 'host', 'left'] : ['1', 'away', 'guest', 'right'];
  for (const key of keys) if (source[key] !== undefined) return source[key];
  return undefined;
}

function resultSideStats(match, side) {
  const direct = resultSideValue(match?.stats, side);
  if (direct && typeof direct === 'object') return direct;
  const nested = resultSideValue(match?.stats?.teams, side);
  return nested && typeof nested === 'object' ? nested : {};
}

function normalizeShotCoordinate(value, axis, fallback) {
  let number = resultNumber(value, fallback);
  if (number >= 0 && number <= 1) number *= 100;
  if (number > 100) number = number / (axis === 'x' ? 120 : 100) * 100;
  return Math.max(5, Math.min(95, number));
}

function shotOutcome(value) {
  const text = String(value || '').toLowerCase();
  if (/goal|scored|进球|破门/.test(text)) return 'goal';
  if (/save|saved|扑救|扑出/.test(text)) return 'saved';
  if (/block|封堵/.test(text)) return 'blocked';
  return 'miss';
}

function isShootoutShot(item) {
  const phase = String(item?.phase ?? item?.shotPhase ?? '').toLowerCase();
  const type = String(item?.type ?? item?.outcome ?? item?.result ?? '').toLowerCase();
  const clock = String(item?.clock ?? '');
  return item?.countsTowardStats === false
    || /shootout|penalty-shootout/.test(phase)
    || /penalty-(goal|miss)/.test(type)
    || /^点球/.test(clock);
}

function rawShotMapForSide(match, side) {
  const source = match?.shotMap ?? match?.analysis?.shotMap;
  if (!source) return [];
  if (Array.isArray(source)) {
    if (source.length === 2 && source.every(Array.isArray)) return source[side] || [];
    return source.filter(item => resultNumber(item?.side ?? item?.teamSide, null) === side);
  }
  if (typeof source === 'object') {
    const direct = resultSideValue(source, side);
    if (Array.isArray(direct)) return direct;
    if (Array.isArray(source.shots)) return source.shots.filter(item => resultNumber(item?.side ?? item?.teamSide, null) === side);
  }
  return [];
}

function normalizeExternalShot(item, index, side) {
  const location = Array.isArray(item?.location) ? item.location : [];
  let x = normalizeShotCoordinate(item?.x ?? item?.shotArea?.x ?? item?.position?.x ?? location[0], 'x', 62 + index % 5 * 6);
  let y = normalizeShotCoordinate(item?.y ?? item?.shotArea?.y ?? item?.position?.y ?? location[1], 'y', 18 + index * 17 % 66);
  const direction = String(item?.attackDirection || item?.attackingDirection || '').toLowerCase();
  if (direction === 'left') x = 100 - x;
  if (item?.flipVertical) y = 100 - y;
  const outcome = shotOutcome(item?.outcome ?? item?.result ?? item?.type);
  const xg = resultNumber(item?.expectedGoals ?? item?.xG ?? item?.xg, outcome === 'goal' ? .32 : outcome === 'saved' ? .23 : .1);
  return {
    id: String(item?.id ?? `external-${side}-${index}`), side, x, y, outcome, xg,
    playerId: item?.playerId ?? item?.shooterId ?? null,
    clock: item?.clock ?? item?.minute ?? '',
    text: item?.text ?? item?.description ?? '',
  };
}

function derivedShotsForSide(match, side) {
  const events = Array.isArray(match?.events) ? match.events : [];
  return events.filter(event => ['goal', 'save', 'shot'].includes(event?.type) && !isShootoutShot(event)).map((event, index) => {
    const explicitAttackingSide = resultNumber(event.attackingSide, null);
    const shootingSide = explicitAttackingSide !== null
      ? explicitAttackingSide
      : event.type === 'save' && Number.isInteger(event.side) ? 1 - event.side : event.side;
    if (shootingSide !== side) return null;
    const seed = stringHash(`${event.id || index}-${event.clock || ''}`);
    const outcome = event.type === 'goal' ? 'goal' : event.type === 'save' ? 'saved' : 'miss';
    return {
      id: String(event.id ?? `event-${side}-${index}`), side,
      x: outcome === 'goal' ? 88 + seed % 7 : outcome === 'saved' ? 82 + seed % 10 : 62 + seed % 29,
      y: 13 + seed % 74,
      outcome,
      xg: resultNumber(event.expectedGoals ?? event.xG ?? event.xg, outcome === 'goal' ? .34 : outcome === 'saved' ? .22 : .09),
      playerId: event.type === 'save' ? null : event.playerId,
      clock: event.clock || '', text: event.text || '',
    };
  }).filter(Boolean);
}

function resultShotsForSide(match, side) {
  const external = rawShotMapForSide(match, side)
    .filter(item => !isShootoutShot(item))
    .map((item, index) => normalizeExternalShot(item, index, side));
  const shots = external.length ? external : derivedShotsForSide(match, side);
  const expectedCount = Math.max(0, Math.round(resultNumber(resultSideStats(match, side).shots, shots.length)));
  const score = resultNumber(match?.score?.[side], 0);
  for (let index = shots.length; index < Math.min(expectedCount, 36); index += 1) {
    const seed = stringHash(`${match?.id || 'match'}-${side}-${index}`);
    const outcome = index < score ? 'goal' : 'miss';
    shots.push({
      id: `fallback-${side}-${index}`, side, x: outcome === 'goal' ? 89 : 60 + seed % 31, y: 12 + seed % 76,
      outcome, xg: outcome === 'goal' ? .3 : .08 + seed % 8 / 100, playerId: null, clock: '', text: '射门记录',
    });
  }
  return shots;
}

function explicitExpectedGoals(match, side) {
  const stats = resultSideStats(match, side);
  const analysis = match?.analysis && typeof match.analysis === 'object' ? match.analysis : {};
  const candidates = [
    stats.expectedGoals, stats.xG, stats.xg,
    resultSideValue(match?.stats?.expectedGoals, side), resultSideValue(match?.expectedGoals, side),
    resultSideValue(analysis.expectedGoals, side), resultSideValue(analysis.xG ?? analysis.xg, side),
  ];
  for (const value of candidates) {
    const number = resultNumber(value, null);
    if (number !== null) return number;
  }
  return null;
}

function resultExpectedGoals(match, shotsBySide) {
  let estimated = false;
  const values = [0, 1].map(side => {
    const explicit = explicitExpectedGoals(match, side);
    if (explicit !== null) return Math.max(0, explicit);
    estimated = true;
    return shotsBySide[side].reduce((total, shot) => total + resultNumber(shot.xg, .1), 0);
  }).map(value => Number(value.toFixed(2)));
  return { values, estimated };
}

function shotMapTeamMarkup(player, side, shots, xg) {
  const teamName = player?.name || (side ? '客队' : '主队');
  const points = shots.map(shot => {
    const player = shot.playerId ? playerById(shot.playerId) : null;
    const label = `${shot.clock ? `${shot.clock} ` : ''}${player?.name || shot.text || '射门'} · xG ${resultNumber(shot.xg, 0).toFixed(2)}`;
    return `<span class="shot-point is-${shot.outcome}" style="left:${shot.x}%;top:${shot.y}%" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}"></span>`;
  }).join('');
  return `<article class="shot-map-team ${side ? 'away' : 'home'}"><header><strong>${escapeHTML(teamName)}</strong><span>${shots.length}次射门 · xG ${xg.toFixed(2)}</span></header><div class="shot-map-canvas" role="img" aria-label="${escapeHTML(teamName)}的射门分布">${points || '<span class="shot-map-empty">暂无射门坐标</span>'}<i class="shot-map-goal" aria-hidden="true"></i></div></article>`;
}

function xgAndShotMapMarkup(players, shotsBySide, xgData) {
  const [homeXg, awayXg] = xgData.values;
  const total = homeXg + awayXg;
  const homeWidth = total > 0 ? homeXg / total * 100 : 0;
  const awayWidth = total > 0 ? awayXg / total * 100 : 0;
  return `<section class="result-panel shot-analysis-panel"><div class="result-module-heading"><div><p>CHANCE QUALITY</p><h2>预期进球与射门分布</h2></div><span>${xgData.estimated ? '根据比赛事件估算' : '比赛模型数据'}</span></div>
    <div class="xg-comparison"><div><span>${escapeHTML(players[0].name)}</span><strong>${homeXg.toFixed(2)}</strong></div><div class="xg-center"><b>预期进球</b><span>xG</span></div><div class="away"><span>${escapeHTML(players[1].name)}</span><strong>${awayXg.toFixed(2)}</strong></div></div>
    <div class="xg-balance" aria-hidden="true"><i style="width:${homeWidth}%"></i><i style="width:${awayWidth}%"></i></div>
    <div class="shot-map-grid">${shotMapTeamMarkup(players[0], 0, shotsBySide[0], homeXg)}${shotMapTeamMarkup(players[1], 1, shotsBySide[1], awayXg)}</div>
    <div class="shot-map-legend"><span class="goal">进球</span><span class="saved">被扑</span><span class="miss">偏出/封堵</span><small>两队均按从左向右进攻展示</small></div></section>`;
}

function resultFormation(player) {
  return state.meta?.formations?.[player?.formation] || { name: player?.formation || '阵型未记录', slots: [] };
}

function resultTactic(player) {
  return state.meta?.tactics?.[player?.tactic] || { name: player?.tactic || '战术未记录' };
}

function resultPair(value, fallback = [0, 0]) {
  return [0, 1].map(side => resultNumber(value?.[side], resultNumber(fallback?.[side], 0)));
}

function resultRecap(match) {
  return match?.recap && typeof match.recap === 'object'
    ? match.recap
    : match?.analysis && typeof match.analysis === 'object' ? match.analysis : {};
}

function resultTacticalData(match, players) {
  const recap = resultRecap(match);
  const analysis = match?.analysis && typeof match.analysis === 'object' ? match.analysis : {};
  const source = recap.tacticalSummary ?? analysis.tacticalSummary ?? analysis.tactical ?? analysis.tacticalMatchup ?? match?.tacticalMatchup ?? {};
  const hasStableSide = source && Object.prototype.hasOwnProperty.call(source, 'advantagedSide');
  const rawAdvantage = hasStableSide ? source.advantagedSide : source?.winnerSide;
  const advantageSide = [0, 1].includes(resultNumber(rawAdvantage, null)) ? resultNumber(rawAdvantage, null) : null;
  const winnerSide = players.findIndex(player => player?.id === match?.winnerId);
  return {
    source,
    advantageSide,
    winnerSide,
    phases: Array.isArray(source?.phases) ? source.phases : [],
    summary: source?.summary || source?.explanation || match?.tacticalMatchup?.explanation || '双方战术没有形成持续、明确的克制关系。',
  };
}

function tacticalReviewMarkup(match, players, tactical) {
  const recap = resultRecap(match);
  const hasAdvantage = tactical.advantageSide !== null;
  const unconverted = hasAdvantage && tactical.winnerSide >= 0 && tactical.advantageSide !== tactical.winnerSide;
  const decidedByPenalties = match?.decision === 'penalties';
  const statusTitle = !hasAdvantage
    ? '战术走势均衡或交替'
    : unconverted
      ? '战术占优未转化为胜势'
      : decidedByPenalties ? '战术优势延续至点球决胜' : '形成持续战术优势';
  const statusText = hasAdvantage
    ? `${players[tactical.advantageSide]?.name || '一方'}${decidedByPenalties ? '在120分钟内占据战术优势；最终胜负由点球大战决定。' : `：${tactical.summary}`}`
    : tactical.summary;
  const phaseMarkup = tactical.phases.slice(0, 5).map(phase => {
    const phaseSide = [0, 1].includes(resultNumber(phase?.advantagedSide, null)) ? resultNumber(phase.advantagedSide, null) : null;
    const range = Number.isFinite(Number(phase?.fromMinute)) && Number.isFinite(Number(phase?.toMinute))
      ? `${phase.fromMinute}-${phase.toMinute}′`
      : phase?.segment || '阶段';
    return `<span class="tactical-phase ${phaseSide === null ? 'is-neutral' : phaseSide ? 'is-away' : 'is-home'}"><b>${escapeHTML(range)}</b>${escapeHTML(phase?.title || '战术均势')}</span>`;
  }).join('');
  const teamMarkup = players.map((player, side) => {
    const teamRecap = resultSideValue(recap?.teams, side) || {};
    const finalMentality = teamRecap?.mentality?.finalLabel || mentalityLabel(player?.mentality);
    const status = tactical.advantageSide === side ? '战术占优' : tactical.advantageSide === null ? '走势均衡' : '受到克制';
    return `<article class="tactical-review-team ${tactical.advantageSide === side ? 'is-advantaged' : ''}"><span>${side ? 'AWAY' : 'HOME'}</span><strong>${escapeHTML(player?.name || '球队')}</strong><p>${escapeHTML(resultFormation(player).name)} · ${escapeHTML(resultTactic(player).name)}</p><small>${escapeHTML(finalMentality)} · ${status}</small></article>`;
  }).join('');
  return `<section class="result-panel tactical-review-panel"><div class="result-module-heading"><div><p>TACTICAL REVIEW</p><h2>战术克制摘要</h2></div><span>${tactical.phases.length ? `${tactical.phases.length}个比赛阶段` : '最终战术关系'}</span></div>
    <div class="tactical-review-teams">${teamMarkup}</div>
    <div class="tactical-verdict ${unconverted ? 'is-unconverted' : hasAdvantage ? 'has-advantage' : 'is-neutral'}"><strong>${escapeHTML(statusTitle)}</strong><p>${escapeHTML(statusText)}</p></div>
    ${phaseMarkup ? `<div class="tactical-phases">${phaseMarkup}</div>` : ''}</section>`;
}

function structuredLossData(match, players) {
  const recap = resultRecap(match);
  const analysis = match?.analysis && typeof match.analysis === 'object' ? match.analysis : {};
  const source = recap?.loserAnalysis ?? analysis?.loserAnalysis ?? analysis?.lossAnalysis ?? analysis?.defeatAnalysis ?? {};
  const winnerSide = players.findIndex(player => player?.id === match?.winnerId);
  const loserSideValue = resultNumber(source?.loserSide ?? recap?.result?.loserSide, null);
  const loserSide = [0, 1].includes(loserSideValue) ? loserSideValue : winnerSide >= 0 ? 1 - winnerSide : 1;
  let reasons = Array.isArray(source?.reasons) ? source.reasons : [];
  if (!reasons.length) {
    const generic = analysis?.reasons;
    reasons = Array.isArray(generic) ? generic.filter(item => item?.side === undefined || resultNumber(item.side, null) === loserSide) : resultSideValue(generic, loserSide) || [];
  }
  reasons = (Array.isArray(reasons) ? reasons : []).filter(item => item && typeof item === 'object').map(item => ({
    label: item.label || item.title || item.name || item.reason || '',
    detail: item.detail || item.description || item.text || '',
    category: item.category || item.type || 'info',
    weight: resultNumber(item.weight ?? item.score, null),
  })).filter(item => item.label || item.detail);
  return { source, loserSide, reasons };
}

function lossAnalysisMarkup(match, players, tactical) {
  const loss = structuredLossData(match, players);
  const loser = players[loss.loserSide];
  const lostOnPenalties = match?.decision === 'penalties';
  const lostWithTacticalAdvantage = tactical.advantageSide === loss.loserSide;
  const headline = lostOnPenalties
    ? '点球惜败'
    : lostWithTacticalAdvantage ? '战术占优未转化为胜势' : loss.source?.primaryReason?.label || loss.reasons[0]?.label || '结构化败因复盘';
  const structuredSummary = loss.source?.summary || loss.source?.primaryReason?.detail || '';
  const toneFor = category => ({
    score: 'danger', finishing: 'warning', tactics: 'warning', mentality: 'warning', substitutions: 'info', lineup: 'info', 'chance-creation': 'info',
  })[category] || 'info';
  const reasonsMarkup = loss.reasons.map((reason, index) => `<article class="analysis-reason tone-${toneFor(reason.category)}"><span>${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHTML(reason.label || '比赛因素')}</strong><p>${escapeHTML(reason.detail)}</p></div>${reason.weight !== null ? `<b>${Math.round(reason.weight)}</b>` : ''}</article>`).join('');
  const context = lostWithTacticalAdvantage && lostOnPenalties
    ? '<span class="analysis-context">战术占优未转化为120分钟内的胜势</span>'
    : '';
  return `<section class="result-panel defeat-analysis-panel"><div class="result-module-heading"><div><p>POST-MATCH DIAGNOSIS</p><h2>败因分析</h2></div><span>${escapeHTML(loser?.name || '失利方')}</span></div>
    ${reasonsMarkup ? `<div class="analysis-summary"><small>${context || 'STRUCTURED REVIEW'}</small><strong>${escapeHTML(headline)}</strong>${structuredSummary ? `<p>${escapeHTML(structuredSummary)}</p>` : ''}</div><div class="analysis-reasons">${reasonsMarkup}</div>` : '<div class="analysis-empty"><strong>暂无结构化败因</strong><p>比赛服务暂未提供结构化败因条目。本页仅展示可核验数据，不根据比分反推原因。</p></div>'}
  </section>`;
}

function ratingSourceForSide(match, side) {
  const source = match?.playerRatings ?? match?.analysis?.playerRatings ?? match?.recap?.playerRatings;
  if (!source) return [];
  if (Array.isArray(source)) {
    if (source.length === 2 && source.every(Array.isArray)) return source[side] || [];
    return source.filter(item => resultNumber(item?.side ?? item?.teamSide, null) === side);
  }
  const direct = resultSideValue(source, side);
  if (Array.isArray(direct)) return direct;
  if (direct && typeof direct === 'object') return Object.entries(direct).map(([cardId, item]) => ({ cardId, ...(item || {}) }));
  return [];
}

function normalizedRatingsForSide(match, player, side) {
  const entries = new Map();
  const ensure = (cardId, fallback = {}) => {
    if (!cardId) return;
    const current = entries.get(cardId) || { cardId };
    Object.entries(fallback).forEach(([key, value]) => {
      if (current[key] === undefined || current[key] === null) current[key] = value;
    });
    entries.set(cardId, current);
  };
  ratingSourceForSide(match, side).forEach(item => {
    const cardId = item?.cardId ?? item?.playerId ?? item?.id;
    if (cardId) entries.set(cardId, { ...item, cardId });
  });
  const substitutions = Array.isArray(resultSideValue(match?.substitutions, side)) ? resultSideValue(match.substitutions, side) : [];
  substitutions.forEach(item => {
    ensure(item?.outCardId, { started: true, startingSlot: item?.outSlot, onMinute: 0, offMinute: item?.minute });
    ensure(item?.inCardId, { started: false, onMinute: item?.minute, offMinute: null });
  });
  const incomingIds = new Set(substitutions.map(item => item?.inCardId).filter(Boolean));
  (Array.isArray(player?.lineup) ? player.lineup : []).forEach((item, index) => {
    const cardId = item?.cardId ?? item;
    if (incomingIds.has(cardId)) ensure(cardId, { started: false });
    else ensure(cardId, { started: true, startingSlot: index, onMinute: 0 });
  });
  const finalMinute = match?.decision === 'regular' ? 90 : 120;
  return [...entries.values()].filter(item => playerById(item.cardId)).map(item => {
    const startingSlot = item.startingSlot === '' ? null : item.startingSlot;
    const started = typeof item.started === 'boolean' ? item.started : startingSlot !== null && startingSlot !== undefined;
    const onMinute = resultNumber(item.onMinute, started ? 0 : null);
    const offMinute = resultNumber(item.offMinute, null);
    const minutesPlayed = resultNumber(item.minutesPlayed, Math.max(0, (offMinute ?? finalMinute) - (onMinute ?? 0)));
    return { ...item, startingSlot, started, onMinute, offMinute, minutesPlayed, rating: resultNumber(item.rating, null) };
  }).sort((a, b) => Number(b.started) - Number(a.started)
    || resultNumber(a.startingSlot, 99) - resultNumber(b.startingSlot, 99)
    || resultNumber(a.onMinute, 999) - resultNumber(b.onMinute, 999)
    || resultNumber(b.rating, 0) - resultNumber(a.rating, 0));
}

function ratingSlotLabel(item, player, match, side) {
  const formation = resultFormation(player);
  const structured = item?.startingSlot;
  if (structured && typeof structured === 'object') return structured.label || structured.name || structured.position || '首发';
  if (typeof structured === 'string' && structured.trim() && !/^\d+$/.test(structured)) return structured;
  const slotIndex = resultNumber(structured, null);
  if (slotIndex !== null) return formation.slots?.[slotIndex]?.label || `首发位 ${slotIndex + 1}`;
  const currentIndex = (player?.lineup || []).findIndex(slot => (slot?.cardId ?? slot) === item.cardId);
  if (currentIndex >= 0) return formation.slots?.[currentIndex]?.label || '场上位置';
  const substitution = (resultSideValue(match?.substitutions, side) || []).find(change => change?.outCardId === item.cardId);
  return substitution ? formation.slots?.[substitution.outSlot]?.label || '首发' : '替补';
}

function ratingStatusText(item) {
  const minutes = resultNumber(item?.minutesPlayed, null);
  if (item?.started) {
    const off = resultNumber(item?.offMinute, null);
    return `${off !== null ? `${off}′换下` : '首发打满'}${minutes !== null ? ` · ${minutes}分钟` : ''}`;
  }
  const on = resultNumber(item?.onMinute, null);
  const off = resultNumber(item?.offMinute, null);
  if (on !== null) return `${on}′替补登场${off !== null ? ` · ${off}′换下` : ''}${minutes !== null ? ` · ${minutes}分钟` : ''}`;
  return minutes !== null ? `替补 · ${minutes}分钟` : '替补登场';
}

function ratingTeamMarkup(player, side, match, ratings) {
  const official = ratings.filter(item => item.rating !== null);
  const weightedMinutes = official.reduce((sum, item) => sum + Math.max(1, resultNumber(item.minutesPlayed, 1)), 0);
  const average = weightedMinutes ? official.reduce((sum, item) => sum + item.rating * Math.max(1, resultNumber(item.minutesPlayed, 1)), 0) / weightedMinutes : null;
  const rows = ratings.map(item => {
    const card = playerById(item.cardId);
    const rating = item.rating;
    const ratingClass = rating === null ? 'is-missing' : rating >= 8 ? 'is-high' : rating >= 7 ? 'is-good' : rating < 6 ? 'is-low' : '';
    const contributions = `${item.goals ? ` · ${item.goals}球` : ''}${item.assists ? ` · ${item.assists}助` : ''}`;
    return `<div class="rating-row"><img src="${avatarData(card)}" alt=""><div class="rating-player-copy"><strong>${escapeHTML(card.name)}</strong><span>${escapeHTML(ratingSlotLabel(item, player, match, side))} · ${escapeHTML(preferredPositionText(card))}${contributions}</span><small class="rating-status">${escapeHTML(ratingStatusText(item))}</small></div><b class="${ratingClass}">${rating === null ? '--' : rating.toFixed(1)}</b></div>`;
  }).join('');
  return `<div class="rating-team ${side ? 'away' : ''}"><h3><span><b>${escapeHTML(player?.name || '球队')}</b><small>${escapeHTML(resultFormation(player).name)} · ${escapeHTML(resultTactic(player).name)}</small></span><em>全队均分 <strong>${average === null ? '--' : average.toFixed(2)}</strong></em></h3>${rows || '<p class="rating-empty">暂无球员评分记录</p>'}</div>`;
}

function manOfMatchMarkup(match, players, ratingsBySide) {
  let selected = match?.manOfMatch && typeof match.manOfMatch === 'object' ? { ...match.manOfMatch } : null;
  if (!selected?.cardId) {
    selected = ratingsBySide.flatMap((ratings, side) => ratings.map(item => ({ ...item, side })))
      .filter(item => item.rating !== null).sort((a, b) => b.rating - a.rating)[0] || null;
  }
  const card = selected?.cardId ? playerById(selected.cardId) : null;
  if (!card) return '<div class="motm motm-empty"><div><small>PLAYER OF THE MATCH</small><strong>本场最佳暂未记录</strong></div></div>';
  let side = [0, 1].includes(resultNumber(selected.side, null)) ? resultNumber(selected.side, null) : ratingsBySide.findIndex(items => items.some(item => item.cardId === selected.cardId));
  if (side < 0) side = 0;
  const rating = resultNumber(selected.rating, ratingsBySide[side]?.find(item => item.cardId === selected.cardId)?.rating);
  return `<div class="motm"><div class="motm-avatar"><img src="${avatarData(card)}" alt="${escapeHTML(card.name)}"></div><div class="motm-copy"><small>PLAYER OF THE MATCH</small><strong>${escapeHTML(card.name)}</strong><span>${escapeHTML(players[side]?.name || '球队')} · ${escapeHTML(preferredPositionText(card))}</span><div class="rating-value">${rating === null ? '--' : Number(rating).toFixed(1)}</div></div></div>`;
}

function legacyRenderResult() {
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
      <div class="motm"><div class="motm-avatar"><img src="${avatarData(motmPlayer)}" alt="${escapeHTML(motmPlayer.name)}"></div><div class="motm-copy"><small>PLAYER OF THE MATCH</small><strong>${escapeHTML(motmPlayer.name)}</strong><span>${escapeHTML(state.room.players[match.manOfMatch.side].name)} · ${escapeHTML(preferredPositionText(motmPlayer))}</span><div class="rating-value">${match.manOfMatch.rating}</div></div></div>
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

function legacyRatingTeamMarkup(player, ratings, side) {
  const formation = state.meta.formations[player.formation];
  const activeSlots = new Map(player.lineup.filter(Boolean).map((item, index) => [item.cardId, formation.slots[index]]));
  const sorted = ratings.map(rating => ({ ...rating, slot: activeSlots.get(rating.cardId) || { label: '替补' } })).sort((a, b) => b.rating - a.rating);
  return `<div class="rating-team ${side ? 'away' : ''}"><h3>${escapeHTML(player.name)} <span>${escapeHTML(state.meta.tactics[player.tactic].name)}</span></h3>${sorted.map(item => {
    const card = playerById(item.cardId);
    return `<div class="rating-row"><img src="${avatarData(card)}" alt=""><div><strong>${escapeHTML(card.name)}</strong><span>${item.slot.label} · ${escapeHTML(preferredPositionText(card))}${item.goals ? ` · ${item.goals}球` : ''}${item.assists ? ` · ${item.assists}助` : ''}</span></div><b class="${item.rating >= 8 ? 'is-high' : ''}">${item.rating}</b></div>`;
  }).join('')}</div>`;
}

function renderResult() {
  const match = state.room?.match;
  const players = Array.isArray(state.room?.players) ? state.room.players.slice(0, 2) : [];
  if (!match || players.length < 2) return;
  const [home, away] = players;
  const score = resultPair(match.score);
  const penalties = resultPair(match.penalties);
  const viewerWon = match.winnerId === state.playerId;
  const viewerLost = Boolean(match.winnerId) && !viewerWon;
  const decisionText = match.decision === 'penalties'
    ? `120分钟 ${score[0]} - ${score[1]} · 点球 ${penalties[0]} - ${penalties[1]}`
    : match.decision === 'extra' ? '加时赛决胜' : '常规时间决胜';
  const stats = [resultSideStats(match, 0), resultSideStats(match, 1)];
  const statValue = (side, key) => {
    const value = resultNumber(stats[side]?.[key], null);
    return value === null ? '--' : value;
  };
  const statsRows = [
    ['控球率', statValue(0, 'possession'), statValue(1, 'possession'), '%'],
    ['射门', statValue(0, 'shots'), statValue(1, 'shots'), ''],
    ['射正', statValue(0, 'onTarget'), statValue(1, 'onTarget'), ''],
    ['角球', statValue(0, 'corners'), statValue(1, 'corners'), ''],
    ['传球成功率', statValue(0, 'passAccuracy'), statValue(1, 'passAccuracy'), '%'],
    ['扑救', statValue(0, 'saves'), statValue(1, 'saves'), ''],
  ];
  const events = Array.isArray(match.events) ? match.events : [];
  const importantEvents = events.filter(event => event?.important);
  const shotsBySide = [resultShotsForSide(match, 0), resultShotsForSide(match, 1)];
  const xgData = resultExpectedGoals(match, shotsBySide);
  const tactical = resultTacticalData(match, players);
  const ratingsBySide = players.map((player, side) => normalizedRatingsForSide(match, player, side));
  const timelineMarkup = importantEvents.map(event => `<div class="timeline-row ${escapeHTML(event?.type || '')}"><time>${escapeHTML(event?.clock || '—')}</time><span class="timeline-dot"></span><p>${escapeHTML(event?.text || EVENT_LABEL[event?.type] || '关键事件')}</p></div>`).join('');
  const resultTitle = viewerWon ? '胜利属于你' : viewerLost && match.decision === 'penalties' ? '点球惜败，再战一场' : viewerLost ? '惜败，再战一场' : '比赛结束';

  dom.resultView.innerHTML = `<div class="result-hero">
    <span class="result-outcome">${viewerWon ? 'MATCH VICTORY' : 'MATCH COMPLETE'}</span><h1>${resultTitle}</h1>
    <div class="result-scoreline"><div class="result-team"><strong>${escapeHTML(home.name)}</strong><span>${escapeHTML(resultFormation(home).name)}</span></div>
      <div class="result-score"><b>${score[0]}</b><i>:</i><b>${score[1]}</b></div>
      <div class="result-team"><strong>${escapeHTML(away.name)}</strong><span>${escapeHTML(resultFormation(away).name)}</span></div></div>
    <p class="result-decision">${escapeHTML(decisionText)}</p>
    <div class="result-actions"><button id="rematchBtn" class="primary-btn" type="button">再来一局</button><button id="backLobbyBtn" class="secondary-btn" type="button">返回大厅</button></div>
  </div>
  <div class="result-grid">
    <section class="result-panel"><h2>全场数据</h2>${manOfMatchMarkup(match, players, ratingsBySide)}
      <div class="result-stats">${statsRows.map(([label, a, b, unit]) => compareMarkup(label, a, b, unit, 'result-stat-row')).join('')}</div>
    </section>
    <section class="result-panel"><h2>关键事件</h2><div class="timeline">${timelineMarkup || '<div class="timeline-empty">暂无关键事件记录</div>'}</div></section>
  </div>
  <div class="result-analysis-grid">
    ${xgAndShotMapMarkup(players, shotsBySide, xgData)}
    ${tacticalReviewMarkup(match, players, tactical)}
    ${lossAnalysisMarkup(match, players, tactical)}
  </div>
  <section class="result-panel rating-panel"><div class="rating-heading"><div><p>PLAYER PERFORMANCE</p><h2>完整球员评分</h2></div><span>按首发位置与替补登场时间排列</span></div><div class="ratings-grid">${ratingTeamMarkup(home, 0, match, ratingsBySide[0])}${ratingTeamMarkup(away, 1, match, ratingsBySide[1])}</div></section>`;

  document.getElementById('rematchBtn')?.addEventListener('click', async event => {
    const data = await roomAction('rematch', {}, { button: event.currentTarget });
    if (data && state.room.status === 'finished') showToast('已申请再来一局，等待对方确认');
  });
  document.getElementById('backLobbyBtn')?.addEventListener('click', () => {
    clearSession();
    showLobby();
  });
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
  dom.interventionDialog.addEventListener('cancel', event => event.preventDefault());
  dom.interventionDialog.addEventListener('click', event => {
    const mentality = event.target.closest('[data-mentality]');
    if (mentality && state.interventionDraft) {
      state.interventionDraft.mentality = mentality.dataset.mentality;
      renderInterventionWindow();
      return;
    }
    if (event.target.closest('#submitInterventionBtn')) submitIntervention();
  });
  dom.interventionDialog.addEventListener('change', event => {
    if (!state.interventionDraft) return;
    if (event.target.id === 'interventionOutSlot') state.interventionDraft.outSlot = event.target.value;
    if (event.target.id === 'interventionInCard') state.interventionDraft.inCardId = event.target.value;
  });
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
    dom.loadingScreen.innerHTML = `<div class="brand-mark brand-mark-large"><span>!</span></div><p>游戏服务正在唤醒：${escapeHTML(error.message)}</p><small>公网版请稍候刷新；只有本地运行时才需要 <b>npm start</b>。</small>`;
  }
}

init();
