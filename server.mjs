import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  ACADEMY_PLAYERS,
  FORMATIONS,
  META,
  PACK_BY_ID,
  PLAYER_BY_ID,
  TACTICS,
  playerOverall,
} from './game-data.mjs';

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const publicRoot = resolve(root, 'public');
const rooms = new Map();
const ROOM_TTL = 1000 * 60 * 60 * 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new ApiError(413, '请求内容过大');
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError(400, '请求格式不正确');
  }
}

function makeCode() {
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function safeName(name, fallback = '匿名教练') {
  const value = String(name || '').trim().slice(0, 16);
  return value || fallback;
}

function createPlayer(name, bot = false) {
  return {
    id: bot ? `bot-${randomUUID()}` : randomUUID(),
    name: safeName(name, bot ? '传奇教头 AI' : '匿名教练'),
    bot,
    coins: META.startingCoins,
    inventory: {},
    lineup: Array(11).fill(null),
    formation: '4-3-3',
    tactic: 'balanced',
    ready: false,
    rematch: false,
  };
}

function addCard(player, cardId, amount = 1) {
  player.inventory[cardId] = (player.inventory[cardId] || 0) + amount;
  if (player.inventory[cardId] <= 0) delete player.inventory[cardId];
}

function inventoryItems(player) {
  return Object.entries(player.inventory)
    .map(([cardId, quantity]) => ({ cardId, quantity }))
    .filter(item => item.quantity > 0 && PLAYER_BY_ID[item.cardId])
    .sort((a, b) => playerOverall(PLAYER_BY_ID[b.cardId]) - playerOverall(PLAYER_BY_ID[a.cardId]));
}

function ownedBestByName(player) {
  return inventoryItems(player);
}

function roleFit(playerPosition, slotRole) {
  if (playerPosition === slotRole) return 1;
  if (playerPosition === 'GK' || slotRole === 'GK') return .48;
  if ((playerPosition === 'DEF' && slotRole === 'MID') || (playerPosition === 'MID' && slotRole === 'DEF')) return .88;
  if ((playerPosition === 'MID' && slotRole === 'FWD') || (playerPosition === 'FWD' && slotRole === 'MID')) return .9;
  return .72;
}

function ensureMinimumSquad(player) {
  const unique = new Set(inventoryItems(player).map(item => item.cardId));
  for (const card of ACADEMY_PLAYERS) {
    if (unique.size >= 11) break;
    if (!unique.has(card.id)) {
      addCard(player, card.id, 1);
      unique.add(card.id);
    }
  }
}

function autoLineup(player, allowLoans = false) {
  if (allowLoans) ensureMinimumSquad(player);
  const owned = ownedBestByName(player);
  if (owned.length < 11) throw new ApiError(400, `至少需要11名不同球员，目前只有${owned.length}名`);
  const slots = FORMATIONS[player.formation].slots;
  const remaining = [...owned];
  const lineup = Array(11).fill(null);
  const slotOrder = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => ({ GK: 0, DEF: 1, MID: 2, FWD: 3 })[a.slot.role] - ({ GK: 0, DEF: 1, MID: 2, FWD: 3 })[b.slot.role]);

  for (const { slot, index } of slotOrder) {
    remaining.sort((a, b) => {
      const pa = PLAYER_BY_ID[a.cardId];
      const pb = PLAYER_BY_ID[b.cardId];
      const scoreA = playerOverall(pa) * roleFit(pa.position, slot.role);
      const scoreB = playerOverall(pb) * roleFit(pb.position, slot.role);
      return scoreB - scoreA;
    });
    const pick = remaining.shift();
    lineup[index] = { cardId: pick.cardId };
  }
  player.lineup = lineup;
  player.ready = false;
}

