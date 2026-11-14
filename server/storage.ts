import fs from 'node:fs/promises';
import path from 'node:path';
import type { SavedPeriodRecord } from '../src/types/airQuality';

const DATA_DIR = path.resolve(process.cwd(), '.studio-data');
const STORE_FILE = path.join(DATA_DIR, 'saved-periods.json');

// Serialize writes so concurrent POST/DELETE calls never collide on temp file renames
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(task, task);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function ensureStoreFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, '[]', 'utf-8');
  }
}

async function atomicWritePeriods(periods: SavedPeriodRecord[]): Promise<void> {
  await ensureStoreFile();
  const uniqueTempFile = `${STORE_FILE}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2, 7)}.tmp`;
  await fs.writeFile(uniqueTempFile, JSON.stringify(periods, null, 2), 'utf-8');
  await fs.rename(uniqueTempFile, STORE_FILE);
}

export async function listSavedPeriods(): Promise<SavedPeriodRecord[]> {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_FILE, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedPeriodRecord[];
  } catch {
    return [];
  }
}

export function savePeriodRecord(record: SavedPeriodRecord): Promise<SavedPeriodRecord[]> {
  return enqueueWrite(async () => {
    const existing = await listSavedPeriods();
    const filtered = existing.filter((item) => item.id !== record.id);
    const updated = [record, ...filtered];
    await atomicWritePeriods(updated);
    return updated;
  });
}

export function deleteSavedPeriod(id: string): Promise<SavedPeriodRecord[]> {
  return enqueueWrite(async () => {
    const existing = await listSavedPeriods();
    const updated = existing.filter((item) => item.id !== id);
    await atomicWritePeriods(updated);
    return updated;
  });
}
