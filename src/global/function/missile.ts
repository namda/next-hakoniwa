/**
 * @module missile
 * @description ミサイル発射・着弾処理のユーティリティ。
 */
import { TurnLog, islandInfo, islandInfoTurnProgress } from '@/db/kysely';
import {
  getBaseLog,
  logLackCosts,
  logMissileBoatPeople,
  logMissileCaught,
  logMissileCaughtS,
  logMissileLDLand,
  logMissileLDMonster,
  logMissileLDMountain,
  logMissileLDSbase,
  logMissileLDSea1,
  logMissileMonKill,
  logMissileMonKillS,
  logMissileMonMoney,
  logMissileMonNoDamage,
  logMissileMonNoDamageS,
  logMissileMonster,
  logMissileMonsterS,
  logMissileNoBase,
  logMissileNoDamage,
  logMissileNoDamageS,
  logMissileNoTarget,
  logMissileNormal,
  logMissileNormalS,
  logMissileNuclear,
  logMissileOut,
  logMissileOutS,
  logMissileUplift,
  logMissileWaste,
  logMissileWasteS,
} from '../define/logType';
import { getMapDefine, getMapLevel, isMonsterHardened } from '../define/mapType';
import META_DATA from '../define/metadata';
import { planType } from '../define/planType';
import {
  changeMapData,
  countMapAround,
  getMapAround,
  isOpenSea,
  mapArrayConverter,
} from './island';
import { randomIntInRange } from './utility';

type IslandWithUser = islandInfoTurnProgress;

type MissileBreakdown = Record<string, number>;

export type MissileType = 'normal' | 'pp' | 'spp' | 'st' | 'ld' | 'uplift' | 'nuclear';
type MissileWarhead = 'normal' | 'land-destruction' | 'uplift' | 'nuclear';

export const MISSILE_CHARACTERISTICS: Record<
  MissileType,
  { errorHex: number; warhead: MissileWarhead; ignoresDefense: boolean; stealth: boolean }
> = {
  normal: { errorHex: 2, warhead: 'normal', ignoresDefense: false, stealth: false },
  pp: { errorHex: 1, warhead: 'normal', ignoresDefense: false, stealth: false },
  spp: { errorHex: 0, warhead: 'normal', ignoresDefense: true, stealth: false },
  st: { errorHex: 2, warhead: 'normal', ignoresDefense: false, stealth: true },
  ld: { errorHex: 2, warhead: 'land-destruction', ignoresDefense: false, stealth: false },
  uplift: { errorHex: 2, warhead: 'uplift', ignoresDefense: false, stealth: false },
  nuclear: { errorHex: 1, warhead: 'nuclear', ignoresDefense: false, stealth: false },
};

/** ミサイル内訳にカウントを加算する */
const addBreakdown = (target: MissileBreakdown, type: string, count: number = 1) => {
  target[type] = (target[type] ?? 0) + count;
};

/** ミサイル内訳を統合する */
const mergeBreakdowns = (target: MissileBreakdown, source: MissileBreakdown) => {
  for (const [type, count] of Object.entries(source)) {
    addBreakdown(target, type, count);
  }
};

/** ミサイルで破壊したとカウントする都市・施設の地形タイプ一覧 */
const CITY_FACILITY_TYPES = new Set([
  'people',
  'factory',
  'labor_factory',
  'farm',
  'mining',
  'labor_mining',
  'missile',
  'defense_base',
  'fake_defense_base',
  'oil_field',
  'monument',
]);

/**
 * 発射元の島から対象の島へミサイルを撃ち込むメイン処理
 * 各種ミサイル（通常、PP、ST、LD）の分岐や難民処理を統括
 * @param turn 現在のターン数
 * @param fromIsland 発射元の島情報
 * @param toIsland 発射先の島情報
 * @param targetX 目標X座標
 * @param targetY 目標Y座標
 * @param missileType ミサイルの種類
 * @param times ミサイルの発射回数（0の場合は資金と弾が尽きるまで）
 * @param planName 計画の名称（ログ用）
 * @param cost ミサイル1発あたりの費用
 * @returns 発生したすべてのログ配列
 */
