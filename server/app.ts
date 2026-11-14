import express, { type NextFunction, type Request, type Response } from 'express';
import {
  generateBriefingsWithGemini,
  generateComparisonBriefingWithGemini,
  mapGeminiError,
} from './gemini';
import { deleteSavedPeriod, listSavedPeriods, savePeriodRecord } from './storage';
import type {
  AnalysisResult,
  BriefingLanguage,
  PeriodComparisonResult,
  ReadingLevel,
  SavedPeriodRecord,
} from '../src/types/airQuality';

const PERIOD_ID_REGEX = /^[a-zA-Z0-9._-]{1,120}$/;

function createRateLimiter(options: { windowMs: number; maxRequests: number; message: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const existing = hits.get(ip);

    if (!existing || now >= existing.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + options.windowMs });
      // Opportunistic cleanup so memory remains bounded
      if (hits.size > 500) {
        for (const [key, val] of hits.entries()) {
          if (now >= val.resetAt) hits.delete(key);
        }
      }
      next();
      return;
    }

    if (existing.count >= options.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: options.message,
        code: 'RATE_LIMITED',
      });
      return;
    }

    existing.count += 1;
    next();
  };
}

function isValidSavedPeriodPayload(record: unknown): record is SavedPeriodRecord {
  if (!record || typeof record !== 'object') return false;
  const r = record as Partial<SavedPeriodRecord>;
  if (typeof r.id !== 'string' || !PERIOD_ID_REGEX.test(r.id)) return false;
  if (typeof r.periodLabel !== 'string' || r.periodLabel.trim().length === 0 || r.periodLabel.length > 160) {
    return false;
  }
  if (typeof r.datasetName !== 'string' || r.datasetName.length > 200) return false;
  if (!r.analysis || typeof r.analysis !== 'object') return false;
  const a = r.analysis as Partial<AnalysisResult>;
  if (!a.qualityReport || !Array.isArray(a.pollutantSummaries)) return false;
  if (typeof a.qualityReport.validRows !== 'number' || a.qualityReport.validRows < 0) return false;
  return true;
}

export function createApp(options?: { disableRateLimit?: boolean }) {
  const app = express();
  app.disable('x-powered-by');

  // Security headers compatible with embedded iframe runtime
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    next();
  });

  app.use(express.json({ limit: '2mb' }));

  // Malformed JSON guard — never fall through to default HTML error stack traces
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const parseErr = err as { type?: string; status?: number };
    if (parseErr?.type === 'entity.parse.failed' || parseErr?.status === 400) {
      res.status(400).json({
        error: 'Malformed JSON request payload.',
        code: 'INVALID_JSON',
      });
      return;
    }
    if (parseErr?.type === 'entity.too.large' || parseErr?.status === 413) {
      res.status(413).json({
        error: 'Request payload exceeds the 2 MB API limit.',
        code: 'PAYLOAD_TOO_LARGE',
      });
      return;
    }
    next(err);
  });

  const aiRateLimiter = options?.disableRateLimit
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : createRateLimiter({
        windowMs: 60_000,
        maxRequests: 20,
        message: 'Too many AI briefing requests. Please wait a minute before trying again.',
      });

  const storageRateLimiter = options?.disableRateLimit
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : createRateLimiter({
        windowMs: 60_000,
        maxRequests: 60,
        message: 'Too many archive requests. Please wait a moment and retry.',
      });

  // Health & API key readiness check (never exposes key value)
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
    } catch {
      res.status(500).json({ error: 'Failed to load saved periods.', code: 'STORAGE_READ_ERROR' });
    }
  });

  app.post('/api/periods', storageRateLimiter, async (req, res) => {
    try {
      if (!isValidSavedPeriodPayload(req.body)) {
        res.status(400).json({
          error:
            'Invalid period payload. Provide a safe alphanumeric id (<=120 chars), periodLabel, and valid analysis summary.',
          code: 'INVALID_PERIOD_PAYLOAD',
        });
        return;
      }
      const record: SavedPeriodRecord = {
        ...req.body,
        periodLabel: req.body.periodLabel.trim(),
        datasetName: req.body.datasetName.trim(),
      };
      const periods = await savePeriodRecord(record);
      res.status(201).json({ periods, saved: record });
    } catch {
      res.status(500).json({ error: 'Failed to save reporting period.', code: 'STORAGE_WRITE_ERROR' });
    }
  });

  app.delete('/api/periods/:id', storageRateLimiter, async (req, res) => {
    try {
      const id = String(req.params.id || '');
      if (!PERIOD_ID_REGEX.test(id)) {
        res.status(400).json({
          error: 'Invalid reporting period identifier.',
          code: 'INVALID_PERIOD_ID',
        });
        return;
      }
      const periods = await deleteSavedPeriod(id);
      res.json({ periods });
    } catch {
      res.status(500).json({ error: 'Failed to delete saved period.', code: 'STORAGE_DELETE_ERROR' });
    }
  });

  // Generate audience briefings via real Gemini API
  app.post('/api/briefings/generate', aiRateLimiter, async (req, res) => {
    try {
      const { analysis, language = 'en', readingLevel = 'detailed' } = (req.body ?? {}) as {
        analysis?: AnalysisResult;
        language?: BriefingLanguage;
        readingLevel?: ReadingLevel;
      };

      if (
        !analysis ||
        !analysis.qualityReport ||
        !Array.isArray(analysis.pollutantSummaries) ||
        analysis.pollutantSummaries.length === 0
      ) {
        res.status(400).json({
          error: 'Valid analyzed monitoring data is required before generating briefings.',
          code: 'INVALID_ANALYSIS_PAYLOAD',
        });
        return;
      }

      if (typeof analysis.qualityReport.validRows !== 'number' || analysis.qualityReport.validRows <= 0) {
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
  app.post('/api/briefings/compare', aiRateLimiter, async (req, res) => {
    try {
      const { comparison, language = 'en' } = (req.body ?? {}) as {
        comparison?: PeriodComparisonResult;
        language?: BriefingLanguage;
      };

      if (
        !comparison ||
        typeof comparison.periodALabel !== 'string' ||
        typeof comparison.periodBLabel !== 'string' ||
        !Array.isArray(comparison.pollutantComparisons)
      ) {
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

  return app;
}
