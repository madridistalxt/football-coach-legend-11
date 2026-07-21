import { CURRENT_PLAYER_EXPANSION } from './current-player-expansion.mjs';
import { LEGEND_PLAYER_EXPANSION } from './legend-player-expansion.mjs';

const card = (id, name, en, position, era, nation, club, league, tier, weight, stats) => ({
  id, name, en, position, era, nation, club, league, tier, weight, stats,
});

const BASE_PLAYERS = [
  // 现役门将：覆盖五大联赛，以主力与实力派为主，巨星为低概率签位。
  card('courtois', '库尔图瓦', 'Courtois', 'GK', 'current', '比利时', '皇家马德里', '西甲', 'star', 1, { pac: 43, sho: 18, pas: 70, dri: 50, def: 26, phy: 78, gk: 91 }),
  card('alisson', '阿利松', 'Alisson', 'GK', 'current', '巴西', '利物浦', '英超', 'star', 1, { pac: 57, sho: 20, pas: 76, dri: 55, def: 24, phy: 82, gk: 90 }),
  card('kobel', '科贝尔', 'Gregor Kobel', 'GK', 'current', '瑞士', '多特蒙德', '德甲', 'elite', 3, { pac: 48, sho: 17, pas: 69, dri: 49, def: 25, phy: 83, gk: 87 }),
  card('unai-simon', '乌奈·西蒙', 'Unai Simón', 'GK', 'current', '西班牙', '毕尔巴鄂竞技', '西甲', 'elite', 3, { pac: 51, sho: 18, pas: 72, dri: 51, def: 24, phy: 80, gk: 86 }),
  card('chevalier', '舍瓦利耶', 'Lucas Chevalier', 'GK', 'current', '法国', '巴黎圣日耳曼', '法甲', 'elite', 3, { pac: 54, sho: 19, pas: 74, dri: 53, def: 23, phy: 78, gk: 85 }),
  card('verbruggen', '费布鲁亨', 'Bart Verbruggen', 'GK', 'current', '荷兰', '布莱顿', '英超', 'core', 7, { pac: 55, sho: 17, pas: 76, dri: 52, def: 23, phy: 79, gk: 83 }),
  card('kelleher', '凯莱赫', 'Caoimhín Kelleher', 'GK', 'current', '爱尔兰', '布伦特福德', '英超', 'core', 7, { pac: 53, sho: 16, pas: 73, dri: 50, def: 22, phy: 77, gk: 82 }),
  card('petrovic', '彼得罗维奇', 'Djordje Petrović', 'GK', 'current', '塞尔维亚', '伯恩茅斯', '英超', 'core', 7, { pac: 49, sho: 15, pas: 66, dri: 47, def: 22, phy: 82, gk: 81 }),
  card('baumann', '鲍曼', 'Oliver Baumann', 'GK', 'current', '德国', '霍芬海姆', '德甲', 'core', 7, { pac: 45, sho: 16, pas: 68, dri: 48, def: 23, phy: 78, gk: 82 }),
  card('di-gregorio', '迪格雷戈里奥', 'Michele Di Gregorio', 'GK', 'current', '意大利', '尤文图斯', '意甲', 'core', 7, { pac: 48, sho: 16, pas: 70, dri: 49, def: 23, phy: 76, gk: 83 }),
  card('carnesecchi', '卡尔内塞基', 'Marco Carnesecchi', 'GK', 'current', '意大利', '亚特兰大', '意甲', 'core', 7, { pac: 52, sho: 17, pas: 68, dri: 50, def: 22, phy: 80, gk: 82 }),
  card('remiro', '雷米罗', 'Álex Remiro', 'GK', 'current', '西班牙', '皇家社会', '西甲', 'core', 7, { pac: 46, sho: 16, pas: 72, dri: 48, def: 23, phy: 77, gk: 82 }),

  // 现役后卫。
  card('saliba', '萨利巴', 'Saliba', 'DEF', 'current', '法国', '阿森纳', '英超', 'star', 1, { pac: 82, sho: 42, pas: 73, dri: 74, def: 88, phy: 84, gk: 11 }),
  card('hakimi', '阿什拉夫', 'Hakimi', 'DEF', 'current', '摩洛哥', '巴黎圣日耳曼', '法甲', 'star', 1, { pac: 94, sho: 73, pas: 82, dri: 84, def: 78, phy: 80, gk: 9 }),
  card('guehi', '格伊', 'Marc Guéhi', 'DEF', 'current', '英格兰', '水晶宫', '英超', 'elite', 3, { pac: 79, sho: 42, pas: 72, dri: 70, def: 84, phy: 82, gk: 10 }),
  card('buongiorno', '布翁焦尔诺', 'Alessandro Buongiorno', 'DEF', 'current', '意大利', '那不勒斯', '意甲', 'elite', 3, { pac: 76, sho: 43, pas: 70, dri: 68, def: 86, phy: 85, gk: 10 }),
  card('cubarsi', '库巴西', 'Pau Cubarsí', 'DEF', 'current', '西班牙', '巴塞罗那', '西甲', 'elite', 3, { pac: 75, sho: 40, pas: 82, dri: 75, def: 84, phy: 76, gk: 9 }),
  card('murillo', '穆里略', 'Murillo', 'DEF', 'current', '巴西', '诺丁汉森林', '英超', 'core', 7, { pac: 81, sho: 48, pas: 69, dri: 70, def: 82, phy: 84, gk: 9 }),
  card('branthwaite', '布兰斯韦特', 'Jarrad Branthwaite', 'DEF', 'current', '英格兰', '埃弗顿', '英超', 'core', 7, { pac: 74, sho: 45, pas: 66, dri: 64, def: 83, phy: 86, gk: 10 }),
  card('nathan-collins', '内森·科林斯', 'Nathan Collins', 'DEF', 'current', '爱尔兰', '布伦特福德', '英超', 'core', 7, { pac: 73, sho: 47, pas: 68, dri: 65, def: 81, phy: 84, gk: 9 }),
  card('anton', '安东', 'Waldemar Anton', 'DEF', 'current', '德国', '多特蒙德', '德甲', 'core', 7, { pac: 70, sho: 49, pas: 72, dri: 67, def: 81, phy: 82, gk: 10 }),
  card('raum', '劳姆', 'David Raum', 'DEF', 'current', '德国', '莱比锡', '德甲', 'core', 7, { pac: 86, sho: 67, pas: 78, dri: 78, def: 74, phy: 77, gk: 8 }),
  card('cambiaso', '坎比亚索', 'Andrea Cambiaso', 'DEF', 'current', '意大利', '尤文图斯', '意甲', 'core', 7, { pac: 83, sho: 68, pas: 78, dri: 80, def: 76, phy: 75, gk: 8 }),
  card('dani-vivian', '达尼·维维安', 'Dani Vivian', 'DEF', 'current', '西班牙', '毕尔巴鄂竞技', '西甲', 'core', 7, { pac: 72, sho: 44, pas: 68, dri: 65, def: 82, phy: 84, gk: 10 }),

  // 现役中场。
  card('bellingham', '贝林厄姆', 'Bellingham', 'MID', 'current', '英格兰', '皇家马德里', '西甲', 'star', 1, { pac: 82, sho: 86, pas: 88, dri: 90, def: 79, phy: 86, gk: 9 }),
  card('vitinha', '维蒂尼亚', 'Vitinha', 'MID', 'current', '葡萄牙', '巴黎圣日耳曼', '法甲', 'star', 1, { pac: 79, sho: 79, pas: 91, dri: 91, def: 73, phy: 72, gk: 8 }),
  card('barella', '巴雷拉', 'Nicolò Barella', 'MID', 'current', '意大利', '国际米兰', '意甲', 'elite', 3, { pac: 80, sho: 78, pas: 88, dri: 86, def: 78, phy: 79, gk: 9 }),
  card('pavlovic', '帕夫洛维奇', 'Aleksandar Pavlović', 'MID', 'current', '德国', '拜仁慕尼黑', '德甲', 'elite', 3, { pac: 70, sho: 72, pas: 86, dri: 82, def: 79, phy: 78, gk: 9 }),
  card('joao-neves', '若昂·内维斯', 'João Neves', 'MID', 'current', '葡萄牙', '巴黎圣日耳曼', '法甲', 'elite', 3, { pac: 79, sho: 72, pas: 87, dri: 87, def: 81, phy: 77, gk: 8 }),
  card('isco', '伊斯科', 'Isco', 'MID', 'current', '西班牙', '皇家贝蒂斯', '西甲', 'elite', 3, { pac: 69, sho: 80, pas: 89, dri: 91, def: 61, phy: 67, gk: 8 }),
  card('gibbs-white', '吉布斯-怀特', 'Morgan Gibbs-White', 'MID', 'current', '英格兰', '诺丁汉森林', '英超', 'core', 7, { pac: 80, sho: 78, pas: 82, dri: 84, def: 62, phy: 75, gk: 8 }),
  card('damsgaard', '达姆斯高', 'Mikkel Damsgaard', 'MID', 'current', '丹麦', '布伦特福德', '英超', 'core', 7, { pac: 76, sho: 72, pas: 83, dri: 82, def: 58, phy: 65, gk: 8 }),
  card('baleba', '巴莱巴', 'Carlos Baleba', 'MID', 'current', '喀麦隆', '布莱顿', '英超', 'core', 7, { pac: 80, sho: 69, pas: 78, dri: 80, def: 79, phy: 84, gk: 9 }),
  card('elliot-anderson', '埃利奥特·安德森', 'Elliot Anderson', 'MID', 'current', '英格兰', '诺丁汉森林', '英超', 'core', 7, { pac: 76, sho: 71, pas: 80, dri: 81, def: 74, phy: 79, gk: 8 }),
  card('stiller', '斯蒂勒', 'Angelo Stiller', 'MID', 'current', '德国', '斯图加特', '德甲', 'core', 7, { pac: 68, sho: 70, pas: 85, dri: 80, def: 76, phy: 72, gk: 9 }),
  card('ederson-mid', '埃德松', 'Éderson', 'MID', 'current', '巴西', '亚特兰大', '意甲', 'core', 7, { pac: 79, sho: 74, pas: 80, dri: 80, def: 79, phy: 85, gk: 9 }),

  // 现役锋线。
  card('mbappe', '姆巴佩', 'Mbappé', 'FWD', 'current', '法国', '皇家马德里', '西甲', 'star', 1, { pac: 97, sho: 92, pas: 84, dri: 94, def: 36, phy: 80, gk: 7 }),
  card('haaland', '哈兰德', 'Haaland', 'FWD', 'current', '挪威', '曼城', '英超', 'star', 1, { pac: 89, sho: 95, pas: 70, dri: 82, def: 45, phy: 93, gk: 8 }),
  card('bowen', '鲍文', 'Jarrod Bowen', 'FWD', 'current', '英格兰', '西汉姆联', '英超', 'elite', 3, { pac: 85, sho: 84, pas: 78, dri: 84, def: 48, phy: 77, gk: 8 }),
  card('schick', '希克', 'Patrik Schick', 'FWD', 'current', '捷克', '勒沃库森', '德甲', 'elite', 3, { pac: 78, sho: 88, pas: 73, dri: 78, def: 44, phy: 84, gk: 8 }),
  card('moise-kean', '莫伊塞·基恩', 'Moise Kean', 'FWD', 'current', '意大利', '佛罗伦萨', '意甲', 'elite', 3, { pac: 86, sho: 84, pas: 70, dri: 81, def: 39, phy: 84, gk: 8 }),
  card('oyarzabal', '奥亚萨瓦尔', 'Mikel Oyarzabal', 'FWD', 'current', '西班牙', '皇家社会', '西甲', 'elite', 3, { pac: 78, sho: 85, pas: 82, dri: 83, def: 48, phy: 73, gk: 8 }),
  card('barcola', '巴尔科拉', 'Bradley Barcola', 'FWD', 'current', '法国', '巴黎圣日耳曼', '法甲', 'elite', 3, { pac: 92, sho: 81, pas: 79, dri: 88, def: 38, phy: 70, gk: 7 }),
  card('semenyo', '塞门约', 'Antoine Semenyo', 'FWD', 'current', '加纳', '伯恩茅斯', '英超', 'core', 7, { pac: 87, sho: 80, pas: 74, dri: 82, def: 46, phy: 83, gk: 8 }),
  card('igor-thiago', '伊戈尔·蒂亚戈', 'Igor Thiago', 'FWD', 'current', '巴西', '布伦特福德', '英超', 'core', 7, { pac: 78, sho: 82, pas: 68, dri: 75, def: 42, phy: 88, gk: 8 }),
  card('undav', '翁达夫', 'Deniz Undav', 'FWD', 'current', '德国', '斯图加特', '德甲', 'core', 7, { pac: 75, sho: 83, pas: 76, dri: 80, def: 41, phy: 78, gk: 8 }),
  card('santiago-castro', '圣地亚哥·卡斯特罗', 'Santiago Castro', 'FWD', 'current', '阿根廷', '博洛尼亚', '意甲', 'core', 7, { pac: 80, sho: 79, pas: 69, dri: 78, def: 43, phy: 81, gk: 8 }),
  card('ayoze', '阿约泽·佩雷斯', 'Ayoze Pérez', 'FWD', 'current', '西班牙', '比利亚雷亚尔', '西甲', 'core', 7, { pac: 76, sho: 82, pas: 78, dri: 82, def: 44, phy: 70, gk: 8 }),

  // 传奇门将。
  card('yashin', '列夫·雅辛', 'Lev Yashin', 'GK', 'legend', '苏联', '传奇殿堂', '传奇', 'legend', 1, { pac: 58, sho: 18, pas: 75, dri: 55, def: 30, phy: 88, gk: 96 }),
  card('buffon', '布冯', 'Buffon', 'GK', 'legend', '意大利', '传奇殿堂', '传奇', 'legend', 1, { pac: 48, sho: 17, pas: 73, dri: 50, def: 28, phy: 87, gk: 94 }),
  card('casillas', '卡西利亚斯', 'Casillas', 'GK', 'legend', '西班牙', '传奇殿堂', '传奇', 'legend', 1, { pac: 61, sho: 16, pas: 70, dri: 54, def: 27, phy: 79, gk: 93 }),
  card('schmeichel', '舒梅切尔', 'Schmeichel', 'GK', 'legend', '丹麦', '传奇殿堂', '传奇', 'legend', 1, { pac: 52, sho: 19, pas: 71, dri: 49, def: 29, phy: 92, gk: 93 }),
  card('cech', '切赫', 'Čech', 'GK', 'legend', '捷克', '传奇殿堂', '传奇', 'legend', 1, { pac: 47, sho: 15, pas: 69, dri: 48, def: 28, phy: 86, gk: 92 }),

  // 传奇后卫。
  card('maldini', '马尔蒂尼', 'Maldini', 'DEF', 'legend', '意大利', '传奇殿堂', '传奇', 'legend', 1, { pac: 88, sho: 60, pas: 84, dri: 83, def: 96, phy: 88, gk: 10 }),
  card('beckenbauer', '贝肯鲍尔', 'Beckenbauer', 'DEF', 'legend', '德国', '传奇殿堂', '传奇', 'legend', 1, { pac: 84, sho: 76, pas: 91, dri: 87, def: 95, phy: 86, gk: 11 }),
  card('cafu', '卡福', 'Cafu', 'DEF', 'legend', '巴西', '传奇殿堂', '传奇', 'legend', 1, { pac: 94, sho: 71, pas: 88, dri: 89, def: 90, phy: 88, gk: 9 }),
  card('roberto-carlos', '罗伯特·卡洛斯', 'Roberto Carlos', 'DEF', 'legend', '巴西', '传奇殿堂', '传奇', 'legend', 1, { pac: 96, sho: 88, pas: 86, dri: 88, def: 88, phy: 90, gk: 8 }),
  card('baresi', '巴雷西', 'Baresi', 'DEF', 'legend', '意大利', '传奇殿堂', '传奇', 'legend', 1, { pac: 79, sho: 48, pas: 86, dri: 78, def: 96, phy: 84, gk: 10 }),

  // 传奇中场。
  card('zidane', '齐达内', 'Zidane', 'MID', 'legend', '法国', '传奇殿堂', '传奇', 'legend', 1, { pac: 85, sho: 91, pas: 96, dri: 96, def: 72, phy: 86, gk: 9 }),
  card('iniesta', '伊涅斯塔', 'Iniesta', 'MID', 'legend', '西班牙', '传奇殿堂', '传奇', 'legend', 1, { pac: 83, sho: 84, pas: 96, dri: 97, def: 70, phy: 72, gk: 8 }),
  card('xavi', '哈维', 'Xavi', 'MID', 'legend', '西班牙', '传奇殿堂', '传奇', 'legend', 1, { pac: 78, sho: 82, pas: 97, dri: 94, def: 77, phy: 75, gk: 8 }),
  card('matthaus', '马特乌斯', 'Matthäus', 'MID', 'legend', '德国', '传奇殿堂', '传奇', 'legend', 1, { pac: 88, sho: 90, pas: 92, dri: 88, def: 90, phy: 91, gk: 10 }),
  card('pirlo', '皮尔洛', 'Pirlo', 'MID', 'legend', '意大利', '传奇殿堂', '传奇', 'legend', 1, { pac: 73, sho: 85, pas: 97, dri: 91, def: 70, phy: 72, gk: 9 }),

  // 传奇锋线。
  card('pele', '贝利', 'Pelé', 'FWD', 'legend', '巴西', '传奇殿堂', '传奇', 'legend', 1, { pac: 96, sho: 96, pas: 92, dri: 97, def: 56, phy: 87, gk: 8 }),
  card('maradona', '马拉多纳', 'Maradona', 'FWD', 'legend', '阿根廷', '传奇殿堂', '传奇', 'legend', 1, { pac: 94, sho: 95, pas: 95, dri: 99, def: 42, phy: 78, gk: 7 }),
  card('r9', '罗纳尔多', 'Ronaldo Nazário', 'FWD', 'legend', '巴西', '传奇殿堂', '传奇', 'legend', 1, { pac: 98, sho: 97, pas: 86, dri: 98, def: 38, phy: 88, gk: 7 }),
  card('cruyff', '克鲁伊夫', 'Cruyff', 'FWD', 'legend', '荷兰', '传奇殿堂', '传奇', 'legend', 1, { pac: 93, sho: 94, pas: 95, dri: 97, def: 48, phy: 80, gk: 7 }),
  card('puskas', '普斯卡什', 'Puskás', 'FWD', 'legend', '匈牙利', '传奇殿堂', '传奇', 'legend', 1, { pac: 89, sho: 98, pas: 91, dri: 94, def: 44, phy: 84, gk: 8 }),
];