function weightedSample(playerIds, count) {
  const pool = playerIds.map(cardId => ({ cardId, weight: PLAYER_BY_ID[cardId]?.weight || 1 }));
  const result = [];
  while (result.length < count && pool.length) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;
    let pickedIndex = 0;
    for (let index = 0; index < pool.length; index += 1) {
      roll -= pool[index].weight;
      if (roll <= 0) {
        pickedIndex = index;
        break;
      }
    }
    result.push(pool.splice(pickedIndex, 1)[0].cardId);
  }
  return result;
}

function drawPackCards(player, pack) {
  const unowned = pack.playerIds.filter(cardId => !(player.inventory[cardId] > 0));
  const freshCards = weightedSample(unowned, Math.min(pack.cardCount, unowned.length));
  if (freshCards.length === pack.cardCount) return freshCards;
  const remainingPool = pack.playerIds.filter(cardId => !freshCards.includes(cardId));
  return [...freshCards, ...weightedSample(remainingPool, pack.cardCount - freshCards.length)];
}

function grantPack(player, packId, charge = true) {
  const pack = PACK_BY_ID[packId];
  if (!pack) throw new ApiError(404, '卡包不存在');
  if (charge && player.coins < pack.price) throw new ApiError(400, '金币不足，无法购买这个卡包');
  if (charge) player.coins -= pack.price;
  const cards = drawPackCards(player, pack).map(cardId => ({ cardId }));
  cards.forEach(item => addCard(player, item.cardId, 1));
  player.ready = false;
  return cards;
}

function prepareBot(bot) {
  const legendPack = ['legend-gk', 'legend-def', 'legend-mid', 'legend-fwd'][Math.floor(Math.random() * 4)];
  const packIds = ['current-gk', 'current-def', 'current-mid', 'current-fwd', legendPack];
  packIds.forEach(packId => grantPack(bot, packId, false));
  bot.coins = META.startingCoins - packIds.reduce((sum, packId) => sum + PACK_BY_ID[packId].price, 0);
  bot.formation = ['4-3-3', '4-2-3-1', '3-5-2'][Math.floor(Math.random() * 3)];
  bot.tactic = ['balanced', 'possession', 'counter', 'pressing'][Math.floor(Math.random() * 4)];
  autoLineup(bot);
  bot.ready = true;
}

