import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import {
  analyzeCron,
  eventsPerDay,
  fallDownBorder,
  fireRate,
  mapSummary,
  monsterRateAbove1M,
  monsterRateBelow1M,
  ratePerTurn,
  serializeNumber,
} from './calculations';
import { atomicUpdate, loadProductionEnv, parseEnv, updateEnv } from './env';

const root = resolve(import.meta.dirname, '../..');
const PUBLIC_COMMON = new Set([
  'ACCESS_TOKEN_EXPIRES_HOUR',
  'REFRESH_TOKEN_EXPIRES_HOUR',
  'LOGIN_FAIL_LIMIT',
  'LOGIN_LOCK_MINUTE',
  'MAX_SESSIONS',
  'MAX_REGISTERED_USERS',
  'MODERATOR_SESSION_EXPIRES_HOUR',
  'ISLAND_NAME_CHANGE_COOLDOWN_DAYS',
]);
const LOCAL_KEYS = new Set([
  'DB_TYPE',
  'MYSQL_DATABASE',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_ROOT_PASSWORD',
  'DB_CONNECTION_STRING',
  'DOCKER_DB_CONNECTION_STRING',
  'PASSKEY_FP_PEPPER',
  'MODERATOR_INITIAL_ID',
  'MODERATOR_INITIAL_PASSWORD',
  'MODERATOR_INITIAL_USER_NAME',
  'LOG_BASE_DIR',
  'LOG_TRANSPORT_MODE',
  'LOG_S3_BUCKET',
  'LOG_S3_REGION',
  'LOG_S3_ENDPOINT',
  'LOG_S3_ACCESS_KEY_ID',
  'LOG_S3_SECRET_ACCESS_KEY',
  'LOG_S3_KEY_PREFIX',
  'LOG_S3_FORCE_PATH_STYLE',
  'NEXT_PUBLIC_ORIGIN_URL',
  'DOCKER_NEXT_PUBLIC_ORIGIN_URL',
  'NEXT_PUBLIC_RP_ID',
  'ISSUER',
]);
const SECRET_KEYS = new Set([
  'MYSQL_PASSWORD',
  'MYSQL_ROOT_PASSWORD',
  'DB_CONNECTION_STRING',
  'DOCKER_DB_CONNECTION_STRING',
  'PASSKEY_FP_PEPPER',
  'MODERATOR_INITIAL_PASSWORD',
  'LOG_S3_ACCESS_KEY_ID',
  'LOG_S3_SECRET_ACCESS_KEY',
]);
const DAILY_KEYS = [
  'NEXT_PUBLIC_EARTHQUAKE_RATE',
  'NEXT_PUBLIC_TSUNAMI_RATE',
  'NEXT_PUBLIC_TYPHOON_RATE',
  'NEXT_PUBLIC_METEORITE_RATE',
  'NEXT_PUBLIC_HUGE_METEORITE_RATE',
  'NEXT_PUBLIC_ERUPTION_RATE',
] as const;
export const PERCENT_SETTING_KEYS = [
  'NEXT_PUBLIC_BURIED_TREASURE_RATE',
  'NEXT_PUBLIC_OIL_FIELD_RATE',
  'NEXT_PUBLIC_OIL_EXHAUSTION_RATE',
  'NEXT_PUBLIC_CONTINUOUS_METEORITE_RATE',
  'NEXT_PUBLIC_VILLAGE_APPEARANCE_RATE',
] as const;