export const executeMissile = ({
  turn,
  fromIsland,
  toIsland,
  targetX,
  targetY,
  missileType,
  times,
  planType,
}: {
  /** 現在のターン数 */
  turn: number;
  /** 発射元の島情報 */
  fromIsland: IslandWithUser;
  /** 発射先の島情報 */
  toIsland: IslandWithUser | undefined;
  /** 目標X座標 */
  targetX: number;
  /** 目標Y座標 */
  targetY: number;
  /** ミサイルの種類 */
  missileType: MissileType;
  /** ミサイルの発射回数（0の場合は資金と弾が尽きるまで） */
  times: number;
  /** 計画タイプ */
  planType: planType;
}): {
  logs: TurnLog[];
  monsterKills: number;
  cityKills: number;
  destroyedMaps: MissileBreakdown;
  killedMonsters: MissileBreakdown;
  refugeeAccepted: number;
  success: boolean;
} => {
  const { name, cost } = planType;
  if (!toIsland) {
    const log = logMissileNoTarget(fromIsland, name);
    return {
      logs: [{ ...getBaseLog(turn, fromIsland), secret_log: log, log }],
      monsterKills: 0,
      cityKills: 0,
      destroyedMaps: {},
      killedMonsters: {},
      refugeeAccepted: 0,
      success: false,
    };
  }

  const missileBases = findMissileBases(fromIsland);
  if (missileBases.length === 0) {
    const log = logMissileNoBase(fromIsland, name);
    return {
      logs: [{ ...getBaseLog(turn, fromIsland), secret_log: log, log }],
      monsterKills: 0,
      cityKills: 0,
      destroyedMaps: {},
      killedMonsters: {},
      refugeeAccepted: 0,
      success: false,
    };
  }

  // 資金が足りない場合は撃てないため、事前にチェックする
  if (fromIsland.money < cost) {
    const log = logLackCosts(fromIsland, planType);
    return {
      logs: [{ ...getBaseLog(turn, fromIsland), secret_log: log, log }],
      monsterKills: 0,
      cityKills: 0,
      destroyedMaps: {},
      killedMonsters: {},
      refugeeAccepted: 0,
      success: false,
    };
  }

  return processMissileImpacts({
    turn,
    fromIsland,
    toIsland,
    targetX,
    targetY,
    missileType,
    times,
    planName: name,
    cost,
    missileBases,
  });
};

/**
 * 島のマップを走査し、ミサイル発射可能な基地と経験値（レベル）の一覧を取得
 * @param fromIsland 走査対象の島情報
 * @returns 基地の座標とレベルの配列
 */
const findMissileBases = (fromIsland: IslandWithUser) => {
  const missileBases = [];
  for (let x = 0; x < META_DATA.MAP_SIZE; x++) {
    for (let y = 0; y < META_DATA.MAP_SIZE; y++) {
      const mapInfo = fromIsland.island_info[mapArrayConverter(x, y)];
      if (mapInfo.type === 'missile' || mapInfo.type === 'submarine_missile') {
        missileBases.push({ x, y, level: getMapLevel(mapInfo.type, mapInfo.landValue) });
      }
    }
  }
  return missileBases;
};

/**
 * 複数基地からのミサイル連続発射処理
 * 発射ごとのお金消費、着弾処理の呼び出し、難民の集計を行う
 * @param args 発射に必要なパラメータ群
 * @returns 発生したすべてのログ配列
 */