const clampStat = value => Math.max(5, Math.min(99, Math.round(value)));

function statVariation(id, offset) {
  let hash = 0;
  for (const character of `${id}:${offset}`) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return (hash % 9) - 4;
}

function generatedStats(spec) {
  const overall = spec.overallSeed;
  const varied = (base, offset) => clampStat(base + statVariation(spec.id, offset));
  if (spec.position === 'GK') return {
    pac: varied(overall - 22, 1), sho: varied(18, 2), pas: varied(overall - 13, 3),
    dri: varied(overall - 18, 4), def: varied(25, 5), phy: varied(overall - 6, 6), gk: varied(overall + 3, 7),
  };
  if (spec.position === 'DEF') return {
    pac: varied(overall - 1, 1), sho: varied(overall - 25, 2), pas: varied(overall - 7, 3),
    dri: varied(overall - 8, 4), def: varied(overall + 3, 5), phy: varied(overall + 1, 6), gk: varied(9, 7),
  };
  if (spec.position === 'MID') return {
    pac: varied(overall - 4, 1), sho: varied(overall - 5, 2), pas: varied(overall + 3, 3),
    dri: varied(overall + 2, 4), def: varied(overall - 10, 5), phy: varied(overall - 5, 6), gk: varied(8, 7),
  };
  return {
    pac: varied(overall + 2, 1), sho: varied(overall + 3, 2), pas: varied(overall - 6, 3),
    dri: varied(overall + 1, 4), def: varied(overall - 37, 5), phy: varied(overall - 4, 6), gk: varied(7, 7),
  };
}