const SETTING_NAMES: Record<string, string> = {
  NEXT_PUBLIC_TURN_TIMEZONE: 'ターンタイムゾーン',
  NEXT_PUBLIC_TURN_CRON: 'ターン更新スケジュール',
  NEXT_PUBLIC_MAP_SIZE: 'マップサイズ',
  NEXT_PUBLIC_EARTHQUAKE_RATE: '地震頻度',
  NEXT_PUBLIC_TSUNAMI_RATE: '津波頻度',
  NEXT_PUBLIC_TYPHOON_RATE: '台風頻度',
  NEXT_PUBLIC_METEORITE_RATE: '隕石頻度',
  NEXT_PUBLIC_HUGE_METEORITE_RATE: '巨大隕石頻度',
  NEXT_PUBLIC_ERUPTION_RATE: '噴火頻度',
  NEXT_PUBLIC_FALL_DOWN_BORDER: '地盤沈下面積境界',
  NEXT_PUBLIC_FALL_DOWN_RATE: '地盤沈下頻度',
  NEXT_PUBLIC_MONSTER_POPULATION_MULTIPLIER_PER_EXTRA_1M: '怪獣人口倍率',
  NEXT_PUBLIC_MONSTER_SPAWN_RATE_BELOW_1M: '100万人未満の怪獣出現頻度',
  NEXT_PUBLIC_MONSTER_RATE: '100万人以上の怪獣出現頻度',
  NEXT_PUBLIC_FIRE_RATE: '火災頻度',
  NEXT_PUBLIC_INIT_MONEY: '初期資金',
  NEXT_PUBLIC_MAX_MONEY: '資金上限',
  NEXT_PUBLIC_INIT_FOOD: '初期食料',
  NEXT_PUBLIC_MAX_FOOD: '食料上限',
  NEXT_PUBLIC_PLAN_LENGTH: '計画数',
  NEXT_PUBLIC_ORIGIN_URL: '公開URL',
  NEXT_PUBLIC_RP_ID: 'Passkey RP ID',
  ISSUER: '認証Issuer',
  MYSQL_DATABASE: 'MySQLデータベース名',
  MYSQL_USER: 'MySQLユーザー名',
  MODERATOR_INITIAL_PASSWORD: 'Moderator初期bootstrap password',
  MODERATOR_INITIAL_ID: 'Moderator初期ID',
  MODERATOR_INITIAL_USER_NAME: 'Moderator初期表示名',
  MYSQL_HOST_PORT: 'ホスト側MySQLポート',
  NEXT_PUBLIC_BURIED_TREASURE_RATE: '埋蔵金発見率',
  NEXT_PUBLIC_OIL_FIELD_RATE: '油田発見率',
  NEXT_PUBLIC_OIL_EXHAUSTION_RATE: '油田枯渇率',
  NEXT_PUBLIC_CONTINUOUS_METEORITE_RATE: '連続隕石率',
  NEXT_PUBLIC_VILLAGE_APPEARANCE_RATE: '村出現率',
};

class UndoRequested extends Error {}

export const createSpinner = (message: string, output = stdout) => {
  let frame = 0;
  let timer: NodeJS.Timeout | undefined;
  const tty = output.isTTY;
  if (tty) {
    const frames = ['|', '/', '-', '\\'];
    output.write(`${message} ${frames[0]}`);
    timer = setInterval(() => {
      frame = (frame + 1) % frames.length;
      output.write(`\r${message} ${frames[frame]}`);
    }, 100);
  } else {
    output.write(`${message}\n`);
  }
  return () => {
    if (timer) clearInterval(timer);
    if (tty) output.write(`\r\x1b[2K`);
  };
};

export const deployCommandFor = (directory: string) =>
  `cd ${directory} && docker compose --env-file .env.production.local build app && docker compose --env-file .env.production.local up -d app && docker compose --env-file .env.production.local ps`;

const numberValue = (values: Map<string, string>, key: string) => Number(values.get(key));
const masked = (value?: string) => (value ? '[設定済み]' : '[未設定]');
const safeUrl = (value?: string) =>
  value?.replace(/:\/\/([^:/]+):[^@]*@/, '://$1:***@') ?? '[未設定]';

