import type {
  AnalysisResult,
  AveragingAssessmentStatus,
  ColumnMapping,
  DataQualityReport,
  FlaggedRow,
  HotspotItem,
  LocationPollutantStats,
  ObservedPeak,
  PeriodComparisonResult,
  PollutantComparisonItem,
  PollutantSummary,
  PollutantThreshold,
  RawParsedTable,
  ReliabilityStatus,
  RowIssue,
  SavedPeriodRecord,
  TrendAnalysis,
  ValidatedReading,
  ValidWindowAverage,
} from '../types/airQuality';

const POLLUTANT_THRESHOLDS: Record<string, PollutantThreshold> = {
  'PM2.5': {
    pollutant: 'PM2.5',
    unit: 'µg/m³',
    averagingHours: 24,
    minSamplesPerWindow: 16,
    minSpanHoursPerWindow: 16,
    whoGuideline: 15,
    cpcbStandard: 60,
    referenceValue: 60,
    referenceLabel: 'CPCB 24-hour avg standard (60 µg/m³)',
  },
  PM10: {
    pollutant: 'PM10',
    unit: 'µg/m³',
    averagingHours: 24,
    minSamplesPerWindow: 16,
    minSpanHoursPerWindow: 16,
    whoGuideline: 45,
    cpcbStandard: 100,
    referenceValue: 100,
    referenceLabel: 'CPCB 24-hour avg standard (100 µg/m³)',
  },
  NO2: {
    pollutant: 'NO2',
    unit: 'µg/m³',
    averagingHours: 24,
    minSamplesPerWindow: 16,
    minSpanHoursPerWindow: 16,
    whoGuideline: 25,
    cpcbStandard: 80,
    referenceValue: 80,
    referenceLabel: 'CPCB 24-hour avg standard (80 µg/m³)',
  },
  SO2: {
    pollutant: 'SO2',
    unit: 'µg/m³',
    averagingHours: 24,
    minSamplesPerWindow: 16,
    minSpanHoursPerWindow: 16,
    whoGuideline: 40,
    cpcbStandard: 80,
    referenceValue: 80,
    referenceLabel: 'CPCB 24-hour avg standard (80 µg/m³)',
  },
  O3: {
    pollutant: 'O3',
    unit: 'µg/m³',
    averagingHours: 8,
    minSamplesPerWindow: 6,
    minSpanHoursPerWindow: 6,
    whoGuideline: 100,
    cpcbStandard: 100,
    referenceValue: 100,
    referenceLabel: 'WHO/CPCB 8-hour avg standard (100 µg/m³)',
  },
  CO: {
    pollutant: 'CO',
    unit: 'mg/m³',
    averagingHours: 8,
    minSamplesPerWindow: 6,
    minSpanHoursPerWindow: 6,
    whoGuideline: 4,
    cpcbStandard: 2,
    referenceValue: 2,
    referenceLabel: 'CPCB 8-hour avg standard (2 mg/m³)',
  },
  AQI: {
    pollutant: 'AQI',
    unit: 'index',
    averagingHours: 24,
    minSamplesPerWindow: 16,
    minSpanHoursPerWindow: 16,
    whoGuideline: null,
    cpcbStandard: 200,
    referenceValue: 200,
    referenceLabel: 'CPCB 24-hour Poor AQI threshold (200)',
  },
};

const MAX_PLAUSIBLE_VALUES: Record<string, number> = {
  'PM2.5': 2000,
  PM10: 3500,
  NO2: 2000,
  SO2: 2000,
  O3: 1500,
  CO: 100,
  AQI: 999,
};

const MISSING_SENTINELS = new Set([
  '',
  'na',
  'n/a',
  '#n/a',
  'null',
  'none',
  'nan',
  'nd',
  'bdl',
  'missing',
  '-',
  '--',
  '---',
  '?',
]);

export function isMissingSentinel(raw: string): boolean {
  return MISSING_SENTINELS.has(raw.trim().toLowerCase());
}

export function normalizePollutantName(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[\s_]+/g, '');
  if (cleaned === 'PM25' || cleaned === 'PM2.5' || cleaned === 'PM2,5') {
    return 'PM2.5';
  }
  if (cleaned === 'PM10') return 'PM10';
  if (cleaned === 'NO2' || cleaned === 'NITROGENDIOXIDE') return 'NO2';
  if (cleaned === 'SO2' || cleaned === 'SULFURDIOXIDE' || cleaned === 'SULPHURDIOXIDE') return 'SO2';
  if (cleaned === 'O3' || cleaned === 'OZONE') return 'O3';
  if (cleaned === 'CO' || cleaned === 'CARBONMONOXIDE') return 'CO';
  if (cleaned === 'AQI') return 'AQI';
  return raw.trim();
}

