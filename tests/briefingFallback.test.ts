import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApp } from '../server/app';
import {
  generateBriefingsWithFallback,
  generateBriefingsWithGemini,
  withTransientRetry,
} from '../server/gemini';
import { BriefingsView } from '../src/components/BriefingsView';
import { CitizenAdvisoryView } from '../src/components/CitizenAdvisoryView';
import { validateAndAnalyzeTable } from '../src/lib/airQualityEngine';
import { inferColumnMapping, parseTabularText } from '../src/lib/csvParser';
import {
  buildDemoFallbackBriefingPack,
  FALLBACK_BANNER_LABEL,
  FALLBACK_UNAVAILABLE_MESSAGE,
  formatVulnerableAdvisoriesCopyText,
  formatWardBriefingCopyText,
  sanitizeDebugError,
} from '../src/lib/demoBriefingFallback';
import { SAMPLE_DATASETS } from '../src/lib/sampleDatasets';
import type { GeneratedBriefingPack } from '../src/types/airQuality';

function analyzeSample(index: number) {
  const spec = SAMPLE_DATASETS[index];
  const table = parseTabularText(spec.csv);
  return validateAndAnalyzeTable(table, inferColumnMapping(table.headers), {
    periodLabel: spec.periodLabel,
    datasetName: spec.filename,
  });
}

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