function computeTeam(player) {
  const formation = FORMATIONS[player.formation];
  const tactic = TACTICS[player.tactic];
  let attackSum = 0;
  let attackWeight = 0;
  let midfieldSum = 0;
  let midfieldWeight = 0;
  let defenseSum = 0;
  let defenseWeight = 0;
  let keeper = 35;
  let total = 0;

  player.lineup.forEach((item, index) => {
    if (!item) return;
    const card = PLAYER_BY_ID[item.cardId];
    const stats = card.stats;
    const fit = roleFit(card.position, formation.slots[index].role);
    const attacking = stats.sho * .36 + stats.pac * .24 + stats.dri * .25 + stats.pas * .15;
    const middle = stats.pas * .35 + stats.dri * .25 + stats.phy * .15 + stats.def * .15 + stats.pac * .1;
    const defending = stats.def * .44 + stats.phy * .24 + stats.pac * .16 + stats.pas * .1 + stats.dri * .06;
    const role = formation.slots[index].role;
    const aw = role === 'FWD' ? 1 : role === 'MID' ? .55 : .25;
    const mw = role === 'MID' ? 1 : role === 'FWD' ? .55 : .5;
    const dw = role === 'DEF' ? 1 : role === 'MID' ? .55 : .22;
    attackSum += attacking * fit * aw;
    attackWeight += aw;
    midfieldSum += middle * fit * mw;
    midfieldWeight += mw;
    defenseSum += defending * fit * dw;
    defenseWeight += dw;
    total += playerOverall(card) * fit;
    if (role === 'GK') keeper = (stats.gk * .82 + stats.pas * .08 + stats.phy * .1) * fit;
  });

  return {
    attack: attackSum / attackWeight * tactic.attack,
    midfield: midfieldSum / midfieldWeight * tactic.midfield,
    defense: defenseSum / defenseWeight * tactic.defense,
    keeper,
    overall: total / 11,
    possessionBias: tactic.possession,
  };
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function weightedAttacker(player, random) {
  const formation = FORMATIONS[player.formation];
  const candidates = player.lineup.map((item, index) => ({
    item,
    card: item ? PLAYER_BY_ID[item.cardId] : null,
    weight: formation.slots[index].role === 'FWD' ? 5 : formation.slots[index].role === 'MID' ? 2.5 : .5,
  })).filter(entry => entry.card && entry.card.position !== 'GK');
  const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  let value = random() * total;
  for (const entry of candidates) {
    value -= entry.weight;
    if (value <= 0) return entry;
  }
  return candidates[0];
}

function weightedDefender(player, random) {
  const formation = FORMATIONS[player.formation];
  const candidates = player.lineup.map((item, index) => ({
    item,
    card: item ? PLAYER_BY_ID[item.cardId] : null,
    weight: formation.slots[index].role === 'DEF' ? 5 : formation.slots[index].role === 'MID' ? 2 : .4,
  })).filter(entry => entry.card);
  const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  let value = random() * total;
  for (const entry of candidates) {
    value -= entry.weight;
    if (value <= 0) return entry;
  }
  return candidates[0];
}

function generateMatch(room) {
  const [home, away] = room.players;
  const teams = [computeTeam(home), computeTeam(away)];
  const random = mulberry32(hashSeed(`${room.code}-${Date.now()}-${home.lineup.map(x => x?.cardId).join()}-${away.lineup.map(x => x?.cardId).join()}`));
  const score = [0, 0];
  const penalty = [0, 0];
  const rawEvents = [];
  const stats = [
    { shots: 0, onTarget: 0, corners: 0, fouls: 0, saves: 0, yellow: 0 },
    { shots: 0, onTarget: 0, corners: 0, fouls: 0, saves: 0, yellow: 0 },
  ];
  const possessionHome = clamp(Math.round(50 + (teams[0].midfield - teams[1].midfield) * .55 + teams[0].possessionBias - teams[1].possessionBias), 35, 65);

  const addEvent = (clock, type, side, text, important = false, detail = {}) => {
    rawEvents.push({
      id: `${rawEvents.length + 1}`,
      clock,
      type,
      side,
      text,
      important,
      score: [...score],
      penalty: [...penalty],
      ...detail,
    });
  };

  const simulateRange = (from, to) => {
    let minute = from + 2 + Math.floor(random() * 3);
    while (minute <= to) {
      const side = random() < possessionHome / 100 ? 0 : 1;
      const other = 1 - side;
      const attacker = weightedAttacker(room.players[side], random);
      const defender = weightedDefender(room.players[other], random);
      const chanceQuality = clamp(.09 + (teams[side].attack - teams[other].defense) / 520 + (teams[side].overall - teams[other].overall) / 900, .035, .2);
      const roll = random();

      if (roll < chanceQuality) {
        score[side] += 1;
        stats[side].shots += 1;
        stats[side].onTarget += 1;
        const assist = weightedAttacker(room.players[side], random);
        addEvent(`${minute}′`, 'goal', side, `${attacker.card.name}冷静终结！${room.players[side].name}取得进球。`, true, {
          playerId: attacker.card.id,
          assistId: assist.card.id === attacker.card.id ? null : assist.card.id,
        });
      } else if (roll < chanceQuality + .19) {
        stats[side].shots += 1;
        stats[side].onTarget += 1;
        stats[other].saves += 1;
        const keeperSlot = room.players[other].lineup.find((_, index) => FORMATIONS[room.players[other].formation].slots[index].role === 'GK');
        const keeperName = keeperSlot ? PLAYER_BY_ID[keeperSlot.cardId].name : defender.card.name;
        addEvent(`${minute}′`, 'save', other, `${attacker.card.name}的射门直奔死角，${keeperName}做出关键扑救！`, true, { playerId: keeperSlot?.cardId });
      } else if (roll < chanceQuality + .4) {
        stats[side].shots += 1;
        if (random() < .3) stats[side].corners += 1;
        addEvent(`${minute}′`, 'shot', side, `${attacker.card.name}获得起脚空间，皮球稍稍偏出。`, false, { playerId: attacker.card.id });
      } else if (roll < chanceQuality + .52) {
        stats[other].fouls += 1;
        if (random() < .42) {
          stats[other].yellow += 1;
          addEvent(`${minute}′`, 'card', other, `${defender.card.name}阻断反击，被出示黄牌。`, true, { playerId: defender.card.id });
        } else {
          addEvent(`${minute}′`, 'foul', other, `${defender.card.name}战术犯规，比赛短暂中断。`, false, { playerId: defender.card.id });
        }
      } else {
        addEvent(`${minute}′`, 'play', side, `${room.players[side].name}在中场连续传递，尝试寻找防线空当。`);
      }
      minute += 4 + Math.floor(random() * 4);
    }
  };

  addEvent('0′', 'phase', null, `比赛开始！${home.name} 对阵 ${away.name}。`, true);
  simulateRange(1, 45);
  addEvent('45′', 'phase', null, `半场结束，比分 ${score[0]} - ${score[1]}。`, true);
  simulateRange(46, 90);
  const regularScore = [...score];
  let decision = 'regular';

  if (score[0] === score[1]) {
    decision = 'extra';
    addEvent('90′', 'phase', null, `常规时间战成 ${score[0]} - ${score[1]}，进入加时赛！`, true);
    simulateRange(91, 105);
    addEvent('105′', 'phase', null, '加时赛半场结束，双方交换场地。', true);
    simulateRange(106, 120);
  }

  const extraScore = [...score];
  if (score[0] === score[1]) {
    decision = 'penalties';
    addEvent('120′', 'phase', null, `加时赛仍为 ${score[0]} - ${score[1]}，点球大战开始！`, true);
    let round = 0;
    let resolved = false;
    while (!resolved) {
      round += 1;
      for (let side = 0; side < 2; side += 1) {
        const kicker = weightedAttacker(room.players[side], random);
        const shooting = kicker.card.stats.sho;
        const scoringChance = clamp(.71 + (shooting - teams[1 - side].keeper) / 260, .55, .9);
        let scored = random() < scoringChance;
        if (round >= 9 && side === 1 && penalty[0] === penalty[1]) scored = random() < .45;
        if (scored) penalty[side] += 1;
        addEvent(`点球${round}`, scored ? 'penalty-goal' : 'penalty-miss', side, scored
          ? `${kicker.card.name}主罚命中，点球比分 ${penalty[0]} - ${penalty[1]}。`
          : `${kicker.card.name}罚失点球！点球比分 ${penalty[0]} - ${penalty[1]}。`, true, { playerId: kicker.card.id, penaltyRound: round });

        if (round <= 5) {
          const homeRemaining = 5 - round + (side === 0 ? 0 : 0);
          const awayRemaining = 5 - round + (side === 0 ? 1 : 0);
          if (penalty[0] > penalty[1] + awayRemaining || penalty[1] > penalty[0] + homeRemaining) {
            resolved = true;
            break;
          }
        } else if (side === 1 && penalty[0] !== penalty[1]) {
          resolved = true;
          break;
        }
      }
      if (round >= 10 && penalty[0] === penalty[1]) {
        const finalSide = Math.floor(random() * 2);
        const finalKicker = weightedAttacker(room.players[finalSide], random);
        penalty[finalSide] += 1;
        addEvent(`点球${round + 1}`, 'penalty-goal', finalSide, `${finalKicker.card.name}打入终极点球！点球比分 ${penalty[0]} - ${penalty[1]}。`, true, { playerId: finalKicker.card.id, penaltyRound: round + 1 });
        resolved = true;
      }
    }
  }

  const winnerIndex = decision === 'penalties'
    ? (penalty[0] > penalty[1] ? 0 : 1)
    : (score[0] > score[1] ? 0 : 1);
  const winner = room.players[winnerIndex];
  const loser = room.players[1 - winnerIndex];
  addEvent(decision === 'penalties' ? '点球结束' : decision === 'extra' ? '120′' : '90′', 'phase', winnerIndex,
    decision === 'penalties'
      ? `比赛结束！${winner.name}点球 ${penalty[winnerIndex]} - ${penalty[1 - winnerIndex]} 获胜。`
      : `比赛结束！${winner.name}以 ${score[winnerIndex]} - ${score[1 - winnerIndex]} 获胜。`, true);
  const goalScorers = rawEvents.filter(event => event.type === 'goal');
  const playerRatings = room.players.map((player, side) => player.lineup.map(item => {
    const card = PLAYER_BY_ID[item.cardId];
    const goals = goalScorers.filter(event => event.side === side && event.playerId === card.id).length;
    const assists = goalScorers.filter(event => event.side === side && event.assistId === card.id).length;
    const base = 6.1 + (playerOverall(card) - 82) / 20 + goals * 1.1 + assists * .55 + (random() - .5) * .6;
    return { cardId: card.id, rating: Number(clamp(base, 5.7, 10).toFixed(1)), goals, assists };
  }));
  const allRatings = playerRatings.flatMap((items, side) => items.map(item => ({ ...item, side })));
  allRatings.sort((a, b) => b.rating - a.rating);
  const manOfMatch = allRatings[0];
  const durationMs = decision === 'penalties' ? 64_000 : decision === 'extra' ? 54_000 : 46_000;
  const events = rawEvents.map((event, index) => ({
    ...event,
    revealAt: Math.round(900 + index / Math.max(1, rawEvents.length - 1) * (durationMs - 2_200)),
  }));

  return {
    id: randomUUID(),
    startedAt: Date.now() + 1_500,
    durationMs,
    decision,
    score: [...score],
    regularScore,
    extraScore,
    penalties: [...penalty],
    winnerId: winner.id,
    loserId: loser.id,
    events,
    teams,
    stats: [
      { ...stats[0], possession: possessionHome, passAccuracy: clamp(Math.round(82 + (teams[0].midfield - 75) * .25 + random() * 5), 76, 94) },
      { ...stats[1], possession: 100 - possessionHome, passAccuracy: clamp(Math.round(82 + (teams[1].midfield - 75) * .25 + random() * 5), 76, 94) },
    ],
    playerRatings,
    manOfMatch,
  };
}

function resetForRematch(room) {
  room.status = 'preparing';
  room.prepStartedAt = Date.now();
  room.match = null;
  room.players.forEach(player => {
    player.coins = META.startingCoins;
    player.inventory = {};
    player.lineup = Array(11).fill(null);
    player.formation = '4-3-3';
    player.tactic = 'balanced';
    player.ready = false;
    player.rematch = false;
    if (player.bot) prepareBot(player);
  });
}

function startMatch(room) {
  if (room.status !== 'preparing' || room.players.length < 2) return;
  room.players.forEach(player => {
    if (player.lineup.filter(Boolean).length !== 11) autoLineup(player, true);
    player.ready = true;
  });
  room.match = generateMatch(room);
  room.status = 'playing';
}

function tickRoom(room) {
  if (room.status === 'preparing' && room.players.length === 2) {
    if (!room.prepStartedAt) room.prepStartedAt = Date.now();
    const expired = Date.now() - room.prepStartedAt >= META.preparationSeconds * 1000;
    if (expired || room.players.every(player => player.ready)) startMatch(room);
  }
  if (room.status === 'playing' && room.match && Date.now() >= room.match.startedAt + room.match.durationMs) {
    room.status = 'finished';
  }
}

function getRoom(code) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) throw new ApiError(404, '没有找到这个房间，请检查房间号');
  if (Date.now() - room.updatedAt > ROOM_TTL) {
    rooms.delete(room.code);
    throw new ApiError(410, '这个房间已经过期');
  }
  tickRoom(room);
  return room;
}