const processMissileImpacts = ({
  turn,
  fromIsland,
  toIsland,
  targetX,
  targetY,
  missileType,
  times,
  planName,
  cost,
  missileBases,
}: {
  /** 現在のターン数 */
  turn: number;
  /** 発射元の島情報 */
  fromIsland: IslandWithUser;
  /** 発射先の島情報 */
  toIsland: IslandWithUser;
  /** 目標X座標 */
  targetX: number;
  /** 目標Y座標 */
  targetY: number;
  /** ミサイルの種類 */
  missileType: MissileType;
  /** ミサイルの発射回数 */
  times: number;
  /** 計画の名称 */
  planName: string;
  /** ミサイル1発あたりの費用 */
  cost: number;
  /** 発射可能なミサイル基地のリスト */
  missileBases: { x: number; y: number; level: number }[];
}) => {
  // 0の場合は資金と弾が尽きるまで撃ち続けるため、事実上の無限回数を設定する
  let remainingTimes = times === 0 ? Number.MAX_SAFE_INTEGER : times;
  const logs: TurnLog[] = [];
  let accumulatedRefugees = 0;
  let flagShot = false;
  let monsterKills = 0;
  let cityKills = 0;
  let refugeeAccepted = 0;
  const destroyedMaps: MissileBreakdown = {};
  const killedMonsters: MissileBreakdown = {};

  const characteristics = MISSILE_CHARACTERISTICS[missileType];
  const errorHex = characteristics.errorHex;

  for (const base of missileBases) {
    // 基地のレベルは経験値付与によって変動するため、ループのたびに現在のレベルを取得する
    let getBaseLevel = () => {
      const mapInfo = fromIsland.island_info[mapArrayConverter(base.x, base.y)];
      return getMapLevel(mapInfo.type, mapInfo.landValue);
    };

    let baseLevel = getBaseLevel();
    // 撃つたびにレベル（発射可能弾数）を1ずつ消費して計算する
    // ただし、途中で経験値を得てレベルが上がった場合は発射可能回数が増える
    let usedLevel = 0;

    while (baseLevel - usedLevel > 0 && remainingTimes > 0 && fromIsland.money >= cost) {
      usedLevel++;
      remainingTimes--;
      fromIsland.money -= cost;
      flagShot = true;

      const area = getMapAround(targetX, targetY, errorHex);
      const impactPoint = area[randomIntInRange(0, area.length - 1)];

      const impactResult = processSingleImpact({
        turn,
        fromIsland,
        toIsland,
        targetX,
        targetY,
        impactPoint,
        missileType,
        planName,
        base,
      });

      logs.push(...impactResult.logs);
      accumulatedRefugees += impactResult.refugees;
      monsterKills += impactResult.monsterKills;
      cityKills += impactResult.cityKills;
      mergeBreakdowns(destroyedMaps, impactResult.destroyedMaps);
      mergeBreakdowns(killedMonsters, impactResult.killedMonsters);

      // 発射によって経験値が得られた場合、基地レベルが上限まで変動する可能性があるため再取得
      baseLevel = getBaseLevel();
    }
  }

  if (
    flagShot &&
    accumulatedRefugees > 0 &&
    fromIsland.uuid !== toIsland.uuid &&
    !characteristics.stealth
  ) {
    // 発生した難民のうち、海上を生き延びて無事に他島へ漂着できるのは半数のみとする仕様
    const validRefugees = Math.floor(accumulatedRefugees / 2);
    const refugeeResult = processRefugees(fromIsland, turn, validRefugees);
    refugeeAccepted = refugeeResult.distributed;
    if (refugeeResult.log) logs.push(refugeeResult.log);
  }

  return {
    logs,
    monsterKills,
    cityKills,
    destroyedMaps,
    killedMonsters,
    refugeeAccepted,
    success: flagShot,
  };
};

/**
 * ステルスミサイルと通常ミサイルでログの出力を分けるヘルパー関数
 * ステルスなら公開用と、発射元のみ見られる非公開用の2つのログを追加する
 * @param isStealth ステルスかどうか
 * @param turn ターン
 * @param fromIsland 発射元島
 * @param baseLog 基地のログ
 * @param stealthLogText ステルスのログ
 * @param normalLogText 通常のログ
 * @returns ログ配列
 */
const createMissileLogs = (
  isStealth: boolean,
  turn: number,
  fromIsland: IslandWithUser,
  baseLog: ReturnType<typeof getBaseLog>,
  stealthLogText: string,
  normalLogText: string
): TurnLog[] => {
  if (isStealth) {
    return [
      {
        ...baseLog,
        from_uuid: baseLog.to_uuid ?? '',
        secret_log: stealthLogText,
        log: stealthLogText,
      },
      { ...getBaseLog(turn, fromIsland), secret_log: normalLogText, log: null },
    ];
  }
  return [{ ...baseLog, secret_log: normalLogText, log: normalLogText }];
};

/**
 * ミサイル1発ごとの着弾処理
 * 迎撃判定や弾かれ判定を行い、ミサイル種別に応じた被害計算へ分岐
 * @param args 1発の着弾に必要なパラメータ群
 * @returns 発生したログと発生した難民数のオブジェクト
 */