export function normalizeUnitString(raw: string): string {
  const trimmed = raw.trim();
  const low = trimmed.toLowerCase().replace(/\s+/g, '');
  if (
    low === 'ug/m3' ||
    low === 'µg/m3' ||
    low === 'μg/m3' ||
    low === 'ug/m^3' ||
    low === 'µg/m^3' ||
    low === 'mcg/m3' ||
    low === 'ugm-3' ||
    low === 'microgram/m3' ||
    low === 'micrograms/m3'
  ) {
    return 'µg/m³';
  }
  if (low === 'mg/m3' || low === 'mg/m^3' || low === 'mgm-3') {
    return 'mg/m³';
  }
  if (low === 'ppm') return 'ppm';
  if (low === 'ppb') return 'ppb';
  if (low === 'index' || low === 'aqi' || low === 'unitless') return 'index';
  return trimmed;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function parseTimestampStrict(raw: string): { iso: string; ms: number } | null {
  const trimmed = raw.trim();
  if (!trimmed || isMissingSentinel(trimmed)) return null;
  if (/^\d+$/.test(trimmed)) return null;

  // DD-MMM-YYYY [HH:mm[:ss]] e.g. 08-Nov-2026 06:00
  const dMonY = trimmed.match(
    /^(\d{1,2})[-\s/]([A-Za-z]{3})[-\s/](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (dMonY) {
    const day = Number(dMonY[1]);
    const month = MONTH_MAP[dMonY[2].toLowerCase()];
    const year = Number(dMonY[3]);
    const hour = dMonY[4] ? Number(dMonY[4]) : 0;
    const min = dMonY[5] ? Number(dMonY[5]) : 0;
    const sec = dMonY[6] ? Number(dMonY[6]) : 0;
    if (month !== undefined && day >= 1 && day <= 31 && hour <= 23 && min <= 59 && sec <= 59) {
      const date = new Date(year, month, day, hour, min, sec);
      if (!Number.isNaN(date.getTime()) && date.getMonth() === month && date.getDate() === day) {
        return { iso: date.toISOString(), ms: date.getTime() };
      }
    }
    return null;
  }

  // DD/MM/YYYY [HH:mm[:ss]] or DD-MM-YYYY [HH:mm[:ss]]
  const dmyMatch = trimmed.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    const hour = dmyMatch[4] ? Number(dmyMatch[4]) : 0;
    const min = dmyMatch[5] ? Number(dmyMatch[5]) : 0;
    const sec = dmyMatch[6] ? Number(dmyMatch[6]) : 0;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && min <= 59 && sec <= 59) {
      const date = new Date(year, month - 1, day, hour, min, sec);
      if (!Number.isNaN(date.getTime()) && date.getMonth() === month - 1 && date.getDate() === day) {
        return { iso: date.toISOString(), ms: date.getTime() };
      }
    }
    return null;
  }

  // YYYY/MM/DD [HH:mm[:ss]] or YYYY-MM-DD HH:mm[:ss]
  const ymdSlashNormalized = trimmed.replace(/^(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3');
  const isoCandidate = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(ymdSlashNormalized)
    ? ymdSlashNormalized.replace(/\s+/, 'T')
    : ymdSlashNormalized;

  const ms = Date.parse(isoCandidate);
  if (Number.isNaN(ms)) return null;

  const d = new Date(ms);
  if (d.getFullYear() < 1990 || d.getFullYear() > 2100) return null;

  return { iso: d.toISOString(), ms };
}

function roundTo(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function computePercentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function getSeriesSpanHours(readings: ValidatedReading[]): number {
  if (readings.length < 2) return 0;
  let minT = readings[0].timestampMs;
  let maxT = readings[0].timestampMs;
  for (let i = 1; i < readings.length; i++) {
    const t = readings[i].timestampMs;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  return roundTo((maxT - minT) / 3600000, 1);
}

function findObservedPeak(readings: ValidatedReading[]): ObservedPeak | null {
  if (readings.length === 0) return null;
  let peak = readings[0];
  for (let i = 1; i < readings.length; i++) {
    if (readings[i].value > peak.value) {
      peak = readings[i];
    }
  }
  return {
    value: roundTo(peak.value, 2),
    unit: peak.normalizedUnit,
    location: peak.location,
    timestampRaw: peak.timestampRaw,
    timestampIso: peak.timestampIso,
    rowIndex: peak.rowIndex,
  };
}

function evaluateRegulatoryWindowsForStation(
  stationReadings: ValidatedReading[],
  threshold: PollutantThreshold | null
): {
  validWindowAverages: ValidWindowAverage[];
  averagingStatus: AveragingAssessmentStatus;
  isPreliminary: boolean;
  averagingNote: string;
} {
  const spanHours = getSeriesSpanHours(stationReadings);

  if (!threshold) {
    return {
      validWindowAverages: [],
      averagingStatus: 'no_standard_configured',
      isPreliminary: spanHours < 24,
      averagingNote: `No ${stationReadings[0]?.pollutant ?? 'pollutant'} (${stationReadings[0]?.normalizedUnit ?? ''}) regulatory threshold configured; reporting observed statistics and peak only.`,
    };
  }

  const ordered = [...stationReadings].sort((a, b) => a.timestampMs - b.timestampMs);
  const winHours = threshold.averagingHours;
  const minSamples = threshold.minSamplesPerWindow;
  const minSpan = threshold.minSpanHoursPerWindow;

  const buckets = new Map<string, ValidatedReading[]>();
  for (const r of ordered) {
    const d = new Date(r.timestampMs);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key =
      winHours === 24
        ? `${yyyy}-${mm}-${dd}`
        : `${yyyy}-${mm}-${dd} [${String(Math.floor(d.getHours() / 8) * 8).padStart(2, '0')}:00–${String(
            Math.floor(d.getHours() / 8) * 8 + 8
          ).padStart(2, '0')}:00]`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }

  const validWindowAverages: ValidWindowAverage[] = [];
  for (const [windowLabel, rows] of buckets.entries()) {
    if (rows.length < minSamples) continue;
    const wSpan = getSeriesSpanHours(rows);
    if (wSpan < minSpan) continue;

    const avg = rows.reduce((s, r) => s + r.value, 0) / rows.length;
    const roundedAvg = roundTo(avg, 2);
    validWindowAverages.push({
      windowLabel,
      location: rows[0].location,
      pollutant: rows[0].pollutant,
      unit: threshold.unit,
      averagingHours: winHours,
      calculatedAverage: roundedAvg,
      readingCount: rows.length,
      spanHours: wSpan,
      standardValue: threshold.referenceValue,
      standardLabel: threshold.referenceLabel,
      exceedsStandard: roundedAvg > threshold.referenceValue,
    });
  }

  if (validWindowAverages.length === 0 && ordered.length >= minSamples && spanHours >= minSpan && spanHours <= 30) {
    const avg = ordered.reduce((s, r) => s + r.value, 0) / ordered.length;
    const roundedAvg = roundTo(avg, 2);
    const startLabel = ordered[0].timestampRaw;
    const endLabel = ordered[ordered.length - 1].timestampRaw;
    validWindowAverages.push({
      windowLabel: `${startLabel} to ${endLabel}`,
      location: ordered[0].location,
      pollutant: ordered[0].pollutant,
      unit: threshold.unit,
      averagingHours: winHours,
      calculatedAverage: roundedAvg,
      readingCount: ordered.length,
      spanHours,
      standardValue: threshold.referenceValue,
      standardLabel: threshold.referenceLabel,
      exceedsStandard: roundedAvg > threshold.referenceValue,
    });
  }

  if (validWindowAverages.length > 0) {
    const exceedCount = validWindowAverages.filter((w) => w.exceedsStandard).length;
    return {
      validWindowAverages,
      averagingStatus: 'regulatory_window_supported',
      isPreliminary: false,
      averagingNote: `${validWindowAverages.length} valid ${winHours}-hour average window(s) computed (>=${minSamples} readings covering >=${minSpan}h each); ${exceedCount} exceeded ${threshold.referenceLabel}.`,
    };
  }

  if (spanHours < winHours) {
    return {
      validWindowAverages: [],
      averagingStatus: 'preliminary_short_duration',
      isPreliminary: true,
      averagingNote: `Preliminary (${spanHours}h span < ${winHours}h): insufficient duration to calculate a valid ${winHours}-hour average against ${threshold.referenceLabel}. Reporting observed mean and observed peak only.`,
    };
  }

  return {
    validWindowAverages: [],
    averagingStatus: 'preliminary_intermittent_sampling',
    isPreliminary: true,
    averagingNote: `Preliminary (intermittent sampling: ${ordered.length} readings across ${spanHours}h): no single ${winHours}-hour window meets the minimum >=${minSamples} readings over >=${minSpan}h required for ${threshold.referenceLabel}. Individual readings are not compared to the ${winHours}-hour standard.`,
  };
}

function computeTrend(readings: ValidatedReading[]): TrendAnalysis {
  if (readings.length < 4) {
    return {
      direction: 'insufficient_data',
      slopePerHour: null,
      slopePerDay: null,
      firstHalfMean: null,
      secondHalfMean: null,
      deltaAbs: null,
      deltaPct: null,
      sampleCount: readings.length,
      spanHours: 0,
      note: `Insufficient data for trend analysis (${readings.length} readings; at least 4 time-ordered readings required).`,
    };
  }

  const ordered = [...readings].sort((a, b) => a.timestampMs - b.timestampMs);
  const t0 = ordered[0].timestampMs;
  const spanHours = (ordered[ordered.length - 1].timestampMs - t0) / 3600000;

  if (spanHours < 2) {
    return {
      direction: 'insufficient_data',
      slopePerHour: null,
      slopePerDay: null,
      firstHalfMean: null,
      secondHalfMean: null,
      deltaAbs: null,
      deltaPct: null,
      sampleCount: ordered.length,
      spanHours: roundTo(spanHours, 2),
      note: `Time span too short for trend estimation (${roundTo(spanHours, 2)}h; requires >= 2 hours).`,
    };
  }

  const xs = ordered.map((r) => (r.timestampMs - t0) / 3600000);
  const ys = ordered.map((r) => r.value);
  const n = ordered.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) * (xs[i] - meanX);
  }

  const slopePerHour = den > 0 ? num / den : 0;
  const slopePerDay = slopePerHour * 24;

  const mid = Math.floor(n / 2);
  const firstHalf = ys.slice(0, mid);
  const secondHalf = ys.slice(mid);
  const firstHalfMean = firstHalf.reduce((s, y) => s + y, 0) / firstHalf.length;
  const secondHalfMean = secondHalf.reduce((s, y) => s + y, 0) / secondHalf.length;
  const deltaAbs = secondHalfMean - firstHalfMean;
  const deltaPct = firstHalfMean !== 0 ? (deltaAbs / firstHalfMean) * 100 : null;

  const totalLinearShiftPct = meanY !== 0 ? (Math.abs(slopePerHour * spanHours) / meanY) * 100 : 0;
  let direction: TrendAnalysis['direction'] = 'stable';
  if (totalLinearShiftPct >= 5 || (deltaPct !== null && Math.abs(deltaPct) >= 5)) {
    direction = slopePerHour > 0 ? 'rising' : slopePerHour < 0 ? 'falling' : 'stable';
  }

  return {
    direction,
    slopePerHour: roundTo(slopePerHour, 3),
    slopePerDay: roundTo(slopePerDay, 2),
    firstHalfMean: roundTo(firstHalfMean, 2),
    secondHalfMean: roundTo(secondHalfMean, 2),
    deltaAbs: roundTo(deltaAbs, 2),
    deltaPct: deltaPct !== null ? roundTo(deltaPct, 1) : null,
    sampleCount: n,
    spanHours: roundTo(spanHours, 1),
    note: `Computed across ${n} readings over ${roundTo(spanHours, 1)} hours.`,
  };
}

function getThresholdForReading(pollutant: string, normalizedUnit: string): PollutantThreshold | null {
  const threshold = POLLUTANT_THRESHOLDS[pollutant];
  if (!threshold) return null;
  if (threshold.unit === normalizedUnit) return threshold;
  return null;
}

export function validateAndAnalyzeTable(
  table: RawParsedTable,
  mapping: ColumnMapping,
  options: { periodLabel: string; datasetName: string }
): AnalysisResult {
  if (!mapping.pollutant || !mapping.location || !mapping.timestamp || !mapping.value || !mapping.unit) {
    throw new Error('All five required columns (pollutant, location, timestamp, value, unit) must be mapped.');
  }

  const flaggedRows: FlaggedRow[] = [];
  const candidateValid: ValidatedReading[] = [];

  let duplicateCount = 0;
  let conflictingDuplicateCount = 0;
  let missingFieldCount = 0;
  let invalidValueCount = 0;
  let invalidTimestampCount = 0;
  let outlierCount = 0;

  const seenKeys = new Map<string, { value: number; unit: string; rowIndex: number }>();

  for (let idx = 0; idx < table.rows.length; idx++) {
    const rowIndex = table.rowLineNumbers?.[idx] ?? idx + 2;
    const rawRow = table.rows[idx];
    const issues: RowIssue[] = [];

    const rawPollutant = (rawRow[mapping.pollutant] ?? '').trim();
    const rawLocation = (rawRow[mapping.location] ?? '').trim();
    const rawTimestamp = (rawRow[mapping.timestamp] ?? '').trim();
    const rawValue = (rawRow[mapping.value] ?? '').trim();
    const rawUnit = (rawRow[mapping.unit] ?? '').trim();

    const missingPollutant = isMissingSentinel(rawPollutant);
    const missingLocation = isMissingSentinel(rawLocation);
    const missingTimestamp = isMissingSentinel(rawTimestamp);
    const missingValue = isMissingSentinel(rawValue);
    const missingUnit = isMissingSentinel(rawUnit);

    if (missingPollutant) {
      missingFieldCount++;
      issues.push({ type: 'missing_field', field: 'pollutant', message: 'Missing pollutant name.' });
    }
    if (missingLocation) {
      missingFieldCount++;
      issues.push({ type: 'missing_field', field: 'location', message: 'Missing location/station name.' });
    }
    if (missingTimestamp) {
      missingFieldCount++;
      issues.push({ type: 'missing_field', field: 'timestamp', message: 'Missing timestamp.' });
    }
    if (missingValue) {
      missingFieldCount++;
      issues.push({
        type: 'missing_field',
        field: 'value',
        message: rawValue
          ? `Missing reading sentinel ("${rawValue}").`
          : 'Missing numeric measurement value.',
      });
    }
    if (missingUnit) {
      missingFieldCount++;
      issues.push({ type: 'missing_field', field: 'unit', message: 'Missing measurement unit.' });
    }

    const parsedTs = !missingTimestamp ? parseTimestampStrict(rawTimestamp) : null;
    if (!missingTimestamp && !parsedTs) {
      invalidTimestampCount++;
      issues.push({
        type: 'invalid_timestamp',
        field: 'timestamp',
        message: `Unparseable timestamp "${rawTimestamp}".`,
      });
    }

    let numericValue = Number.NaN;
    if (!missingValue) {
      const cleanedNum = rawValue.replace(/,/g, '');
      if (!/^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(cleanedNum)) {
        invalidValueCount++;
        issues.push({
          type: 'invalid_number',
          field: 'value',
          message: `Non-numeric reading "${rawValue}".`,
        });
      } else {
        numericValue = Number(cleanedNum);
        if (!Number.isFinite(numericValue)) {
          invalidValueCount++;
          issues.push({
            type: 'invalid_number',
            field: 'value',
            message: `Invalid floating value "${rawValue}".`,
          });
        } else if (numericValue < 0) {
          invalidValueCount++;
          issues.push({
            type: 'negative_value',
            field: 'value',
            message: `Negative concentration (${numericValue}) is physically invalid.`,
          });
        }
      }
    }

    const pollutant = !missingPollutant ? normalizePollutantName(rawPollutant) : '';
    const normalizedUnit = !missingUnit ? normalizeUnitString(rawUnit) : '';

    if (Number.isFinite(numericValue) && numericValue >= 0 && pollutant) {
      const maxPlausible = MAX_PLAUSIBLE_VALUES[pollutant];
      if (
        maxPlausible !== undefined &&
        (normalizedUnit === 'µg/m³' || normalizedUnit === 'index' || (pollutant === 'CO' && normalizedUnit === 'mg/m³')) &&
        numericValue > maxPlausible
      ) {
        outlierCount++;
        issues.push({
          type: 'implausible_outlier',
          field: 'value',
          message: `Value ${numericValue} ${normalizedUnit} exceeds plausible sensor range (> ${maxPlausible}) for ${pollutant}.`,
        });
      }
    }

    if (pollutant && !missingLocation && parsedTs && Number.isFinite(numericValue) && issues.length === 0) {
      const key = `${rawLocation.toLowerCase()}|${pollutant}|${parsedTs.ms}`;
      const existing = seenKeys.get(key);
      if (existing) {
        if (Math.abs(existing.value - numericValue) < 1e-6 && existing.unit === normalizedUnit) {
          duplicateCount++;
          issues.push({
            type: 'duplicate_reading',
            field: 'row',
            message: `Exact duplicate of line #${existing.rowIndex} (${rawLocation}, ${pollutant}, ${rawTimestamp}).`,
          });
        } else {
          conflictingDuplicateCount++;
          issues.push({
            type: 'conflicting_duplicate',
            field: 'row',
            message: `Conflicting duplicate of line #${existing.rowIndex}: earlier value was ${existing.value} ${existing.unit}, found ${numericValue} ${normalizedUnit}.`,
          });
        }
      } else {
        seenKeys.set(key, { value: numericValue, unit: normalizedUnit, rowIndex });
      }
    }

    if (issues.length > 0) {
      flaggedRows.push({ rowIndex, rawRow, issues });
    } else if (parsedTs) {
      candidateValid.push({
        rowIndex,
        rawRow,
        location: rawLocation,
        pollutant,
        timestampRaw: rawTimestamp,
        timestampIso: parsedTs.iso,
        timestampMs: parsedTs.ms,
        value: numericValue,
        unit: rawUnit,
        normalizedUnit,
        warnings: [],
      });
    }
  }

  const unitsByPollutant: Record<string, string[]> = {};
  const pollutantUnitCounts = new Map<string, Map<string, number>>();
  const readingsByPollutant = new Map<string, ValidatedReading[]>();
  for (const r of candidateValid) {
    let bucket = readingsByPollutant.get(r.pollutant);
    if (!bucket) {
      bucket = [];
      readingsByPollutant.set(r.pollutant, bucket);
    }
    bucket.push(r);

    let uMap = pollutantUnitCounts.get(r.pollutant);
    if (!uMap) {
      uMap = new Map();
      pollutantUnitCounts.set(r.pollutant, uMap);
    }
    uMap.set(r.normalizedUnit, (uMap.get(r.normalizedUnit) ?? 0) + 1);
  }

  let unitInconsistencyCount = 0;
  for (const [pollutant, uMap] of pollutantUnitCounts.entries()) {
    const units = Array.from(uMap.keys());
    unitsByPollutant[pollutant] = units;
    if (units.length > 1) {
      const sortedUnits = Array.from(uMap.entries()).sort((a, b) => b[1] - a[1]);
      const primaryUnit = sortedUnits[0][0];
      const pollutantReadings = readingsByPollutant.get(pollutant) ?? [];
      for (const r of pollutantReadings) {
        if (r.normalizedUnit !== primaryUnit) {
          unitInconsistencyCount++;
          r.warnings.push(
            `Unit mismatch: recorded in "${r.normalizedUnit}" while majority of ${pollutant} readings use "${primaryUnit}". Excluded from pooled ${pollutant} averages.`
          );
        }
      }
    }
  }

  const totalRows = table.rows.length;
  const validRows = candidateValid.length;
  const flaggedRowsCount = flaggedRows.length;
  const completenessPct = totalRows > 0 ? roundTo((validRows / totalRows) * 100, 1) : 0;

  const sortedValidByTime = [...candidateValid].sort((a, b) => a.timestampMs - b.timestampMs);
  const timeRangeStart = sortedValidByTime.length > 0 ? sortedValidByTime[0].timestampIso : null;
  const timeRangeEnd =
    sortedValidByTime.length > 0 ? sortedValidByTime[sortedValidByTime.length - 1].timestampIso : null;
  const timeSpanHours =
    sortedValidByTime.length >= 2
      ? roundTo(
          (sortedValidByTime[sortedValidByTime.length - 1].timestampMs -
            sortedValidByTime[0].timestampMs) /
            3600000,
          1
        )
      : 0;

  const stations = Array.from(new Set(candidateValid.map((r) => r.location))).sort();
  const pollutants = Array.from(new Set(candidateValid.map((r) => r.pollutant))).sort();

  const reliabilityReasons: string[] = [];
  let reliabilityStatus: ReliabilityStatus = 'reliable';

  if (validRows === 0) {
    reliabilityStatus = 'insufficient';
    reliabilityReasons.push('Zero valid readings remained after validation.');
  } else {
    if (validRows < 8) {
      reliabilityStatus = 'insufficient';
      reliabilityReasons.push(
        `Only ${validRows} valid readings detected (minimum 8 recommended for reliable ward briefing).`
      );
    }
    if (timeSpanHours !== null && timeSpanHours < 24 && validRows >= 2) {
      if (reliabilityStatus === 'reliable') reliabilityStatus = 'caution';
      reliabilityReasons.push(
        `Short monitoring window (${timeSpanHours}h < 24h): findings are preliminary and cannot determine 24-hour regulatory exceedances.`
      );
    }
    if (completenessPct < 70) {
      if (reliabilityStatus === 'reliable') reliabilityStatus = 'caution';
      reliabilityReasons.push(
        `Low data completeness (${completenessPct}% valid rows; ${flaggedRowsCount} rows flagged).`
      );
    }
    if (unitInconsistencyCount > 0) {
      if (reliabilityStatus === 'reliable') reliabilityStatus = 'caution';
      reliabilityReasons.push(
        `${unitInconsistencyCount} reading(s) have inconsistent units and were quarantined from pooled averages.`
      );
    }
    if (stations.length === 1 && validRows >= 8) {
      if (reliabilityStatus === 'reliable') reliabilityStatus = 'caution';
      reliabilityReasons.push(
        'Only 1 monitoring location present; cross-ward spatial hotspot ranking is not possible.'
      );
    }
    if (conflictingDuplicateCount > 0) {
      if (reliabilityStatus === 'reliable') reliabilityStatus = 'caution';
      reliabilityReasons.push(
        `${conflictingDuplicateCount} conflicting duplicate timestamp(s) found and excluded.`
      );
    }
  }

  const pollutantSummaries: PollutantSummary[] = pollutants.map((pollutant) => {
    const allForPollutant = readingsByPollutant.get(pollutant) ?? [];
    const uMap = pollutantUnitCounts.get(pollutant)!;
    const unitBreakdown = Array.from(uMap.entries())
      .map(([unit, count]) => ({ unit, count }))
      .sort((a, b) => b.count - a.count);

    const primaryUnit = unitBreakdown[0].unit;
    const hasMixedUnits = unitBreakdown.length > 1;
    const compatibleReadings = hasMixedUnits
      ? allForPollutant.filter((r) => r.normalizedUnit === primaryUnit)
      : allForPollutant;
    const excludedUnitRowCount = allForPollutant.length - compatibleReadings.length;

    const values = compatibleReadings.map((r) => r.value).sort((a, b) => a - b);
    const totalCount = values.length;
    const sum = values.reduce((s, v) => s + v, 0);
    const mean = totalCount > 0 ? sum / totalCount : 0;
    const median = computePercentile(values, 50);
    const p90 = computePercentile(values, 90);
    const min = totalCount > 0 ? values[0] : 0;
    const max = totalCount > 0 ? values[totalCount - 1] : 0;
    const variance =
      totalCount > 1
        ? values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (totalCount - 1)
        : 0;
    const stdDev = Math.sqrt(variance);
    const spanHours = getSeriesSpanHours(compatibleReadings);
    const observedPeak = findObservedPeak(compatibleReadings);

    const thresholdUsed = getThresholdForReading(pollutant, primaryUnit);
    const trend = computeTrend(compatibleReadings);

    const readingsByStation = new Map<string, ValidatedReading[]>();
    for (const r of compatibleReadings) {
      let stBucket = readingsByStation.get(r.location);
      if (!stBucket) {
        stBucket = [];
        readingsByStation.set(r.location, stBucket);
      }
      stBucket.push(r);
    }

    const stationNames = Array.from(readingsByStation.keys()).sort();
    const locationStats: LocationPollutantStats[] = stationNames.map((location) => {
      const locReadings = readingsByStation.get(location)!;
      const locVals = locReadings.map((r) => r.value).sort((a, b) => a - b);
      const locCount = locVals.length;
      const locSpanHours = getSeriesSpanHours(locReadings);
      const locMean = locVals.reduce((s, v) => s + v, 0) / locCount;
      const locMedian = computePercentile(locVals, 50);
      const locP90 = computePercentile(locVals, 90);
      const locVar =
        locCount > 1
          ? locVals.reduce((acc, v) => acc + (v - locMean) * (v - locMean), 0) / (locCount - 1)
          : 0;
      const pctVsWardMean = mean > 0 ? roundTo(((locMean - mean) / mean) * 100, 1) : 0;
      const locPeak = findObservedPeak(locReadings)!;
      const locWinEval = evaluateRegulatoryWindowsForStation(locReadings, thresholdUsed);
      const locExceedCount =
        locWinEval.validWindowAverages.length > 0
          ? locWinEval.validWindowAverages.filter((w) => w.exceedsStandard).length
          : null;

      return {
        location,
        pollutant,
        unit: primaryUnit,
        count: locCount,
        spanHours: locSpanHours,
        min: roundTo(locVals[0], 2),
        max: roundTo(locVals[locCount - 1], 2),
        observedPeak: locPeak,
        mean: roundTo(locMean, 2),
        median: roundTo(locMedian, 2),
        p90: roundTo(locP90, 2),
        stdDev: roundTo(Math.sqrt(locVar), 2),
        pctVsWardMean,
        isLowSample: locCount < 3,
        isPreliminary: locWinEval.isPreliminary,
        averagingStatus: locWinEval.averagingStatus,
        averagingNote: locWinEval.averagingNote,
        validWindowAverages: locWinEval.validWindowAverages,
        regulatoryExceedanceCount: locExceedCount,
        trend: computeTrend(locReadings),
        readingRowIndices: locReadings.map((r) => r.rowIndex),
      };
    });

    const allValidWindowAverages = locationStats.flatMap((s) => s.validWindowAverages);
    const regulatoryWindowTotalCount = allValidWindowAverages.length;
    const regulatoryWindowExceedanceCount =
      regulatoryWindowTotalCount > 0
        ? allValidWindowAverages.filter((w) => w.exceedsStandard).length
        : null;

    let averagingStatus: AveragingAssessmentStatus = 'no_standard_configured';
    let isPreliminary = spanHours < 24;
    let preliminaryLabel = 'Observed statistics only';
    let averagingNote = '';

    if (!thresholdUsed) {
      averagingStatus = 'no_standard_configured';
      preliminaryLabel = isPreliminary ? 'Preliminary (short duration)' : 'Observed statistics';
      averagingNote = `No standard averaging threshold configured for ${pollutant} (${primaryUnit}).`;
    } else if (regulatoryWindowTotalCount > 0) {
      averagingStatus = 'regulatory_window_supported';
      isPreliminary = false;
      preliminaryLabel = `${thresholdUsed.averagingHours}h regulatory average verified`;
      averagingNote = `${regulatoryWindowTotalCount} valid ${thresholdUsed.averagingHours}-hour window average(s) computed across stations (>=${thresholdUsed.minSamplesPerWindow} readings over >=${thresholdUsed.minSpanHoursPerWindow}h per window); ${regulatoryWindowExceedanceCount} exceeded ${thresholdUsed.referenceLabel}.`;
    } else if (spanHours < thresholdUsed.averagingHours) {
      averagingStatus = 'preliminary_short_duration';
      isPreliminary = true;
      preliminaryLabel = `Preliminary (<${thresholdUsed.averagingHours}h window)`;
      averagingNote = `Preliminary finding: ${pollutant} span is ${spanHours}h (<${thresholdUsed.averagingHours}h required for ${thresholdUsed.referenceLabel}). Maximum value (${max} ${primaryUnit}) is reported as an observed peak, not a regulatory exceedance.`;
    } else {
      averagingStatus = 'preliminary_intermittent_sampling';
      isPreliminary = true;
      preliminaryLabel = `Preliminary (insufficient ${thresholdUsed.averagingHours}h density)`;
      averagingNote = `Preliminary finding: no station has >=${thresholdUsed.minSamplesPerWindow} readings spanning >=${thresholdUsed.minSpanHoursPerWindow}h within a single ${thresholdUsed.averagingHours}-hour block. Individual readings are never compared to ${thresholdUsed.referenceLabel}; maximum value (${max} ${primaryUnit}) is reported as an observed peak only.`;
    }

    const sortedLocations = [...locationStats].sort((a, b) => b.mean - a.mean);
    const hotspots: HotspotItem[] = sortedLocations.map((loc, idx) => ({
      rank: idx + 1,
      location: loc.location,
      pollutant,
      unit: primaryUnit,
      mean: loc.mean,
      max: loc.max,
      observedPeakRowIndex: loc.observedPeak.rowIndex,
      observedPeakTimestamp: loc.observedPeak.timestampRaw,
      count: loc.count,
      pctAboveWardMean: loc.pctVsWardMean,
      isPreliminary: loc.isPreliminary,
      validWindowExceedances: loc.regulatoryExceedanceCount,
      validWindowCount: loc.validWindowAverages.length,
      reliabilityNote: loc.isLowSample
        ? `Low sample size (${loc.count} reading${loc.count === 1 ? '' : 's'}); treat ranking cautiously.`
        : loc.isPreliminary
        ? `Preliminary ranking based on ${loc.count} intermittent/short-window readings (no 24h regulatory average).`
        : null,
    }));

    const unitWarning = hasMixedUnits
      ? `Mixed units detected (${unitBreakdown.map((u) => `${u.count} in ${u.unit}`).join(', ')}). Statistics reflect only the ${totalCount} readings in ${primaryUnit}; ${excludedUnitRowCount} mismatched row(s) were excluded from averages.`
      : null;

    return {
      pollutant,
      primaryUnit,
      hasMixedUnits,
      unitsFound: unitBreakdown.map((u) => u.unit),
      unitBreakdown,
      excludedUnitRowCount,
      totalCount,
      spanHours,
      min: roundTo(min, 2),
      max: roundTo(max, 2),
      observedPeak,
      mean: roundTo(mean, 2),
      median: roundTo(median, 2),
      p90: roundTo(p90, 2),
      stdDev: roundTo(stdDev, 2),
      thresholdUsed,
      averagingStatus,
      isPreliminary,
      preliminaryLabel,
      averagingNote,
      validWindowAverages: allValidWindowAverages,
      regulatoryWindowExceedanceCount,
      regulatoryWindowTotalCount,
      trend,
      locationStats,
      hotspots,
      unitWarning,
    };
  });

  const anyPreliminary = pollutantSummaries.some((p) => p.isPreliminary);
  const allPreliminary =
    pollutantSummaries.length > 0 && pollutantSummaries.every((p) => p.isPreliminary);
  const hasAnyValidRegulatoryWindows = pollutantSummaries.some(
    (p) => p.regulatoryWindowTotalCount > 0
  );

  if (anyPreliminary && validRows > 0 && !reliabilityReasons.some((r) => r.includes('preliminary'))) {
    reliabilityReasons.push(
      hasAnyValidRegulatoryWindows
        ? 'Some pollutant series lack continuous 24h/8h hourly density and are labeled preliminary.'
        : 'Sampling density/duration does not support 24-hour or 8-hour regulatory standard averages; all findings are labeled preliminary with observed means and observed peaks only.'
    );
  }

  if (reliabilityReasons.length === 0) {
    reliabilityReasons.push(
      `All quality checks passed: ${validRows} valid readings across ${stations.length} location(s) and ${timeSpanHours}h.`
    );
  }

  const preliminarySummaryNote = allPreliminary
    ? 'Preliminary Assessment: Data lacks continuous >=16-of-24h hourly coverage per window; observed peaks are reported without claiming 24-hour regulatory standard exceedances.'
    : anyPreliminary
    ? 'Mixed Averaging Coverage: Some pollutants/stations support verified 24h/8h regulatory averages while others remain preliminary.'
    : 'Verified Multi-Hour Coverage: Sufficient hourly readings exist to evaluate valid 24h/8h regulatory window averages.';

  const qualityReport: DataQualityReport = {
    totalRows,
    validRows,
    flaggedRowsCount,
    duplicateCount,
    conflictingDuplicateCount,
    missingFieldCount,
    invalidValueCount,
    invalidTimestampCount,
    outlierCount,
    unitInconsistencyCount,
    completenessPct,
    timeRangeStart,
    timeRangeEnd,
    timeSpanHours,
    stations,
    pollutants,
    unitsByPollutant,
    reliabilityStatus,
    reliabilityReasons,
    flaggedRows,
  };

  return {
    id: `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    periodLabel: options.periodLabel.trim() || 'Active Reporting Period',
    datasetName: options.datasetName.trim() || 'Uploaded Dataset',
    analyzedAtIso: new Date().toISOString(),
    columnMapping: mapping,
    qualityReport,
    validReadings: sortedValidByTime,
    pollutantSummaries,
    overallReliability: reliabilityStatus,
    isPreliminary: anyPreliminary,
    preliminarySummaryNote,
    reliabilityNotes: reliabilityReasons,
  };
}

export function comparePeriods(
  periodA: SavedPeriodRecord,
  periodB: SavedPeriodRecord
): PeriodComparisonResult {
  const sumA = new Map(periodA.analysis.pollutantSummaries.map((p) => [p.pollutant, p]));
  const sumB = new Map(periodB.analysis.pollutantSummaries.map((p) => [p.pollutant, p]));
  const allPollutants = Array.from(new Set([...sumA.keys(), ...sumB.keys()])).sort();

  const stationsA = new Set(periodA.analysis.qualityReport.stations);
  const stationsB = new Set(periodB.analysis.qualityReport.stations);
  const overlappingStations = Array.from(stationsA).filter((s) => stationsB.has(s)).sort();

  const pollutantComparisons: PollutantComparisonItem[] = [];
  let comparableCount = 0;
  let nonComparableCount = 0;
  let hasSampleImbalance = false;

  for (const pollutant of allPollutants) {
    const a = sumA.get(pollutant);
    const b = sumB.get(pollutant);

    if (!a || !b) {
      nonComparableCount++;
      pollutantComparisons.push({
        pollutant,
        comparable: false,
        nonComparableReason: !a
          ? `Pollutant missing from "${periodA.periodLabel}".`
          : `Pollutant missing from "${periodB.periodLabel}".`,
        unitA: a?.primaryUnit ?? null,
        unitB: b?.primaryUnit ?? null,
        countA: a?.totalCount ?? 0,
        countB: b?.totalCount ?? 0,
        overlappingStations: [],
        meanA: a?.mean ?? null,
        meanB: b?.mean ?? null,
        maxA: a?.max ?? null,
        maxB: b?.max ?? null,
        deltaAbs: null,
        deltaPct: null,
        direction: 'not_comparable',
        stationComparisons: [],
      });
      continue;
    }

    if (a.primaryUnit !== b.primaryUnit) {
      nonComparableCount++;
      pollutantComparisons.push({
        pollutant,
        comparable: false,
        nonComparableReason: `Incompatible primary units: "${a.primaryUnit}" vs "${b.primaryUnit}".`,
        unitA: a.primaryUnit,
        unitB: b.primaryUnit,
        countA: a.totalCount,
        countB: b.totalCount,
        overlappingStations: [],
        meanA: a.mean,
        meanB: b.mean,
        maxA: a.max,
        maxB: b.max,
        deltaAbs: null,
        deltaPct: null,
        direction: 'not_comparable',
        stationComparisons: [],
      });
      continue;
    }

    const pStationsA = new Set(a.locationStats.map((l) => l.location));
    const pStationsB = new Set(b.locationStats.map((l) => l.location));
    const sharedStations = Array.from(pStationsA).filter((s) => pStationsB.has(s)).sort();

    if (sharedStations.length === 0) {
      nonComparableCount++;
      pollutantComparisons.push({
        pollutant,
        comparable: false,
        nonComparableReason: 'Zero overlapping monitoring stations between both periods for this pollutant.',
        unitA: a.primaryUnit,
        unitB: b.primaryUnit,
        countA: a.totalCount,
        countB: b.totalCount,
        overlappingStations: [],
        meanA: a.mean,
        meanB: b.mean,
        maxA: a.max,
        maxB: b.max,
        deltaAbs: null,
        deltaPct: null,
        direction: 'not_comparable',
        stationComparisons: [],
      });
      continue;
    }

    if (a.totalCount < 3 || b.totalCount < 3) {
      nonComparableCount++;
      pollutantComparisons.push({
        pollutant,
        comparable: false,
        nonComparableReason: `Insufficient sample count (${a.totalCount} vs ${b.totalCount}; requires at least 3 valid readings in each period).`,
        unitA: a.primaryUnit,
        unitB: b.primaryUnit,
        countA: a.totalCount,
        countB: b.totalCount,
        overlappingStations: sharedStations,
        meanA: a.mean,
        meanB: b.mean,
        maxA: a.max,
        maxB: b.max,
        deltaAbs: null,
        deltaPct: null,
        direction: 'not_comparable',
        stationComparisons: [],
      });
      continue;
    }

    const sharedStationSet = new Set(sharedStations);
    let sharedSumA = 0;
    let sharedCountA = 0;
    let matchedMaxA = -Infinity;
    for (const r of periodA.analysis.validReadings) {
      if (r.pollutant === pollutant && r.normalizedUnit === a.primaryUnit && sharedStationSet.has(r.location)) {
        sharedSumA += r.value;
        sharedCountA++;
        if (r.value > matchedMaxA) matchedMaxA = r.value;
      }
    }

    let sharedSumB = 0;
    let sharedCountB = 0;
    let matchedMaxB = -Infinity;
    for (const r of periodB.analysis.validReadings) {
      if (r.pollutant === pollutant && r.normalizedUnit === b.primaryUnit && sharedStationSet.has(r.location)) {
        sharedSumB += r.value;
        sharedCountB++;
        if (r.value > matchedMaxB) matchedMaxB = r.value;
      }
    }

    const minShared = Math.min(sharedCountA, sharedCountB);
    const maxShared = Math.max(sharedCountA, sharedCountB);
    if (maxShared > 0 && minShared / maxShared < 0.35) {
      hasSampleImbalance = true;
    }

    const matchedMeanA = sharedCountA > 0 ? sharedSumA / sharedCountA : 0;
    const matchedMeanB = sharedCountB > 0 ? sharedSumB / sharedCountB : 0;

    const deltaAbs = roundTo(matchedMeanB - matchedMeanA, 2);
    const deltaPct = matchedMeanA !== 0 ? roundTo(((matchedMeanB - matchedMeanA) / matchedMeanA) * 100, 1) : null;

    let direction: PollutantComparisonItem['direction'] = 'unchanged';
    if (deltaPct !== null && Math.abs(deltaPct) >= 3) {
      direction = deltaAbs < 0 ? 'improved' : 'worsened';
    }

    const locMapA = new Map(a.locationStats.map((l) => [l.location, l]));
    const locMapB = new Map(b.locationStats.map((l) => [l.location, l]));

    const stationComparisons = sharedStations.map((location) => {
      const stA = locMapA.get(location)!;
      const stB = locMapB.get(location)!;
      if (stA.count < 2 || stB.count < 2) {
        return {
          location,
          comparable: false,
          reason: `Low station sample count (${stA.count} vs ${stB.count}; min 2 each).`,
          countA: stA.count,
          countB: stB.count,
          meanA: stA.mean,
          meanB: stB.mean,
          deltaAbs: null,
          deltaPct: null,
        };
      }
      const stDeltaAbs = roundTo(stB.mean - stA.mean, 2);
      const stDeltaPct = stA.mean !== 0 ? roundTo(((stB.mean - stA.mean) / stA.mean) * 100, 1) : null;
      return {
        location,
        comparable: true,
        reason: null,
        countA: stA.count,
        countB: stB.count,
        meanA: stA.mean,
        meanB: stB.mean,
        deltaAbs: stDeltaAbs,
        deltaPct: stDeltaPct,
      };
    });

    comparableCount++;
    pollutantComparisons.push({
      pollutant,
      comparable: true,
      nonComparableReason: null,
      unitA: a.primaryUnit,
      unitB: b.primaryUnit,
      countA: sharedCountA,
      countB: sharedCountB,
      overlappingStations: sharedStations,
      meanA: roundTo(matchedMeanA, 2),
      meanB: roundTo(matchedMeanB, 2),
      maxA: roundTo(matchedMaxA, 2),
      maxB: roundTo(matchedMaxB, 2),
      deltaAbs,
      deltaPct,
      direction,
      stationComparisons,
    });
  }

  const cautionNotes: string[] = [];
  if (overlappingStations.length === 0) {
    cautionNotes.push('No overlapping monitoring stations exist between the two selected periods.');
  }
  if (
    periodA.analysis.overallReliability === 'insufficient' ||
    periodB.analysis.overallReliability === 'insufficient'
  ) {
    cautionNotes.push('At least one period has an "Insufficient" reliability flag. Interpret differences with caution.');
  }
  if (periodA.analysis.isPreliminary || periodB.analysis.isPreliminary) {
    cautionNotes.push('At least one period uses preliminary intermittent/short-duration sampling; changes reflect observed sample means rather than verified 24-hour regulatory averages.');
  }
  if (hasSampleImbalance) {
    cautionNotes.push('Sample counts differ substantially between the two periods (>3x difference); differences may reflect sampling density rather than true trend.');
  }
  if (nonComparableCount > 0) {
    cautionNotes.push(`${nonComparableCount} pollutant series could not be compared due to missing coverage, unit mismatch, or insufficient samples.`);
  }

  let overallVerdict = 'No comparable pollutant datasets were found between these two periods.';
  if (comparableCount > 0) {
    const improved = pollutantComparisons.filter((p) => p.comparable && p.direction === 'improved');
    const worsened = pollutantComparisons.filter((p) => p.comparable && p.direction === 'worsened');
    const unchanged = pollutantComparisons.filter((p) => p.comparable && p.direction === 'unchanged');
    const parts: string[] = [];
    if (improved.length > 0) {
      parts.push(`Lower observed concentrations for ${improved.map((p) => p.pollutant).join(', ')}`);
    }
    if (worsened.length > 0) {
      parts.push(`higher observed concentrations for ${worsened.map((p) => p.pollutant).join(', ')}`);
    }
    if (unchanged.length > 0) {
      parts.push(`minimal change (<3%) for ${unchanged.map((p) => p.pollutant).join(', ')}`);
    }
    overallVerdict = `Across ${overlappingStations.length} shared monitoring station(s): ${parts.join('; ')}.`;
  }

  return {
    periodAId: periodA.id,
    periodALabel: periodA.periodLabel,
    periodBId: periodB.id,
    periodBLabel: periodB.periodLabel,
    comparableCount,
    nonComparableCount,
    overlappingStations,
    pollutantComparisons,
    overallVerdict,
    cautionNotes,
  };
}