function getPlayer(room, playerId) {
  const player = room.players.find(item => item.id === playerId);
  if (!player) throw new ApiError(403, '你不在这个房间中，请重新加入');
  return player;
}

function serializeRoom(room, viewerId) {
  tickRoom(room);
  const viewer = room.players.find(player => player.id === viewerId);
  const remainingSeconds = room.prepStartedAt
    ? Math.max(0, Math.ceil((META.preparationSeconds * 1000 - (Date.now() - room.prepStartedAt)) / 1000))
    : META.preparationSeconds;
  return {
    code: room.code,
    status: room.status,
    createdAt: room.createdAt,
    prepStartedAt: room.prepStartedAt,
    remainingSeconds,
    viewerId,
    isHost: room.players[0]?.id === viewerId,
    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      bot: player.bot,
      coins: player.id === viewerId ? player.coins : null,
      formation: player.formation,
      tactic: player.tactic,
      ready: player.ready,
      rematch: player.rematch,
      lineup: room.status === 'preparing' && player.id !== viewerId ? Array(11).fill(null) : player.lineup,
      inventory: player.id === viewerId ? inventoryItems(player) : undefined,
      inventoryCount: inventoryItems(player).reduce((sum, item) => sum + item.quantity, 0),
      uniqueCount: ownedBestByName(player).length,
      teamOverall: player.lineup.filter(Boolean).length === 11 ? Math.round(computeTeam(player).overall) : null,
    })),
    match: room.match,
    canAddBot: room.players.length === 1 && room.status === 'preparing',
    viewerReady: viewer?.ready || false,
  };
}