function expandedCard(spec, era) {
  return card(
    spec.id,
    spec.name,
    spec.en,
    spec.position,
    era,
    spec.nation,
    era === 'legend' ? '传奇殿堂' : spec.club,
    era === 'legend' ? '传奇' : spec.league,
    spec.tier,
    spec.weight,
    generatedStats(spec),
  );
}

export const PLAYERS = [
  ...BASE_PLAYERS,
  ...CURRENT_PLAYER_EXPANSION.map(spec => expandedCard(spec, 'current')),
  ...LEGEND_PLAYER_EXPANSION.map(spec => expandedCard(spec, 'legend')),
];

// 仅在倒计时结束且阵容人数不足时用于补位，不会进入任何卡包。
export const ACADEMY_PLAYERS = [
  card('academy-gk', '青训门将', 'Academy Keeper', 'GK', 'academy', '青训营', '教练学院', '青训', 'academy', 0, { pac: 50, sho: 20, pas: 55, dri: 48, def: 40, phy: 58, gk: 58 }),
  card('academy-def-1', '青训左卫', 'Academy Left Back', 'DEF', 'academy', '青训营', '教练学院', '青训', 'academy', 0, { pac: 60, sho: 44, pas: 55, dri: 54, def: 57, phy: 58, gk: 10 }),
  card('academy-def-2', '青训中卫甲', 'Academy Centre Back A', 'DEF', 'academy', '青训营', '教练学院', '青训', 'academy', 0, { pac: 54, sho: 42, pas: 53, dri: 50, def: 60, phy: 62, gk: 10 }),
  card('academy-def-3', '青训中卫乙', 'Academy Centre Back B', 'DEF', 'academy', '青训营', '教练学院', '青训', 'academy', 0, { pac: 55, sho: 43, pas: 54, dri: 51, def: 59, phy: 61, gk: 10 }),
  card('academy-def-4', '青训右卫', 'Academy Right Back', 'DEF', 'academy', '青训营', '教练学院', '青训', 'academy', 0, { pac: 61, sho: 45, pas: 55, dri: 55, def: 56, phy: 57, gk: 10 }),
  card('academy-mid-1', '青训后腰', 'Academy Holding Midfielder', 'MID', 'academy', '青训营', '教练学院', '青训', 'academy', 0, { pac: 55, sho: 50, pas: 57, dri: 55, def: 58, phy: 60, gk: 9 }),
  card('academy-mid-2', '青训中场甲', 'Academy Midfielder A', 'MID', 'academy', '青训营', '教练学院', '青训', 'academy', 0, { pac: 58, sho: 54, pas: 59, dri: 58, def: 52, phy: 57, gk: 9 }),
  card('academy-mid-3', '青训中场乙', 'Academy Midfielder B', 'MID', 'academy', '青训营', '教练学院', '青训', 'academy', 0, { pac: 57, sho: 55, pas: 58, dri: 59, def: 51, phy: 56, gk: 9 }),
  card('academy-fwd-1', '青训左锋', 'Academy Left Forward', 'FWD', 'academy', '青训营', '教练学院', '青训', 'academy', 0, { pac: 62, sho: 58, pas: 53, dri: 59, def: 38, phy: 56, gk: 8 }),
  card('academy-fwd-2', '青训中锋', 'Academy Striker', 'FWD', 'academy', '青训营', '教练学院', '青训', 'academy', 0, { pac: 58, sho: 61, pas: 51, dri: 56, def: 39, phy: 61, gk: 8 }),
  card('academy-fwd-3', '青训右锋', 'Academy Right Forward', 'FWD', 'academy', '青训营', '教练学院', '青训', 'academy', 0, { pac: 63, sho: 57, pas: 54, dri: 60, def: 37, phy: 55, gk: 8 }),
];