const processSingleImpact = ({
  turn,
  fromIsland,
  toIsland,
  targetX,
  targetY,
  impactPoint,
  missileType,
  planName,
  base,
}: {
  /** 現在のターン数 */
  turn: number;
  /** 発射元の島情報 */
  fromIsland: IslandWithUser;
  /** 発射先の島情報 */
  toIsland: IslandWithUser;
  /** 目標X座標 */
  targetX: number;
  /** 目標Y座標 */
  targetY: number;
  /** 実際の着弾座標 */
  impactPoint: { x: number; y: number };
  /** ミサイルの種類 */
  missileType: MissileType;
  /** 計画の名称 */
  planName: string;
  /** 発射した基地の情報 */
  base: { x: number; y: number; level: number };
}): {
  logs: TurnLog[];
  refugees: number;
  monsterKills: number;
  cityKills: number;
  destroyedMaps: MissileBreakdown;
  killedMonsters: MissileBreakdown;
} => {
  const characteristics = MISSILE_CHARACTERISTICS[missileType];
  const isStealth = characteristics.stealth;
  const baseLog = getBaseLog(turn, fromIsland, toIsland);

  if (isOpenSea(impactPoint.x, impactPoint.y)) {
    const logOutS = logMissileOutS();
    const logOut = logMissileOut(fromIsland, toIsland, planName);
    return {
      logs: createMissileLogs(isStealth, turn, fromIsland, baseLog, logOutS, logOut),
      refugees: 0,
      monsterKills: 0,
      cityKills: 0,
      destroyedMaps: {},
      killedMonsters: {},
    };
  }

  const impactMapInfo = toIsland.island_info[mapArrayConverter(impactPoint.x, impactPoint.y)];

  if (
    !characteristics.ignoresDefense &&
    checkIntercepted(toIsland, impactPoint.x, impactPoint.y, impactMapInfo.type)
  ) {
    const logCaughtS = logMissileCaughtS(toIsland, impactPoint.x, impactPoint.y);
    const logCaught = logMissileCaught(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y
    );
    return {
      logs: createMissileLogs(isStealth, turn, fromIsland, baseLog, logCaughtS, logCaught),
      refugees: 0,
      monsterKills: 0,
      cityKills: 0,
      destroyedMaps: {},
      killedMonsters: {},
    };
  }

  if (
    (characteristics.warhead === 'normal' || characteristics.warhead === 'land-destruction') &&
    checkNoDamage(characteristics.warhead, impactMapInfo.type)
  ) {
    // 潜水艦基地は攻撃を弾いた際、単なる「海」としてログに記録し、他島からその存在を秘匿する
    const fakeMapInfo =
      impactMapInfo.type === 'submarine_missile'
        ? { ...impactMapInfo, type: 'sea' }
        : impactMapInfo;
    const logNoDamS = logMissileNoDamageS(toIsland, impactPoint.x, impactPoint.y, fakeMapInfo);
    const logNoDam = logMissileNoDamage(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y,
      fakeMapInfo
    );
    return {
      logs: createMissileLogs(isStealth, turn, fromIsland, baseLog, logNoDamS, logNoDam),
      refugees: 0,
      monsterKills: 0,
      cityKills: 0,
      destroyedMaps: {},
      killedMonsters: {},
    };
  }

  if (characteristics.warhead === 'land-destruction') {
    return applyLandDestructionMissile({
      turn,
      fromIsland,
      toIsland,
      targetX,
      targetY,
      impactPoint,
      planName,
      impactMapInfo,
      base,
    });
  }
  if (characteristics.warhead === 'uplift') {
    return applyUpliftMissile({
      turn,
      fromIsland,
      toIsland,
      targetX,
      targetY,
      impactPoint,
      planName,
      impactMapInfo,
      base,
    });
  }
  if (characteristics.warhead === 'nuclear') {
    return applyNuclearMissile({
      turn,
      fromIsland,
      toIsland,
      targetX,
      targetY,
      impactPoint,
      planName,
      base,
    });
  }
  return applyNormalMissile({
    turn,
    fromIsland,
    toIsland,
    targetX,
    targetY,
    impactPoint,
    planName,
    impactMapInfo,
    missileType,
    base,
  });
};

/**
 * 対象座標が防衛施設等により迎撃されるかどうかの判定
 * @param island 対象の島情報
 * @param ix 目標X座標
 * @param iy 目標Y座標
 * @param type 着弾地点の地形タイプ
 * @returns 迎撃判定結果（真偽値）
 */
const checkIntercepted = (island: IslandWithUser, ix: number, iy: number, type: string) => {
  if (type === 'defense_base') return false; // 直撃の場合は迎撃されないで破壊される
  const defenseBaseCount = countMapAround(island.island_info, 'defense_base', ix, iy, 2);
  return defenseBaseCount > 0;
};

/**
 * ミサイル種別と地形種別による「被害なし（弾かれた）」判定
 * @param missileType ミサイルの種類
 * @param type 着弾地点の地形タイプ
 * @returns 被害なし判定結果（真偽値）
 */
const checkNoDamage = (warhead: MissileWarhead, type: string) => {
  return (
    type === 'sea' ||
    (warhead !== 'land-destruction' &&
      (type === 'shallows' || type === 'submarine_missile' || type === 'mountain'))
  );
};