describe('Briefings & Citizen Advisory deterministic fallback system', () => {
  it('1. returns normal Gemini briefing with source="gemini" when live generation succeeds', async () => {
    const analysis = analyzeSample(0);
    const mockLivePack = buildDemoFallbackBriefingPack(analysis, 'en', 'detailed');
    const liveCandidate: GeneratedBriefingPack = {
      ...mockLivePack,
      source: 'gemini',
      modelUsed: 'gemini-4-hydrogen',
      fallbackNotice: undefined,
      fallbackDebugError: undefined,
      wardOfficerBriefing: {
        ...mockLivePack.wardOfficerBriefing,
        title: `Live Gemini Briefing — ${analysis.periodLabel}`,
      },
    };

    const app = createApp({
      disableRateLimit: true,
      generateBriefings: async () => liveCandidate,
    });
    const srv = await startServer(app);
    try {
      const res = await fetch(`${srv.baseUrl}/api/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, language: 'en', readingLevel: 'detailed' }),
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        briefingPack: GeneratedBriefingPack;
        liveAiError?: unknown;
      };
      assert.equal(data.briefingPack.source, 'gemini');
      assert.equal(data.briefingPack.modelUsed, 'gemini-4-hydrogen');
      assert.equal(data.liveAiError, undefined);
      assert.ok(data.briefingPack.wardOfficerBriefing.title.includes('Live Gemini Briefing'));
      assert.equal(
        formatWardBriefingCopyText(data.briefingPack, analysis).includes(FALLBACK_BANNER_LABEL),
        false
      );
    } finally {
      await srv.close();
    }
  });

  it('2. triggers fallback on HTTP 429 quota/rate limit errors', async () => {
    const analysis = analyzeSample(0);
    const app = createApp({
      disableRateLimit: true,
      generateBriefings: async () => {
        throw Object.assign(new Error('RESOURCE_EXHAUSTED: Quota exceeded'), { status: 429 });
      },
    });
    const srv = await startServer(app);
    try {
      const res = await fetch(`${srv.baseUrl}/api/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, language: 'en', readingLevel: 'detailed' }),
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        briefingPack: GeneratedBriefingPack;
        liveAiError: { code: string; statusCode?: number; message: string };
      };
      assert.equal(data.briefingPack.source, 'demo_template');
      assert.equal(data.briefingPack.fallbackNotice, FALLBACK_UNAVAILABLE_MESSAGE);
      assert.equal(data.liveAiError.code, 'RATE_LIMITED');
      assert.equal(data.liveAiError.statusCode, 429);
    } finally {
      await srv.close();
    }
  });

  it('3. triggers fallback on HTTP 503 only after existing transient retry behavior completes', async () => {
    const analysis = analyzeSample(0);
    let attempts = 0;

    const result = await generateBriefingsWithFallback(analysis, 'en', 'detailed', async () => {
      return await withTransientRetry(
        async () => {
          attempts += 1;
          throw Object.assign(new Error('Service UNAVAILABLE due to high demand'), {
            status: 503,
          });
        },
        2,
        1
      );
    });

    assert.equal(attempts, 3, 'Expected initial attempt + 2 retries before fallback');
    assert.equal(result.briefingPack.source, 'demo_template');
    assert.equal(result.liveAiError?.code, 'SERVICE_UNAVAILABLE');
    assert.equal(result.liveAiError?.statusCode, 503);
  });

  it('4. triggers fallback on HTTP 403 and HTTP 500 without leaking secrets', async () => {
    const analysis = analyzeSample(0);

    const err403 = await generateBriefingsWithFallback(analysis, 'en', 'simple', async () => {
      throw Object.assign(
        new Error('PERMISSION_DENIED for AIzaSyFakeKeyValue1234567890'),
        { status: 403 }
      );
    });
    assert.equal(err403.briefingPack.source, 'demo_template');
    assert.equal(err403.liveAiError?.code, 'API_KEY_INVALID');
    assert.equal(err403.liveAiError?.statusCode, 403);
    assert.equal(JSON.stringify(err403).includes('AIzaSyFakeKey'), false);

    const redacted = sanitizeDebugError({
      code: 'TEST',
      message: 'Failed with AIzaSySecretTokenABC123456 and Bearer secret.jwt.token',
    });
    assert.equal(redacted.message.includes('AIzaSySecretToken'), false);
    assert.equal(redacted.message.includes('secret.jwt.token'), false);

    const err500 = await generateBriefingsWithFallback(analysis, 'en', 'detailed', async () => {
      throw Object.assign(new Error('Internal upstream failure'), { status: 500 });
    });
    assert.equal(err500.briefingPack.source, 'demo_template');
    assert.equal(err500.liveAiError?.code, 'GEMINI_API_ERROR');
    assert.equal(err500.liveAiError?.statusCode, 500);
  });

  it('5. triggers fallback when GEMINI_API_KEY is missing', async () => {
    const analysis = analyzeSample(0);
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const result = await generateBriefingsWithFallback(
        analysis,
        'en',
        'detailed',
        generateBriefingsWithGemini
      );
      assert.equal(result.briefingPack.source, 'demo_template');
      assert.equal(result.liveAiError?.code, 'MISSING_API_KEY');
      assert.equal(result.liveAiError?.statusCode, 503);
    } finally {
      if (prevKey !== undefined) {
        process.env.GEMINI_API_KEY = prevKey;
      }
    }
  });

  it('6. triggers fallback on malformed or HTML Gemini responses', async () => {
    const analysis = analyzeSample(0);

    const malformed = await generateBriefingsWithFallback(analysis, 'en', 'detailed', async () => {
      throw Object.assign(new Error('Gemini returned malformed structured output'), {
        statusCode: 502,
        code: 'INVALID_AI_RESPONSE',
      });
    });
    assert.equal(malformed.briefingPack.source, 'demo_template');
    assert.equal(malformed.liveAiError?.code, 'INVALID_AI_RESPONSE');

    const htmlErr = await generateBriefingsWithFallback(analysis, 'en', 'detailed', async () => {
      throw new Error('<!doctype html><html><body>502 Bad Gateway</body></html>');
    });
    assert.equal(htmlErr.briefingPack.source, 'demo_template');
    assert.equal(htmlErr.liveAiError?.code, 'UPSTREAM_HTML_RESPONSE');
    assert.equal(htmlErr.liveAiError?.message.includes('<!doctype'), false);
  });

  it('7 & 8. generates localized English, Hindi, and Marathi fallbacks across Simple and Detailed reading levels', () => {
    const analysis = analyzeSample(0);

    const enDetailed = buildDemoFallbackBriefingPack(analysis, 'en', 'detailed');
    const enSimple = buildDemoFallbackBriefingPack(analysis, 'en', 'simple');
    const hiDetailed = buildDemoFallbackBriefingPack(analysis, 'hi', 'detailed');
    const mrDetailed = buildDemoFallbackBriefingPack(analysis, 'mr', 'detailed');

    assert.equal(enDetailed.language, 'en');
    assert.equal(enSimple.readingLevel, 'simple');
    assert.notEqual(
      enDetailed.wardOfficerBriefing.measuredFacts.join('\n'),
      enSimple.wardOfficerBriefing.measuredFacts.join('\n')
    );
    assert.ok(enDetailed.wardOfficerBriefing.measuredFacts.some((f) => f.includes('P90')));

    assert.equal(hiDetailed.language, 'hi');
    assert.ok(/[\u0900-\u097F]/.test(hiDetailed.wardOfficerBriefing.title));
    assert.ok(/[\u0900-\u097F]/.test(hiDetailed.housingSocietyAdvisory.residentNoticeDraft));
    assert.ok(/[\u0900-\u097F]/.test(hiDetailed.schoolAdvisory.parentMessageDraft));
    assert.ok(hiDetailed.wardOfficerBriefing.executiveSummary.includes('PM2.5'));

    assert.equal(mrDetailed.language, 'mr');
    assert.ok(/[\u0900-\u097F]/.test(mrDetailed.wardOfficerBriefing.title));
    assert.ok(/[\u0900-\u097F]/.test(mrDetailed.housingSocietyAdvisory.residentNoticeDraft));
    assert.ok(/[\u0900-\u097F]/.test(mrDetailed.schoolAdvisory.parentMessageDraft));
    assert.ok(mrDetailed.wardOfficerBriefing.executiveSummary.includes('PM2.5'));
    assert.notEqual(hiDetailed.wardOfficerBriefing.title, mrDetailed.wardOfficerBriefing.title);
  });

  it('9 & 10. matches exact validated metrics and never fabricates readings or unsupported 24h regulatory exceedances', () => {
    // Sample 0 is preliminary (short-duration / intermittent), so 0 regulatory exceedances can be claimed
    const prelimAnalysis = analyzeSample(0);
    const prelimPack = buildDemoFallbackBriefingPack(prelimAnalysis, 'en', 'detailed');
    const pm25 = prelimAnalysis.pollutantSummaries.find((p) => p.pollutant === 'PM2.5')!;
    const topHotspot = pm25.hotspots[0];

    const joined = JSON.stringify(prelimPack);
    assert.ok(joined.includes(String(prelimAnalysis.qualityReport.validRows)));
    assert.ok(joined.includes(String(pm25.mean)));
    assert.ok(joined.includes(String(pm25.max)));
    assert.ok(joined.includes(topHotspot.location));
    assert.ok(prelimPack.wardOfficerBriefing.title.includes('[PRELIMINARY]'));
    assert.equal(joined.includes('exceeded CPCB 24-hour'), false);

    // Sample 2 has valid 24h windows; verify exact window exceedance counts are preserved accurately
    const sustainedAnalysis = analyzeSample(2);
    const sustainedPack = buildDemoFallbackBriefingPack(sustainedAnalysis, 'en', 'detailed');
    const sustainedPm25 = sustainedAnalysis.pollutantSummaries.find((p) => p.pollutant === 'PM2.5')!;
    if (sustainedPm25.regulatoryWindowTotalCount > 0) {
      const expectedRatio = `${sustainedPm25.regulatoryWindowExceedanceCount}/${sustainedPm25.regulatoryWindowTotalCount}`;
      assert.ok(
        sustainedPack.wardOfficerBriefing.measuredFacts.some((f) => f.includes(expectedRatio))
      );
    }
  });

  it('11. never uses fallback for zero-valid-reading or invalid analysis payloads', async () => {
    const app = createApp({ disableRateLimit: true });
    const srv = await startServer(app);
    try {
      const badPayload = await fetch(`${srv.baseUrl}/api/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(badPayload.status, 400);
      const badData = (await badPayload.json()) as { code: string; briefingPack?: unknown };
      assert.equal(badData.code, 'INVALID_ANALYSIS_PAYLOAD');
      assert.equal(badData.briefingPack, undefined);

      const zeroValid = await fetch(`${srv.baseUrl}/api/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis: {
            qualityReport: { validRows: 0 },
            pollutantSummaries: [{ pollutant: 'PM2.5' }],
          },
        }),
      });
      assert.equal(zeroValid.status, 400);
      const zeroData = (await zeroValid.json()) as { code: string; briefingPack?: unknown };
      assert.equal(zeroData.code, 'ZERO_VALID_READINGS');
      assert.equal(zeroData.briefingPack, undefined);
    } finally {
      await srv.close();
    }
  });

  it('12 & 13. renders fallback banners in both BriefingsView and CitizenAdvisoryView and preserves disclaimer in copy & print outputs', () => {
    const analysis = analyzeSample(0);
    const fallbackPack = buildDemoFallbackBriefingPack(analysis, 'en', 'detailed', {
      code: 'RATE_LIMITED',
      statusCode: 429,
      message: 'Gemini quota exceeded',
    });

    const briefingsHtml = renderToStaticMarkup(
      React.createElement(BriefingsView, {
        analysis,
        briefingPack: fallbackPack,
        language: 'en',
        readingLevel: 'detailed',
        isGenerating: false,
        error: null,
        onChangeLanguage: () => {},
        onChangeReadingLevel: () => {},
        onGenerate: () => {},
        onNavigate: () => {},
      })
    );

    const advisoryHtml = renderToStaticMarkup(
      React.createElement(CitizenAdvisoryView, {
        analysis,
        briefingPack: fallbackPack,
        language: 'en',
        readingLevel: 'detailed',
        isGenerating: false,
        error: null,
        onChangeLanguage: () => {},
        onChangeReadingLevel: () => {},
        onGenerate: () => {},
        onNavigate: () => {},
      })
    );

    for (const html of [briefingsHtml, advisoryHtml]) {
      assert.ok(html.includes(FALLBACK_BANNER_LABEL));
      assert.ok(html.includes(FALLBACK_UNAVAILABLE_MESSAGE));
      assert.ok(html.includes('RATE_LIMITED (HTTP 429)'));
      assert.ok(html.includes('Retry Live AI'));
      // Verify the printable notice banner wrapper itself is NOT hidden by no-print
      assert.equal(
        html.includes(`no-print">${FALLBACK_BANNER_LABEL}`),
        false
      );
    }

    const wardCopy = formatWardBriefingCopyText(fallbackPack, analysis);
    assert.ok(wardCopy.includes(FALLBACK_BANNER_LABEL));
    assert.ok(wardCopy.includes(FALLBACK_UNAVAILABLE_MESSAGE));

    const vulnerableCopy = formatVulnerableAdvisoriesCopyText(fallbackPack);
    assert.ok(vulnerableCopy.includes(FALLBACK_BANNER_LABEL));
    assert.ok(vulnerableCopy.includes(FALLBACK_UNAVAILABLE_MESSAGE));

    assert.ok(fallbackPack.housingSocietyAdvisory.residentNoticeDraft.includes(FALLBACK_BANNER_LABEL));
    assert.ok(fallbackPack.schoolAdvisory.parentMessageDraft.includes(FALLBACK_BANNER_LABEL));
  });
});