export const ALL_PLAYERS = [...PLAYERS, ...ACADEMY_PLAYERS];

export const PACKS = [
  { id: 'current-gk', name: '现役门将包', era: 'current', position: 'GK', price: 480, cardCount: 5, tag: '五大联赛主力门将' },
  { id: 'current-def', name: '现役后卫包', era: 'current', position: 'DEF', price: 500, cardCount: 5, tag: '实力派防线拼图' },
  { id: 'current-mid', name: '现役中场包', era: 'current', position: 'MID', price: 520, cardCount: 5, tag: '联赛中坚与组织者' },
  { id: 'current-fwd', name: '现役锋线包', era: 'current', position: 'FWD', price: 540, cardCount: 5, tag: '多层级火力选择' },
  { id: 'legend-gk', name: '传奇门将包', era: 'legend', position: 'GK', price: 2400, cardCount: 3, tag: '三选不朽门神' },
  { id: 'legend-def', name: '传奇后卫包', era: 'legend', position: 'DEF', price: 2500, cardCount: 3, tag: '三张永恒壁垒' },
  { id: 'legend-mid', name: '传奇中场包', era: 'legend', position: 'MID', price: 2550, cardCount: 3, tag: '三位中场大师' },
  { id: 'legend-fwd', name: '传奇锋线包', era: 'legend', position: 'FWD', price: 2600, cardCount: 3, tag: '三张封神之刃' },
].map(pack => ({
  ...pack,
  playerIds: PLAYERS.filter(player => player.era === pack.era && player.position === pack.position).map(player => player.id),
}));

