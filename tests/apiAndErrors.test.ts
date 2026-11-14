import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  generateBriefingsWithGemini,
  generateComparisonBriefingWithGemini,
  mapGeminiError,
} from '../server/gemini';
import { deleteSavedPeriod, listSavedPeriods, savePeriodRecord } from '../server/storage';
import { validateAndAnalyzeTable } from '../src/lib/airQualityEngine';
import { inferColumnMapping, parseTabularText } from '../src/lib/csvParser';
import { SAMPLE_DATASETS } from '../src/lib/sampleDatasets';
import type { SavedPeriodRecord } from '../src/types/airQuality';

describe('API error handling, server validation & period persistence', () => {
  it('maps Gemini SDK/API error cases to clear HTTP status codes and messages', () => {
    const missing = Object.assign(new Error('Missing key'), { code: 'MISSING_API_KEY' });
    assert.deepEqual(mapGeminiError(missing), {
      statusCode: 503,
      code: 'MISSING_API_KEY',
      message: 'Missing key',
    });

    const invalidKey = Object.assign(new Error('PERMISSION_DENIED: invalid key'), { status: 403 });
    assert.equal(mapGeminiError(invalidKey).statusCode, 403);
    assert.equal(mapGeminiError(invalidKey).code, 'API_KEY_INVALID');

    const rateLimit = Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
    assert.equal(mapGeminiError(rateLimit).statusCode, 429);
    assert.equal(mapGeminiError(rateLimit).code, 'RATE_LIMITED');

    const notFound = Object.assign(new Error('NOT_FOUND'), { status: 404 });
    assert.equal(mapGeminiError(notFound).statusCode, 502);
    assert.equal(mapGeminiError(notFound).code, 'MODEL_UNAVAILABLE');

    const unavailable = Object.assign(
      new Error('{"error":{"code":503,"message":"high demand","status":"UNAVAILABLE"}}'),
      { status: 503 }
    );
    assert.equal(mapGeminiError(unavailable).statusCode, 503);
    assert.equal(mapGeminiError(unavailable).code, 'SERVICE_UNAVAILABLE');
    assert.ok(mapGeminiError(unavailable).message.includes('temporarily experiencing high demand'));
  });

  it('rejects briefing generation with 503 MISSING_API_KEY when GEMINI_API_KEY is absent', async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const spec = SAMPLE_DATASETS[0];
      const t = parseTabularText(spec.csv);
      const analysis = validateAndAnalyzeTable(t, inferColumnMapping(t.headers), {
        periodLabel: spec.periodLabel,
        datasetName: spec.filename,
      });

      await assert.rejects(
        () => generateBriefingsWithGemini(analysis, 'en', 'detailed'),
        (err: unknown) => {
          const mapped = mapGeminiError(err);
          assert.equal(mapped.statusCode, 503);
          assert.equal(mapped.code, 'MISSING_API_KEY');
          return true;
        }
      );
    } finally {
      if (prevKey !== undefined) {
        process.env.GEMINI_API_KEY = prevKey;
      }
    }
  });

  it('validates backend API payloads and executes period save/list/delete roundtrip', async () => {
    const app = express();
    app.use(express.json());

    app.get('/api/periods', async (_req, res) => {
      const periods = await listSavedPeriods();
      res.json({ periods });
    });

    app.post('/api/periods', async (req, res) => {
      const record = req.body as SavedPeriodRecord;
      if (!record?.id || !record?.periodLabel || !record?.analysis) {
        res.status(400).json({ error: 'Invalid period payload.' });
        return;
      }
      const periods = await savePeriodRecord(record);
      res.status(201).json({ periods, saved: record });
    });

    app.delete('/api/periods/:id', async (req, res) => {
      const periods = await deleteSavedPeriod(req.params.id);
      res.json({ periods });
    });

    app.post('/api/briefings/generate', async (req, res) => {
      const { analysis } = req.body ?? {};
      if (!analysis || !analysis.qualityReport || !Array.isArray(analysis.pollutantSummaries)) {
        res.status(400).json({ code: 'INVALID_ANALYSIS_PAYLOAD', error: 'Missing analysis.' });
        return;
      }
      if (analysis.qualityReport.validRows === 0) {
        res.status(400).json({ code: 'ZERO_VALID_READINGS', error: 'Zero valid rows.' });
        return;
      }
      try {
        const pack = await generateBriefingsWithGemini(analysis, 'en', 'simple');
        res.json({ briefingPack: pack });
      } catch (err) {
        const mapped = mapGeminiError(err);
        res.status(mapped.statusCode).json({ error: mapped.message, code: mapped.code });
      }
    });

    app.post('/api/briefings/compare', async (req, res) => {
      const { comparison } = req.body ?? {};
      if (!comparison || !Array.isArray(comparison.pollutantComparisons)) {
        res.status(400).json({ code: 'INVALID_COMPARISON_PAYLOAD', error: 'Invalid comparison.' });
        return;
      }
      try {
        const summary = await generateComparisonBriefingWithGemini(comparison, 'en');
        res.json({ comparisonBriefing: summary });
      } catch (err) {
        const mapped = mapGeminiError(err);
        res.status(mapped.statusCode).json({ error: mapped.message, code: mapped.code });
      }
    });

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const testId = `__test_period_${Date.now()}__`;

    try {
      // 1. Briefing validation guardrails
      const badGenRes = await fetch(`${baseUrl}/api/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(badGenRes.status, 400);
      const badGenJson = await badGenRes.json();
      assert.equal(badGenJson.code, 'INVALID_ANALYSIS_PAYLOAD');

      const zeroRowsRes = await fetch(`${baseUrl}/api/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis: { qualityReport: { validRows: 0 }, pollutantSummaries: [] },
        }),
      });
      assert.equal(zeroRowsRes.status, 400);
      assert.equal((await zeroRowsRes.json()).code, 'ZERO_VALID_READINGS');

      const badCompareRes = await fetch(`${baseUrl}/api/briefings/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(badCompareRes.status, 400);
      assert.equal((await badCompareRes.json()).code, 'INVALID_COMPARISON_PAYLOAD');

      // 2. Period persistence save -> list -> delete roundtrip
      const spec = SAMPLE_DATASETS[3];
      const table = parseTabularText(spec.csv);
      const analysis = validateAndAnalyzeTable(table, inferColumnMapping(table.headers), {
        periodLabel: 'Automated Test Period',
        datasetName: spec.filename,
      });

      const postPeriodRes = await fetch(`${baseUrl}/api/periods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: testId,
          periodLabel: 'Automated Test Period',
          datasetName: spec.filename,
          savedAtIso: new Date().toISOString(),
          analysis,
        }),
      });
      assert.equal(postPeriodRes.status, 201);
      const postData = await postPeriodRes.json();
      assert.ok(postData.periods.some((p: SavedPeriodRecord) => p.id === testId));

      const delRes = await fetch(`${baseUrl}/api/periods/${encodeURIComponent(testId)}`, {
        method: 'DELETE',
      });
      assert.equal(delRes.status, 200);
      const delData = await delRes.json();
      assert.ok(!delData.periods.some((p: SavedPeriodRecord) => p.id === testId));
    } finally {
      await deleteSavedPeriod(testId);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
