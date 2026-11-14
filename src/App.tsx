import { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, Upload } from 'lucide-react';
import { AnalysisView } from './components/AnalysisView';
import { BriefingsView } from './components/BriefingsView';
import { CitizenAdvisoryView } from './components/CitizenAdvisoryView';
import { ComparisonView } from './components/ComparisonView';
import { DataQualityView } from './components/DataQualityView';
import { OverviewView } from './components/OverviewView';
import { Sidebar } from './components/Sidebar';
import { UploadDataView } from './components/UploadDataView';
import { validateAndAnalyzeTable } from './lib/airQualityEngine';
import { ApiRequestError, readApiJson } from './lib/apiClient';
import { inferColumnMapping, parseTabularText } from './lib/csvParser';
import {
  buildDemoFallbackBriefingPack,
  sanitizeDebugError,
} from './lib/demoBriefingFallback';
import { SAMPLE_DATASETS } from './lib/sampleDatasets';
import type {
  AnalysisResult,
  BriefingLanguage,
  ColumnMapping,
  DashboardView,
  FallbackDebugError,
  GeneratedBriefingPack,
  RawParsedTable,
  ReadingLevel,
  SavedPeriodRecord,
} from './types/airQuality';

const VIEW_TITLES: Record<DashboardView, string> = {
  overview: 'Overview',
  upload: 'Upload Data',
  quality: 'Data Quality Report',
  analysis: 'Statistical Analysis',
  briefings: 'Ward Officer AI Briefings',
  advisory: 'Citizen & School Advisory',
  comparison: 'Historical Comparison',
};

