import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectDelimiter, inferColumnMapping, parseTabularText } from '../src/lib/csvParser';

describe('csvParser — messy format ingestion & line tracking', () => {
  it('strips UTF-8 BOM, skips single-column preamble banners and separator rows, and tracks physical line numbers', () => {
    const raw = [
      '\uFEFFMunicipal Ward 14 Air Quality Export',
      'Generated: 2026-11-10',
      'station;datetime;parameter;concentration;units',
      '---+---+---+---+---',
      'School Gate;08-Nov-2026 06:00;PM2.5;94;ug/m3',
      'Ring Road;08-Nov-2026 06:00;PM2.5;142;ug/m3',
    ].join('\n');

    const parsed = parseTabularText(raw);
    assert.equal(parsed.detectedDelimiter, ';');
    assert.equal(parsed.skippedPreambleLines.length, 2);
    assert.equal(parsed.headerLineNumber, 3);
    assert.deepEqual(parsed.headers, [
      'station',
      'datetime',
      'parameter',
      'concentration',
      'units',
    ]);
    assert.equal(parsed.rows.length, 2);
    assert.deepEqual(parsed.rowLineNumbers, [5, 6]);
    assert.equal(parsed.rows[0].station, 'School Gate');
    assert.equal(parsed.rows[1].concentration, '142');
  });

  it('supports RFC-4180 quoted commas, tab-delimited, and multi-space fixed-width tables', () => {
    const quotedCsv = [
      'location,timestamp,pollutant,value,unit',
      '"Gate 2, Main Road",2026-11-08 08:00,PM2.5,105,ug/m3',
    ].join('\n');
    const parsedCsv = parseTabularText(quotedCsv);
    assert.equal(parsedCsv.detectedDelimiter, ',');
    assert.equal(parsedCsv.rows[0].location, 'Gate 2, Main Road');

    const spaceTable = [
      'Station Name          Timestamp            Pollutant   Value   Unit',
      'School Gate           2026-11-08 08:00     PM2.5       88      ug/m3',
      'Market Chowk          2026-11-08 09:00     PM2.5       112     ug/m3',
    ].join('\n');
    const parsedSpaces = parseTabularText(spaceTable);
    assert.equal(parsedSpaces.detectedDelimiter, 'SPACES');
    assert.equal(parsedSpaces.rows.length, 2);
    assert.equal(parsedSpaces.rows[1].Pollutant, 'PM2.5');
    assert.equal(parsedSpaces.rows[1].Value, '112');
  });

  it('deduplicates identical column headers and infers column aliases cleanly', () => {
    const raw = [
      'site,recorded_at,analyte,reading,uom,reading',
      'Ward Office,2026-11-08 10:00,NO2,48,ug/m3,backup',
    ].join('\n');

    const parsed = parseTabularText(raw);
    assert.deepEqual(parsed.headers, [
      'site',
      'recorded_at',
      'analyte',
      'reading',
      'uom',
      'reading_2',
    ]);

    const mapping = inferColumnMapping(parsed.headers);
    assert.equal(mapping.location, 'site');
    assert.equal(mapping.timestamp, 'recorded_at');
    assert.equal(mapping.pollutant, 'analyte');
    assert.equal(mapping.value, 'reading');
    assert.equal(mapping.unit, 'uom');
  });

  it('detects tabs and throws explicit errors for empty or header-only inputs', () => {
    assert.equal(detectDelimiter(['a\tb\tc', '1\t2\t3']), '\t');
    assert.throws(() => parseTabularText('   '), /Input is empty/i);
    assert.throws(() => parseTabularText('a,b,c'), /at least one monitoring row/i);
  });

  it('handles CRLF line endings, escaped double quotes, blank lines, and pipe delimiters', () => {
    const raw = [
      'location|timestamp|pollutant|value|unit',
      '',
      '"Sector ""A"" Gate"|2026-11-08 08:00|PM2.5|92|ug/m3',
      'Market Road|2026-11-08 09:00|PM2.5|114|ug/m3',
    ].join('\r\n');

    const parsed = parseTabularText(raw);
    assert.equal(parsed.detectedDelimiter, '|');
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0].location, 'Sector "A" Gate');
    assert.deepEqual(parsed.rowLineNumbers, [3, 4]);
  });

  it('parses 5,000+ unquoted CSV rows quickly via fast path with accurate line numbers', () => {
    const lines = ['location,timestamp,pollutant,value,unit'];
    for (let i = 0; i < 5000; i++) {
      const day = String(1 + (i % 28)).padStart(2, '0');
      const hour = String(i % 24).padStart(2, '0');
      lines.push(`Station_${i % 10},2026-11-${day} ${hour}:00,PM2.5,${40 + (i % 80)},ug/m3`);
    }
    const raw = lines.join('\n');
    const t0 = performance.now();
    const parsed = parseTabularText(raw);
    const elapsedMs = performance.now() - t0;

    assert.equal(parsed.rows.length, 5000);
    assert.equal(parsed.rowLineNumbers[0], 2);
    assert.equal(parsed.rowLineNumbers[4999], 5001);
    assert.equal(parsed.rows[4999].location, 'Station_9');
    assert.ok(elapsedMs < 1000, `Expected <1000ms parse time, took ${elapsedMs.toFixed(1)}ms`);
  });
});