const applyUpliftMissile = ({
  turn,
  fromIsland,
  toIsland,
  targetX,
  targetY,
  impactPoint,
  planName,
  impactMapInfo,
  base,
}: {
  turn: number;
  fromIsland: IslandWithUser;
  toIsland: IslandWithUser;
  targetX: number;
  targetY: number;
  impactPoint: { x: number; y: number };
  planName: string;
  impactMapInfo: islandInfo;
  base: { x: number; y: number };
}) => {
  const baseLog = getBaseLog(turn, fromIsland, toIsland);
  const impactBaseLand = getMapDefine(impactMapInfo.type).baseLand;
  const isMonster = ['monster', 'sanjira', 'kujira'].includes(impactBaseLand);
  const seaTypes = ['sea', 'submarine_missile', 'oil_field'];
  const nextType = seaTypes.includes(impactMapInfo.type)
    ? 'shallows'
    : impactMapInfo.type === 'shallows'
      ? 'ruins'
      : 'mountain';
  const cityKills = CITY_FACILITY_TYPES.has(impactMapInfo.type) ? 1 : 0;
  const monsterKills = isMonster ? 1 : 0;
  const destroyedMaps: MissileBreakdown = {};
  const killedMonsters: MissileBreakdown = {};
  let bounty = 0;
  if (cityKills) addBreakdown(destroyedMaps, impactMapInfo.type);
  if (monsterKills) {
    addBreakdown(killedMonsters, impactMapInfo.type);
    bounty = grantMonsterRewards(fromIsland, toIsland, base, impactMapInfo);
  }
  if (impactMapInfo.type === 'people') {
    grantBaseExperience(fromIsland, base.x, base.y, impactMapInfo.landValue);
  }
  changeMapData(toIsland, impactPoint.x, impactPoint.y, nextType, { type: 'ins', value: 0 });
  const log = logMissileUplift(
    fromIsland,
    toIsland,
    planName,
    targetX,
    targetY,
    impactPoint.x,
    impactPoint.y,
    impactMapInfo,
    nextType
  );
  const logs = [{ ...baseLog, secret_log: log, log }];
  if (bounty > 0) {
    const rewardLog = logMissileMonMoney(impactMapInfo, bounty);
    logs.push({ ...baseLog, secret_log: rewardLog, log: rewardLog });
  }
  return {
    logs,
    refugees: impactMapInfo.type === 'people' ? impactMapInfo.landValue : 0,
    monsterKills,
    cityKills,
    destroyedMaps,
    killedMonsters,
  };
};

const applyNuclearMissile = ({
  turn,
  fromIsland,
  toIsland,
  targetX,
  targetY,
  impactPoint,
  planName,
  base,
}: {
  turn: number;
  fromIsland: IslandWithUser;
  toIsland: IslandWithUser;
  targetX: number;
  targetY: number;
  impactPoint: { x: number; y: number };
  planName: string;
  base: { x: number; y: number };
}) => {
  const baseLog = getBaseLog(turn, fromIsland, toIsland);
  const logs: TurnLog[] = [];
  const destroyedMaps: MissileBreakdown = {};
  const killedMonsters: MissileBreakdown = {};
  let refugees = 0;
  let monsterKills = 0;
  let cityKills = 0;
  let affected = 0;

  for (const point of getMapAround(impactPoint.x, impactPoint.y, 2)) {
    if (isOpenSea(point.x, point.y)) continue;
    const mapInfo = toIsland.island_info[mapArrayConverter(point.x, point.y)];
    if (['sea', 'shallows', 'submarine_missile', 'oil_field'].includes(mapInfo.type)) continue;
    const baseLand = getMapDefine(mapInfo.type).baseLand;
    const isMonster = ['monster', 'sanjira', 'kujira'].includes(baseLand);
    if (isMonster) {
      monsterKills++;
      addBreakdown(killedMonsters, mapInfo.type);
      const bounty = grantMonsterRewards(fromIsland, toIsland, base, mapInfo);
      if (bounty > 0) {
        const rewardLog = logMissileMonMoney(mapInfo, bounty);
        logs.push({ ...baseLog, secret_log: rewardLog, log: rewardLog });
      }
    }
    if (CITY_FACILITY_TYPES.has(mapInfo.type)) {
      cityKills++;
      addBreakdown(destroyedMaps, mapInfo.type);
    }
    if (mapInfo.type === 'people') {
      refugees += mapInfo.landValue;
      grantBaseExperience(fromIsland, base.x, base.y, mapInfo.landValue);
    }
    changeMapData(toIsland, point.x, point.y, 'ruins', { type: 'ins', value: 0 });
    affected++;
  }

  const log = logMissileNuclear(
    fromIsland,
    toIsland,
    planName,
    targetX,
    targetY,
    impactPoint.x,
    impactPoint.y,
    affected
  );
  logs.unshift({ ...baseLog, secret_log: log, log });
  return { logs, refugees, monsterKills, cityKills, destroyedMaps, killedMonsters };
};

const grantMonsterRewards = (
  fromIsland: IslandWithUser,
  toIsland: IslandWithUser,
  base: { x: number; y: number },
  mapInfo: islandInfo
) => {
  const { exp, bounty } = getMapDefine(mapInfo.type);
  grantBaseExperience(fromIsland, base.x, base.y, (exp ?? 0) * 20);
  if (bounty) toIsland.money += bounty;
  return bounty ?? 0;
};

