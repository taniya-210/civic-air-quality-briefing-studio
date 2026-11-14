import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookmarkPlus,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { comparePeriods } from '../lib/airQualityEngine';
import { readApiJson } from '../lib/apiClient';
import type {
  AnalysisResult,
  BriefingLanguage,
  ComparativeBriefingResponse,
  SavedPeriodRecord,
} from '../types/airQuality';

interface ComparisonViewProps {
  activeAnalysis: AnalysisResult | null;
  savedPeriods: SavedPeriodRecord[];
  isSaving: boolean;
  periodsError: string | null;
  onSaveActivePeriod: (label: string) => Promise<SavedPeriodRecord | null>;
  onDeletePeriod: (id: string) => Promise<void>;
}

const ACTIVE_PERIOD_OPTION_ID = '__ACTIVE_CURRENT_DATASET__';

export function ComparisonView({
  activeAnalysis,
  savedPeriods,
  isSaving,
  periodsError,
  onSaveActivePeriod,
  onDeletePeriod,
}: ComparisonViewProps) {
  const [periodLabelInput, setPeriodLabelInput] = useState(
    activeAnalysis?.periodLabel || 'Current Reporting Period'
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [periodAId, setPeriodAId] = useState<string>('');
  const [periodBId, setPeriodBId] = useState<string>('');

  const [language, setLanguage] = useState<BriefingLanguage>('en');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiComparisonCache, setAiComparisonCache] = useState<
    Record<string, ComparativeBriefingResponse>
  >({});
  const inFlightCompareRef = useRef<string | null>(null);

  // Sync label input and reset stale active comparison state whenever a new dataset is analyzed
  useEffect(() => {
    if (activeAnalysis) {
      setPeriodLabelInput(activeAnalysis.periodLabel);
      setSaveMessage(null);
      setSaveError(null);
      setAiError(null);
    }
  }, [activeAnalysis?.id, activeAnalysis?.periodLabel]);

  // Build selectable list including Active Unsaved Dataset + Saved Periods
  const selectablePeriods: SavedPeriodRecord[] = useMemo(() => {
    const activeAsRecord: SavedPeriodRecord[] =
      activeAnalysis &&
      activeAnalysis.qualityReport.validRows > 0 &&
      !savedPeriods.some((p) => p.id === activeAnalysis.id)
        ? [
            {
              id: ACTIVE_PERIOD_OPTION_ID,
              periodLabel: `${activeAnalysis.periodLabel} (Active Unsaved)`,
              datasetName: activeAnalysis.datasetName,
              savedAtIso: activeAnalysis.analyzedAtIso,
              analysis: activeAnalysis,
            },
          ]
        : [];
    return [...activeAsRecord, ...savedPeriods];
  }, [activeAnalysis, savedPeriods]);

  const resolvedBId =
    selectablePeriods.find((p) => p.id === periodBId)?.id ?? selectablePeriods[0]?.id ?? '';
  const resolvedAId =
    selectablePeriods.find((p) => p.id === periodAId && p.id !== resolvedBId)?.id ??
    selectablePeriods.find((p) => p.id !== resolvedBId)?.id ??
    '';

  const periodA = selectablePeriods.find((p) => p.id === resolvedAId) ?? null;
  const periodB = selectablePeriods.find((p) => p.id === resolvedBId) ?? null;

  const comparison = useMemo(() => {
    if (!periodA || !periodB || periodA.id === periodB.id) return null;
    return comparePeriods(periodA, periodB);
  }, [periodA, periodB]);

  const compareCacheKey =
    periodA && periodB
      ? `${periodA.analysis.id}|${periodB.analysis.id}|${language}`
      : '';
  const aiComparison = compareCacheKey ? aiComparisonCache[compareCacheKey] ?? null : null;

  const handleSave = async () => {
    if (!activeAnalysis) return;
    setSaveError(null);
    setSaveMessage(null);
    try {
      const saved = await onSaveActivePeriod(
        periodLabelInput.trim() || activeAnalysis.periodLabel
      );
      if (saved) {
        setSaveMessage(`Saved "${saved.periodLabel}" to historical archive.`);
        setPeriodBId(saved.id);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save reporting period.');
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteError(null);
    try {
      await onDeletePeriod(id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete saved period.');
    }
  };

  const handleGenerateComparativeAi = async (forceRefresh = false) => {
    if (!comparison || !compareCacheKey) return;
    if (!forceRefresh && aiComparisonCache[compareCacheKey]) return;
    if (inFlightCompareRef.current === compareCacheKey) return;

    inFlightCompareRef.current = compareCacheKey;
    setIsGeneratingAi(true);
    setAiError(null);
    try {
      const res = await fetch('/api/briefings/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comparison, language }),
      });
      const data = await readApiJson<{ comparisonBriefing: ComparativeBriefingResponse }>(
        res,
        'Failed to generate comparative summary.'
      );
      setAiComparisonCache((prev) => ({
        ...prev,
        [compareCacheKey]: data.comparisonBriefing,
      }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach Gemini service.');
    } finally {
      inFlightCompareRef.current = null;
      setIsGeneratingAi(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Save Active Analysis Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            Save Reporting Period to Archive
          </h2>
          <p className="text-xs text-slate-500">
            Persist validated datasets and calculated averages on the backend to compare across
            weeks or episodes. You can also compare your active dataset directly against any
            saved baseline below.
          </p>
        </div>

        {activeAnalysis ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label htmlFor="period-label-input" className="block text-xs font-medium text-slate-700 mb-1">
                Period Label
              </label>
              <input
                id="period-label-input"
                type="text"
                value={periodLabelInput}
                onChange={(e) => setPeriodLabelInput(e.target.value)}
                placeholder={activeAnalysis.periodLabel}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || activeAnalysis.qualityReport.validRows === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <BookmarkPlus className="w-4 h-4" aria-hidden="true" />
              {isSaving ? 'Saving...' : 'Save Current Analysis'}
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-500">
            Load and analyze a dataset first to save it as a reporting period.
          </div>
        )}

        {saveMessage && (
          <div role="status" aria-live="polite" className="text-xs text-emerald-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            <span>{saveMessage}</span>
          </div>
        )}
        {saveError && (
          <div role="alert" className="text-xs text-red-700">
            {saveError}
          </div>
        )}
      </div>

      {/* Saved Periods List */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h3 className="font-display text-base font-semibold text-slate-900">
          Saved Reporting Periods ({savedPeriods.length})
        </h3>
        {periodsError && (
          <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {periodsError}
          </div>
        )}
        {deleteError && (
          <div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {deleteError}
          </div>
        )}
        {savedPeriods.length === 0 ? (
          <p className="text-xs text-slate-500">
            No periods saved yet. Save your active analysis above, then load a second dataset (e.g.
            the October Baseline CSV in Upload Data) to compare two reporting periods.
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="px-3 py-2 font-medium">Period Label</th>
                  <th className="px-3 py-2 font-mono font-medium">Source File</th>
                  <th className="px-3 py-2 font-mono font-medium text-right">Valid Rows</th>
                  <th className="px-3 py-2 font-medium">Stations</th>
                  <th className="px-3 py-2 font-medium">Reliability</th>
                  <th className="px-3 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {savedPeriods.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/70 align-top">
                    <td className="px-3 py-1.5 font-semibold text-slate-900 align-top">{rec.periodLabel}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-600 align-top">{rec.datasetName}</td>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-right text-slate-800 align-top">
                      {rec.analysis.qualityReport.validRows}
                    </td>
                    <td className="px-3 py-1.5 text-slate-600 align-top">
                      {rec.analysis.qualityReport.stations.length} stations
                    </td>
                    <td className="px-3 py-1.5 capitalize text-slate-700 align-top">
                      {rec.analysis.overallReliability}
                    </td>
                    <td className="px-3 py-1.5 text-right align-top">
                      <button
                        type="button"
                        onClick={() => handleDelete(rec.id)}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-700"
                        title="Delete saved period"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Period Selector & Strict Comparison */}
      {selectablePeriods.length >= 2 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div>
              <label htmlFor="baseline-period-select" className="block text-xs font-medium text-slate-700 mb-1">
                Baseline Period (Period A)
              </label>
              <select
                id="baseline-period-select"
                value={resolvedAId}
                onChange={(e) => {
                  setPeriodAId(e.target.value);
                  setAiError(null);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {selectablePeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.periodLabel} ({p.analysis.qualityReport.validRows} rows)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="comparison-period-select" className="block text-xs font-medium text-slate-700 mb-1">
                Comparison Period (Period B)
              </label>
              <select
                id="comparison-period-select"
                value={resolvedBId}
                onChange={(e) => {
                  setPeriodBId(e.target.value);
                  setAiError(null);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-teal-700"
              >
                {selectablePeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.periodLabel} ({p.analysis.qualityReport.validRows} rows)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {periodA && periodB && periodA.id === periodB.id && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              Select two different reporting periods to compare changes.
            </div>
          )}

          {comparison && (
            <div className="space-y-5 pt-2 border-t border-slate-200">
              <div className="space-y-1">
                <div className="text-xs text-slate-500">
                  Comparability Audit · {comparison.comparableCount} comparable ·{' '}
                  {comparison.nonComparableCount} non-comparable
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {comparison.overallVerdict}
                </div>
              </div>

              {comparison.cautionNotes.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-950 space-y-1">
                  {comparison.cautionNotes.map((note, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" />
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pollutant Comparison Cards */}
              <div className="space-y-4">
                {comparison.pollutantComparisons.map((item) => (
                  <div
                    key={item.pollutant}
                    className="border border-slate-200 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-display text-sm font-bold text-slate-900">
                          {item.pollutant}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {item.comparable
                            ? `Shared stations: ${item.overlappingStations.length} · Unit: ${item.unitA}`
                            : 'Not Comparable'}
                        </span>
                      </div>

                      {item.comparable && item.deltaAbs !== null && (
                        <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums font-semibold">
                          {item.direction === 'improved' && (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <ArrowDownRight className="w-4 h-4" />
                              {item.deltaAbs} {item.unitA} ({item.deltaPct}%) — Lower
                            </span>
                          )}
                          {item.direction === 'worsened' && (
                            <span className="inline-flex items-center gap-1 text-red-700">
                              <ArrowUpRight className="w-4 h-4" />
                              +{item.deltaAbs} {item.unitA} (+{item.deltaPct}%) — Higher
                            </span>
                          )}
                          {item.direction === 'unchanged' && (
                            <span className="text-slate-700">
                              {item.deltaAbs > 0 ? '+' : ''}
                              {item.deltaAbs} {item.unitA} ({item.deltaPct}%) — Minimal change
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {!item.comparable ? (
                      <div className="text-xs text-amber-900 bg-amber-50/70 border border-amber-200 rounded-lg px-3 py-2">
                        Comparison blocked: {item.nonComparableReason}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start text-xs">
                          <div className="bg-slate-50 rounded-lg p-3">
                            <div className="text-slate-500 truncate">{comparison.periodALabel}</div>
                            <div className="font-mono tabular-nums text-base font-bold text-slate-900 mt-0.5">
                              {item.meanA} {item.unitA}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              Peak {item.maxA} · n={item.countA}
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3">
                            <div className="text-slate-500 truncate">{comparison.periodBLabel}</div>
                            <div className="font-mono tabular-nums text-base font-bold text-slate-900 mt-0.5">
                              {item.meanB} {item.unitB}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              Peak {item.maxB} · n={item.countB}
                            </div>
                          </div>
                        </div>

                        {item.stationComparisons.length > 0 && (
                          <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                  <th className="px-3 py-2 font-medium align-top">Shared Station</th>
                                  <th className="px-3 py-2 font-mono font-medium text-right align-top">
                                    Period A Mean
                                  </th>
                                  <th className="px-3 py-2 font-mono font-medium text-right align-top">
                                    Period B Mean
                                  </th>
                                  <th className="px-3 py-2 font-mono font-medium text-right align-top">
                                    Delta
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {item.stationComparisons.map((st) => (
                                  <tr key={st.location} className="align-top">
                                    <td className="px-3 py-1.5 font-medium text-slate-900 align-top">
                                      {st.location}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono tabular-nums text-right text-slate-700 align-top">
                                      {st.meanA} (n={st.countA})
                                    </td>
                                    <td className="px-3 py-1.5 font-mono tabular-nums text-right text-slate-700 align-top">
                                      {st.meanB} (n={st.countB})
                                    </td>
                                    <td className="px-3 py-1.5 font-mono tabular-nums text-right align-top">
                                      {st.comparable && st.deltaAbs !== null ? (
                                        <span
                                          className={
                                            st.deltaAbs < 0
                                              ? 'text-emerald-700 font-semibold'
                                              : st.deltaAbs > 0
                                              ? 'text-red-700 font-semibold'
                                              : 'text-slate-600'
                                          }
                                        >
                                          {st.deltaAbs > 0 ? '+' : ''}
                                          {st.deltaAbs} (
                                          {st.deltaPct !== null && st.deltaPct > 0 ? '+' : ''}
                                          {st.deltaPct}%)
                                        </span>
                                      ) : (
                                        <span className="text-amber-800">{st.reason}</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Optional Gemini Comparative Summary */}
              <div className="pt-4 border-t border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-display text-sm font-semibold text-slate-900">
                      AI Comparative Synthesis (Verified Deltas Only)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Generates a factual period-over-period briefing without extrapolating
                      non-comparable metrics.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div role="group" aria-label="Comparison briefing language" className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {(['en', 'hi', 'mr'] as BriefingLanguage[]).map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          aria-pressed={language === lang}
                          onClick={() => setLanguage(lang)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md focus-visible:outline-2 focus-visible:outline-teal-700 ${
                            language === lang
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600'
                          }`}
                        >
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={isGeneratingAi}
                      onClick={() => handleGenerateComparativeAi(Boolean(aiComparison))}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                    >
                      {isGeneratingAi ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {isGeneratingAi
                        ? 'Synthesizing...'
                        : aiComparison
                        ? 'Regenerate Brief'
                        : 'Generate Comparison Brief'}
                    </button>
                  </div>
                </div>

                {isGeneratingAi && (
                  <div
                    role="status"
                    aria-busy="true"
                    className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3"
                  >
                    <span className="sr-only">Synthesizing period comparison briefing...</span>
                    <div className="h-4 w-1/2 bg-slate-200 rounded animate-pulse" />
                    <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                  </div>
                )}

                {aiError && (
                  <div
                    role="alert"
                    className="flex items-start justify-between gap-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3"
                  >
                    <span>{aiError}</span>
                    <button
                      type="button"
                      onClick={() => handleGenerateComparativeAi(true)}
                      disabled={isGeneratingAi}
                      className="px-2.5 py-1 text-xs font-medium text-red-900 bg-white border border-red-300 rounded-md hover:bg-red-100 whitespace-nowrap shrink-0"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {aiComparison && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="font-display text-base font-bold text-slate-900">
                      {aiComparison.headline}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start text-xs">
                      <div className="space-y-1.5">
                        <div className="font-semibold text-emerald-800">Verified Changes</div>
                        <ul className="space-y-1 text-slate-700">
                          {aiComparison.verifiedChanges.map((v, i) => (
                            <li key={i}>• {v}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-1.5">
                        <div className="font-semibold text-teal-900">AI Interpretation</div>
                        <ul className="space-y-1 text-slate-700">
                          {aiComparison.aiInterpretation.map((v, i) => (
                            <li key={i}>• {v}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    {aiComparison.recommendedNextSteps.length > 0 && (
                      <div className="text-xs text-slate-800 space-y-1 pt-2 border-t border-slate-200">
                        <div className="font-semibold text-slate-900">Recommended Next Steps</div>
                        <ul className="space-y-1 text-slate-700">
                          {aiComparison.recommendedNextSteps.map((step, i) => (
                            <li key={i}>• {step}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiComparison.uncomparableWarnings.length > 0 && (
                      <div className="text-xs text-amber-900 space-y-1 pt-2 border-t border-slate-200">
                        <div className="font-semibold">Non-Comparable Warnings</div>
                        {aiComparison.uncomparableWarnings.map((w, i) => (
                          <div key={i}>• {w}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
