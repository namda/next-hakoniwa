import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type EnvDocument = { lines: string[]; values: Map<string, string> };

const decode = (raw: string) => {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value.replace(/\s+#.*$/, '');
};

export const parseEnv = (text: string): EnvDocument => {
  const values = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match) values.set(match[1], decode(match[2]));
  }
  return { lines, values };
};

export const quoteEnv = (value: string) => {
  if (value.includes('\0') || value.includes('\n') || value.includes('\r'))
    throw new Error('Env values cannot contain NUL or newlines');
  return /^[A-Za-z0-9_./:@%+,-]*$/.test(value) ? value : JSON.stringify(value);
};

export const updateEnv = (
  document: EnvDocument,
  updates: Map<string, string>,
  managed: Set<string>
) => {
  const emitted = new Set<string>();
  const lines = document.lines.flatMap((line) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!match || !managed.has(match[1])) return [line];
    const key = match[1];
    if (emitted.has(key)) return [];
    emitted.add(key);
    return updates.has(key) ? [`${key}=${quoteEnv(updates.get(key)!)}`] : [];
  });
  for (const [key, value] of updates)
    if (!emitted.has(key)) lines.push(`${key}=${quoteEnv(value)}`);
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
};

export const loadProductionEnv = async (root: string) => {
  // Common tracked values are loaded first; host-specific values override them.
  // .env.local is intentionally excluded from production setup state.
  const files = ['.env', '.env.production', '.env.production.local'];
  const result = new Map<string, string>();
  for (const file of files) {
    try {
      for (const [key, value] of parseEnv(await readFile(join(root, file), 'utf8')).values)
        result.set(key, value);
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return result;
};

const uniqueBackup = async (dir: string, name: string) => {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  for (let suffix = 0; ; suffix += 1) {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14);
    const path = join(dir, `${name}.${stamp}${suffix ? `-${suffix}` : ''}.bak`);
    try {
      const handle = await open(path, 'wx', 0o600);
      await handle.close();
      return path;
    } catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
};

export const atomicUpdate = async (
  root: string,
  updates: { file: string; content: string; secret?: boolean }[]
) => {
  const backups: { target: string; backup?: string }[] = [];
  const temps: string[] = [];
  try {
    for (const update of updates) {
      const target = join(root, update.file);
      let backup: string | undefined;
      try {
        await stat(target);
        backup = await uniqueBackup(join(root, '.setup-backups'), update.file.replaceAll('/', '_'));
        await copyFile(target, backup);
        await chmod(backup, 0o600);
      } catch (error: any) {
        if (error.code !== 'ENOENT') throw error;
      }
      backups.push({ target, backup });
      const temp = join(dirname(target), `.${update.file.replaceAll('/', '_')}.${process.pid}.tmp`);
      await writeFile(temp, update.content, { mode: update.secret ? 0o600 : 0o644, flag: 'wx' });
      temps.push(temp);
    }
    for (let index = 0; index < updates.length; index += 1)
      await rename(temps[index], backups[index].target);
  } catch (error) {
    for (const temp of temps) await unlink(temp).catch(() => undefined);
    for (const item of backups) if (item.backup) await copyFile(item.backup, item.target);
    throw error;
  }
};