/**
 * 陸地破壊爆弾（LDミサイル）専用の地形破壊処理
 * 陸地をえぐったり海底を隆起させたりする
 * @param args 陸地破壊爆弾の着弾に必要なパラメータ群
 * @returns 発生したログと難民数（常に0）
 */
const applyLandDestructionMissile = ({
  turn,
  fromIsland,
  toIsland,
  targetX,
  targetY,
  impactPoint,
  planName,
  impactMapInfo,
  base,
}: {
  /** 現在のターン数 */
  turn: number;
  /** 発射元の島情報 */
  fromIsland: IslandWithUser;
  /** 発射先の島情報 */
  toIsland: IslandWithUser;
  /** 目標X座標 */
  targetX: number;
  /** 目標Y座標 */
  targetY: number;
  /** 実際の着弾座標 */
  impactPoint: { x: number; y: number };
  /** 計画の名称 */
  planName: string;
  /** 着弾地点の地形情報 */
  impactMapInfo: islandInfo;
  /** 発射した基地の座標 */
  base: { x: number; y: number };
}) => {
  const baseLog = getBaseLog(turn, fromIsland, toIsland);
  let log = '';
  const impactBaseLand = getMapDefine(impactMapInfo.type).baseLand;
  let monsterKills = 0;
  let cityKills = 0;
  const destroyedMaps: MissileBreakdown = {};

  if (impactMapInfo.type === 'mountain') {
    log = logMissileLDMountain(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y,
      impactMapInfo
    );
    changeMapData(toIsland, impactPoint.x, impactPoint.y, 'ruins', { type: 'ins', value: 0 });
  } else if (impactMapInfo.type === 'marine_base') {
    log = logMissileLDSbase(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y
    );
    changeMapData(toIsland, impactPoint.x, impactPoint.y, 'shallows', { type: 'ins', value: 0 });
  } else if (['monster', 'sanjira', 'kujira'].includes(impactBaseLand)) {
    log = logMissileLDMonster(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y,
      impactMapInfo
    );
    changeMapData(toIsland, impactPoint.x, impactPoint.y, 'shallows', {
      type: 'ins',
      value: 0,
    });
    monsterKills = 1;
  } else if (impactMapInfo.type === 'shallows') {
    log = logMissileLDSea1(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y
    );
    changeMapData(toIsland, impactPoint.x, impactPoint.y, 'sea', { type: 'ins', value: 0 });
  } else {
    log = logMissileLDLand(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y
    );
    changeMapData(toIsland, impactPoint.x, impactPoint.y, 'shallows', { type: 'ins', value: 0 });
    cityKills = CITY_FACILITY_TYPES.has(impactMapInfo.type) ? 1 : 0;
    if (cityKills > 0) {
      addBreakdown(destroyedMaps, impactMapInfo.type);
    }
  }

  if (impactMapInfo.type === 'people') {
    grantBaseExperience(fromIsland, base.x, base.y, impactMapInfo.landValue);
  }

  if (['oil_field', 'sea', 'submarine_missile'].includes(impactMapInfo.type)) {
    changeMapData(toIsland, impactPoint.x, impactPoint.y, 'sea', { type: 'ins', value: 0 });
  }

  return {
    logs: [{ ...baseLog, secret_log: log, log }],
    refugees: 0,
    monsterKills,
    cityKills,
    destroyedMaps,
    killedMonsters: {},
  };
};

/**
 * 通常ミサイル系統（通常、PP、ST）の着弾被害処理
 * 怪獣への命中や地形の荒地化を行う
 * @param args 通常ミサイル系の着弾に必要なパラメータ群
 * @returns 発生したログと発生した難民数のオブジェクト
 */
