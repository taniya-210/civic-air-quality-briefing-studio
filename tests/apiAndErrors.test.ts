import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import {
  generateBriefingsWithGemini,
  mapGeminiError,
  parseStructuredAiJson,
  verifyJsonUpstreamResponse,
} from '../server/gemini';
import { deleteSavedPeriod, listSavedPeriods, savePeriodRecord } from '../server/storage';
import { validateAndAnalyzeTable } from '../src/lib/airQualityEngine';
import { readApiJson } from '../src/lib/apiClient';
import { inferColumnMapping, parseTabularText } from '../src/lib/csvParser';
import { SAMPLE_DATASETS } from '../src/lib/sampleDatasets';
import type { SavedPeriodRecord } from '../src/types/airQuality';

async function startServer(app: ReturnType<typeof createApp>) {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('API error handling, server security, rate limiting & period persistence', () => {
  it('maps Gemini SDK/API error cases and masks raw JSON blobs safely', () => {
    const missing = Object.assign(new Error('Missing key'), { code: 'MISSING_API_KEY' });
    assert.deepEqual(mapGeminiError(missing), {
      statusCode: 503,
      code: 'MISSING_API_KEY',
      message: 'Missing key',
    });

    const invalidAi = Object.assign(new Error('Malformed output'), { code: 'INVALID_AI_RESPONSE' });
    assert.deepEqual(mapGeminiError(invalidAi), {
      statusCode: 502,
      code: 'INVALID_AI_RESPONSE',
      message: 'Malformed output',
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

    const rawJsonFallback = Object.assign(new Error('{"internal":"trace"}'), { status: 500 });
    const mappedFallback = mapGeminiError(rawJsonFallback);
    assert.equal(mappedFallback.statusCode, 500);
    assert.equal(mappedFallback.code, 'GEMINI_API_ERROR');
    assert.equal(mappedFallback.message.startsWith('{'), false);

    const htmlError = Object.assign(new Error('<!doctype html><html><body>502 Bad Gateway</body></html>'), {
      status: 502,
    });
    const mappedHtml = mapGeminiError(htmlError);
    assert.equal(mappedHtml.statusCode, 502);
    assert.equal(mappedHtml.code, 'UPSTREAM_HTML_RESPONSE');
    assert.equal(mappedHtml.message.includes('<!doctype'), false);
  });

  it('inspects HTTP status, content-type, and HTML/non-JSON bodies safely before JSON.parse', async () => {
    const htmlUpstream = new Response('<!doctype html><html><body>Error</body></html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    await assert.rejects(
      () => verifyJsonUpstreamResponse(htmlUpstream),
      (err: unknown) => {
        const mapped = mapGeminiError(err);
        assert.equal(mapped.statusCode, 502);
        assert.equal(mapped.code, 'UPSTREAM_HTML_RESPONSE');
        assert.ok(mapped.message.includes('HTML page'));
        return true;
      }
    );

    const nonJsonOk = new Response('plain text upstream output', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
    await assert.rejects(
      () => verifyJsonUpstreamResponse(nonJsonOk),
      (err: unknown) => {
        const mapped = mapGeminiError(err);
        assert.equal(mapped.statusCode, 502);
        assert.equal(mapped.code, 'INVALID_AI_RESPONSE');
        return true;
      }
    );

    assert.throws(
      () => parseStructuredAiJson('<!doctype html><html></html>', 'briefings'),
      (err: unknown) => {
        const mapped = mapGeminiError(err);
        assert.equal(mapped.code, 'UPSTREAM_HTML_RESPONSE');
        return true;
      }
    );

    const clientHtmlRes = new Response('<!doctype html><html><body>SPA</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    await assert.rejects(
      () => readApiJson(clientHtmlRes, 'Failed to generate AI briefing.'),
      /HTML page \(HTTP 200\) instead of JSON/
    );
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

  it('serves security headers, validates JSON/IDs/payloads, and executes real server/app.ts roundtrip', async () => {
    const app = createApp({ disableRateLimit: true });
    const srv = await startServer(app);
    const testId = `__test_period_${Date.now()}__`;

    try {
      // 1. Health & Security headers
      const healthRes = await fetch(`${srv.baseUrl}/api/health`);
      assert.equal(healthRes.status, 200);
      assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(healthRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
      assert.equal(healthRes.headers.get('x-powered-by'), null);
      const healthJson = await healthRes.json();
      assert.equal(healthJson.status, 'ok');
      assert.equal(typeof healthJson.geminiConfigured, 'boolean');

      // 2. Malformed JSON returns structured 400 INVALID_JSON
      const badJsonRes = await fetch(`${srv.baseUrl}/api/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not-valid-json',
      });
      assert.equal(badJsonRes.status, 400);
      assert.equal((await badJsonRes.json()).code, 'INVALID_JSON');

      // 3. Briefing validation guardrails
      const badGenRes = await fetch(`${srv.baseUrl}/api/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(badGenRes.status, 400);
      assert.equal((await badGenRes.json()).code, 'INVALID_ANALYSIS_PAYLOAD');

      const zeroRowsRes = await fetch(`${srv.baseUrl}/api/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis: { qualityReport: { validRows: 0 }, pollutantSummaries: [{ pollutant: 'PM2.5' }] },
        }),
      });
      assert.equal(zeroRowsRes.status, 400);
      assert.equal((await zeroRowsRes.json()).code, 'ZERO_VALID_READINGS');

      const badCompareRes = await fetch(`${srv.baseUrl}/api/briefings/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(badCompareRes.status, 400);
      assert.equal((await badCompareRes.json()).code, 'INVALID_COMPARISON_PAYLOAD');

      // 4. Period ID & payload validation
      const badDeleteRes = await fetch(`${srv.baseUrl}/api/periods/${encodeURIComponent('../bad!id')}`, {
        method: 'DELETE',
      });
      assert.equal(badDeleteRes.status, 400);
      assert.equal((await badDeleteRes.json()).code, 'INVALID_PERIOD_ID');

      const badPostPeriodRes = await fetch(`${srv.baseUrl}/api/periods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'bad/id', periodLabel: 'x', datasetName: 'y' }),
      });
      assert.equal(badPostPeriodRes.status, 400);
      assert.equal((await badPostPeriodRes.json()).code, 'INVALID_PERIOD_PAYLOAD');

      // 5. Real period persistence save -> list -> delete roundtrip
      const spec = SAMPLE_DATASETS[3];
      const table = parseTabularText(spec.csv);
      const analysis = validateAndAnalyzeTable(table, inferColumnMapping(table.headers), {
        periodLabel: 'Automated Test Period',
        datasetName: spec.filename,
      });

      const postPeriodRes = await fetch(`${srv.baseUrl}/api/periods`, {
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

      const delRes = await fetch(`${srv.baseUrl}/api/periods/${encodeURIComponent(testId)}`, {
        method: 'DELETE',
      });
      assert.equal(delRes.status, 200);
      const delData = await delRes.json();
      assert.ok(!delData.periods.some((p: SavedPeriodRecord) => p.id === testId));

      // 6. Unmatched /api route returns structured 404 JSON instead of falling through to HTML
      const missingApiRes = await fetch(`${srv.baseUrl}/api/nonexistent-endpoint`);
      assert.equal(missingApiRes.status, 404);
      assert.ok((missingApiRes.headers.get('content-type') || '').includes('application/json'));
      assert.equal((await missingApiRes.json()).code, 'API_ROUTE_NOT_FOUND');
    } finally {
      await deleteSavedPeriod(testId);
      await srv.close();
    }
  });

  it('enforces AI endpoint sliding-window rate limit (429 RATE_LIMITED)', async () => {
    const app = createApp({ disableRateLimit: false });
    const srv = await startServer(app);
    try {
      // First 20 invalid requests consume the 20/min window with 400; #21 must trigger 429
      for (let i = 0; i < 20; i++) {
        const res = await fetch(`${srv.baseUrl}/api/briefings/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        assert.equal(res.status, 400);
      }

      const limitedRes = await fetch(`${srv.baseUrl}/api/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(limitedRes.status, 429);
      assert.ok(limitedRes.headers.get('retry-after'));
      assert.equal((await limitedRes.json()).code, 'RATE_LIMITED');
    } finally {
      await srv.close();
    }
  });

  it('serializes concurrent savePeriodRecord calls without race conditions or lost writes', async () => {
    const spec = SAMPLE_DATASETS[3];
    const t = parseTabularText(spec.csv);
    const analysis = validateAndAnalyzeTable(t, inferColumnMapping(t.headers), {
      periodLabel: 'Concurrency Test',
      datasetName: spec.filename,
    });

    const ids = Array.from({ length: 5 }, (_, i) => `__test_conc_${Date.now()}_${i}`);
    try {
      await Promise.all(
        ids.map((id, i) =>
          savePeriodRecord({
            id,
            periodLabel: `Concurrency ${i}`,
            datasetName: spec.filename,
            savedAtIso: new Date().toISOString(),
            analysis,
          })
        )
      );

      const all = await listSavedPeriods();
      for (const id of ids) {
        assert.ok(all.some((p) => p.id === id), `Missing concurrent saved record ${id}`);
      }
    } finally {
      for (const id of ids) {
        await deleteSavedPeriod(id);
      }
    }
  });
});
