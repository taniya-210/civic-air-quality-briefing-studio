import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AnalysisResult,
  BriefingLanguage,
  ComparativeBriefingResponse,
  GeneratedBriefingPack,
  PeriodComparisonResult,
  ReadingLevel,
} from '../src/types/airQuality';

const MODEL_NAME = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY is not configured on the server. Add your Gemini API key in Settings > Secrets to enable AI briefing generation.'
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 503;
    err.code = 'MISSING_API_KEY';
    throw err;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getLanguageInstruction(language: BriefingLanguage): string {
  if (language === 'hi') {
    return 'Write ALL human-readable prose, headings, notices, and recommendations in clear, natural Hindi (Devanagari script). Keep pollutant chemical formulas (PM2.5, PM10, NO2, SO2, O3, CO) and station names recognizable.';
  }
  if (language === 'mr') {
    return 'Write ALL human-readable prose, headings, notices, and recommendations in clear, natural Marathi (Devanagari script). Keep pollutant chemical formulas (PM2.5, PM10, NO2, SO2, O3, CO) and station names recognizable.';
  }
  return 'Write ALL prose, headings, notices, and recommendations in crisp, plain, authoritative English.';
}

function sanitizePromptText(value: string | undefined | null, maxLen = 160): string {
  if (!value) return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function buildCompactEvidencePayload(analysis: AnalysisResult) {
  return {
    periodLabel: sanitizePromptText(analysis.periodLabel, 160),
    datasetName: sanitizePromptText(analysis.datasetName, 160),
    overallReliability: analysis.overallReliability,
    isPreliminaryAssessment: analysis.isPreliminary,
    preliminarySummaryNote: sanitizePromptText(analysis.preliminarySummaryNote, 400),
    reliabilityNotes: analysis.reliabilityNotes.map((n) => sanitizePromptText(n, 300)),
    qualityMetrics: {
      totalRawRows: analysis.qualityReport.totalRows,
      validRows: analysis.qualityReport.validRows,
      flaggedRowsCount: analysis.qualityReport.flaggedRowsCount,
      duplicateCount: analysis.qualityReport.duplicateCount,
      missingFieldCount: analysis.qualityReport.missingFieldCount,
      invalidValueCount: analysis.qualityReport.invalidValueCount,
      invalidTimestampCount: analysis.qualityReport.invalidTimestampCount,
      unitInconsistencyCount: analysis.qualityReport.unitInconsistencyCount,
      completenessPct: analysis.qualityReport.completenessPct,
      timeRangeStart: analysis.qualityReport.timeRangeStart,
      timeRangeEnd: analysis.qualityReport.timeRangeEnd,
      timeSpanHours: analysis.qualityReport.timeSpanHours,
      stationsCovered: analysis.qualityReport.stations.slice(0, 50).map((s) => sanitizePromptText(s, 100)),
      pollutantsCovered: analysis.qualityReport.pollutants.slice(0, 20).map((p) => sanitizePromptText(p, 40)),
    },
    pollutantSummaries: analysis.pollutantSummaries.map((p) => ({
      pollutant: sanitizePromptText(p.pollutant, 40),
      unit: sanitizePromptText(p.primaryUnit, 30),
      hasMixedUnits: p.hasMixedUnits,
      unitWarning: p.unitWarning ? sanitizePromptText(p.unitWarning, 300) : null,
      totalValidCount: p.totalCount,
      spanHours: p.spanHours,
      observedMean: p.mean,
      observedMedian: p.median,
      observedP90: p.p90,
      observedMin: p.min,
      observedPeak: p.observedPeak
        ? {
            value: p.observedPeak.value,
            unit: sanitizePromptText(p.observedPeak.unit, 30),
            location: sanitizePromptText(p.observedPeak.location, 100),
            timestamp: sanitizePromptText(p.observedPeak.timestampRaw, 60),
            sourceRow: p.observedPeak.rowIndex,
          }
        : null,
      stdDev: p.stdDev,
      averagingStatus: p.averagingStatus,
      isPreliminary: p.isPreliminary,
      preliminaryLabel: p.preliminaryLabel,
      averagingNote: p.averagingNote,
      ...(p.regulatoryWindowTotalCount > 0 && p.thresholdUsed
        ? {
            regulatoryAssessment: {
              standardLabel: p.thresholdUsed.referenceLabel,
              validWindowCount: p.regulatoryWindowTotalCount,
              exceedingWindowCount: p.regulatoryWindowExceedanceCount,
              validWindowAverages: p.validWindowAverages.map((w) => ({
                windowLabel: w.windowLabel,
                location: w.location,
                calculatedAverage: w.calculatedAverage,
                readingCount: w.readingCount,
                spanHours: w.spanHours,
                exceedsStandard: w.exceedsStandard,
              })),
            },
          }
        : {
            regulatoryAssessment: null,
          }),
      trend: {
        direction: p.trend.direction,
        slopePerHour: p.trend.slopePerHour,
        slopePerDay: p.trend.slopePerDay,
        firstHalfMean: p.trend.firstHalfMean,
        secondHalfMean: p.trend.secondHalfMean,
        deltaPct: p.trend.deltaPct,
        note: p.trend.note,
      },
      stationRankings: p.hotspots.map((h) => ({
        rank: h.rank,
        location: h.location,
        observedMean: h.mean,
        observedPeak: h.max,
        observedPeakRow: h.observedPeakRowIndex,
        observedPeakTimestamp: h.observedPeakTimestamp,
        sampleCount: h.count,
        pctVsWardMean: h.pctAboveWardMean,
        isPreliminary: h.isPreliminary,
        validWindowCount: h.validWindowCount,
        validWindowExceedances: h.validWindowExceedances,
        reliabilityNote: h.reliabilityNote,
      })),
    })),
  };
}

export function mapGeminiError(error: unknown): { statusCode: number; code: string; message: string } {
  const errObj = error as { status?: number; statusCode?: number; code?: string; message?: string };
  const rawMsg = errObj?.message || 'Unexpected error communicating with Gemini API.';
  const status = errObj?.statusCode || errObj?.status || 500;

  if (errObj?.code === 'MISSING_API_KEY') {
    return { statusCode: 503, code: 'MISSING_API_KEY', message: rawMsg };
  }
  if (errObj?.code === 'INVALID_AI_RESPONSE') {
    return { statusCode: 502, code: 'INVALID_AI_RESPONSE', message: rawMsg };
  }
  if (status === 403 || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('API_KEY_INVALID')) {
    return {
      statusCode: 403,
      code: 'API_KEY_INVALID',
      message: 'Gemini API rejected the configured key. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED')) {
    return {
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Gemini API quota or rate limit exceeded. Wait a moment and retry.',
    };
  }
  if (status === 404 || rawMsg.includes('NOT_FOUND')) {
    return {
      statusCode: 502,
      code: 'MODEL_UNAVAILABLE',
      message: `Gemini model "${MODEL_NAME}" returned not found. Please retry or check service status.`,
    };
  }
  if (status === 503 || rawMsg.includes('UNAVAILABLE') || rawMsg.toLowerCase().includes('high demand')) {
    return {
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message:
        'Gemini AI service is temporarily experiencing high demand. Your validated analysis is intact—please wait a few seconds and click Retry.',
    };
  }

  return {
    statusCode: status >= 400 && status < 600 ? status : 500,
    code: 'GEMINI_API_ERROR',
    message: rawMsg.startsWith('{')
      ? 'Unexpected error communicating with Gemini AI service. Please retry.'
      : rawMsg,
  };
}

function parseStructuredAiJson<T>(rawText: string | undefined, contextLabel: string): T {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) {
    const err = new Error(
      `Gemini returned an empty response for ${contextLabel}. Please retry.`
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 502;
    err.code = 'INVALID_AI_RESPONSE';
    throw err;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const err = new Error(
      `Gemini returned malformed structured output for ${contextLabel}. Please retry.`
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 502;
    err.code = 'INVALID_AI_RESPONSE';
    throw err;
  }
}

function isTransientCapacityError(error: unknown): boolean {
  const errObj = error as { status?: number; statusCode?: number; message?: string };
  const status = errObj?.statusCode || errObj?.status;
  const msg = (errObj?.message || '').toLowerCase();
  return status === 503 || msg.includes('unavailable') || msg.includes('high demand');
}

async function withTransientRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries || !isTransientCapacityError(error)) {
        throw error;
      }
      const delayMs = 800 * Math.pow(2, attempt);
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

const vulnerableGroupItemSchema = {
  type: Type.OBJECT,
  required: ['groupName', 'riskSummary', 'precautions', 'whenToSeekCare', 'linkedEvidence'],
  properties: {
    groupName: { type: Type.STRING },
    riskSummary: { type: Type.STRING },
    precautions: { type: Type.ARRAY, items: { type: Type.STRING } },
    whenToSeekCare: { type: Type.STRING },
    linkedEvidence: { type: Type.STRING },
  },
};

export async function generateBriefingsWithGemini(
  analysis: AnalysisResult,
  language: BriefingLanguage,
  readingLevel: ReadingLevel
): Promise<GeneratedBriefingPack> {
  const ai = getGeminiClient();
  const evidence = buildCompactEvidencePayload(analysis);

  const langInstruction = getLanguageInstruction(language);

  const levelInstruction =
    readingLevel === 'simple'
      ? 'Use a SIMPLE reading level: short sentences, everyday vocabulary, minimal jargon, immediately scannable for busy principals, residents, and field officers.'
      : 'Use a DETAILED reading level: include exact statistical context (observed means, observed peaks, P90, trend slopes, sample counts, and verified 24h window averages where available) suitable for formal civic documentation.';

  const systemInstruction = [
    'You are an analytical assistant for the Civic Air Quality Briefing Studio.',
    'STRICT SCIENTIFIC ACCURACY & GROUNDING RULES:',
    '1. Every numeric measurement, station name, pollutant name, row number, and time span you cite MUST come verbatim from the provided JSON evidence payload.',
    '2. NEVER compare individual hourly or spot readings directly against a 24-hour or 8-hour regulatory standard (such as CPCB 24h PM2.5 = 60 ug/m3).',
    '3. ONLY report a regulatory standard exceedance when "regulatoryAssessment" is non-null for that pollutant and "exceedingWindowCount" > 0 (meaning a valid 24-hour or 8-hour window average was calculated from sufficient hourly readings).',
    '4. When "isPreliminary" is true (or "regulatoryAssessment" is null), explicitly label findings as PRELIMINARY, report the observed mean and observed peak (maximum observed reading) without calling it a regulatory exceedance, and state why 24-hour regulatory exceedance determination is not supported.',
    '5. Keep measured facts (measuredFacts), AI interpretations (aiInterpretations), and recommendations (recommendations / practicalActions) strictly separate. Never present analytical hypotheses as measured facts.',
    '6. Include specific, practical precautionary advisories in vulnerableGroupAdvisories for (a) children, (b) older adults, and (c) people sensitive to poor air quality (asthma, COPD, heart disease, outdoor workers), each linked to exact observed concentrations/stations in the payload.',
    '7. If overallReliability is "insufficient" or "caution", or if any trend direction is "insufficient_data", highlight those caveats prominently in dataCaveats/caveats.',
    langInstruction,
    levelInstruction,
  ].join('\n');

  const response = await withTransientRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Analyze this validated air-quality monitoring summary and produce tailored briefings for Ward Officers, Housing Societies, Schools, and Vulnerable Groups (children, older adults, sensitive individuals).\n\nVALIDATED EVIDENCE PAYLOAD:\n${JSON.stringify(evidence, null, 2)}`,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        responseMimeType: 'application/json',
        responseSchema: {
        type: Type.OBJECT,
        required: [
          'groundingAudit',
          'wardOfficerBriefing',
          'housingSocietyAdvisory',
          'schoolAdvisory',
          'vulnerableGroupAdvisories',
        ],
        properties: {
          groundingAudit: {
            type: Type.OBJECT,
            required: ['datasetPeriod', 'totalValidReadings', 'reliabilityStatus', 'verifiedMetricsCited'],
            properties: {
              datasetPeriod: { type: Type.STRING },
              totalValidReadings: { type: Type.INTEGER },
              reliabilityStatus: { type: Type.STRING },
              verifiedMetricsCited: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
          wardOfficerBriefing: {
            type: Type.OBJECT,
            required: [
              'title',
              'executiveSummary',
              'measuredFacts',
              'aiInterpretations',
              'hotspotPriorities',
              'recommendations',
              'dataCaveats',
            ],
            properties: {
              title: { type: Type.STRING },
              executiveSummary: { type: Type.STRING },
              measuredFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
              aiInterpretations: { type: Type.ARRAY, items: { type: Type.STRING } },
              hotspotPriorities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ['location', 'priorityLevel', 'action', 'evidence'],
                  properties: {
                    location: { type: Type.STRING },
                    priorityLevel: { type: Type.STRING },
                    action: { type: Type.STRING },
                    evidence: { type: Type.STRING },
                  },
                },
              },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ['action', 'rationale', 'linkedMetric'],
                  properties: {
                    action: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    linkedMetric: { type: Type.STRING },
                  },
                },
              },
              dataCaveats: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          housingSocietyAdvisory: {
            type: Type.OBJECT,
            required: [
              'title',
              'summary',
              'measuredFacts',
              'practicalActions',
              'residentNoticeDraft',
              'caveats',
            ],
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              measuredFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
              practicalActions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ['action', 'timingOrCondition', 'whyItHelps'],
                  properties: {
                    action: { type: Type.STRING },
                    timingOrCondition: { type: Type.STRING },
                    whyItHelps: { type: Type.STRING },
                  },
                },
              },
              residentNoticeDraft: { type: Type.STRING },
              caveats: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          schoolAdvisory: {
            type: Type.OBJECT,
            required: [
              'title',
              'summary',
              'measuredFacts',
              'outdoorActivityGuidance',
              'classroomPrecautions',
              'sensitiveGroupNotes',
              'parentMessageDraft',
              'caveats',
            ],
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              measuredFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
              outdoorActivityGuidance: { type: Type.STRING },
              classroomPrecautions: { type: Type.ARRAY, items: { type: Type.STRING } },
              sensitiveGroupNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
              parentMessageDraft: { type: Type.STRING },
              caveats: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          vulnerableGroupAdvisories: {
            type: Type.OBJECT,
            required: ['children', 'olderAdults', 'sensitiveIndividuals'],
            properties: {
              children: vulnerableGroupItemSchema,
              olderAdults: vulnerableGroupItemSchema,
              sensitiveIndividuals: vulnerableGroupItemSchema,
            },
          },
        },
      },
    },
  }));

  const parsed = parseStructuredAiJson<{
    groundingAudit?: { verifiedMetricsCited?: string[] };
    wardOfficerBriefing: GeneratedBriefingPack['wardOfficerBriefing'];
    housingSocietyAdvisory: GeneratedBriefingPack['housingSocietyAdvisory'];
    schoolAdvisory: GeneratedBriefingPack['schoolAdvisory'];
    vulnerableGroupAdvisories: GeneratedBriefingPack['vulnerableGroupAdvisories'];
  }>(response.text, 'briefings');

  return {
    language,
    readingLevel,
    generatedAtIso: new Date().toISOString(),
    modelUsed: MODEL_NAME,
    groundingAudit: {
      datasetPeriod: sanitizePromptText(analysis.periodLabel, 160),
      totalValidReadings: analysis.qualityReport.validRows,
      reliabilityStatus: analysis.overallReliability,
      verifiedMetricsCited: parsed.groundingAudit?.verifiedMetricsCited ?? [],
    },
    wardOfficerBriefing: parsed.wardOfficerBriefing,
    housingSocietyAdvisory: parsed.housingSocietyAdvisory,
    schoolAdvisory: parsed.schoolAdvisory,
    vulnerableGroupAdvisories: parsed.vulnerableGroupAdvisories,
  };
}

export async function generateComparisonBriefingWithGemini(
  comparison: PeriodComparisonResult,
  language: BriefingLanguage
): Promise<ComparativeBriefingResponse> {
  const ai = getGeminiClient();

  const langInstruction = getLanguageInstruction(language);

  const systemInstruction = [
    'You are analyzing a verified comparison between two air-quality reporting periods.',
    'STRICT NON-FABRICATION & AVERAGING RULES:',
    '1. NEVER claim improvement or worsening for any pollutant where comparable is false.',
    '2. Cite exact observed means, percentage changes, and shared station counts directly from the payload.',
    '3. Do NOT claim 24-hour regulatory standard exceedances from observed sample means unless verified 24h windows were computed.',
    '4. List all non-comparable items and their reasons clearly under uncomparableWarnings.',
    langInstruction,
  ].join('\n');

  const response = await withTransientRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Summarize this period-over-period air quality comparison:\n${JSON.stringify(comparison, null, 2)}`,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: [
            'headline',
            'verifiedChanges',
            'aiInterpretation',
            'uncomparableWarnings',
            'recommendedNextSteps',
          ],
          properties: {
            headline: { type: Type.STRING },
            verifiedChanges: { type: Type.ARRAY, items: { type: Type.STRING } },
            aiInterpretation: { type: Type.ARRAY, items: { type: Type.STRING } },
            uncomparableWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendedNextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    })
  );

  const parsed = parseStructuredAiJson<{
    headline: string;
    verifiedChanges?: string[];
    aiInterpretation?: string[];
    uncomparableWarnings?: string[];
    recommendedNextSteps?: string[];
  }>(response.text, 'period comparison');

  return {
    generatedAtIso: new Date().toISOString(),
    modelUsed: MODEL_NAME,
    language,
    headline: parsed.headline,
    verifiedChanges: parsed.verifiedChanges ?? [],
    aiInterpretation: parsed.aiInterpretation ?? [],
    uncomparableWarnings: parsed.uncomparableWarnings ?? [],
    recommendedNextSteps: parsed.recommendedNextSteps ?? [],
  };
}
