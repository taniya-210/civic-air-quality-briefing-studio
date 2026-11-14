import type { ColumnMapping, RawParsedTable } from '../types/airQuality';

const DELIMITER_CANDIDATES = [',', '\t', ';', '|'] as const;

function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/**
 * Splits a single delimited text line respecting RFC-4180 double-quoted fields.
 */
function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Splits multi-line delimited text into logical records (preserving newlines inside quotes).
 */
function splitLogicalLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      if (current.trim().length > 0) {
        lines.push(current);
      }
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim().length > 0) {
    lines.push(current);
  }

  return lines;
}

export function detectDelimiter(sampleLines: string[]): string {
  const probe = sampleLines.slice(0, 5);
  if (probe.length === 0) return ',';

  let bestDelimiter = ',';
  let bestScore = -1;

  for (const delim of DELIMITER_CANDIDATES) {
    const counts = probe.map((line) => parseLine(line, delim).length);
    const first = counts[0];
    if (first <= 1) continue;

    const consistent = counts.every((c) => c === first);
    const score = first * 10 + (consistent ? 25 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

export function parseTabularText(rawInput: string): RawParsedTable {
  const cleanText = stripBom(rawInput).trim();
  if (!cleanText) {
    throw new Error('Input is empty. Upload a CSV file or paste tabular monitoring data.');
  }

  const lines = splitLogicalLines(cleanText);
  if (lines.length < 2) {
    throw new Error(
      'Data must contain a header row and at least one monitoring row.'
    );
  }

  const delimiter = detectDelimiter(lines);
  const rawHeaders = parseLine(lines[0], delimiter);

  const headers = rawHeaders.map((h, idx) => {
    const cleaned = h.trim();
    return cleaned.length > 0 ? cleaned : `Column_${idx + 1}`;
  });

  // Deduplicate identical header names so row mapping never collides silently
  const seenHeaderCounts = new Map<string, number>();
  const uniqueHeaders = headers.map((header) => {
    const count = seenHeaderCounts.get(header) ?? 0;
    seenHeaderCounts.set(header, count + 1);
    return count === 0 ? header : `${header}_${count + 1}`;
  });

  if (uniqueHeaders.length < 2) {
    throw new Error(
      'Could not detect multiple columns. Ensure values are separated by commas, tabs, or semicolons.'
    );
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i], delimiter);
    const record: Record<string, string> = {};
    for (let colIdx = 0; colIdx < uniqueHeaders.length; colIdx++) {
      record[uniqueHeaders[colIdx]] = (cells[colIdx] ?? '').trim();
    }
    rows.push(record);
  }

  return {
    headers: uniqueHeaders,
    rows,
    detectedDelimiter: delimiter === '\t' ? 'TAB' : delimiter,
    totalRawLines: lines.length,
  };
}

const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  pollutant: [
    'pollutant',
    'parameter',
    'param',
    'contaminant',
    'analyte',
    'species',
    'metric',
    'gas',
  ],
  location: [
    'location',
    'station',
    'site',
    'ward',
    'zone',
    'area',
    'sensor',
    'monitor',
    'locality',
    'station_name',
    'site_name',
  ],
  timestamp: [
    'timestamp',
    'datetime',
    'date_time',
    'time',
    'date',
    'recorded_at',
    'measured_at',
    'observed_at',
    'utc',
    'local_time',
  ],
  value: [
    'value',
    'concentration',
    'reading',
    'measurement',
    'val',
    'avg',
    'level',
    'conc',
    'result',
  ],
  unit: ['unit', 'units', 'uom', 'measure_unit', 'unit_name'],
};

export function inferColumnMapping(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map((h) => ({
    original: h,
    norm: h.toLowerCase().replace(/[^a-z0-9_]/g, ''),
  }));

  const used = new Set<string>();
  const mapping: ColumnMapping = {
    pollutant: '',
    location: '',
    timestamp: '',
    value: '',
    unit: '',
  };

  const fields: (keyof ColumnMapping)[] = [
    'pollutant',
    'location',
    'timestamp',
    'value',
    'unit',
  ];

  // Exact or strong substring match pass
  for (const field of fields) {
    const aliases = COLUMN_ALIASES[field];
    const exactMatch = normalizedHeaders.find(
      (h) => !used.has(h.original) && aliases.includes(h.norm)
    );
    if (exactMatch) {
      mapping[field] = exactMatch.original;
      used.add(exactMatch.original);
      continue;
    }

    const partialMatch = normalizedHeaders.find(
      (h) =>
        !used.has(h.original) &&
        aliases.some((alias) => h.norm.includes(alias) || alias.includes(h.norm))
    );
    if (partialMatch) {
      mapping[field] = partialMatch.original;
      used.add(partialMatch.original);
    }
  }

  // Fallback positional heuristic only if header names are unrecognized and exactly 5 columns exist
  for (const field of fields) {
    if (!mapping[field]) {
      const remaining = headers.find((h) => !used.has(h));
      if (remaining) {
        mapping[field] = remaining;
        used.add(remaining);
      }
    }
  }

  return mapping;
}
