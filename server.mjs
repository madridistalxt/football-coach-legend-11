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
const INTERVENTION_TIMEOUT_MS = 15_000;
const MAX_SUBSTITUTIONS = 2;
const MATCH_SEGMENTS = [
  { id: 'first-half', from: 1, to: 45, durationMs: 19_000, interventionMinute: 45 },
  { id: 'second-half-opening', from: 46, to: 70, durationMs: 11_000, interventionMinute: 70 },
  { id: 'second-half-closing', from: 71, to: 90, durationMs: 10_000, interventionMinute: null },
];
const MENTALITIES = Object.freeze({
  attacking: { id: 'attacking', name: '全力进攻', attack: 1.1, midfield: 1.02, defense: .9, possession: 2, chanceBonus: .012 },
  balanced: { id: 'balanced', name: '攻守平衡', attack: 1, midfield: 1, defense: 1, possession: 0, chanceBonus: 0 },
  defensive: { id: 'defensive', name: '稳守反击', attack: .91, midfield: .98, defense: 1.1, possession: -2, chanceBonus: -.008 },
});
const TACTICAL_COUNTERS = Object.freeze({
  'pressing>possession': {
    winner: 'pressing', loser: 'possession', title: '高位压迫克制传控渗透',
    explanation: '高位压迫切断短传出球线路，压迫方获得前场夺回球权与进攻组织加成。',
  },
  'counter>pressing': {
    winner: 'counter', loser: 'pressing', title: '快速反击克制高位压迫',
    explanation: '快速反击利用高位防线身后的空间，反击方获得推进和机会质量加成。',
  },
  'possession>counter': {
    winner: 'possession', loser: 'counter', title: '传控渗透克制快速反击',
    explanation: '持续控球减少攻防转换次数，传控方获得中场控制与防守稳定性加成。',
  },
});
const SHOT_AREA_LABELS = Object.freeze({
  'inside-box': '禁区内',
  'outside-box': '禁区外',
  penalty: '点球',
});
const SHOT_LANE_LABELS = Object.freeze({
  left: '左侧',
  center: '中路',
  right: '右侧',
});

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
  const created = {
    id: bot ? `bot-${randomUUID()}` : randomUUID(),
    authToken: randomUUID(),
    name: safeName(name, bot ? '传奇教头 AI' : '匿名教练'),
    bot,
    coins: META.startingCoins,
    inventory: {},
    lineup: Array(11).fill(null),
    formation: '4-3-3',
    tactic: 'balanced',
    mentality: 'balanced',
    ready: false,
    rematch: false,
  };
  grantStarterSquad(created);
  assignStarterLineup(created);
  return created;
}

function addCard(player, cardId, amount = 1) {
  player.inventory[cardId] = (player.inventory[cardId] || 0) + amount;
  if (player.inventory[cardId] <= 0) delete player.inventory[cardId];
}

function grantStarterSquad(player) {
  ACADEMY_PLAYERS.slice(0, 11).forEach(card => addCard(player, card.id, 1));
}

function assignStarterLineup(player) {
  const order = [0, 1, 2, 3, 4, 6, 5, 7, 8, 9, 10];
  player.lineup = order.map(index => ({ cardId: ACADEMY_PLAYERS[index].id }));
  player.ready = false;
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

function normalizePosition(value) {
  return String(value || '').trim().toUpperCase();
}

function broadPosition(position) {
  const value = normalizePosition(position);
  if (value === 'GK') return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'WB', 'FB', 'FB/WB', 'DEF'].includes(value)) return 'DEF';
  if (['DM', 'CDM', 'CM', 'AM', 'CAM', 'LM', 'RM', 'WM', 'MID'].includes(value)) return 'MID';
  if (['LW', 'RW', 'CF', 'SS', 'ST', 'W', 'WM/W', 'FWD'].includes(value)) return 'FWD';
  return value;
}

function detailedPositionFamily(position) {
  const value = normalizePosition(position);
  if (['LB', 'RB', 'LWB', 'RWB', 'WB', 'FB', 'FB/WB'].includes(value)) return 'FB/WB';
  if (['DM', 'CDM'].includes(value)) return 'CDM';
  if (value === 'CM') return 'CM';
  if (['AM', 'CAM'].includes(value)) return 'CAM';
  if (['LM', 'RM', 'LW', 'RW', 'WM', 'W', 'WM/W'].includes(value)) return 'WM/W';
  if (['CF', 'SS'].includes(value)) return 'CF';
  return value;
}

function supportsBroadPosition(position, slotBroad, cardBroad) {
  const value = normalizePosition(position);
  if (value === 'WM/W') return slotBroad === 'MID' || slotBroad === 'FWD';
  if (value === 'FB/WB') return slotBroad === 'DEF';
  return broadPosition(value) === slotBroad || (!value && cardBroad === slotBroad);
}

function positionLane(position) {
  const value = normalizePosition(position);
  if (value.startsWith('L')) return 'left';
  if (value.startsWith('R')) return 'right';
  return 'center';
}

function preferredPositions(card) {
  const detailed = card.preferredPositions ?? card.positions ?? card.roles;
  const values = Array.isArray(detailed) ? detailed : detailed ? [detailed] : [card.position];
  return [...new Set(values.map(normalizePosition).filter(Boolean))];
}

function positionFitForCard(card, slot) {
  const slotPosition = normalizePosition(slot.label || slot.role);
  const slotFamily = detailedPositionFamily(slotPosition);
  const slotBroad = broadPosition(slot.role || slotPosition);
  const preferences = preferredPositions(card);
  const hasDetailedPositions = Boolean(card.preferredPositions || card.positions || card.roles);

  if (preferences.includes(slotPosition) || preferences.includes(slotBroad) || preferences.includes(slotFamily)) {
    return { fit: 1, grade: 'natural', slotPosition, slotFamily, preferredPositions: preferences };
  }
  if (!hasDetailedPositions && broadPosition(card.position) === slotBroad) {
    return { fit: 1, grade: 'natural', slotPosition, slotFamily, preferredPositions: preferences };
  }
  if (slotBroad === 'GK' || preferences.some(position => broadPosition(position) === 'GK')) {
    return { fit: .32, grade: 'out-of-position', slotPosition, slotFamily, preferredPositions: preferences };
  }

  const cardBroad = broadPosition(card.position);
  const sameLine = preferences.filter(position => supportsBroadPosition(position, slotBroad, cardBroad));
  let fit;
  if (sameLine.length) {
    const familySpecialist = sameLine.some(position => ['FB/WB', 'WM/W'].includes(position));
    if (familySpecialist) {
      fit = .82;
    } else {
      const lanes = sameLine.map(positionLane);
      const slotLane = positionLane(slotPosition);
      fit = lanes.includes(slotLane) ? .94 : lanes.includes('center') || slotLane === 'center' ? .84 : .72;
    }
  } else {
    const playerBroad = cardBroad || broadPosition(preferences[0]);
    const transition = `${playerBroad}>${slotBroad}`;
    fit = ({ 'DEF>MID': .7, 'MID>DEF': .7, 'MID>FWD': .76, 'FWD>MID': .76, 'DEF>FWD': .55, 'FWD>DEF': .55 })[transition] || .58;
  }
  return {
    fit,
    grade: fit >= .8 ? 'adapted' : 'out-of-position',
    slotPosition,
    slotFamily,
    preferredPositions: preferences,
  };
}

function roleFit(cardOrPosition, slotOrRole) {
  const card = typeof cardOrPosition === 'string' ? { position: cardOrPosition } : cardOrPosition;
  const slot = typeof slotOrRole === 'string' ? { role: slotOrRole, label: slotOrRole } : slotOrRole;
  return positionFitForCard(card, slot).fit;
}

