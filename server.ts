import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  generateBriefingsWithGemini,
  generateComparisonBriefingWithGemini,
  mapGeminiError,
} from './server/gemini';
import { deleteSavedPeriod, listSavedPeriods, savePeriodRecord } from './server/storage';
import type {
  AnalysisResult,
  BriefingLanguage,
  PeriodComparisonResult,
  ReadingLevel,
  SavedPeriodRecord,
} from './src/types/airQuality';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health & API key readiness check (never leaks key value)
  app.get('/api/health', (_req, res) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY.trim() !== '' &&
        process.env.GEMINI_API_KEY.trim() !== 'MY_GEMINI_API_KEY'
    );
    res.json({
      status: 'ok',
      geminiConfigured: hasKey,
    });
  });

  // Saved historical reporting periods
  app.get('/api/periods', async (_req, res) => {
    try {
      const periods = await listSavedPeriods();
      res.json({ periods });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load saved periods.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/periods', async (req, res) => {
    try {
      const record = req.body as SavedPeriodRecord;
      if (!record?.id || !record?.periodLabel || !record?.analysis) {
        res.status(400).json({ error: 'Invalid period payload. Missing id, periodLabel, or analysis.' });
        return;
      }
      const periods = await savePeriodRecord(record);
      res.status(201).json({ periods, saved: record });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save reporting period.';
      res.status(500).json({ error: message });
    }
  });

  app.delete('/api/periods/:id', async (req, res) => {
    try {
      const periods = await deleteSavedPeriod(req.params.id);
      res.json({ periods });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete saved period.';
      res.status(500).json({ error: message });
    }
  });

  // Generate audience briefings via real Gemini API
  app.post('/api/briefings/generate', async (req, res) => {
    try {
      const { analysis, language = 'en', readingLevel = 'detailed' } = req.body as {
        analysis?: AnalysisResult;
        language?: BriefingLanguage;
        readingLevel?: ReadingLevel;
      };

      if (!analysis || !analysis.qualityReport || !Array.isArray(analysis.pollutantSummaries)) {
        res.status(400).json({
          error: 'Valid analyzed monitoring data is required before generating briefings.',
          code: 'INVALID_ANALYSIS_PAYLOAD',
        });
        return;
      }

      if (analysis.qualityReport.validRows === 0) {
        res.status(400).json({
          error: 'Cannot generate briefings because the dataset contains 0 valid readings.',
          code: 'ZERO_VALID_READINGS',
        });
        return;
      }

      const validLang: BriefingLanguage =
        language === 'hi' ? 'hi' : language === 'mr' ? 'mr' : 'en';
      const validLevel: ReadingLevel = readingLevel === 'simple' ? 'simple' : 'detailed';

      const pack = await generateBriefingsWithGemini(analysis, validLang, validLevel);
      res.json({ briefingPack: pack });
    } catch (error) {
      const mapped = mapGeminiError(error);
      res.status(mapped.statusCode).json({
        error: mapped.message,
        code: mapped.code,
      });
    }
  });

  // Generate comparative briefing via Gemini API
  app.post('/api/briefings/compare', async (req, res) => {
    try {
      const { comparison, language = 'en' } = req.body as {
        comparison?: PeriodComparisonResult;
        language?: BriefingLanguage;
      };

      if (!comparison || !Array.isArray(comparison.pollutantComparisons)) {
        res.status(400).json({
          error: 'Valid period comparison data is required.',
          code: 'INVALID_COMPARISON_PAYLOAD',
        });
        return;
      }

      const validLang: BriefingLanguage =
        language === 'hi' ? 'hi' : language === 'mr' ? 'mr' : 'en';
      const summary = await generateComparisonBriefingWithGemini(comparison, validLang);
      res.json({ comparisonBriefing: summary });
    } catch (error) {
      const mapped = mapGeminiError(error);
      res.status(mapped.statusCode).json({
        error: mapped.message,
        code: mapped.code,
      });
    }
  });

  // Vite dev middleware or production static assets
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Civic Air Quality Briefing Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