const applyNormalMissile = ({
  turn,
  fromIsland,
  toIsland,
  targetX,
  targetY,
  impactPoint,
  planName,
  impactMapInfo,
  missileType,
  base,
}: {
  /** 現在のターン数 */
  turn: number;
  /** 発射元の島情報 */
  fromIsland: IslandWithUser;
  /** 発射先の島情報 */
  toIsland: IslandWithUser;
  /** 目標X座標 */
  targetX: number;
  /** 目標Y座標 */
  targetY: number;
  /** 実際の着弾座標 */
  impactPoint: { x: number; y: number };
  /** 計画の名称 */
  planName: string;
  /** 着弾地点の地形情報 */
  impactMapInfo: islandInfo;
  /** ミサイルの種類 */
  missileType: MissileType;
  /** 発射した基地の座標 */
  base: { x: number; y: number };
}) => {
  const isStealth = MISSILE_CHARACTERISTICS[missileType].stealth;
  const baseLog = getBaseLog(turn, fromIsland, toIsland);
  const impactBaseLand = getMapDefine(impactMapInfo.type).baseLand;
  let refugees = 0;
  let monsterKills = 0;
  let cityKills = 0;
  const destroyedMaps: MissileBreakdown = {};
  const killedMonsters: MissileBreakdown = {};
  const logs: TurnLog[] = [];

  if (impactMapInfo.type === 'wasteland') {
    changeMapData(toIsland, impactPoint.x, impactPoint.y, 'ruins', { type: 'ins', value: 0 });
    const logWasteS = logMissileWasteS(toIsland, impactPoint.x, impactPoint.y, impactMapInfo);
    const logWaste = logMissileWaste(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y,
      impactMapInfo
    );
    logs.push(...createMissileLogs(isStealth, turn, fromIsland, baseLog, logWasteS, logWaste));
  } else if (['monster', 'sanjira', 'kujira'].includes(impactBaseLand)) {
    const monsterResult = handleMonsterImpact(
      fromIsland,
      toIsland,
      turn,
      planName,
      targetX,
      targetY,
      impactPoint,
      impactMapInfo,
      isStealth,
      baseLog,
      logs,
      base
    );
    monsterKills = monsterResult.monsterKills;
    if (monsterResult.killedMonsterType) {
      addBreakdown(killedMonsters, monsterResult.killedMonsterType);
    }
  } else {
    cityKills = CITY_FACILITY_TYPES.has(impactMapInfo.type) ? 1 : 0;
    if (cityKills > 0) {
      addBreakdown(destroyedMaps, impactMapInfo.type);
    }
    const logNormS = logMissileNormalS(toIsland, impactPoint.x, impactPoint.y, impactMapInfo);
    const logNorm = logMissileNormal(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y,
      impactMapInfo
    );
    logs.push(...createMissileLogs(isStealth, turn, fromIsland, baseLog, logNormS, logNorm));

    if (impactMapInfo.type === 'people') {
      grantBaseExperience(fromIsland, base.x, base.y, impactMapInfo.landValue);
      refugees = impactMapInfo.landValue;
    }

    changeMapData(toIsland, impactPoint.x, impactPoint.y, 'ruins', { type: 'ins', value: 0 });
    if (impactMapInfo.type === 'oil_field') {
      changeMapData(toIsland, impactPoint.x, impactPoint.y, 'sea', { type: 'ins', value: 0 });
    }
  }

  return { logs, refugees, monsterKills, cityKills, destroyedMaps, killedMonsters };
};

/**
 * ミサイルが怪獣に命中した際の専用処理
 * 怪獣の硬化判定、討伐、および賞金・経験値の付与を行う
 * @param fromIsland 発射元の島情報
 * @param toIsland 発射先の島情報
 * @param turn 現在のターン数
 * @param planName 計画の名称
 * @param targetX 目標X座標
 * @param targetY 目標Y座標
 * @param impactPoint 実際の着弾座標
 * @param impactMapInfo 着弾地点の地形情報
 * @param isStealth ステルスミサイルかどうかのフラグ
 * @param baseLog 共通のベースログ
 * @param logs 追加先のログ配列
 * @param base 発射した基地の座標
 */