function chemistryMetric(player, formation) {
  const entries = player.lineup.map((item, index) => item && ({
    card: PLAYER_BY_ID[item.cardId],
    slot: formation.slots[index],
    index,
  })).filter(entry => entry?.card);
  const pairs = [];
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const a = entries[left];
      const b = entries[right];
      const distance = Math.hypot(a.slot.x - b.slot.x, a.slot.y - b.slot.y);
      if (distance <= 38) pairs.push([a, b]);
    }
  }

  const links = { club: 0, league: 0, nation: 0, linkedPairs: 0 };
  let points = 0;
  for (const [a, b] of pairs) {
    let pairPoints = 0;
    const currentAffiliations = a.card.era === 'current' && b.card.era === 'current';
    if (currentAffiliations && a.card.club && a.card.club === b.card.club) {
      links.club += 1;
      pairPoints += 3;
    }
    if (currentAffiliations && a.card.league && a.card.league === b.card.league) {
      links.league += 1;
      pairPoints += 1.25;
    }
    if (a.card.nation && a.card.nation === b.card.nation && !['青训营', '传奇'].includes(a.card.nation)) {
      links.nation += 1;
      pairPoints += 1.5;
    }
    if (pairPoints > 0) links.linkedPairs += 1;
    points += pairPoints;
  }
  const maximum = Math.max(1, pairs.length * 5.75);
  const score = clamp(Math.round(45 + points / maximum * 55), 45, 100);
  return {
    score,
    multiplier: Number((.94 + score / 100 * .11).toFixed(3)),
    pairCount: pairs.length,
    links,
  };
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
      const scoreA = playerOverall(pa) * roleFit(pa, slot);
      const scoreB = playerOverall(pb) * roleFit(pb, slot);
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
  const mentality = MENTALITIES[player.mentality] || MENTALITIES.balanced;
  const chemistry = chemistryMetric(player, formation);
  let attackSum = 0;
  let attackWeight = 0;
  let midfieldSum = 0;
  let midfieldWeight = 0;
  let defenseSum = 0;
  let defenseWeight = 0;
  let keeper = 35;
  let total = 0;
  const fitSlots = [];

  player.lineup.forEach((item, index) => {
    if (!item) return;
    const card = PLAYER_BY_ID[item.cardId];
    const stats = card.stats;
    const fitMetric = positionFitForCard(card, formation.slots[index]);
    const fit = fitMetric.fit;
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
    fitSlots.push({
      slotIndex: index,
      cardId: card.id,
      slotPosition: fitMetric.slotPosition,
      slotFamily: fitMetric.slotFamily,
      preferredPositions: fitMetric.preferredPositions,
      fit: Number(fit.toFixed(2)),
      grade: fitMetric.grade,
    });
  });

  const averageFit = fitSlots.length ? fitSlots.reduce((sum, item) => sum + item.fit, 0) / fitSlots.length : 0;
  const positionFit = {
    score: Math.round(averageFit * 100),
    naturalCount: fitSlots.filter(item => item.grade === 'natural').length,
    adaptedCount: fitSlots.filter(item => item.grade === 'adapted').length,
    outOfPositionCount: fitSlots.filter(item => item.grade === 'out-of-position').length,
    slots: fitSlots,
  };

  return {
    attack: attackSum / attackWeight * tactic.attack * mentality.attack * chemistry.multiplier,
    midfield: midfieldSum / midfieldWeight * tactic.midfield * mentality.midfield * chemistry.multiplier,
    defense: defenseSum / defenseWeight * tactic.defense * mentality.defense * chemistry.multiplier,
    keeper,
    overall: total / 11 * chemistry.multiplier,
    possessionBias: tactic.possession + mentality.possession,
    chanceBonus: mentality.chanceBonus,
    mentality: mentality.id,
    positionFit,
    chemistry,
  };
}