const slot = (role, x, y, label) => ({ role, x, y, label });

export const FORMATIONS = {
  '4-3-3': {
    id: '4-3-3', name: '4-3-3 进攻',
    slots: [slot('GK', 50, 91, 'GK'), slot('DEF', 15, 72, 'LB'), slot('DEF', 38, 75, 'CB'), slot('DEF', 62, 75, 'CB'), slot('DEF', 85, 72, 'RB'), slot('MID', 25, 48, 'CM'), slot('MID', 50, 55, 'DM'), slot('MID', 75, 48, 'CM'), slot('FWD', 16, 20, 'LW'), slot('FWD', 50, 14, 'ST'), slot('FWD', 84, 20, 'RW')],
  },
  '4-4-2': {
    id: '4-4-2', name: '4-4-2 经典',
    slots: [slot('GK', 50, 91, 'GK'), slot('DEF', 15, 72, 'LB'), slot('DEF', 38, 76, 'CB'), slot('DEF', 62, 76, 'CB'), slot('DEF', 85, 72, 'RB'), slot('MID', 14, 45, 'LM'), slot('MID', 38, 52, 'CM'), slot('MID', 62, 52, 'CM'), slot('MID', 86, 45, 'RM'), slot('FWD', 36, 18, 'ST'), slot('FWD', 64, 18, 'ST')],
  },
  '4-2-3-1': {
    id: '4-2-3-1', name: '4-2-3-1 控制',
    slots: [slot('GK', 50, 91, 'GK'), slot('DEF', 15, 72, 'LB'), slot('DEF', 38, 76, 'CB'), slot('DEF', 62, 76, 'CB'), slot('DEF', 85, 72, 'RB'), slot('MID', 35, 57, 'DM'), slot('MID', 65, 57, 'DM'), slot('MID', 16, 36, 'AM'), slot('MID', 50, 40, 'AM'), slot('MID', 84, 36, 'AM'), slot('FWD', 50, 14, 'ST')],
  },
  '3-5-2': {
    id: '3-5-2', name: '3-5-2 翼卫',
    slots: [slot('GK', 50, 91, 'GK'), slot('DEF', 25, 73, 'CB'), slot('DEF', 50, 77, 'CB'), slot('DEF', 75, 73, 'CB'), slot('MID', 10, 47, 'LWB'), slot('MID', 32, 52, 'CM'), slot('MID', 50, 42, 'AM'), slot('MID', 68, 52, 'CM'), slot('MID', 90, 47, 'RWB'), slot('FWD', 35, 17, 'ST'), slot('FWD', 65, 17, 'ST')],
  },
  '5-3-2': {
    id: '5-3-2', name: '5-3-2 防反',
    slots: [slot('GK', 50, 91, 'GK'), slot('DEF', 10, 65, 'LWB'), slot('DEF', 30, 75, 'CB'), slot('DEF', 50, 78, 'CB'), slot('DEF', 70, 75, 'CB'), slot('DEF', 90, 65, 'RWB'), slot('MID', 25, 45, 'CM'), slot('MID', 50, 52, 'DM'), slot('MID', 75, 45, 'CM'), slot('FWD', 35, 17, 'ST'), slot('FWD', 65, 17, 'ST')],
  },
  '3-4-3': {
    id: '3-4-3', name: '3-4-3 高压',
    slots: [slot('GK', 50, 91, 'GK'), slot('DEF', 25, 74, 'CB'), slot('DEF', 50, 78, 'CB'), slot('DEF', 75, 74, 'CB'), slot('MID', 14, 48, 'LM'), slot('MID', 40, 54, 'CM'), slot('MID', 60, 54, 'CM'), slot('MID', 86, 48, 'RM'), slot('FWD', 16, 20, 'LW'), slot('FWD', 50, 14, 'ST'), slot('FWD', 84, 20, 'RW')],
  },
};