function performAction(room, player, type, payload = {}) {
  if (type === 'skipMatch') {
    if (room.status !== 'playing') throw new ApiError(400, '当前没有正在进行的比赛');
    room.match.startedAt = Date.now() - room.match.durationMs;
    tickRoom(room);
    return {};
  }

  if (type === 'rematch') {
    if (room.status !== 'finished') throw new ApiError(400, '比赛结束后才能发起再来一局');
    player.rematch = true;
    room.players.filter(item => item.bot).forEach(item => { item.rematch = true; });
    if (room.players.every(item => item.rematch)) resetForRematch(room);
    return {};
  }

  if (room.status !== 'preparing') throw new ApiError(400, '阵容已经锁定，无法再修改');
  if (player.ready && type !== 'setReady') throw new ApiError(400, '请先取消准备，再修改阵容');

  if (type === 'buyPack') {
    const cards = grantPack(player, payload.packId, true);
    return { reveal: { packId: payload.packId, cards } };
  }

  if (type === 'setFormation') {
    if (!FORMATIONS[payload.formation]) throw new ApiError(400, '不支持这个阵型');
    player.formation = payload.formation;
    player.ready = false;
    return {};
  }

  if (type === 'setTactic') {
    if (!TACTICS[payload.tactic]) throw new ApiError(400, '不支持这个战术');
    player.tactic = payload.tactic;
    player.ready = false;
    return {};
  }

  if (type === 'setLineup') {
    const slotIndex = Number(payload.slotIndex);
    const card = PLAYER_BY_ID[payload.cardId];
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 10 || !card) throw new ApiError(400, '放置位置不正确');
    if ((player.inventory[card.id] || 0) < 1) throw new ApiError(400, '你的待定区中没有这张球员卡');
    if (player.lineup.some((item, index) => index !== slotIndex && item?.cardId === card.id)) throw new ApiError(400, '首发阵容不能出现同名球员');
    player.lineup[slotIndex] = { cardId: card.id };
    player.ready = false;
    return {};
  }

  if (type === 'swapLineup') {
    const from = Number(payload.from);
    const to = Number(payload.to);
    if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index <= 10)) throw new ApiError(400, '交换位置不正确');
    [player.lineup[from], player.lineup[to]] = [player.lineup[to], player.lineup[from]];
    player.ready = false;
    return {};
  }

  if (type === 'removeLineup') {
    const slotIndex = Number(payload.slotIndex);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 10) throw new ApiError(400, '移除位置不正确');
    player.lineup[slotIndex] = null;
    player.ready = false;
    return {};
  }

  if (type === 'autoLineup') {
    autoLineup(player);
    return {};
  }

  if (type === 'setReady') {
    const ready = Boolean(payload.ready);
    if (ready && player.lineup.filter(Boolean).length !== 11) throw new ApiError(400, '请先安排满11名不同球员');
    player.ready = ready;
    if (room.players.length === 2 && room.players.every(item => item.ready)) startMatch(room);
    return {};
  }

  throw new ApiError(400, '未知操作');
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/meta' && req.method === 'GET') {
    sendJson(res, 200, META);
    return;
  }

  if (url.pathname === '/api/rooms' && req.method === 'POST') {
    const body = await readJson(req);
    const player = createPlayer(body.name);
    const room = {
      code: makeCode(),
      status: 'preparing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      prepStartedAt: null,
      players: [player],
      match: null,
    };
    rooms.set(room.code, room);
    sendJson(res, 201, { room: serializeRoom(room, player.id), playerId: player.id });
    return;
  }

  const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(preview|join|bot|state|action))?$/i);
  if (!match) throw new ApiError(404, '接口不存在');
  const room = getRoom(match[1]);
  const operation = match[2];

  if (operation === 'preview' && req.method === 'GET') {
    sendJson(res, 200, {
      code: room.code,
      host: room.players[0].name,
      playerCount: room.players.length,
      status: room.status,
      joinable: room.status === 'preparing' && room.players.length < 2,
    });
    return;
  }

  if (operation === 'join' && req.method === 'POST') {
    if (room.status !== 'preparing') throw new ApiError(409, '这场比赛已经开始');
    if (room.players.length >= 2) throw new ApiError(409, '房间已经满员');
    const body = await readJson(req);
    const player = createPlayer(body.name);
    room.players.push(player);
    room.prepStartedAt = Date.now();
    room.updatedAt = Date.now();
    sendJson(res, 200, { room: serializeRoom(room, player.id), playerId: player.id });
    return;
  }

  if (operation === 'bot' && req.method === 'POST') {
    const body = await readJson(req);
    const requester = getPlayer(room, body.playerId);
    if (room.players[0].id !== requester.id) throw new ApiError(403, '只有房主可以邀请 AI');
    if (room.players.length >= 2) throw new ApiError(409, '房间已经满员');
    const bot = createPlayer('传奇教头 AI', true);
    prepareBot(bot);
    room.players.push(bot);
    room.prepStartedAt = Date.now();
    room.updatedAt = Date.now();
    sendJson(res, 200, { room: serializeRoom(room, requester.id) });
    return;
  }

  if (operation === 'state' && req.method === 'GET') {
    const playerId = url.searchParams.get('playerId');
    getPlayer(room, playerId);
    sendJson(res, 200, { room: serializeRoom(room, playerId) });
    return;
  }

  if (operation === 'action' && req.method === 'POST') {
    const body = await readJson(req);
    const player = getPlayer(room, body.playerId);
    const result = performAction(room, player, body.type, body.payload);
    room.updatedAt = Date.now();
    sendJson(res, 200, { ...result, room: serializeRoom(room, player.id) });
    return;
  }

  throw new ApiError(405, '不支持这个请求方法');
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = resolve(publicRoot, `.${pathname}`);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) throw new ApiError(403, '禁止访问');
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mime[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') throw new ApiError(404, '页面不存在');
    throw error;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (status === 500) console.error(error);
    sendJson(res, status, { error: error.message || '服务器暂时无法处理请求' });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > ROOM_TTL) rooms.delete(code);
  }
}, 1000 * 60 * 10).unref();

server.listen(PORT, HOST, () => {
  console.log(`\n足球教练-传奇11人 已启动： http://${HOST}:${PORT}\n`);
  if (process.env.OPEN_BROWSER === '1') {
    const url = `http://127.0.0.1:${PORT}`;
    const command = process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
    const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore' });
    child.unref();
  }
});
