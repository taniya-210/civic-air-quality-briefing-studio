import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  comparePeriods,
  isMissingSentinel,
  normalizePollutantName,
  normalizeUnitString,
  parseTimestampStrict,
  validateAndAnalyzeTable,
} from '../src/lib/airQualityEngine';
import { inferColumnMapping, parseTabularText } from '../src/lib/csvParser';
import { SAMPLE_DATASETS } from '../src/lib/sampleDatasets';
import type { SavedPeriodRecord } from '../src/types/airQuality';

describe('airQualityEngine — validation, scientific accuracy & comparisons', () => {
  it('recognizes missing-value sentinels and parses multi-format timestamps without inventing dates', () => {
    for (const sentinel of ['', 'NA', 'N/A', 'null', 'BDL', 'nd', '--', '?']) {
      assert.equal(isMissingSentinel(sentinel), true, `Expected "${sentinel}" to be a missing sentinel`);
    }
    assert.equal(isMissingSentinel('0'), false);

    assert.ok(parseTimestampStrict('08-Nov-2026 06:00'));
    assert.ok(parseTimestampStrict('08/11/2026 06:00'));
    assert.ok(parseTimestampStrict('2026/11/08 06:00'));
    assert.equal(parseTimestampStrict('bad-date-here'), null);
    assert.equal(parseTimestampStrict('123456'), null);
  });

  it('flags messy anomalies transparently and quarantines mixed units without modifying raw measurements', () => {
    const csv = [
      'Municipal Export Banner',
      'location,timestamp,pollutant,value,unit',
      'Gate A,08-Nov-2026 06:00,PM2.5,90,ug/m3',
      'Gate A,08-Nov-2026 06:00,PM2.5,90,ug/m3', // exact duplicate (line 4)
      'Gate A,08-Nov-2026 06:00,PM2.5,120,ug/m3', // conflicting duplicate (line 5)
      'Gate A,08-Nov-2026 10:00,PM2.5,BDL,ug/m3', // missing sentinel (line 6)
      'Gate A,08-Nov-2026 14:00,PM2.5,-15,ug/m3', // negative value (line 7)
      'Gate A,bad-ts,PM2.5,110,ug/m3', // bad timestamp (line 8)
      'Gate A,08-Nov-2026 18:00,PM2.5,2500,ug/m3', // implausible outlier (line 9)
      'Gate A,08-Nov-2026 22:00,PM2.5,0.12,mg/m3', // unit mismatch (line 10, kept but excluded from ug/m3 average)
      'Gate B,09-Nov-2026 06:00,PM2.5,110,ug/m3', // valid (line 11)
    ].join('\n');

    const table = parseTabularText(csv);
    const mapping = inferColumnMapping(table.headers);
    const result = validateAndAnalyzeTable(table, mapping, {
      periodLabel: 'Messy Test',
      datasetName: 'messy.csv',
    });

    assert.equal(result.qualityReport.totalRows, 9);
    assert.equal(result.qualityReport.validRows, 3); // lines 3, 10, 11
    assert.equal(result.qualityReport.flaggedRowsCount, 6);
    assert.equal(result.qualityReport.duplicateCount, 1);
    assert.equal(result.qualityReport.conflictingDuplicateCount, 1);
    assert.equal(result.qualityReport.missingFieldCount, 1);
    assert.equal(result.qualityReport.invalidValueCount, 1);
    assert.equal(result.qualityReport.invalidTimestampCount, 1);
    assert.equal(result.qualityReport.outlierCount, 1);
    assert.equal(result.qualityReport.unitInconsistencyCount, 1);

    // Physical line numbers must match source lines despite banner line 1
    const flaggedLines = result.qualityReport.flaggedRows.map((r) => r.rowIndex);
    assert.deepEqual(flaggedLines, [4, 5, 6, 7, 8, 9]);

    const pm25 = result.pollutantSummaries.find((p) => p.pollutant === 'PM2.5')!;
    assert.equal(pm25.primaryUnit, 'µg/m³');
    assert.equal(pm25.hasMixedUnits, true);
    assert.equal(pm25.excludedUnitRowCount, 1);
    // Excluded mg/m3 row is NOT silently multiplied by 1000; mean is strictly (90 + 110) / 2 = 100
    assert.equal(pm25.mean, 100);
    assert.equal(pm25.observedPeak?.value, 110);
    assert.equal(pm25.observedPeak?.rowIndex, 11);
  });

  it('never reports 24h regulatory exceedances for intermittent/short datasets and computes valid 24h windows when supported', () => {
    // 1) Intermittent sample dataset (4-hourly spot readings)
    const intermittentSpec = SAMPLE_DATASETS.find((d) => d.id === 'ward14_nov_episode')!;
    const intermittentTable = parseTabularText(intermittentSpec.csv);
    const intermittentAnalysis = validateAndAnalyzeTable(
      intermittentTable,
      inferColumnMapping(intermittentTable.headers),
      { periodLabel: intermittentSpec.periodLabel, datasetName: intermittentSpec.filename }
    );

    assert.equal(intermittentAnalysis.isPreliminary, true);
    for (const p of intermittentAnalysis.pollutantSummaries) {
      assert.equal(p.isPreliminary, true);
      assert.equal(p.averagingStatus, 'preliminary_intermittent_sampling');
      assert.equal(p.regulatoryWindowTotalCount, 0);
      assert.equal(p.regulatoryWindowExceedanceCount, null);
    }

    const pm25Intermittent = intermittentAnalysis.pollutantSummaries.find((p) => p.pollutant === 'PM2.5')!;
    assert.equal(pm25Intermittent.hotspots[0].location, 'Industrial Nala Corridor');
    assert.equal(pm25Intermittent.observedPeak?.value, 232);
    assert.equal(pm25Intermittent.observedPeak?.location, 'Industrial Nala Corridor');

    // 2) Full 24h hourly continuous log (24 readings/day for 2 stations)
    const full24hSpec = SAMPLE_DATASETS.find((d) => d.id === 'ward14_full_24h_hourly')!;
    const fullTable = parseTabularText(full24hSpec.csv);
    const fullAnalysis = validateAndAnalyzeTable(
      fullTable,
      inferColumnMapping(fullTable.headers),
      { periodLabel: full24hSpec.periodLabel, datasetName: full24hSpec.filename }
    );

    assert.equal(fullAnalysis.isPreliminary, false);
    const pm25Full = fullAnalysis.pollutantSummaries[0];
    assert.equal(pm25Full.averagingStatus, 'regulatory_window_supported');
    assert.equal(pm25Full.regulatoryWindowTotalCount, 2);
    // School Gate Ward 14 24h avg = 59.83 <= 60 (within); Ring Road Junction 24h avg = 99.42 > 60 (exceeds)
    assert.equal(pm25Full.regulatoryWindowExceedanceCount, 1);
    const schoolWin = pm25Full.validWindowAverages.find((w) => w.location === 'School Gate Ward 14')!;
    const ringWin = pm25Full.validWindowAverages.find((w) => w.location === 'Ring Road Junction')!;
    assert.equal(schoolWin.exceedsStandard, false);
    assert.equal(ringWin.exceedsStandard, true);
    assert.ok(schoolWin.calculatedAverage < 60 && schoolWin.calculatedAverage > 59);
    assert.ok(ringWin.calculatedAverage > 99);
  });

  it('enforces comparability guards in comparePeriods and detects improvements vs mismatches', () => {
    const octSpec = SAMPLE_DATASETS.find((d) => d.id === 'ward14_oct_baseline')!;
    const novSpec = SAMPLE_DATASETS.find((d) => d.id === 'ward14_nov_episode')!;
    const shortSpec = SAMPLE_DATASETS.find((d) => d.id === 'low_sample_sparse')!;

    const toRecord = (spec: typeof octSpec): SavedPeriodRecord => {
      const t = parseTabularText(spec.csv);
      const analysis = validateAndAnalyzeTable(t, inferColumnMapping(t.headers), {
        periodLabel: spec.periodLabel,
        datasetName: spec.filename,
      });
      return {
        id: spec.id,
        periodLabel: spec.periodLabel,
        datasetName: spec.filename,
        savedAtIso: '2026-11-12T00:00:00.000Z',
        analysis,
      };
    };

    const octRec = toRecord(octSpec);
    const novRec = toRecord(novSpec);
    const shortRec = toRecord(shortSpec);

    const octVsNov = comparePeriods(octRec, novRec);
    assert.equal(octVsNov.comparableCount, 3);
    assert.equal(octVsNov.nonComparableCount, 0);
    assert.equal(octVsNov.overlappingStations.length, 4);
    const pm25Comp = octVsNov.pollutantComparisons.find((c) => c.pollutant === 'PM2.5')!;
    assert.equal(pm25Comp.comparable, true);
    assert.equal(pm25Comp.direction, 'worsened');
    assert.ok((pm25Comp.deltaPct ?? 0) > 50);

    // Non-overlapping stations should block comparability cleanly
    const octVsShort = comparePeriods(octRec, shortRec);
    assert.equal(octVsShort.comparableCount, 0);
    assert.equal(octVsShort.overlappingStations.length, 0);
    assert.ok(
      octVsShort.cautionNotes.some((n) => n.includes('No overlapping monitoring stations'))
    );
  });

  it('normalizes synonymous pollutant and unit aliases cleanly while preserving incompatible units separately', () => {
    assert.equal(normalizePollutantName('pm25'), 'PM2.5');
    assert.equal(normalizePollutantName('Nitrogen Dioxide'), 'NO2');
    assert.equal(normalizePollutantName('sulphur_dioxide'), 'SO2');
    assert.equal(normalizePollutantName('Ozone'), 'O3');

    assert.equal(normalizeUnitString('ug/m3'), 'µg/m³');
    assert.equal(normalizeUnitString('mcg/m3'), 'µg/m³');
    assert.equal(normalizeUnitString('ug/m^3'), 'µg/m³');
    assert.equal(normalizeUnitString('micrograms/m3'), 'µg/m³');
    assert.equal(normalizeUnitString('mg/m3'), 'mg/m³');
    assert.equal(normalizeUnitString('PPM'), 'ppm');
    assert.equal(normalizeUnitString('aqi'), 'index');
  });

  it('calculates exact mean, median, P90, stdDev, and trend directions (rising, falling, stable, insufficient)', () => {
    const buildSeries = (vals: number[], loc = 'North Chowk') => {
      const rows = ['location,timestamp,pollutant,value,unit'];
      vals.forEach((v, i) => {
        const hh = String(i).padStart(2, '0');
        rows.push(`${loc},2026-11-08 ${hh}:00,PM2.5,${v},ug/m3`);
      });
      const t = parseTabularText(rows.join('\n'));
      return validateAndAnalyzeTable(t, inferColumnMapping(t.headers), {
        periodLabel: 'Trend Check',
        datasetName: 'trend.csv',
      });
    };

    const rising = buildSeries([20, 40, 60, 80, 100]);
    const rSum = rising.pollutantSummaries[0];
    assert.equal(rSum.mean, 60);
    assert.equal(rSum.median, 60);
    assert.equal(rSum.p90, 92);
    assert.ok(Math.abs(rSum.stdDev - 31.62) < 0.05);
    assert.equal(rSum.trend.direction, 'rising');

    const falling = buildSeries([100, 80, 60, 40, 20]);
    assert.equal(falling.pollutantSummaries[0].trend.direction, 'falling');

    const stable = buildSeries([50, 51, 50, 49, 50]);
    assert.equal(stable.pollutantSummaries[0].trend.direction, 'stable');

    const tooShort = buildSeries([50, 90]);
    assert.equal(tooShort.pollutantSummaries[0].trend.direction, 'insufficient_data');
  });

  it('computes 8-hour O3 windows when >=6 hourly samples span >=6h and flags low-sample hotspots', () => {
    const rows = ['location,timestamp,pollutant,value,unit'];
    // Station A: 6 hourly O3 readings spanning 6 hours, mean = 120 (> 100 standard)
    for (let h = 10; h <= 16; h++) {
      rows.push(`Park Station,2026-11-08 ${String(h).padStart(2, '0')}:00,O3,120,ug/m3`);
    }
    // Station B: only 2 readings (low sample < 3)
    rows.push('Tiny Spot,2026-11-08 10:00,O3,180,ug/m3');
    rows.push('Tiny Spot,2026-11-08 12:00,O3,180,ug/m3');

    const t = parseTabularText(rows.join('\n'));
    const analysis = validateAndAnalyzeTable(t, inferColumnMapping(t.headers), {
      periodLabel: 'O3 Window Test',
      datasetName: 'o3.csv',
    });

    const o3 = analysis.pollutantSummaries[0];
    assert.equal(o3.averagingStatus, 'regulatory_window_supported');
    assert.equal(o3.regulatoryWindowTotalCount, 1);
    assert.equal(o3.regulatoryWindowExceedanceCount, 1);

    const lowSampleStats = o3.locationStats.find((s) => s.location === 'Tiny Spot')!;
    assert.equal(lowSampleStats.isLowSample, true);
    const lowSampleHotspot = o3.hotspots.find((h) => h.location === 'Tiny Spot')!;
    assert.ok(lowSampleHotspot.reliabilityNote?.includes('Low sample size (2 readings)'));
  });

  it('processes 10,000+ readings without call-stack overflow in analysis and comparePeriods', () => {
    const buildLarge = (offset: number, label: string): SavedPeriodRecord => {
      const lines = ['location,timestamp,pollutant,value,unit'];
      for (let i = 0; i < 10000; i++) {
        const day = 1 + Math.floor(i / 480); // spreads across ~21 days
        const hour = Math.floor((i % 480) / 20);
        const min = (i % 20) * 3;
        const st = `Station_${i % 5}`;
        lines.push(
          `${st},2026-10-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')},PM2.5,${offset + (i % 40)},ug/m3`
        );
      }
      const t = parseTabularText(lines.join('\n'));
      const analysis = validateAndAnalyzeTable(t, inferColumnMapping(t.headers), {
        periodLabel: label,
        datasetName: `${label}.csv`,
      });
      return {
        id: `id_${label}`,
        periodLabel: label,
        datasetName: `${label}.csv`,
        savedAtIso: '2026-11-12T00:00:00.000Z',
        analysis,
      };
    };

    const recA = buildLarge(40, 'Oct');
    const recB = buildLarge(70, 'Nov');
    assert.equal(recA.analysis.qualityReport.validRows, 10000);
    assert.equal(recB.analysis.qualityReport.validRows, 10000);

    const cmp = comparePeriods(recA, recB);
    assert.equal(cmp.comparableCount, 1);
    assert.equal(cmp.pollutantComparisons[0].direction, 'worsened');
  });

  it('produces exact results across single-unit, mixed-unit, multiple-pollutant, and large mixed-unit datasets', () => {
    // 1) Single-unit multi-pollutant dataset
    const singleCsv = [
      'location,timestamp,pollutant,value,unit',
      'Station A,2026-11-08 06:00,PM2.5,80,ug/m3',
      'Station B,2026-11-08 06:00,PM2.5,120,ug/m3',
      'Station A,2026-11-08 10:00,PM10,140,ug/m3',
      'Station B,2026-11-08 10:00,PM10,180,ug/m3',
      'Station A,2026-11-08 14:00,NO2,40,ug/m3',
      'Station B,2026-11-08 14:00,NO2,60,ug/m3',
    ].join('\n');
    const singleTable = parseTabularText(singleCsv);
    const singleRes = validateAndAnalyzeTable(singleTable, inferColumnMapping(singleTable.headers), {
      periodLabel: 'Single Unit Multi Pollutant',
      datasetName: 'single_multi.csv',
    });

    assert.equal(singleRes.qualityReport.validRows, 6);
    assert.equal(singleRes.qualityReport.unitInconsistencyCount, 0);
    assert.deepEqual(singleRes.qualityReport.pollutants, ['NO2', 'PM10', 'PM2.5']);
    assert.equal(singleRes.pollutantSummaries.find((p) => p.pollutant === 'PM2.5')?.mean, 100);
    assert.equal(singleRes.pollutantSummaries.find((p) => p.pollutant === 'PM10')?.mean, 160);
    assert.equal(singleRes.pollutantSummaries.find((p) => p.pollutant === 'NO2')?.mean, 50);

    // 2) Mixed-unit + multiple-pollutant dataset (majority unit preserved, minority quarantined)
    const mixedCsv = [
      'location,timestamp,pollutant,value,unit',
      'Gate A,2026-11-08 06:00,PM2.5,60,ug/m3',
      'Gate B,2026-11-08 06:00,PM2.5,90,ug/m3',
      'Gate A,2026-11-08 10:00,PM2.5,120,ug/m3',
      'Gate B,2026-11-08 10:00,PM2.5,0.15,mg/m3', // minority unit for PM2.5
      'Gate A,2026-11-08 06:00,CO,1.2,mg/m3',
      'Gate B,2026-11-08 06:00,CO,1.8,mg/m3',
      'Gate A,2026-11-08 10:00,CO,2.4,mg/m3',
      'Gate B,2026-11-08 10:00,CO,900,ppb', // minority unit for CO
    ].join('\n');
    const mixedTable = parseTabularText(mixedCsv);
    const mixedRes = validateAndAnalyzeTable(mixedTable, inferColumnMapping(mixedTable.headers), {
      periodLabel: 'Mixed Unit Multi Pollutant',
      datasetName: 'mixed_multi.csv',
    });

    assert.equal(mixedRes.qualityReport.validRows, 8);
    assert.equal(mixedRes.qualityReport.unitInconsistencyCount, 2);
    assert.deepEqual(mixedRes.qualityReport.unitsByPollutant['PM2.5'], ['µg/m³', 'mg/m³']);
    assert.deepEqual(mixedRes.qualityReport.unitsByPollutant['CO'], ['mg/m³', 'ppb']);

    const mixedPm25 = mixedRes.pollutantSummaries.find((p) => p.pollutant === 'PM2.5')!;
    assert.equal(mixedPm25.primaryUnit, 'µg/m³');
    assert.equal(mixedPm25.hasMixedUnits, true);
    assert.equal(mixedPm25.excludedUnitRowCount, 1);
    assert.equal(mixedPm25.mean, 90);
    assert.ok(mixedPm25.unitWarning?.includes('3 in µg/m³, 1 in mg/m³'));

    const mixedCo = mixedRes.pollutantSummaries.find((p) => p.pollutant === 'CO')!;
    assert.equal(mixedCo.primaryUnit, 'mg/m³');
    assert.equal(mixedCo.hasMixedUnits, true);
    assert.equal(mixedCo.excludedUnitRowCount, 1);
    assert.equal(mixedCo.mean, 1.8);

    const flaggedWarnings = mixedRes.validReadings.filter((r) => r.warnings.length > 0);
    assert.equal(flaggedWarnings.length, 2);
    assert.ok(flaggedWarnings.every((r) => r.warnings[0].includes('Unit mismatch')));

    // 3) Large multi-pollutant dataset with mixed units across all pollutants
    const largeLines = ['location,timestamp,pollutant,value,unit'];
    const largePollutants = ['PM2.5', 'PM10', 'NO2', 'SO2', 'O3'];
    for (let i = 0; i < 12000; i++) {
      const p = largePollutants[i % largePollutants.length];
      const unit = Math.floor(i / largePollutants.length) % 15 === 0 ? 'ppb' : 'ug/m3';
      const day = 1 + (Math.floor(i / 480) % 28);
      const hour = Math.floor((i % 480) / 20);
      const min = (i % 20) * 3;
      largeLines.push(
        `Station_${i % 4},2026-11-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')},${p},${50 + (i % 30)},${unit}`
      );
    }
    const largeTable = parseTabularText(largeLines.join('\n'));
    const largeRes = validateAndAnalyzeTable(largeTable, inferColumnMapping(largeTable.headers), {
      periodLabel: 'Large Multi Pollutant Mixed',
      datasetName: 'large_mixed.csv',
    });

    assert.equal(largeRes.qualityReport.validRows, 12000);
    assert.equal(largeRes.qualityReport.unitInconsistencyCount, 800); // 12000 / 15
    assert.equal(largeRes.pollutantSummaries.length, 5);
    for (const s of largeRes.pollutantSummaries) {
      assert.equal(s.primaryUnit, 'µg/m³');
      assert.equal(s.hasMixedUnits, true);
      assert.equal(s.totalCount + s.excludedUnitRowCount, 2400);
      assert.equal(s.excludedUnitRowCount, 160);
    }
  });
});