export const TACTICS = {
  balanced: { id: 'balanced', name: '攻守平衡', desc: '三线稳定，临场波动更小', attack: 1, midfield: 1, defense: 1, possession: 0 },
  possession: { id: 'possession', name: '传控渗透', desc: '中场与控球提升，反击速度下降', attack: 1.02, midfield: 1.08, defense: 0.97, possession: 7 },
  pressing: { id: 'pressing', name: '高位压迫', desc: '抢回球权并制造射门，体能消耗更高', attack: 1.06, midfield: 1.03, defense: 0.95, possession: 3 },
  counter: { id: 'counter', name: '快速反击', desc: '降低控球，放大锋线速度与终结', attack: 1.09, midfield: 0.95, defense: 1.03, possession: -7 },
  wings: { id: 'wings', name: '两翼齐飞', desc: '边路推进更强，中央保护略降', attack: 1.05, midfield: 1, defense: 0.97, possession: 1 },
};

export const META = {
  title: '足球教练-传奇11人',
  startingCoins: 5000,
  preparationSeconds: 180,
  players: ALL_PLAYERS,
  packs: PACKS,
  formations: FORMATIONS,
  tactics: TACTICS,
};

export const PLAYER_BY_ID = Object.fromEntries(ALL_PLAYERS.map(player => [player.id, player]));
export const PACK_BY_ID = Object.fromEntries(PACKS.map(pack => [pack.id, pack]));

export function playerOverall(player) {
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