function computeMatchTeams(players) {
  const teams = players.map(computeTeam);
  const directKey = `${players[0].tactic}>${players[1].tactic}`;
  const reverseKey = `${players[1].tactic}>${players[0].tactic}`;
  const rule = TACTICAL_COUNTERS[directKey] || TACTICAL_COUNTERS[reverseKey] || null;
  if (!rule) {
    teams.forEach(team => { team.tacticalMatchup = { status: 'neutral', bonus: 0 }; });
    return { teams, tacticalMatchup: null };
  }

  const winnerSide = players[0].tactic === rule.winner ? 0 : 1;
  const loserSide = 1 - winnerSide;
  teams[winnerSide].attack *= 1.06;
  teams[winnerSide].midfield *= 1.05;
  teams[winnerSide].defense *= 1.02;
  teams[winnerSide].chanceBonus += .015;
  teams[winnerSide].tacticalMatchup = { status: 'advantage', bonus: 6, title: rule.title };
  teams[loserSide].tacticalMatchup = { status: 'disadvantage', bonus: 0, title: rule.title };

  return {
    teams,
    tacticalMatchup: {
      winnerSide,
      loserSide,
      winnerTactic: rule.winner,
      loserTactic: rule.loser,
      bonus: { attackPercent: 6, midfieldPercent: 5, defensePercent: 2, chanceQuality: .015 },
      title: rule.title,
      explanation: rule.explanation,
    },
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

function addMatchEvent(match, revealAt, clock, type, side, text, important = false, detail = {}) {
  const event = {
    id: `${match.events.length + 1}`,
    revealAt: Math.max(0, Math.round(revealAt)),
    clock,
    type,
    side,
    text,
    important,
    score: [...match._score],
    penalty: [...match._penalty],
    ...detail,
  };
  match.events.push(event);
  return event;
}

function shotLaneFromRoll(roll) {
  if (roll < .3) return 'left';
  if (roll > .7) return 'right';
  return 'center';
}

function shotCoordinates(zone, lane, random) {
  const x = zone === 'penalty'
    ? 88
    : zone === 'inside-box'
      ? 82 + Math.round(random() * 14)
      : 61 + Math.round(random() * 18);
  const laneRanges = {
    left: [18, 39],
    center: [40, 60],
    right: [61, 82],
  };
  const [from, to] = laneRanges[lane];
  return { x, y: from + Math.round(random() * (to - from)) };
}

function normalShotProfile(match, key, side, minute, shooter, teams, chanceQuality) {
  const random = mulberry32(hashSeed(`${match.seed}|shot-profile|${key}|${side}|${minute}|${match.events.length}`));
  const attackGap = teams[side].attack - teams[1 - side].defense;
  const insideProbability = clamp(.63 + attackGap / 330, .48, .82);
  const zone = random() < insideProbability ? 'inside-box' : 'outside-box';
  const lane = shotLaneFromRoll(random());
  const baseXg = zone === 'inside-box'
    ? (lane === 'center' ? .24 : .15)
    : (lane === 'center' ? .075 : .045);
  const shootingAdjustment = (shooter.stats.sho - 75) / 620;
  const chanceAdjustment = (chanceQuality - .1) * .5;
  const variance = .82 + random() * .36;
  const xG = Number(clamp((baseXg + shootingAdjustment + chanceAdjustment) * variance, .02, .52).toFixed(3));
  const coordinates = shotCoordinates(zone, lane, random);
  return {
    xG,
    shotArea: {
      zone,
      zoneLabel: SHOT_AREA_LABELS[zone],
      lane,
      laneLabel: SHOT_LANE_LABELS[lane],
      label: `${SHOT_AREA_LABELS[zone]}·${SHOT_LANE_LABELS[lane]}`,
      ...coordinates,
    },
  };
}

function penaltyShotProfile(match, side, round, scoringChance) {
  const random = mulberry32(hashSeed(`${match.seed}|penalty-profile|${side}|${round}|${match.events.length}`));
  const zone = 'penalty';
  const lane = shotLaneFromRoll(random());
  return {
    xG: Number(clamp(scoringChance, .55, .9).toFixed(3)),
    shotArea: {
      zone,
      zoneLabel: SHOT_AREA_LABELS[zone],
      lane,
      laneLabel: SHOT_LANE_LABELS[lane],
      label: `${SHOT_AREA_LABELS[zone]}·${SHOT_LANE_LABELS[lane]}`,
      ...shotCoordinates(zone, lane, random),
    },
  };
}

function addShotEvent(match, {
  revealAt,
  clock,
  type,
  eventSide,
  attackingSide,
  text,
  important = false,
  shooter,
  outcome,
  profile,
  detail = {},
  phase = 'match',
  countsTowardStats = true,
}) {
  const event = addMatchEvent(match, revealAt, clock, type, eventSide, text, important, {
    ...detail,
    shooterId: shooter.id,
    xG: profile.xG,
    shotArea: profile.shotArea,
    shotOutcome: outcome,
    shotPhase: phase,
    countsTowardStats,
  });
  match._shotMap[attackingSide].push({
    eventId: event.id,
    side: attackingSide,
    clock,
    minute: Number.parseInt(clock, 10) || null,
    playerId: shooter.id,
    playerName: shooter.name,
    outcome,
    xG: profile.xG,
    shotArea: { ...profile.shotArea },
    phase,
    countsTowardStats,
    score: [...event.score],
    penalty: [...event.penalty],
  });
  return event;
}

function summarizeShotDistribution(shots) {
  const countBy = (values, key) => values.reduce((result, shot) => {
    const value = key(shot);
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
  const byZone = { 'inside-box': 0, 'outside-box': 0, penalty: 0, ...countBy(shots, shot => shot.shotArea.zone) };
  const byLane = { left: 0, center: 0, right: 0, ...countBy(shots, shot => shot.shotArea.lane) };
  const outcomes = {
    goals: shots.filter(shot => ['goal', 'penalty-goal'].includes(shot.outcome)).length,
    saved: shots.filter(shot => shot.outcome === 'saved').length,
    offTarget: shots.filter(shot => ['off-target', 'penalty-miss'].includes(shot.outcome)).length,
  };
  return {
    total: shots.length,
    expectedGoals: Number(shots.reduce((sum, shot) => sum + shot.xG, 0).toFixed(2)),
    byZone,
    byLane,
    outcomes,
  };
}

function refreshMatchStats(match) {
  const possessionHome = match._possessionMinutes
    ? clamp(Math.round(match._possessionHomePoints / match._possessionMinutes), 30, 70)
    : 50;
  match.score = [...match._score];
  match.penalties = [...match._penalty];
  const matchShots = match._shotMap.map(shots => shots.filter(shot => shot.countsTowardStats !== false));
  const shootoutShots = match._shotMap.map(shots => shots.filter(shot => shot.phase === 'shootout'));
  const serializeShots = shots => shots.map(shot => ({
    ...shot,
    shotArea: { ...shot.shotArea },
    score: [...shot.score],
    penalty: [...shot.penalty],
  }));
  match.shotMap = matchShots.map(serializeShots);
  match.shootoutShotMap = shootoutShots.map(serializeShots);
  match.shotDistribution = matchShots.map(summarizeShotDistribution);
  match.shootoutShotDistribution = shootoutShots.map(summarizeShotDistribution);
  match.stats = [
    {
      ...match._stats[0],
      possession: possessionHome,
      passAccuracy: clamp(Math.round(82 + (match.teams[0].midfield - 75) * .25), 76, 94),
      expectedGoals: match.shotDistribution[0].expectedGoals,
      shotDistribution: match.shotDistribution[0],
    },
    {
      ...match._stats[1],
      possession: 100 - possessionHome,
      passAccuracy: clamp(Math.round(82 + (match.teams[1].midfield - 75) * .25), 76, 94),
      expectedGoals: match.shotDistribution[1].expectedGoals,
      shotDistribution: match.shotDistribution[1],
    },
  ];
}

function percent(value, total) {
  return Number((total > 0 ? value / total * 100 : 0).toFixed(1));
}

function mentalitySummary(match, room, side) {
  const player = room.players[side];
  const timeline = [{ minute: 0, mentality: 'balanced', label: MENTALITIES.balanced.name }];
  for (const intervention of match.interventions) {
    const submission = intervention.submissions.find(item => item.playerId === player.id);
    if (!submission) continue;
    timeline.push({
      minute: intervention.minute,
      mentality: submission.mentality,
      label: MENTALITIES[submission.mentality].name,
      score: [...intervention.score],
      submitted: submission.submitted,
    });
  }
  return {
    final: player.mentality || 'balanced',
    finalLabel: MENTALITIES[player.mentality || 'balanced'].name,
    timeline,
  };
}

function substitutionSummary(match, side) {
  const goalEvents = match.events.filter(event => event.type === 'goal');
  return match.substitutions[side].map(substitution => {
    const incoming = PLAYER_BY_ID[substitution.inCardId];
    const outgoing = PLAYER_BY_ID[substitution.outCardId];
    return {
      ...substitution,
      incomingName: incoming.name,
      outgoingName: outgoing.name,
      goals: goalEvents.filter(event => event.side === side && event.playerId === incoming.id).length,
      assists: goalEvents.filter(event => event.side === side && event.assistId === incoming.id).length,
    };
  });
}

function teamRecap(room, match, side, winnerSide) {
  const player = room.players[side];
  const stats = match.stats[side];
  const team = match.teams[side];
  const substitutions = substitutionSummary(match, side);
  const goals = match.score[side];
  const averageRating = match.playerRatings[side].length
    ? match.playerRatings[side].reduce((sum, item) => sum + item.rating * item.minutesPlayed, 0)
      / Math.max(1, match.playerRatings[side].reduce((sum, item) => sum + item.minutesPlayed, 0))
    : 0;
  return {
    side,
    playerId: player.id,
    name: player.name,
    result: side === winnerSide ? 'win' : 'loss',
    score: goals,
    expectedGoals: stats.expectedGoals,
    shots: stats.shots,
    onTarget: stats.onTarget,
    shotEfficiency: {
      conversionRate: percent(goals, stats.shots),
      onTargetRate: percent(stats.onTarget, stats.shots),
      xGPerShot: Number((stats.shots ? stats.expectedGoals / stats.shots : 0).toFixed(3)),
      goalsMinusXG: Number((goals - stats.expectedGoals).toFixed(2)),
    },
    positionFit: {
      score: team.positionFit.score,
      naturalCount: team.positionFit.naturalCount,
      adaptedCount: team.positionFit.adaptedCount,
      outOfPositionCount: team.positionFit.outOfPositionCount,
    },
    chemistry: {
      score: team.chemistry.score,
      links: { ...team.chemistry.links },
    },
    tactic: {
      id: player.tactic,
      name: TACTICS[player.tactic].name,
      finalStatus: team.tacticalMatchup?.status || 'neutral',
      phases: match.tacticalPhases.map(phase => ({
        segment: phase.segment,
        status: phase.teams[side].tacticalStatus,
      })),
    },
    mentality: mentalitySummary(match, room, side),
    substitutions: {
      used: substitutions.length,
      goalContributions: substitutions.reduce((sum, item) => sum + item.goals + item.assists, 0),
      changes: substitutions,
    },
    averageRating: Number(averageRating.toFixed(2)),
  };
}

function tacticalRecap(room, match, winnerSide) {
  const phases = match.tacticalPhases.map(phase => ({
    segment: phase.segment,
    fromMinute: phase.fromMinute,
    toMinute: phase.toMinute,
    mentalities: [...phase.mentalities],
    advantagedSide: phase.matchup?.winnerSide ?? null,
    disadvantagedSide: phase.matchup?.loserSide ?? null,
    title: phase.matchup?.title || '战术均势',
    explanation: phase.matchup?.explanation || '双方战术没有形成直接克制。',
    teams: phase.teams.map(team => ({ ...team })),
  }));
  const advantagedSides = phases.map(phase => phase.advantagedSide).filter(side => side !== null);
  const stableAdvantagedSide = advantagedSides.length && advantagedSides.every(side => side === advantagedSides[0])
    ? advantagedSides[0]
    : null;
  const convertedToVictory = stableAdvantagedSide !== null ? stableAdvantagedSide === winnerSide : null;
  return {
    status: stableAdvantagedSide === null ? 'neutral-or-mixed' : 'stable-advantage',
    advantagedSide: stableAdvantagedSide,
    disadvantagedSide: stableAdvantagedSide === null ? null : 1 - stableAdvantagedSide,
    convertedToVictory,
    summary: stableAdvantagedSide === null
      ? '双方没有形成持续、明确的战术克制关系。'
      : convertedToVictory
        ? `${room.players[stableAdvantagedSide].name}将战术克制优势转化为胜势。`
        : `${room.players[stableAdvantagedSide].name}形成战术优势，但未能将优势转化为胜利。`,
    phases,
  };
}

function lossReason(code, category, label, detail, weight, metrics = {}) {
  return { code, category, label, detail, weight: Math.round(weight), metrics };
}

function buildLossAnalysis(room, match, teamSummaries, tacticalSummary, winnerSide) {
  const loserSide = 1 - winnerSide;
  const winner = teamSummaries[winnerSide];
  const loser = teamSummaries[loserSide];
  const reasons = [];
  const xgGap = winner.expectedGoals - loser.expectedGoals;
  const conversionGap = winner.shotEfficiency.conversionRate - loser.shotEfficiency.conversionRate;
  const fitGap = winner.positionFit.score - loser.positionFit.score;
  const chemistryGap = winner.chemistry.score - loser.chemistry.score;

  if (match.decision === 'penalties') {
    reasons.push(lossReason(
      'penalty-shootout',
      'score',
      '点球决胜失利',
      `双方在120分钟内战平，${loser.name}在点球大战中以 ${match.penalties[loserSide]} - ${match.penalties[winnerSide]} 落败。`,
      100,
      { penalties: [...match.penalties] },
    ));
  }

  if (xgGap >= .25) {
    reasons.push(lossReason(
      'xg-deficit',
      'chance-creation',
      '高质量机会不足',
      `${loser.name}的预期进球为 ${loser.expectedGoals}，低于对手的 ${winner.expectedGoals}。`,
      62 + xgGap * 12,
      { loserXG: loser.expectedGoals, winnerXG: winner.expectedGoals, gap: Number(xgGap.toFixed(2)) },
    ));
  } else if (loser.expectedGoals - winner.expectedGoals >= .25 && loser.result === 'loss') {
    reasons.push(lossReason(
      'xg-not-converted',
      'finishing',
      '机会未能兑现',
      `${loser.name}创造了更多预期进球，却未能把场面优势转化为比分。`,
      78,
      { loserXG: loser.expectedGoals, winnerXG: winner.expectedGoals },
    ));
  }

  if (conversionGap >= 5 || loser.shotEfficiency.goalsMinusXG <= -.35) {
    reasons.push(lossReason(
      'finishing-efficiency',
      'finishing',
      '终结效率落后',
      `${loser.name}射门转化率 ${loser.shotEfficiency.conversionRate}%，对手为 ${winner.shotEfficiency.conversionRate}%。`,
      58 + Math.max(0, conversionGap),
      {
        loserConversionRate: loser.shotEfficiency.conversionRate,
        winnerConversionRate: winner.shotEfficiency.conversionRate,
        loserGoalsMinusXG: loser.shotEfficiency.goalsMinusXG,
      },
    ));
  }

  if (fitGap >= 4) {
    reasons.push(lossReason(
      'position-fit-gap',
      'lineup',
      '位置适配处于劣势',
      `${loser.name}的位置适配为 ${loser.positionFit.score}，比对手低 ${fitGap} 点。`,
      42 + fitGap,
      { loser: loser.positionFit.score, winner: winner.positionFit.score, gap: fitGap },
    ));
  }

  if (chemistryGap >= 5) {
    reasons.push(lossReason(
      'chemistry-gap',
      'lineup',
      '球队默契不足',
      `${loser.name}的默契为 ${loser.chemistry.score}，对手为 ${winner.chemistry.score}。`,
      38 + chemistryGap,
      { loser: loser.chemistry.score, winner: winner.chemistry.score, gap: chemistryGap },
    ));
  }

  const counteredPhases = tacticalSummary.phases.filter(phase => phase.disadvantagedSide === loserSide);
  if (counteredPhases.length) {
    reasons.push(lossReason(
      'tactically-countered',
      'tactics',
      '战术受到克制',
      `${loser.name}在 ${counteredPhases.map(phase => `${phase.fromMinute}-${phase.toMinute}分钟`).join('、')} 受到对手战术克制。`,
      64,
      { phases: counteredPhases.map(phase => phase.segment), advantagedSide: winnerSide },
    ));
  }

  const conservativeWhileTrailing = match.interventions.some(intervention => {
    const submission = intervention.submissions.find(item => item.playerId === loser.playerId);
    return submission?.mentality === 'defensive' && intervention.score[loserSide] < intervention.score[winnerSide];
  });
  if (conservativeWhileTrailing) {
    reasons.push(lossReason(
      'conservative-while-trailing',
      'mentality',
      '落后时调整偏保守',
      `${loser.name}在落后阶段选择稳守反击，追平所需的进攻投入不足。`,
      48,
    ));
  }

  const attackingRisk = [...match.interventions].reverse().find(intervention => {
    const submission = intervention.submissions.find(item => item.playerId === loser.playerId);
    return submission?.mentality === 'attacking' && match.score[winnerSide] > intervention.score[winnerSide];
  });
  if (attackingRisk) {
    reasons.push(lossReason(
      'attacking-risk',
      'mentality',
      '压上后的防守风险',
      `${loser.name}在 ${attackingRisk.minute} 分钟转为全力进攻后仍有失球，阵型前压带来了防守空间。`,
      44,
    ));
  }

  if (winner.substitutions.goalContributions > loser.substitutions.goalContributions) {
    reasons.push(lossReason(
      'substitution-impact',
      'substitutions',
      '换人贡献不及对手',
      `对手替补贡献 ${winner.substitutions.goalContributions} 次进球参与，${loser.name}替补贡献 ${loser.substitutions.goalContributions} 次。`,
      52,
      { loser: loser.substitutions.goalContributions, winner: winner.substitutions.goalContributions },
    ));
  } else if (loser.substitutions.used === 0 && winner.substitutions.used > 0) {
    reasons.push(lossReason(
      'limited-substitutions',
      'substitutions',
      '临场换人不足',
      `${loser.name}没有使用换人，对手完成了 ${winner.substitutions.used} 次人员调整。`,
      30,
      { loserUsed: 0, winnerUsed: winner.substitutions.used },
    ));
  }

  if (!reasons.length) {
    reasons.push(lossReason(
      'fine-margins',
      'score',
      '胜负取决于关键细节',
      `双方核心指标接近，${loser.name}在关键回合的处理稍逊一筹。`,
      35,
    ));
  }

  reasons.sort((a, b) => {
    if (a.code === 'penalty-shootout') return -1;
    if (b.code === 'penalty-shootout') return 1;
    return b.weight - a.weight;
  });
  return {
    loserSide,
    loserId: loser.playerId,
    primaryReason: reasons[0],
    reasons,
    summary: `${loser.name}失利的首要因素是“${reasons[0].label}”。${reasons[0].detail}`,
  };
}

function buildMatchRecap(room, match) {
  const winnerSide = room.players.findIndex(player => player.id === match.winnerId);
  const teams = room.players.map((_, side) => teamRecap(room, match, side, winnerSide));
  const tacticalSummary = tacticalRecap(room, match, winnerSide);
  const loserAnalysis = buildLossAnalysis(room, match, teams, tacticalSummary, winnerSide);
  return {
    version: 1,
    result: {
      winnerSide,
      loserSide: 1 - winnerSide,
      decision: match.decision,
      score: [...match.score],
      regularScore: [...match.regularScore],
      extraScore: [...match.extraScore],
      penalties: [...match.penalties],
    },
    tacticalSummary,
    teams,
    decisiveFactors: loserAnalysis.reasons.slice(0, 4),
    loserAnalysis,
  };
}

function simulateRange(room, match, { from, to, durationMs, revealBase, key }) {
  const random = mulberry32(hashSeed(`${match.seed}|${key}|${match.interventions.length}|${room.players.map(player => `${player.mentality}:${player.lineup.map(item => item?.cardId).join(',')}`).join('|')}`));
  const computed = computeMatchTeams(room.players);
  match.teams = computed.teams;
  match.tacticalMatchup = computed.tacticalMatchup;
  const teams = match.teams;
  const possessionHome = clamp(Math.round(50 + (teams[0].midfield - teams[1].midfield) * .55 + teams[0].possessionBias - teams[1].possessionBias), 30, 70);
  const rangeMinutes = to - from + 1;
  match._possessionHomePoints += possessionHome * rangeMinutes;
  match._possessionMinutes += rangeMinutes;

  let minute = from + 2 + Math.floor(random() * 3);
  while (minute <= to) {
    const side = random() < possessionHome / 100 ? 0 : 1;
    const other = 1 - side;
    const attacker = weightedAttacker(room.players[side], random);
    const defender = weightedDefender(room.players[other], random);
    if (!attacker || !defender) break;
    const chanceQuality = clamp(
      .09
      + (teams[side].attack - teams[other].defense) / 520
      + (teams[side].overall - teams[other].overall) / 900
      + teams[side].chanceBonus,
      .03,
      .24,
    );
    const revealAt = revealBase + 500 + (minute - from + 1) / rangeMinutes * Math.max(1_000, durationMs - 1_000);
    const roll = random();
    const shotProfile = roll < chanceQuality + .4
      ? normalShotProfile(match, key, side, minute, attacker.card, teams, chanceQuality)
      : null;

    if (roll < chanceQuality) {
      match._score[side] += 1;
      match._stats[side].shots += 1;
      match._stats[side].onTarget += 1;
      const assist = weightedAttacker(room.players[side], random);
      addShotEvent(match, {
        revealAt,
        clock: `${minute}′`,
        type: 'goal',
        eventSide: side,
        attackingSide: side,
        text: `${attacker.card.name}冷静终结！${room.players[side].name}取得进球。`,
        important: true,
        shooter: attacker.card,
        outcome: 'goal',
        profile: shotProfile,
        detail: {
          playerId: attacker.card.id,
          assistId: assist?.card.id === attacker.card.id ? null : assist?.card.id,
        },
      });
    } else if (roll < chanceQuality + .19) {
      match._stats[side].shots += 1;
      match._stats[side].onTarget += 1;
      match._stats[other].saves += 1;
      const keeperSlot = room.players[other].lineup.find((_, index) => FORMATIONS[room.players[other].formation].slots[index].role === 'GK');
      const keeperName = keeperSlot ? PLAYER_BY_ID[keeperSlot.cardId].name : defender.card.name;
      addShotEvent(match, {
        revealAt,
        clock: `${minute}′`,
        type: 'save',
        eventSide: other,
        attackingSide: side,
        text: `${attacker.card.name}的射门直奔死角，${keeperName}做出关键扑救！`,
        important: true,
        shooter: attacker.card,
        outcome: 'saved',
        profile: shotProfile,
        detail: { playerId: keeperSlot?.cardId, keeperId: keeperSlot?.cardId },
      });
    } else if (roll < chanceQuality + .4) {
      match._stats[side].shots += 1;
      if (random() < .3) match._stats[side].corners += 1;
      addShotEvent(match, {
        revealAt,
        clock: `${minute}′`,
        type: 'shot',
        eventSide: side,
        attackingSide: side,
        text: `${attacker.card.name}获得起脚空间，皮球稍稍偏出。`,
        shooter: attacker.card,
        outcome: 'off-target',
        profile: shotProfile,
        detail: { playerId: attacker.card.id },
      });
    } else if (roll < chanceQuality + .52) {
      match._stats[other].fouls += 1;
      if (random() < .42) {
        match._stats[other].yellow += 1;
        addMatchEvent(match, revealAt, `${minute}′`, 'card', other, `${defender.card.name}阻断反击，被出示黄牌。`, true, { playerId: defender.card.id });
      } else {
        addMatchEvent(match, revealAt, `${minute}′`, 'foul', other, `${defender.card.name}战术犯规，比赛短暂中断。`, false, { playerId: defender.card.id });
      }
    } else {
      addMatchEvent(match, revealAt, `${minute}′`, 'play', side, `${room.players[side].name}在中场连续传递，尝试寻找防线空当。`);
    }
    minute += 4 + Math.floor(random() * 4);
  }
  refreshMatchStats(match);
  return random;
}

function finishMatchSimulation(room, match, regularDurationMs, revealBase) {
  const regularScore = [...match._score];
  match.regularScore = regularScore;
  let decision = 'regular';
  let extraDurationMs = 0;
  let penaltyDurationMs = 0;
  let random = mulberry32(hashSeed(`${match.seed}|finish`));

  if (match._score[0] === match._score[1]) {
    decision = 'extra';
    extraDurationMs = 8_000;
    addMatchEvent(match, revealBase + regularDurationMs - 100, '90′', 'phase', null, `常规时间战成 ${match._score[0]} - ${match._score[1]}，进入加时赛！`, true);
    random = simulateRange(room, match, { from: 91, to: 105, durationMs: 4_000, revealBase: revealBase + regularDurationMs, key: 'extra-one' });
    addMatchEvent(match, revealBase + regularDurationMs + 3_900, '105′', 'phase', null, '加时赛半场结束，双方交换场地。', true);
    random = simulateRange(room, match, { from: 106, to: 120, durationMs: 4_000, revealBase: revealBase + regularDurationMs + 4_000, key: 'extra-two' });
  }

  match.extraScore = [...match._score];
  if (match._score[0] === match._score[1]) {
    decision = 'penalties';
    penaltyDurationMs = 6_000;
    const penaltyBase = revealBase + regularDurationMs + extraDurationMs;
    addMatchEvent(match, penaltyBase, '120′', 'phase', null, `加时赛仍为 ${match._score[0]} - ${match._score[1]}，点球大战开始！`, true);
    let round = 0;
    let resolved = false;
    let kickIndex = 0;
    while (!resolved) {
      round += 1;
      for (let side = 0; side < 2; side += 1) {
        const kicker = weightedAttacker(room.players[side], random);
        const shooting = kicker.card.stats.sho;
        const scoringChance = clamp(.71 + (shooting - match.teams[1 - side].keeper) / 260, .55, .9);
        let scored = random() < scoringChance;
        if (round >= 9 && side === 1 && match._penalty[0] === match._penalty[1]) scored = random() < .45;
        if (scored) match._penalty[side] += 1;
        kickIndex += 1;
        addShotEvent(match, {
          revealAt: penaltyBase + Math.min(5_500, kickIndex * 420),
          clock: `点球${round}`,
          type: scored ? 'penalty-goal' : 'penalty-miss',
          eventSide: side,
          attackingSide: side,
          text: scored
            ? `${kicker.card.name}主罚命中，点球比分 ${match._penalty[0]} - ${match._penalty[1]}。`
            : `${kicker.card.name}罚失点球！点球比分 ${match._penalty[0]} - ${match._penalty[1]}。`,
          important: true,
          shooter: kicker.card,
          outcome: scored ? 'penalty-goal' : 'penalty-miss',
          profile: penaltyShotProfile(match, side, round, scoringChance),
          phase: 'shootout',
          countsTowardStats: false,
          detail: { playerId: kicker.card.id, penaltyRound: round },
        });

        if (round <= 5) {
          const homeRemaining = 5 - round;
          const awayRemaining = 5 - round + (side === 0 ? 1 : 0);
          if (match._penalty[0] > match._penalty[1] + awayRemaining || match._penalty[1] > match._penalty[0] + homeRemaining) {
            resolved = true;
            break;
          }
        } else if (side === 1 && match._penalty[0] !== match._penalty[1]) {
          resolved = true;
          break;
        }
      }
      if (round >= 10 && match._penalty[0] === match._penalty[1]) {
        const finalSide = Math.floor(random() * 2);
        const finalKicker = weightedAttacker(room.players[finalSide], random);
        match._penalty[finalSide] += 1;
        addShotEvent(match, {
          revealAt: penaltyBase + 5_700,
          clock: `点球${round + 1}`,
          type: 'penalty-goal',
          eventSide: finalSide,
          attackingSide: finalSide,
          text: `${finalKicker.card.name}打入终极点球！点球比分 ${match._penalty[0]} - ${match._penalty[1]}。`,
          important: true,
          shooter: finalKicker.card,
          outcome: 'penalty-goal',
          profile: penaltyShotProfile(match, finalSide, round + 1, .76),
          phase: 'shootout',
          countsTowardStats: false,
          detail: { playerId: finalKicker.card.id, penaltyRound: round + 1 },
        });
        resolved = true;
      }
    }
  }

  match.decision = decision;
  match.score = [...match._score];
  match.penalties = [...match._penalty];
  const winnerIndex = decision === 'penalties'
    ? (match._penalty[0] > match._penalty[1] ? 0 : 1)
    : (match._score[0] > match._score[1] ? 0 : 1);
  const winner = room.players[winnerIndex];
  const loser = room.players[1 - winnerIndex];
  const finalDuration = regularDurationMs + extraDurationMs + penaltyDurationMs;
  addMatchEvent(match, revealBase + finalDuration - 250, decision === 'penalties' ? '点球结束' : decision === 'extra' ? '120′' : '90′', 'phase', winnerIndex,
    decision === 'penalties'
      ? `比赛结束！${winner.name}点球 ${match._penalty[winnerIndex]} - ${match._penalty[1 - winnerIndex]} 获胜。`
      : `比赛结束！${winner.name}以 ${match._score[winnerIndex]} - ${match._score[1 - winnerIndex]} 获胜。`, true);

  match.winnerId = winner.id;
  match.loserId = loser.id;
  const goalScorers = match.events.filter(event => event.type === 'goal');
  const finalMinute = decision === 'regular' ? 90 : 120;
  match.playerRatings = room.players.map((player, side) => [...match._participants[side]].map(cardId => {
    const card = PLAYER_BY_ID[cardId];
    const goals = goalScorers.filter(event => event.side === side && event.playerId === card.id).length;
    const assists = goalScorers.filter(event => event.side === side && event.assistId === card.id).length;
    const startingSlot = match._startingLineups[side].indexOf(cardId);
    const started = startingSlot >= 0;
    const entered = match.substitutions[side].find(item => item.inCardId === cardId);
    const departed = match.substitutions[side].find(item => item.outCardId === cardId);
    const onMinute = started ? 0 : entered?.minute ?? 0;
    const offMinute = departed?.minute ?? null;
    const minutesPlayed = Math.max(0, (offMinute ?? finalMinute) - onMinute);
    const base = 6.1 + (playerOverall(card) - 82) / 20 + goals * 1.1 + assists * .55 + (random() - .5) * .6;
    return {
      cardId: card.id,
      rating: Number(clamp(base, 5.7, 10).toFixed(1)),
      goals,
      assists,
      startingSlot: started ? startingSlot : null,
      started,
      onMinute,
      offMinute,
      minutesPlayed,
    };
  }));
  const allRatings = match.playerRatings.flatMap((items, side) => items.map(item => ({ ...item, side })));
  allRatings.sort((a, b) => b.rating - a.rating);
  match.manOfMatch = allRatings[0];
  match.finalized = true;
  refreshMatchStats(match);
  match.recap = buildMatchRecap(room, match);
  return finalDuration;
}

function startMatchSegment(room, match, segmentIndex) {
  const segment = MATCH_SEGMENTS[segmentIndex];
  const now = Date.now();
  const segmentStartedAt = segmentIndex === 0 ? match.startedAt : now;
  const revealBase = match._elapsedBaseMs;
  const computed = computeMatchTeams(room.players);
  match.teams = computed.teams;
  match.tacticalMatchup = computed.tacticalMatchup;
  match.currentSegmentIndex = segmentIndex;
  match.currentSegment = segment.id;
  match.playState = 'playing';
  match.segmentStartedAt = segmentStartedAt;
  match.tacticalPhases.push({
    segment: segment.id,
    fromMinute: segment.from,
    toMinute: segment.to,
    mentalities: room.players.map(player => player.mentality || 'balanced'),
    matchup: match.tacticalMatchup ? {
      ...match.tacticalMatchup,
      bonus: { ...match.tacticalMatchup.bonus },
    } : null,
    teams: match.teams.map((team, side) => ({
      side,
      tactic: room.players[side].tactic,
      mentality: room.players[side].mentality || 'balanced',
      tacticalStatus: team.tacticalMatchup?.status || 'neutral',
      attack: Number(team.attack.toFixed(2)),
      midfield: Number(team.midfield.toFixed(2)),
      defense: Number(team.defense.toFixed(2)),
      positionFit: team.positionFit.score,
      chemistry: team.chemistry.score,
    })),
  });

  if (segmentIndex === 0) {
    addMatchEvent(match, revealBase + 300, '0′', 'phase', null, `比赛开始！${room.players[0].name} 对阵 ${room.players[1].name}。`, true);
    if (match.tacticalMatchup) {
      addMatchEvent(match, revealBase + 750, '0′', 'tactical', match.tacticalMatchup.winnerSide,
        `${match.tacticalMatchup.title}：${match.tacticalMatchup.explanation}`, true);
    }
  }

  simulateRange(room, match, { ...segment, revealBase, key: segment.id });
  let segmentDurationMs = segment.durationMs;
  if (segment.interventionMinute) {
    const label = segment.interventionMinute === 45 ? '半场结束' : '比赛进入关键阶段';
    addMatchEvent(match, revealBase + segment.durationMs - 200, `${segment.interventionMinute}′`, 'phase', null,
      `${label}，比分 ${match._score[0]} - ${match._score[1]}，教练调整窗口即将开启。`, true);
  } else {
    segmentDurationMs = finishMatchSimulation(room, match, segment.durationMs, revealBase);
  }

  match.currentSegmentDurationMs = segmentDurationMs;
  match.segmentEndsAt = segmentStartedAt + segmentDurationMs;
  match.durationMs = Math.max(match.durationMs, revealBase + segmentDurationMs);
  refreshMatchStats(match);
}

function generateMatch(room) {
  const id = randomUUID();
  const startedAt = Date.now() + 1_500;
  const match = {
    id,
    seed: hashSeed(`${room.code}-${Date.now()}-${room.players.map(player => player.lineup.map(item => item?.cardId).join()).join('|')}`),
    startedAt,
    durationMs: MATCH_SEGMENTS.reduce((sum, segment) => sum + segment.durationMs, 0),
    playState: 'playing',
    currentSegment: null,
    currentSegmentIndex: 0,
    segmentStartedAt: startedAt,
    segmentEndsAt: startedAt,
    currentSegmentDurationMs: 0,
    decision: null,
    score: [0, 0],
    regularScore: null,
    extraScore: null,
    penalties: [0, 0],
    winnerId: null,
    loserId: null,
    events: [],
    teams: [],
    stats: [],
    playerRatings: [[], []],
    manOfMatch: null,
    tacticalMatchup: null,
    tacticalPhases: [],
    interventions: [],
    currentWindow: null,
    substitutions: [[], []],
    mentalities: room.players.map(player => player.mentality || 'balanced'),
    shotMap: [[], []],
    shotDistribution: [null, null],
    shootoutShotMap: [[], []],
    shootoutShotDistribution: [null, null],
    recap: null,
    finalized: false,
    _score: [0, 0],
    _penalty: [0, 0],
    _stats: [
      { shots: 0, onTarget: 0, corners: 0, fouls: 0, saves: 0, yellow: 0 },
      { shots: 0, onTarget: 0, corners: 0, fouls: 0, saves: 0, yellow: 0 },
    ],
    _possessionHomePoints: 0,
    _possessionMinutes: 0,
    _shotMap: [[], []],
    _elapsedBaseMs: 0,
    _pauseStartedAt: null,
    _participants: room.players.map(player => new Set(player.lineup.filter(Boolean).map(item => item.cardId))),
    _startingLineups: room.players.map(player => player.lineup.map(item => item?.cardId || null)),
  };
  startMatchSegment(room, match, 0);
  return match;
}

function validateInterventionSubmission(room, player, payload = {}) {
  const match = room.match;
  if (!match?.currentWindow || match.playState !== 'intervention') throw new ApiError(409, '当前没有可提交的教练调整窗口');
  const mentality = String(payload.mentality || 'balanced');
  if (!MENTALITIES[mentality]) throw new ApiError(400, '不支持这个比赛心态');
  const hasOutSlot = payload.outSlot !== undefined && payload.outSlot !== null && payload.outSlot !== '';
  const hasIncoming = payload.inCardId !== undefined && payload.inCardId !== null && payload.inCardId !== '';
  if (hasOutSlot !== hasIncoming) throw new ApiError(400, '换人必须同时指定离场位置和替补球员');

  const submission = { mentality, outSlot: null, inCardId: null, submittedAt: Date.now() };
  if (!hasOutSlot) return submission;
  const side = room.players.findIndex(item => item.id === player.id);
  if (match.substitutions[side].length >= MAX_SUBSTITUTIONS) throw new ApiError(400, '本场换人名额已经用完');
  const outSlot = Number(payload.outSlot);
  const incoming = PLAYER_BY_ID[payload.inCardId];
  if (!Number.isInteger(outSlot) || outSlot < 0 || outSlot > 10 || !player.lineup[outSlot]) throw new ApiError(400, '离场位置不正确');
  if (!incoming || !(player.inventory[incoming.id] > 0)) throw new ApiError(400, '替补席中没有这名球员');
  if (player.lineup.some(item => item?.cardId === incoming.id)) throw new ApiError(400, '替补球员已经在场上');
  if (match.substitutions[side].some(item => item.outCardId === incoming.id)) throw new ApiError(400, '已经被换下的球员不能重新登场');
  const resultingNames = player.lineup.map((item, index) => PLAYER_BY_ID[index === outSlot ? incoming.id : item.cardId].name);
  if (new Set(resultingNames).size !== resultingNames.length) throw new ApiError(400, '换人后阵容不能出现同名球员');
  return { ...submission, outSlot, inCardId: incoming.id };
}

function botIntervention(room, player) {
  const match = room.match;
  const side = room.players.findIndex(item => item.id === player.id);
  const scoreDifference = match._score[side] - match._score[1 - side];
  const mentality = scoreDifference < 0 ? 'attacking' : scoreDifference > 0 ? 'defensive' : 'balanced';
  if (match.substitutions[side].length >= MAX_SUBSTITUTIONS) return { mentality, outSlot: null, inCardId: null, submittedAt: Date.now() };
  const formation = FORMATIONS[player.formation];
  const onField = new Set(player.lineup.map(item => item.cardId));
  const unavailable = new Set(match.substitutions[side].map(item => item.outCardId));
  const lineupNames = new Set(player.lineup.map(item => PLAYER_BY_ID[item.cardId].name));
  const bench = inventoryItems(player)
    .map(item => PLAYER_BY_ID[item.cardId])
    .filter(card => !onField.has(card.id) && !unavailable.has(card.id) && !lineupNames.has(card.name));
  let best = null;
  player.lineup.forEach((item, outSlot) => {
    const outgoing = PLAYER_BY_ID[item.cardId];
    const outgoingScore = playerOverall(outgoing) * roleFit(outgoing, formation.slots[outSlot]);
    for (const incoming of bench) {
      const gain = playerOverall(incoming) * roleFit(incoming, formation.slots[outSlot]) - outgoingScore;
      if (!best || gain > best.gain) best = { gain, outSlot, inCardId: incoming.id };
    }
  });
  return best?.gain > 1
    ? { mentality, outSlot: best.outSlot, inCardId: best.inCardId, submittedAt: Date.now() }
    : { mentality, outSlot: null, inCardId: null, submittedAt: Date.now() };
}

function openInterventionWindow(room, minute) {
  const match = room.match;
  const now = Date.now();
  match.playState = 'intervention';
  match._pauseStartedAt = match.segmentEndsAt;
  match.currentWindow = {
    id: `${match.id}-${minute}`,
    minute,
    openedAt: now,
    deadlineAt: now + INTERVENTION_TIMEOUT_MS,
    submissions: {},
  };
  room.players.forEach(player => {
    if (player.bot) match.currentWindow.submissions[player.id] = botIntervention(room, player);
  });
}

function resolveIntervention(room, reason) {
  const match = room.match;
  const window = match.currentWindow;
  if (!window) return;
  const resolved = [];
  room.players.forEach((player, side) => {
    const submission = window.submissions[player.id] || {
      mentality: player.mentality || 'balanced', outSlot: null, inCardId: null, submittedAt: null,
    };
    player.mentality = submission.mentality;
    match.mentalities[side] = submission.mentality;
    let substitution = null;
    if (submission.inCardId !== null && match.substitutions[side].length < MAX_SUBSTITUTIONS) {
      const outCardId = player.lineup[submission.outSlot].cardId;
      player.lineup[submission.outSlot] = { cardId: submission.inCardId };
      substitution = { minute: window.minute, outSlot: submission.outSlot, outCardId, inCardId: submission.inCardId };
      match.substitutions[side].push(substitution);
      match._participants[side].add(submission.inCardId);
    }
    resolved.push({ playerId: player.id, mentality: submission.mentality, substitution, submitted: Boolean(window.submissions[player.id]) });
  });

  const resolvedAt = Date.now();
  match.interventions.push({
    id: window.id,
    minute: window.minute,
    score: [...match._score],
    openedAt: window.openedAt,
    resolvedAt,
    reason,
    submissions: resolved,
  });
  const summary = resolved.map((item, side) => {
    const mentalityName = MENTALITIES[item.mentality].name;
    if (!item.substitution) return `${room.players[side].name}选择${mentalityName}`;
    const outgoing = PLAYER_BY_ID[item.substitution.outCardId].name;
    const incoming = PLAYER_BY_ID[item.substitution.inCardId].name;
    return `${room.players[side].name}选择${mentalityName}，${incoming}换下${outgoing}`;
  }).join('；');
  addMatchEvent(match, match._elapsedBaseMs + 100, `${window.minute}′`, 'intervention', null, `教练调整：${summary}。`, true);
  match.startedAt += Math.max(0, resolvedAt - match._pauseStartedAt);
  match.currentWindow = null;
  match._pauseStartedAt = null;
  startMatchSegment(room, match, match.currentSegmentIndex + 1);
}

function tickMatch(room) {
  const match = room.match;
  if (!match || room.status !== 'playing') return;
  const now = Date.now();
  if (match.playState === 'intervention') {
    const submittedCount = Object.keys(match.currentWindow.submissions).length;
    if (submittedCount >= room.players.length || now >= match.currentWindow.deadlineAt) {
      resolveIntervention(room, submittedCount >= room.players.length ? 'all-submitted' : 'timeout');
    }
    return;
  }
  if (match.playState !== 'playing' || now < match.segmentEndsAt) return;
  match._elapsedBaseMs += match.currentSegmentDurationMs;
  const segment = MATCH_SEGMENTS[match.currentSegmentIndex];
  if (segment.interventionMinute) {
    openInterventionWindow(room, segment.interventionMinute);
  } else {
    match.playState = 'completed';
    room.status = 'finished';
  }
}

function fastForwardMatch(room) {
  let guard = 0;
  while (room.status === 'playing' && guard < 10) {
    guard += 1;
    if (room.match.playState === 'intervention') {
      resolveIntervention(room, 'skipped');
    } else {
      room.match.segmentEndsAt = Date.now() - 1;
      tickMatch(room);
    }
  }
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
    player.mentality = 'balanced';
    player.ready = false;
    player.rematch = false;
    grantStarterSquad(player);
    assignStarterLineup(player);
    if (player.bot) prepareBot(player);
  });
}

function startMatch(room) {
  if (room.status !== 'preparing' || room.players.length < 2) return;
  room.players.forEach(player => {
    if (player.lineup.filter(Boolean).length !== 11) autoLineup(player, true);
    player.mentality = 'balanced';
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
  if (room.status === 'playing' && room.match) tickMatch(room);
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

function getPlayer(room, playerId, authToken) {
  const player = room.players.find(item => item.id === playerId);
  if (!player) throw new ApiError(403, '你不在这个房间中，请重新加入');
  if (!authToken || player.authToken !== authToken) throw new ApiError(403, '登录凭证已失效，请重新加入房间');
  return player;
}

function serializeMatch(room, viewerId) {
  const match = room.match;
  if (!match) return null;
  const now = Date.now();
  const activeSegmentElapsed = match.playState === 'playing'
    ? clamp(now - match.segmentStartedAt, 0, match.currentSegmentDurationMs)
    : 0;
  const elapsedMs = match._elapsedBaseMs + activeSegmentElapsed;
  const publicMatch = Object.fromEntries(Object.entries(match).filter(([key]) => !key.startsWith('_') && key !== 'currentWindow'));
  const window = match.currentWindow;
  const viewer = room.players.find(player => player.id === viewerId);
  const viewerSide = room.players.findIndex(player => player.id === viewerId);
  const submittedPlayerIds = window ? Object.keys(window.submissions) : [];
  const onField = new Set(viewer?.lineup.filter(Boolean).map(item => item.cardId) || []);
  const previouslyRemoved = new Set(viewerSide >= 0 ? match.substitutions[viewerSide].map(item => item.outCardId) : []);
  const lineupNames = new Set(viewer?.lineup.filter(Boolean).map(item => PLAYER_BY_ID[item.cardId].name) || []);
  const bench = viewer ? inventoryItems(viewer)
    .map(item => PLAYER_BY_ID[item.cardId])
    .filter(card => !onField.has(card.id))
    .map(card => ({
      cardId: card.id,
      name: card.name,
      position: card.position,
      preferredPositions: preferredPositions(card),
      overall: playerOverall(card),
      eligible: !previouslyRemoved.has(card.id) && !lineupNames.has(card.name),
    })) : [];

  return {
    ...publicMatch,
    playback: {
      state: match.playState,
      segment: match.currentSegment,
      elapsedMs,
      totalMs: match.durationMs,
      segmentStartedAt: match.segmentStartedAt,
      segmentEndsAt: match.segmentEndsAt,
    },
    interventionWindow: window ? {
      id: window.id,
      minute: window.minute,
      openedAt: window.openedAt,
      deadlineAt: window.deadlineAt,
      remainingMs: Math.max(0, window.deadlineAt - now),
      submittedPlayerIds,
      pendingPlayerIds: room.players.map(player => player.id).filter(id => !submittedPlayerIds.includes(id)),
    } : null,
    viewerIntervention: {
      canSubmit: Boolean(window && viewer && !viewer.bot && !window.submissions[viewerId]),
      submitted: Boolean(window?.submissions[viewerId]),
      submission: window?.submissions[viewerId] || null,
      currentMentality: viewer?.mentality || 'balanced',
      allowedMentalities: Object.values(MENTALITIES).map(item => ({ id: item.id, name: item.name })),
      substitutionsUsed: viewerSide >= 0 ? match.substitutions[viewerSide].length : 0,
      substitutionsRemaining: viewerSide >= 0 ? MAX_SUBSTITUTIONS - match.substitutions[viewerSide].length : 0,
      maxSubstitutions: MAX_SUBSTITUTIONS,
      bench,
    },
  };
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
    players: room.players.map(player => {
      const team = player.lineup.filter(Boolean).length === 11 ? computeTeam(player) : null;
      return {
        id: player.id,
        name: player.name,
        bot: player.bot,
        coins: player.id === viewerId ? player.coins : null,
        formation: player.formation,
        tactic: player.tactic,
        mentality: player.mentality || 'balanced',
        ready: player.ready,
        rematch: player.rematch,
        lineup: room.status === 'preparing' && player.id !== viewerId ? Array(11).fill(null) : player.lineup,
        inventory: player.id === viewerId ? inventoryItems(player) : undefined,
        inventoryCount: inventoryItems(player).reduce((sum, item) => sum + item.quantity, 0),
        uniqueCount: ownedBestByName(player).length,
        teamOverall: team ? Math.round(team.overall) : null,
        positionFit: team?.positionFit || null,
        chemistry: team?.chemistry || null,
      };
    }),
    match: serializeMatch(room, viewerId),
    canAddBot: room.players.length === 1 && room.status === 'preparing',
    viewerReady: viewer?.ready || false,
  };
}

function performAction(room, player, type, payload = {}) {
  if (type === 'skipMatch') {
    if (room.status !== 'playing') throw new ApiError(400, '当前没有正在进行的比赛');
    fastForwardMatch(room);
    return {};
  }

  if (type === 'matchIntervention') {
    if (room.status !== 'playing') throw new ApiError(400, '当前没有正在进行的比赛');
    const submission = validateInterventionSubmission(room, player, payload);
    room.match.currentWindow.submissions[player.id] = submission;
    const allSubmitted = room.players.every(item => room.match.currentWindow.submissions[item.id]);
    const windowId = room.match.currentWindow.id;
    if (allSubmitted) resolveIntervention(room, 'all-submitted');
    return { intervention: { windowId, submitted: true, resolved: allSubmitted } };
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
    sendJson(res, 201, { room: serializeRoom(room, player.id), playerId: player.id, sessionToken: player.authToken });
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
    sendJson(res, 200, { room: serializeRoom(room, player.id), playerId: player.id, sessionToken: player.authToken });
    return;
  }

  if (operation === 'bot' && req.method === 'POST') {
    const body = await readJson(req);
    const requester = getPlayer(room, body.playerId, body.sessionToken);
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
    const sessionToken = url.searchParams.get('sessionToken');
    getPlayer(room, playerId, sessionToken);
    sendJson(res, 200, { room: serializeRoom(room, playerId) });
    return;
  }

  if (operation === 'action' && req.method === 'POST') {
    const body = await readJson(req);
    const player = getPlayer(room, body.playerId, body.sessionToken);
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

// Keep match phases and coaching-window timeouts authoritative on the server,
// even when neither browser happens to poll during a transition.
setInterval(() => {
  for (const room of rooms.values()) tickRoom(room);
}, 250).unref();

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
