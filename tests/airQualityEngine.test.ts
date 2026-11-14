import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  comparePeriods,
  isMissingSentinel,
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
});