export const composeMysqlContainerId = (repositoryRoot: string) => {
  const result = spawnSync('docker', ['compose', 'ps', '-a', '-q', 'mysql'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : '';
};

const targetMysqlEnv = (repositoryRoot: string) => {
  const id = composeMysqlContainerId(repositoryRoot);
  if (!id) return new Map<string, string>();
  const inspected = spawnSync(
    'docker',
    ['inspect', '--format', '{{range .Config.Env}}{{println .}}{{end}}', id],
    { encoding: 'utf8' }
  );
  if (inspected.status !== 0) return new Map<string, string>();
  return parseEnv(inspected.stdout).values;
};

export const originDefaults = (origin: string) => {
  const hostname = new URL(origin).hostname;
  return { rpId: hostname, issuer: hostname };
};

const islandCount = async (connectionString?: string): Promise<number | null> => {
  if (!connectionString?.startsWith('mysql:')) return null;
  try {
    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection(connectionString);
    try {
      const [rows] = await connection.query<any[]>('SELECT COUNT(*) AS count FROM island');
      return Number(rows[0]?.count);
    } finally {
      await connection.end();
    }
  } catch {
    return null;
  }
};

const questionSecret = async (prompt: string) => {
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  let result = '';
  try {
    return await new Promise<string>((resolveValue, reject) => {
      const listener = (buffer: Buffer) => {
        const text = buffer.toString('utf8');
        if (text === '\u0003') {
          stdin.off('data', listener);
          reject(new Error('cancelled'));
          return;
        }
        if (text === '\r' || text === '\n') {
          stdin.off('data', listener);
          stdout.write('\n');
          resolveValue(result);
          return;
        }
        if (text === '\u007f') {
          result = result.slice(0, -1);
          return;
        }
        result += text;
      };
      stdin.on('data', listener);
    });
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
  }
};

const main = async () => {
  if (!stdin.isTTY)
    throw new Error('npm run setup requires an interactive TTY; no files were changed.');
  const stopSpinner = createSpinner('セットアップ情報を読み込み中...');
  let spinnerStopped = false;
  let rl: ReturnType<typeof createInterface> | undefined;
  const finishSpinner = () => {
    if (!spinnerStopped) stopSpinner();
    spinnerStopped = true;
  };
  try {
    const example = parseEnv(await readFile(resolve(root, '.env.example'), 'utf8')).values;
    const current = await loadProductionEnv(root);
    const hasLocal = existsSync(resolve(root, '.env.production.local'));
    const mysqlContainerId = composeMysqlContainerId(root);
    const hasTargetMysql = Boolean(mysqlContainerId);
    const existing =
      hasLocal ||
      hasTargetMysql ||
      Boolean(current.get('DB_CONNECTION_STRING') || current.get('PASSKEY_FP_PEPPER'));
    // One-time migration from the repository's former Compose credentials. The
    // application URL is authoritative for user/password/database; the legacy root
    // candidate is only accepted for an already-existing legacy volume.
    if (existing && hasTargetMysql && current.get('DB_CONNECTION_STRING')) {
      try {
        const url = new URL(current.get('DB_CONNECTION_STRING')!);
        if (url.protocol === 'mysql:') {
          current.set(
            'MYSQL_DATABASE',
            current.get('MYSQL_DATABASE') ?? decodeURIComponent(url.pathname.slice(1))
          );
          current.set('MYSQL_USER', current.get('MYSQL_USER') ?? decodeURIComponent(url.username));
          current.set(
            'MYSQL_PASSWORD',
            current.get('MYSQL_PASSWORD') ?? decodeURIComponent(url.password)
          );
          const containerEnv = targetMysqlEnv(root);
          if (!current.get('MYSQL_ROOT_PASSWORD') && containerEnv.get('MYSQL_ROOT_PASSWORD'))
            current.set('MYSQL_ROOT_PASSWORD', containerEnv.get('MYSQL_ROOT_PASSWORD')!);
          current.set(
            'DOCKER_DB_CONNECTION_STRING',
            current.get('DOCKER_DB_CONNECTION_STRING') ??
              `mysql://${encodeURIComponent(decodeURIComponent(url.username))}:${encodeURIComponent(decodeURIComponent(url.password))}@mysql:3306/${encodeURIComponent(decodeURIComponent(url.pathname.slice(1)))}`
          );
        }
      } catch {
        // Missing/invalid legacy credentials are handled by the fail-closed check.
      }
    }
    if (existing) {
      const missing = ['MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD', 'PASSKEY_FP_PEPPER'].filter(
        (key) => !current.get(key)
      );
      if (missing.length)
        throw new Error(
          `旧構成を含む既存環境のcredentialを安全に自動移行できません (${missing.join(', ')})。ファイルは変更していません。既存credentialを確認して .env.production.local へ手動移行した後、setupを再実行してください。`
        );
    }

    const baseValues = existing ? new Map(current) : new Map(example);
    if (!existing) {
      for (const key of [
        'NEXT_PUBLIC_RP_ID',
        'ISSUER',
        'PASSKEY_FP_PEPPER',
        'MODERATOR_INITIAL_PASSWORD',
        'MYSQL_PASSWORD',
        'MYSQL_ROOT_PASSWORD',
        'DB_CONNECTION_STRING',
        'DOCKER_DB_CONNECTION_STRING',
        'LOG_BASE_DIR',
        'LOG_TRANSPORT_MODE',
        'LOG_S3_BUCKET',
        'LOG_S3_REGION',
        'LOG_S3_ENDPOINT',
        'LOG_S3_ACCESS_KEY_ID',
        'LOG_S3_SECRET_ACCESS_KEY',
        'LOG_S3_KEY_PREFIX',
        'LOG_S3_FORCE_PATH_STYLE',
      ])
        baseValues.delete(key);
    }
    let values = new Map(baseValues);
    const generatedSecrets = existing
      ? undefined
      : {
          dbPassword: randomBytes(32).toString('base64url'),
          rootPassword: randomBytes(32).toString('base64url'),
          pepper: randomBytes(32).toString('base64url'),
        };
    const oldCron = values.get('NEXT_PUBLIC_TURN_CRON')!;
    const oldZone = values.get('NEXT_PUBLIC_TURN_TIMEZONE')!;
    const oldAnalysis = analyzeCron(oldCron, oldZone);
    const oldMap = mapSummary(numberValue(values, 'NEXT_PUBLIC_MAP_SIZE'));
    finishSpinner();
    console.log('\n現在の設定');
    console.log(
      `Turn: ${oldCron} / ${oldZone} / ${oldAnalysis.fixed ? `${oldAnalysis.turnsPerDay} turn/day` : 'turn/day: 可変'}`
    );
    console.log(
      `Map: ${oldMap.size} x ${oldMap.size}, ${oldMap.hexes} HEX, 理論最大面積 ${oldMap.maxArea}万坪`
    );
    console.log(
      `Population: 自然都市上限 ${oldMap.naturalPopulation}人 / 最大 ${oldMap.maxPopulation}人`
    );
    console.log(
      `Resources: 資金 ${values.get('NEXT_PUBLIC_INIT_MONEY')} / ${values.get('NEXT_PUBLIC_MAX_MONEY')}, 食料 ${values.get('NEXT_PUBLIC_INIT_FOOD')} / ${values.get('NEXT_PUBLIC_MAX_FOOD')}`
    );
    console.log(`DB: ${safeUrl(values.get('DB_CONNECTION_STRING'))}`);
    console.log(`Passkey pepper: ${masked(values.get('PASSKEY_FP_PEPPER'))}`);
    console.log(
      `Moderator initial bootstrap password: ${masked(values.get('MODERATOR_INITIAL_PASSWORD'))}`
    );

    console.log('\n操作方法:');
    console.log('- Enter: 現在値を維持');
    console.log('- 値を入力: 設定を変更');
    console.log('- undo または u: 1つ前の項目へ戻る');
    console.log('- Ctrl+C: セットアップを中止\n');

    rl = createInterface({ input: stdin, output: stdout });
    const answers: string[] = [];
    let answerIndex = 0;
    const ask = async (key: string, detail: string, currentValue: string) => {
      let raw: string;
      if (answerIndex < answers.length) {
        raw = answers[answerIndex];
      } else {
        const name = SETTING_NAMES[key] ?? key;
        console.log(`${key} (${name})`);
        raw = (await rl!.question(`${detail} [現在: ${currentValue}]: `)).trim();
        if (raw === 'undo' || raw === 'u') {
          if (answers.length > 0) answers.pop();
          throw new UndoRequested();
        }
        answers.push(raw);
      }
      answerIndex += 1;
      return raw || currentValue;
    };
    const askNumber = async (
      key: string,
      detail: string,
      currentValue: number,
      validate: (value: number) => boolean
    ) => {
      while (true) {
        const raw = await ask(key, detail, serializeNumber(currentValue));
        const value = Number(raw);
        if (Number.isFinite(value) && validate(value)) return value;
        console.log('入力値が範囲外です。');
        answers.splice(--answerIndex, 1);
      }
    };
    const askSecret = async (key: string, detail: string) => {
      let raw: string;
      if (answerIndex < answers.length) {
        raw = answers[answerIndex];
      } else {
        console.log(`${key} (${SETTING_NAMES[key] ?? key})`);
        rl!.pause();
        raw = (await questionSecret(`${detail} [現在: [未設定]]: `)).trim();
        rl!.resume();
        if (raw === 'undo' || raw === 'u') {
          if (answers.length > 0) answers.pop();
          throw new UndoRequested();
        }
        answers.push(raw);
      }
      answerIndex += 1;
      return raw;
    };
    while (true) {
      values = new Map(baseValues);
      answerIndex = 0;
      try {
        const zone = await ask('NEXT_PUBLIC_TURN_TIMEZONE', 'timezone', oldZone);
        const cron = await ask('NEXT_PUBLIC_TURN_CRON', 'cron式', oldCron);
        const analysis =
          cron === oldCron && zone === oldZone ? oldAnalysis : analyzeCron(cron, zone);
        if (!analysis.fixed || !analysis.turnsPerDay)
          throw new Error(
            `このsetupでは、1日あたりのターン数が一定になるcronのみ対応しています (${analysis.counts.join(', ')})。設定は保存していません。`
          );
        values.set('NEXT_PUBLIC_TURN_TIMEZONE', zone);
        values.set('NEXT_PUBLIC_TURN_CRON', cron);
        console.log(
          `${analysis.turnsPerDay} turn/day / 名目平均 ${serializeNumber(1440 / analysis.turnsPerDay)}分/turn`
        );
        const oldTurns = oldAnalysis.turnsPerDay;

        const existingIslandCount = existing
          ? await islandCount(values.get('DB_CONNECTION_STRING'))
          : 0;
        const mapLocked = existing && existingIslandCount !== 0;
        const mapSize = mapLocked
          ? oldMap.size
          : await askNumber(
              'NEXT_PUBLIC_MAP_SIZE',
              '一辺のHEX数',
              oldMap.size,
              (v) => Number.isInteger(v) && v >= 8
            );
        values.set('NEXT_PUBLIC_MAP_SIZE', String(mapSize));
        const summary = mapSummary(mapSize);
        console.log(
          `${summary.hexes} HEX / 理論最大面積 ${summary.maxArea}万坪 / 理論人口 ${summary.naturalPopulation}〜${summary.maxPopulation}人${mapLocked ? ' (既存DBのため変更不可)' : ''}`
        );

        for (const key of DAILY_KEYS) {
          const oldDaily = oldTurns ? eventsPerDay(numberValue(values, key), oldTurns) : NaN;
          if (!Number.isFinite(oldDaily))
            throw new Error(
              `旧cronが可変のため ${key} の期待回数/dayを明示設定できません。cronと旧rateを確認してください。`
            );
          const daily = await askNumber(
            key,
            '期待回数/day',
            oldDaily,
            (v) => v >= 0 && v <= analysis.turnsPerDay!
          );
          values.set(key, serializeNumber(ratePerTurn(daily, analysis.turnsPerDay)));
        }
        const ratio = (numberValue(values, 'NEXT_PUBLIC_FALL_DOWN_BORDER') / summary.maxArea) * 100;
        const nextRatio = await askNumber(
          'NEXT_PUBLIC_FALL_DOWN_BORDER',
          '理論最大面積に対する割合 (%)',
          ratio,
          (v) => v >= 0 && v <= 100
        );
        const border = fallDownBorder(mapSize, nextRatio);
        values.set('NEXT_PUBLIC_FALL_DOWN_BORDER', String(border.border));
        const fallDaily = eventsPerDay(
          numberValue(values, 'NEXT_PUBLIC_FALL_DOWN_RATE'),
          oldTurns!
        );
        values.set(
          'NEXT_PUBLIC_FALL_DOWN_RATE',
          serializeNumber(
            ratePerTurn(
              await askNumber(
                'NEXT_PUBLIC_FALL_DOWN_RATE',
                '対象面積を超えた1島の期待回数/day',
                fallDaily,
                (v) => v >= 0 && v <= analysis.turnsPerDay!
              ),
              analysis.turnsPerDay
            )
          )
        );
        console.log(`境界 ${border.border}万坪 (>); 最初の対象 ${border.firstAffectedArea}万坪`);

        const multiplier = await askNumber(
          'NEXT_PUBLIC_MONSTER_POPULATION_MULTIPLIER_PER_EXTRA_1M',
          '100万人超過ごとの倍率係数',
          numberValue(values, 'NEXT_PUBLIC_MONSTER_POPULATION_MULTIPLIER_PER_EXTRA_1M'),
          (v) => v >= 0
        );
        values.set(
          'NEXT_PUBLIC_MONSTER_POPULATION_MULTIPLIER_PER_EXTRA_1M',
          serializeNumber(multiplier)
        );
        const belowDaily = eventsPerDay(
          monsterRateBelow1M(
            numberValue(values, 'NEXT_PUBLIC_MONSTER_SPAWN_RATE_BELOW_1M'),
            500_000
          ),
          oldTurns!
        );
        const belowTarget = await askNumber(
          'NEXT_PUBLIC_MONSTER_SPAWN_RATE_BELOW_1M',
          '50万人・自然怪獣なしでの判定期待回数/day',
          belowDaily,
          (v) => v >= 0 && v <= analysis.turnsPerDay!
        );
        values.set(
          'NEXT_PUBLIC_MONSTER_SPAWN_RATE_BELOW_1M',
          serializeNumber(ratePerTurn(belowTarget, analysis.turnsPerDay) * 2)
        );
        const referenceArea = Math.min(5000, summary.maxArea);
        const aboveDaily = eventsPerDay(
          monsterRateAbove1M(
            numberValue(values, 'NEXT_PUBLIC_MONSTER_RATE'),
            1_000_000,
            referenceArea,
            multiplier
          ),
          oldTurns!
        );
        const aboveTarget = await askNumber(
          'NEXT_PUBLIC_MONSTER_RATE',
          `100万人・${referenceArea}万坪での判定期待回数/day`,
          aboveDaily,
          (v) => v >= 0 && v <= analysis.turnsPerDay!
        );
        values.set(
          'NEXT_PUBLIC_MONSTER_RATE',
          serializeNumber(ratePerTurn(aboveTarget, analysis.turnsPerDay) / (referenceArea / 100))
        );
        for (const population of [
          500_000, 990_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000,
        ]) {
          const rate =
            population < 1_000_000
              ? monsterRateBelow1M(
                  numberValue(values, 'NEXT_PUBLIC_MONSTER_SPAWN_RATE_BELOW_1M'),
                  population
                )
              : monsterRateAbove1M(
                  numberValue(values, 'NEXT_PUBLIC_MONSTER_RATE'),
                  population,
                  referenceArea,
                  multiplier
                );
          console.log(
            `怪獣 ${population}人: ${serializeNumber(eventsPerDay(rate, analysis.turnsPerDay))} 判定期待回数/day${population > summary.maxPopulation ? ' (現マップでは理論上到達不能)' : ''}`
          );
        }

        const firePopulation = 10_000;
        const divisor = numberValue(values, 'NEXT_PUBLIC_FIRE_POPULATION_DIVISOR');
        const fireDaily = eventsPerDay(
          fireRate(numberValue(values, 'NEXT_PUBLIC_FIRE_RATE'), firePopulation, divisor),
          oldTurns!
        );
        const fireTarget = await askNumber(
          'NEXT_PUBLIC_FIRE_RATE',
          '1万人HEXの判定期待回数/day (保護条件を除く)',
          fireDaily,
          (v) => v >= 0 && v <= analysis.turnsPerDay!
        );
        values.set(
          'NEXT_PUBLIC_FIRE_RATE',
          serializeNumber(
            (ratePerTurn(fireTarget, analysis.turnsPerDay) * divisor) / (firePopulation * 100)
          )
        );
        const weights = [
          'NEXT_PUBLIC_FIRE_SMALL_WEIGHT',
          'NEXT_PUBLIC_FIRE_LARGE_WEIGHT',
          'NEXT_PUBLIC_FIRE_CATASTROPHIC_WEIGHT',
        ];
        if (
          weights.reduce((sum, key) => sum + numberValue(values, key), 0) < 1 ||
          weights.some(
            (key) => !Number.isInteger(numberValue(values, key)) || numberValue(values, key) < 0
          )
        )
          throw new Error('Fire weights must be non-negative integers with a positive total');

        const percentDetails: Record<(typeof PERCENT_SETTING_KEYS)[number], string> = {
          NEXT_PUBLIC_BURIED_TREASURE_RATE: '整地1回あたりの発見率 (%)',
          NEXT_PUBLIC_OIL_FIELD_RATE: '海掘削1回あたりの発見率 (%)',
          NEXT_PUBLIC_OIL_EXHAUSTION_RATE: '油田1HEX・1turnあたりの枯渇率 (%)',
          NEXT_PUBLIC_CONTINUOUS_METEORITE_RATE: '隕石発生後の連続落下率 (%)',
          NEXT_PUBLIC_VILLAGE_APPEARANCE_RATE: '対象HEX・1turnあたりの出現率 (%)',
        };
        for (const key of PERCENT_SETTING_KEYS)
          values.set(
            key,
            serializeNumber(
              await askNumber(
                key,
                percentDetails[key],
                numberValue(values, key),
                (v) => v >= 0 && v <= 100
              )
            )
          );

        for (const key of [
          'NEXT_PUBLIC_INIT_MONEY',
          'NEXT_PUBLIC_MAX_MONEY',
          'NEXT_PUBLIC_INIT_FOOD',
          'NEXT_PUBLIC_MAX_FOOD',
          'NEXT_PUBLIC_PLAN_LENGTH',
        ])
          values.set(
            key,
            String(
              await askNumber(
                key,
                key.includes('MONEY') ? '資金' : key.includes('FOOD') ? '食料' : '件数',
                numberValue(values, key),
                (v) =>
                  Number.isInteger(v) &&
                  v >= (key === 'NEXT_PUBLIC_PLAN_LENGTH' ? 1 : 0) &&
                  v <= 2_147_483_647
              )
            )
          );
        if (
          numberValue(values, 'NEXT_PUBLIC_MAX_MONEY') <
            numberValue(values, 'NEXT_PUBLIC_INIT_MONEY') ||
          numberValue(values, 'NEXT_PUBLIC_MAX_FOOD') < numberValue(values, 'NEXT_PUBLIC_INIT_FOOD')
        )
          throw new Error('Resource maximum must not be below its initial value');

        const origin = await ask(
          'NEXT_PUBLIC_ORIGIN_URL',
          'URL',
          values.get('NEXT_PUBLIC_ORIGIN_URL') ?? 'http://localhost:3000'
        );
        values.set('NEXT_PUBLIC_ORIGIN_URL', origin);
        values.set('DOCKER_NEXT_PUBLIC_ORIGIN_URL', origin);
        const derivedOrigin = originDefaults(origin);
        values.set(
          'NEXT_PUBLIC_RP_ID',
          await ask(
            'NEXT_PUBLIC_RP_ID',
            'RP ID',
            values.get('NEXT_PUBLIC_RP_ID') ?? derivedOrigin.rpId
          )
        );
        values.set(
          'ISSUER',
          await ask('ISSUER', 'issuer', values.get('ISSUER') ?? derivedOrigin.issuer)
        );
        if (!existing) {
          const dbName = await ask(
            'MYSQL_DATABASE',
            'database名',
            values.get('MYSQL_DATABASE') ?? 'hakoniwa'
          );
          const dbUser = await ask(
            'MYSQL_USER',
            'user名',
            values.get('MYSQL_USER') ?? 'hakoniwa_user'
          );
          const hostPort = await askNumber(
            'MYSQL_HOST_PORT',
            'host側port',
            13306,
            (v) => Number.isInteger(v) && v > 0 && v <= 65535
          );
          const moderatorId = await ask(
            'MODERATOR_INITIAL_ID',
            '初期ID',
            values.get('MODERATOR_INITIAL_ID') ?? 'moderator0001'
          );
          const moderatorName = await ask(
            'MODERATOR_INITIAL_USER_NAME',
            '表示名',
            values.get('MODERATOR_INITIAL_USER_NAME') ?? 'Moderator'
          );
          const dbPassword = generatedSecrets!.dbPassword;
          values.set('DB_TYPE', 'mysql');
          values.set('MYSQL_DATABASE', dbName);
          values.set('MYSQL_USER', dbUser);
          values.set('MYSQL_PASSWORD', dbPassword);
          values.set('MYSQL_ROOT_PASSWORD', generatedSecrets!.rootPassword);
          values.set('PASSKEY_FP_PEPPER', generatedSecrets!.pepper);
          values.set(
            'DB_CONNECTION_STRING',
            `mysql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@127.0.0.1:${hostPort}/${encodeURIComponent(dbName)}`
          );
          values.set(
            'DOCKER_DB_CONNECTION_STRING',
            `mysql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@mysql:3306/${encodeURIComponent(dbName)}`
          );
          values.set('MODERATOR_INITIAL_ID', moderatorId);
          values.set('MODERATOR_INITIAL_USER_NAME', moderatorName);
          const password = await askSecret('MODERATOR_INITIAL_PASSWORD', 'password');
          if (!password) throw new Error('Moderator bootstrap password is required');
          const passwordConfirmation = await askSecret(
            'MODERATOR_INITIAL_PASSWORD',
            'password (確認)'
          );
          if (password !== passwordConfirmation)
            throw new Error(
              'Moderator bootstrap passwordが確認入力と一致しません。設定は保存していません。'
            );
          values.set('MODERATOR_INITIAL_PASSWORD', password);
        }

        console.log('\n変更予定 (secretはマスク)');
        for (const [key, value] of values)
          if (current.get(key) !== value)
            console.log(`${key}: ${SECRET_KEYS.has(key) ? '[変更/生成予定]' : value}`);
        if (oldAnalysis.turnsPerDay !== analysis.turnsPerDay)
          console.log('注意: 人口成長・生産・消費等の1日あたり進行速度も変わります。');
        const confirmation = await ask('最終確認', 'この内容で保存しますか? [y/N/undo]', 'N');
        if (confirmation.toLowerCase() !== 'y') {
          console.log('キャンセルしました。変更はありません。');
          return;
        }

        const productionKeys = new Set(
          [...values.keys()].filter(
            (key) =>
              (key.startsWith('NEXT_PUBLIC_') && !LOCAL_KEYS.has(key)) || PUBLIC_COMMON.has(key)
          )
        );
        const localKeys = LOCAL_KEYS;
        const productionDoc = parseEnv(
          await readFile(resolve(root, '.env.production'), 'utf8').catch(() => '')
        );
        const localDoc = parseEnv(
          await readFile(resolve(root, '.env.production.local'), 'utf8').catch(() => '')
        );
        const productionValues = new Map([...values].filter(([key]) => productionKeys.has(key)));
        const localValues = new Map([...values].filter(([key]) => localKeys.has(key)));
        const production = updateEnv(
          productionDoc,
          productionValues,
          new Set([...productionKeys, ...localKeys])
        );
        const local = updateEnv(localDoc, localValues, new Set([...productionKeys, ...localKeys]));
        parseEnv(production);
        parseEnv(local);
        await atomicUpdate(root, [
          { file: '.env.production', content: production },
          { file: '.env.production.local', content: local, secret: true },
        ]);
        const verified = await loadProductionEnv(root);
        const verifiedProduction = parseEnv(
          await readFile(resolve(root, '.env.production'), 'utf8')
        ).values;
        const verifiedLocal = parseEnv(
          await readFile(resolve(root, '.env.production.local'), 'utf8')
        ).values;
        for (const key of localKeys)
          if (verifiedProduction.has(key))
            throw new Error(
              `保存後検証に失敗しました: local-only key ${key} が公開設定へ混入しています。`
            );
        for (const [key, expected] of productionValues)
          if (verifiedProduction.get(key) !== expected)
            throw new Error(`保存後検証に失敗しました: ${key} の保存値が一致しません。`);
        for (const [key, expected] of localValues)
          if (verifiedLocal.get(key) !== expected)
            throw new Error(`保存後検証に失敗しました: ${key} の保存値が一致しません。`);
        const localMode = (await stat(resolve(root, '.env.production.local'))).mode & 0o777;
        if (localMode !== 0o600)
          throw new Error(
            '保存後検証に失敗しました: .env.production.local の権限が0600ではありません。'
          );
        for (const key of [...DAILY_KEYS, 'NEXT_PUBLIC_MAP_SIZE', 'NEXT_PUBLIC_MAX_MONEY'])
          if (!Number.isFinite(Number(verified.get(key))))
            throw new Error(`保存後検証に失敗しました: ${key} が数値ではありません。`);
        const verifiedCron = analyzeCron(
          verified.get('NEXT_PUBLIC_TURN_CRON')!,
          verified.get('NEXT_PUBLIC_TURN_TIMEZONE')!
        );
        if (verifiedCron.turnsPerDay !== analysis.turnsPerDay)
          throw new Error('Post-write cron verification failed');
        console.log('\n設定を保存しました。secretは変更内容へ表示していません。');
        console.log('\n変更を反映するには、次のコマンドを実行してください。\n');
        console.log(deployCommandFor(root));
        return;
      } catch (error) {
        if (error instanceof UndoRequested) continue;
        throw error;
      }
    }
  } finally {
    finishSpinner();
    rl?.close();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message.replace(/:\/\/([^:/]+):[^@]*@/g, '://$1:***@')
        : 'Setup failed'
    );
    process.exitCode = 1;
  });