export default function App() {
  const [activeView, setActiveView] = useState<DashboardView>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [savedPeriods, setSavedPeriods] = useState<SavedPeriodRecord[]>([]);
  const [isSavingPeriod, setIsSavingPeriod] = useState(false);
  const [periodsError, setPeriodsError] = useState<string | null>(null);

  // Briefings keyed by `${analysis.id}|${lang}|${level}` so language/level switches never mix stale outputs
  const [briefingCache, setBriefingCache] = useState<Record<string, GeneratedBriefingPack>>({});
  const [fallbackErrorByAnalysis, setFallbackErrorByAnalysis] = useState<
    Record<string, FallbackDebugError>
  >({});
  const [language, setLanguage] = useState<BriefingLanguage>('en');
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>('detailed');
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);

  const loadSavedPeriods = useCallback(async () => {
    try {
      const res = await fetch('/api/periods');
      const data = await readApiJson<{ periods?: SavedPeriodRecord[] }>(
        res,
        'Failed to load saved reporting periods.'
      );
      setPeriodsError(null);
      if (Array.isArray(data.periods)) {
        setSavedPeriods(data.periods);
      }
    } catch (err) {
      setPeriodsError(
        err instanceof Error ? err.message : 'Could not reach backend period archive.'
      );
    }
  }, []);

  useEffect(() => {
    void loadSavedPeriods();
  }, [loadSavedPeriods]);

  const handleAnalyzeTable = (
    table: RawParsedTable,
    mapping: ColumnMapping,
    options: { periodLabel: string; datasetName: string }
  ) => {
    const result = validateAndAnalyzeTable(table, mapping, options);
    setAnalysis(result);
    setBriefingError(null);
    setActiveView('quality');
  };

  const handleLoadDefaultSample = () => {
    const sample = SAMPLE_DATASETS[0];
    const table = parseTabularText(sample.csv);
    const mapping = inferColumnMapping(table.headers);
    const result = validateAndAnalyzeTable(table, mapping, {
      periodLabel: sample.periodLabel,
      datasetName: sample.filename,
    });
    setAnalysis(result);
    setBriefingError(null);
    setActiveView('overview');
  };

  const activeBriefingKey = analysis
    ? `${analysis.id}|${language}|${readingLevel}`
    : '';
  const activeBriefing = activeBriefingKey ? briefingCache[activeBriefingKey] ?? null : null;

  const ensureLocalFallbackIfActive = useCallback(
    (targetLang: BriefingLanguage, targetLevel: ReadingLevel) => {
      if (!analysis || analysis.qualityReport.validRows <= 0) return;
      const activeFallbackErr = fallbackErrorByAnalysis[analysis.id];
      if (!activeFallbackErr) return;

      const nextKey = `${analysis.id}|${targetLang}|${targetLevel}`;
      setBriefingCache((prev) => {
        const existing = prev[nextKey];
        if (existing && existing.source === 'gemini') {
          return prev;
        }
        return {
          ...prev,
          [nextKey]: buildDemoFallbackBriefingPack(
            analysis,
            targetLang,
            targetLevel,
            activeFallbackErr
          ),
        };
      });
    },
    [analysis, fallbackErrorByAnalysis]
  );

  const handleChangeLanguage = (nextLang: BriefingLanguage) => {
    setLanguage(nextLang);
    ensureLocalFallbackIfActive(nextLang, readingLevel);
  };

  const handleChangeReadingLevel = (nextLevel: ReadingLevel) => {
    setReadingLevel(nextLevel);
    ensureLocalFallbackIfActive(language, nextLevel);
  };

  const handleGenerateBriefing = async (
    targetLang: BriefingLanguage,
    targetLevel: ReadingLevel,
    forceRefresh = true
  ) => {
    if (!analysis) return;
    if (analysis.qualityReport.validRows <= 0) {
      setBriefingError('Cannot generate briefings because the dataset contains 0 valid readings.');
      return;
    }

    const key = `${analysis.id}|${targetLang}|${targetLevel}`;
    if (!forceRefresh && briefingCache[key]) return;
    if (inFlightKeyRef.current === key) return;

    inFlightKeyRef.current = key;
    setIsGeneratingBriefing(true);
    setBriefingError(null);
    try {
      const res = await fetch('/api/briefings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis,
          language: targetLang,
          readingLevel: targetLevel,
        }),
      });
      const data = await readApiJson<{
        briefingPack: GeneratedBriefingPack;
        liveAiError?: FallbackDebugError;
      }>(res, 'Failed to generate AI briefing.');

      const pack = data.briefingPack;
      if (pack.source === 'gemini') {
        setFallbackErrorByAnalysis((prev) => {
          const next = { ...prev };
          delete next[analysis.id];
          return next;
        });
        setBriefingCache((prev) => {
          const cleaned: Record<string, GeneratedBriefingPack> = {};
          for (const [cacheKey, cachedPack] of Object.entries(prev)) {
            if (!cacheKey.startsWith(`${analysis.id}|`) || cachedPack.source === 'gemini') {
              cleaned[cacheKey] = cachedPack;
            }
          }
          cleaned[key] = pack;
          return cleaned;
        });
      } else {
        const debugErr = sanitizeDebugError(pack.fallbackDebugError ?? data.liveAiError);
        setFallbackErrorByAnalysis((prev) => ({
          ...prev,
          [analysis.id]: debugErr,
        }));
        setBriefingCache((prev) => ({
          ...prev,
          [key]: pack,
        }));
      }
    } catch (err) {
      // Never convert validation errors (400 / zero valid rows) into fallback briefings
      if (
        err instanceof ApiRequestError &&
        (err.statusCode === 400 ||
          err.code === 'INVALID_ANALYSIS_PAYLOAD' ||
          err.code === 'ZERO_VALID_READINGS' ||
          err.code === 'INVALID_JSON')
      ) {
        setBriefingError(err.message);
        return;
      }

      const debugErr = sanitizeDebugError({
        code: err instanceof ApiRequestError ? err.code : 'NETWORK_OR_PROVIDER_ERROR',
        statusCode: err instanceof ApiRequestError ? err.statusCode : undefined,
        message: err instanceof Error ? err.message : 'Unable to reach Gemini briefing service.',
      });
      const fallbackPack = buildDemoFallbackBriefingPack(
        analysis,
        targetLang,
        targetLevel,
        debugErr
      );
      setFallbackErrorByAnalysis((prev) => ({
        ...prev,
        [analysis.id]: debugErr,
      }));
      setBriefingCache((prev) => ({
        ...prev,
        [key]: fallbackPack,
      }));
    } finally {
      if (inFlightKeyRef.current === key) {
        inFlightKeyRef.current = null;
      }
      setIsGeneratingBriefing(false);
    }
  };

  const handleSaveActivePeriod = async (label: string): Promise<SavedPeriodRecord | null> => {
    if (!analysis) return null;
    setIsSavingPeriod(true);
    try {
      const record: SavedPeriodRecord = {
        id: analysis.id,
        periodLabel: label,
        datasetName: analysis.datasetName,
        savedAtIso: new Date().toISOString(),
        analysis: { ...analysis, periodLabel: label },
      };
      const res = await fetch('/api/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      const data = await readApiJson<{ periods?: SavedPeriodRecord[] }>(
        res,
        'Failed to save reporting period.'
      );
      if (Array.isArray(data.periods)) {
        setSavedPeriods(data.periods);
      }
      return record;
    } finally {
      setIsSavingPeriod(false);
    }
  };

  const handleDeletePeriod = async (id: string) => {
    const res = await fetch(`/api/periods/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await readApiJson<{ periods?: SavedPeriodRecord[] }>(
      res,
      'Failed to delete saved period.'
    );
    setPeriodsError(null);
    if (Array.isArray(data.periods)) {
      setSavedPeriods(data.periods);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-slate-900 focus:text-white focus:text-xs focus:font-medium focus:rounded-lg focus:outline-2 focus:outline-teal-600"
      >
        Skip to main content
      </a>
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        analysis={analysis}
        savedCount={savedPeriods.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb + Contextual Meta + 1 Primary Action */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1.5 text-slate-600 hover:text-slate-900 rounded-md"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-500 whitespace-nowrap shrink-0">
                Civic Air Quality Briefing Studio
              </span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {VIEW_TITLES[activeView]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {analysis && (
              <div className="hidden md:block text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                {analysis.periodLabel} · {analysis.qualityReport.validRows} valid rows
              </div>
            )}
            <button
              type="button"
              onClick={() => setActiveView('upload')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              {analysis ? 'New Dataset' : 'Upload CSV'}
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 w-full max-w-[1260px] mx-auto px-4 sm:px-6 py-4 focus:outline-none">
          {activeView === 'overview' && (
            <OverviewView
              analysis={analysis}
              activeBriefing={activeBriefing}
              onNavigate={setActiveView}
              onLoadDefaultSample={handleLoadDefaultSample}
            />
          )}

          {activeView === 'upload' && (
            <UploadDataView onAnalyze={handleAnalyzeTable} />
          )}

          {activeView === 'quality' && (
            <DataQualityView analysis={analysis} onNavigate={setActiveView} />
          )}

          {activeView === 'analysis' && (
            <AnalysisView analysis={analysis} onNavigate={setActiveView} />
          )}

          {activeView === 'briefings' && (
            <BriefingsView
              analysis={analysis}
              briefingPack={activeBriefing}
              language={language}
              readingLevel={readingLevel}
              isGenerating={isGeneratingBriefing}
              error={briefingError}
              onChangeLanguage={handleChangeLanguage}
              onChangeReadingLevel={handleChangeReadingLevel}
              onGenerate={handleGenerateBriefing}
              onNavigate={setActiveView}
            />
          )}

          {activeView === 'advisory' && (
            <CitizenAdvisoryView
              analysis={analysis}
              briefingPack={activeBriefing}
              language={language}
              readingLevel={readingLevel}
              isGenerating={isGeneratingBriefing}
              error={briefingError}
              onChangeLanguage={handleChangeLanguage}
              onChangeReadingLevel={handleChangeReadingLevel}
              onGenerate={handleGenerateBriefing}
              onNavigate={setActiveView}
            />
          )}

          {activeView === 'comparison' && (
            <ComparisonView
              activeAnalysis={analysis}
              savedPeriods={savedPeriods}
              isSaving={isSavingPeriod}
              periodsError={periodsError}
              onSaveActivePeriod={handleSaveActivePeriod}
              onDeletePeriod={handleDeletePeriod}
            />
          )}
        </main>
      </div>
    </div>
  );
}