const handleMonsterImpact = (
  fromIsland: IslandWithUser,
  toIsland: IslandWithUser,
  turn: number,
  planName: string,
  targetX: number,
  targetY: number,
  impactPoint: { x: number; y: number },
  impactMapInfo: islandInfo,
  isStealth: boolean,
  baseLog: ReturnType<typeof getBaseLog>,
  logs: TurnLog[],
  base: { x: number; y: number }
): { monsterKills: number; killedMonsterType?: string } => {
  // 通常弾頭ではサンジラは奇数ターン、クジラは偶数ターンに硬化状態となる
  const isHardened = isMonsterHardened(impactMapInfo.type, turn);

  if (isHardened) {
    const logMonNoDamS = logMissileMonNoDamageS(
      toIsland,
      impactPoint.x,
      impactPoint.y,
      impactMapInfo
    );
    const logMonNoDam = logMissileMonNoDamage(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y,
      impactMapInfo
    );
    logs.push(
      ...createMissileLogs(isStealth, turn, fromIsland, baseLog, logMonNoDamS, logMonNoDam)
    );
    return { monsterKills: 0 };
  }

  // 現在の体力が1以下（今回の着弾で0になる）場合、討伐成功として処理する
  if (impactMapInfo.landValue <= 1) {
    const logKillS = logMissileMonKillS(toIsland, impactPoint.x, impactPoint.y, impactMapInfo);
    const logKill = logMissileMonKill(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y,
      impactMapInfo
    );
    logs.push(...createMissileLogs(isStealth, turn, fromIsland, baseLog, logKillS, logKill));
    changeMapData(toIsland, impactPoint.x, impactPoint.y, 'ruins', { type: 'ins', value: 0 });

    const { exp, bounty } = getMapDefine(impactMapInfo.type);
    grantBaseExperience(fromIsland, base.x, base.y, (exp ?? 0) * 20);

    if (bounty && bounty > 0) {
      toIsland.money += bounty;
      const mLog = logMissileMonMoney(impactMapInfo, bounty);
      logs.push({ ...baseLog, secret_log: mLog, log: mLog });
    }
    return { monsterKills: 1, killedMonsterType: impactMapInfo.type };
  } else {
    const logMonS = logMissileMonsterS(toIsland, impactPoint.x, impactPoint.y, impactMapInfo);
    const logMon = logMissileMonster(
      fromIsland,
      toIsland,
      planName,
      targetX,
      targetY,
      impactPoint.x,
      impactPoint.y,
      impactMapInfo
    );
    logs.push(...createMissileLogs(isStealth, turn, fromIsland, baseLog, logMonS, logMon));
    changeMapData(toIsland, impactPoint.x, impactPoint.y, impactMapInfo.type, {
      type: 'sub',
      value: 1,
    });
    return { monsterKills: 0 };
  }
};

/**
 * モンスター等によって難民が発生した際の他島への難民漂着処理
 * @param fromIsland 漂着元の島情報
 * @param turn 現在のターン数
 * @param validRefugees 実際に漂着する難民の数
 * @returns 実際の受け入れ難民数と、発生した場合のみ難民漂着ログ
 */
export const processRefugees = (
  fromIsland: IslandWithUser,
  turn: number,
  validRefugees: number
): { log?: TurnLog; distributed: number } => {
  const normalizedRefugees = Math.max(0, Math.floor(validRefugees));
  if (normalizedRefugees === 0) return { distributed: 0 };
  let refugeesToDistribute = normalizedRefugees;
  let distributed = 0;

  for (let x = 0; x < META_DATA.MAP_SIZE && refugeesToDistribute > 0; x++) {
    for (let y = 0; y < META_DATA.MAP_SIZE && refugeesToDistribute > 0; y++) {
      const mapInfo = fromIsland.island_info[mapArrayConverter(x, y)];
      if (mapInfo.type === 'people') {
        const currentPopulation = Math.max(1, Math.min(200, Math.round(mapInfo.landValue)));
        if (mapInfo.landValue !== currentPopulation) {
          changeMapData(fromIsland, x, y, 'people', { type: 'ins', value: currentPopulation });
        }
        const add = Math.min(refugeesToDistribute, 50, 200 - currentPopulation);
        if (add > 0) {
          changeMapData(fromIsland, x, y, 'people', { type: 'add', value: add });
          refugeesToDistribute -= add;
          distributed += add;
        }
      } else if (mapInfo.type === 'plains') {
        const add = Math.min(refugeesToDistribute, 5);
        changeMapData(fromIsland, x, y, 'people', { type: 'ins', value: add });
        distributed += add;
        refugeesToDistribute -= add;
      }
    }
  }

  if (distributed > 0) {
    const log = logMissileBoatPeople(fromIsland, distributed);
    return {
      distributed,
      log: { ...getBaseLog(turn, fromIsland), secret_log: log, log: null },
    };
  }
  return { distributed: 0 };
};

/**
 * ミサイル発射によって対象に被害を与えた際、基地に経験値を付与する処理
 * @param island 発射元の島情報
 * @param x 基地のX座標
 * @param y 基地のY座標
 * @param enemyLandValue 攻撃対象の元々の規模（人口や怪獣の体力など）
 */
const grantBaseExperience = (
  island: islandInfoTurnProgress,
  x: number,
  y: number,
  enemyLandValue: number
) => {
  const mapInfo = island.island_info[mapArrayConverter(x, y)];
  if (mapInfo.type === 'missile' || mapInfo.type === 'submarine_missile') {
    // 基地の経験値は標的の規模（人口、怪獣の体力など）の1/20（切り捨て）だけ上昇する
    const expGain = Math.floor(enemyLandValue / 20);
    // 経験値の最大値は200に制限されている
    const newExp = Math.min(mapInfo.landValue + expGain, 200);
    changeMapData(island, x, y, mapInfo.type, { type: 'ins', value: newExp });
  }
};
