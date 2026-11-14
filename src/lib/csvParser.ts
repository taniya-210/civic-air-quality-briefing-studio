import type { ColumnMapping, RawParsedTable } from '../types/airQuality';

const DELIMITER_CANDIDATES = [',', '\t', ';', '|'] as const;

function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/**
 * Splits a single delimited text line respecting RFC-4180 double-quoted fields.
 */
function parseLine(line: string, delimiter: string): string[] {
  if (delimiter === 'WHITESPACE') {
    return line.trim().split(/\s{2,}/).map((s) => s.trim());
  }

  // Fast path for unquoted lines (dominant case in civic telemetry CSVs)
  if (!line.includes('"')) {
    return line.split(delimiter).map((s) => s.trim());
  }

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
 * Splits multi-line delimited text into logical records while tracking 1-based physical line numbers.
 */
function splitLogicalLines(text: string): { line: string; lineNumber: number }[] {
  // Fast linear split when no quoted multi-line cells exist
  if (!text.includes('"')) {
    const rawLines = text.split(/\r\n|\n|\r/);
    const result: { line: string; lineNumber: number }[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      if (rawLines[i].trim().length > 0) {
        result.push({ line: rawLines[i], lineNumber: i + 1 });
      }
    }
    return result;
  }

  const lines: { line: string; lineNumber: number }[] = [];
  let current = '';
  let inQuotes = false;
  let physicalLine = 1;
  let recordStartLine = 1;

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
        lines.push({ line: current, lineNumber: recordStartLine });
      }
      current = '';
      physicalLine++;
      recordStartLine = physicalLine;
    } else {
      current += ch;
    }
  }

  if (current.trim().length > 0) {
    lines.push({ line: current, lineNumber: recordStartLine });
  }

  return lines;
}

export function detectDelimiter(sampleLines: string[]): string {
  const probe = sampleLines.slice(0, 8);
  if (probe.length === 0) return ',';

  let bestDelimiter = ',';
  let bestScore = -1;

  for (const delim of DELIMITER_CANDIDATES) {
    const counts = probe.map((line) => parseLine(line, delim).length);
    const multiColCounts = counts.filter((c) => c >= 2);
    if (multiColCounts.length === 0) continue;

    const modeCount = multiColCounts[0];
    const consistentRows = multiColCounts.filter((c) => c === modeCount).length;
    const score = modeCount * 10 + consistentRows * 15;
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delim;
    }
  }

  if (bestScore > 0) return bestDelimiter;

  // Fallback for fixed-width / multi-space separated tables pasted from reports
  const wsCounts = probe.map((line) => parseLine(line, 'WHITESPACE').length);
  if (wsCounts.some((c) => c >= 3)) {
    return 'WHITESPACE';
  }

  return ',';
}

export function parseTabularText(rawInput: string): RawParsedTable {
  const cleanText = stripBom(rawInput).trim();
  if (!cleanText) {
    throw new Error('Input is empty. Upload a CSV file or paste tabular monitoring data.');
  }

  const logicalLines = splitLogicalLines(cleanText);
  if (logicalLines.length < 2) {
    throw new Error(
      'Data must contain a header row and at least one monitoring row.'
    );
  }

  const delimiter = detectDelimiter(logicalLines.map((l) => l.line));

  // Skip single-column report banners/preamble lines above the actual tabular header
  let headerIdx = 0;
  const skippedPreambleLines: string[] = [];
  while (headerIdx < logicalLines.length - 1) {
    const parsedCells = parseLine(logicalLines[headerIdx].line, delimiter);
    const nonEmptyCells = parsedCells.filter((c) => c.length > 0);
    if (parsedCells.length >= 2 && nonEmptyCells.length >= 2) {
      break;
    }
    skippedPreambleLines.push(logicalLines[headerIdx].line.trim());
    headerIdx++;
  }

  const rawHeaders = parseLine(logicalLines[headerIdx].line, delimiter);
  const headerLineNumber = logicalLines[headerIdx].lineNumber;

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
      'Could not detect multiple columns. Ensure values are separated by commas, tabs, semicolons, or multiple spaces.'
    );
  }

  const rows: Record<string, string>[] = [];
  const rowLineNumbers: number[] = [];
  for (let i = headerIdx + 1; i < logicalLines.length; i++) {
    const cells = parseLine(logicalLines[i].line, delimiter);
    // Skip repeated inline separator lines like "---+---+---" or "---|---"
    const rawTrimmed = logicalLines[i].line.trim();
    if (
      (/[-=_*]{2,}/.test(rawTrimmed)) &&
      cells.every((c) => c === '' || /^[-=_*+:|]+$/.test(c))
    ) {
      continue;
    }
    const record: Record<string, string> = {};
    for (let colIdx = 0; colIdx < uniqueHeaders.length; colIdx++) {
      record[uniqueHeaders[colIdx]] = (cells[colIdx] ?? '').trim();
    }
    rows.push(record);
    rowLineNumbers.push(logicalLines[i].lineNumber);
  }

  if (rows.length === 0) {
    throw new Error('Header row was found, but zero monitoring data rows followed.');
  }

  return {
    headers: uniqueHeaders,
    rows,
    rowLineNumbers,
    headerLineNumber,
    skippedPreambleLines,
    detectedDelimiter: delimiter === '\t' ? 'TAB' : delimiter === 'WHITESPACE' ? 'SPACES' : delimiter,
    totalRawLines: logicalLines.length,
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
