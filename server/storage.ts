import fs from 'node:fs/promises';
import path from 'node:path';
import type { SavedPeriodRecord } from '../src/types/airQuality';

const DATA_DIR = path.resolve(process.cwd(), '.studio-data');
const STORE_FILE = path.join(DATA_DIR, 'saved-periods.json');

async function ensureStoreFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, '[]', 'utf-8');
  }
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

export async function savePeriodRecord(record: SavedPeriodRecord): Promise<SavedPeriodRecord[]> {
  const existing = await listSavedPeriods();
  const filtered = existing.filter((item) => item.id !== record.id);
  const updated = [record, ...filtered];
  const tempFile = `${STORE_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(updated, null, 2), 'utf-8');
  await fs.rename(tempFile, STORE_FILE);
  return updated;
}

export async function deleteSavedPeriod(id: string): Promise<SavedPeriodRecord[]> {
  const existing = await listSavedPeriods();
  const updated = existing.filter((item) => item.id !== id);
  const tempFile = `${STORE_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(updated, null, 2), 'utf-8');
  await fs.rename(tempFile, STORE_FILE);
  return updated;
}
