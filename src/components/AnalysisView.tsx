import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Minus,
  Search,
  Upload,
} from 'lucide-react';
import type { AnalysisResult, DashboardView } from '../types/airQuality';
import { HotspotBarChart, TimeSeriesChart } from './Charts';

interface AnalysisViewProps {
  analysis: AnalysisResult | null;
  onNavigate: (view: DashboardView) => void;
}

const READINGS_PER_PAGE = 100;

export function AnalysisView({ analysis, onNavigate }: AnalysisViewProps) {
  const [selectedPollutant, setSelectedPollutant] = useState<string>('');
  const [stationFilter, setStationFilter] = useState<string>('ALL');
  const [topDecileOnly, setTopDecileOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);

  const activeSummary = useMemo(() => {
    if (!analysis || analysis.pollutantSummaries.length === 0) return null;
    return (
      analysis.pollutantSummaries.find((p) => p.pollutant === selectedPollutant) ??
      analysis.pollutantSummaries[0]
    );
  }, [analysis, selectedPollutant]);

  const traceableReadings = useMemo(() => {
    if (!analysis || !activeSummary) return [];
    const q = searchText.trim().toLowerCase();
    return analysis.validReadings.filter((r) => {
      if (r.pollutant !== activeSummary.pollutant) return false;
      if (stationFilter !== 'ALL' && r.location !== stationFilter) return false;
      if (topDecileOnly && r.value < activeSummary.p90) return false;
      if (q) {
        return (
          r.location.toLowerCase().includes(q) ||
          String(r.rowIndex).includes(q) ||
          r.timestampRaw.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [analysis, activeSummary, stationFilter, topDecileOnly, searchText]);

  useEffect(() => {
    setPage(1);
  }, [stationFilter, topDecileOnly, searchText, selectedPollutant, analysis?.id]);

  if (!analysis || !activeSummary) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
        <div className="font-display text-base font-semibold text-slate-900">
          No Validated Data to Analyze
        </div>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Upload or paste air-quality monitoring rows first. All observed means, peaks, trends, and
          24-hour averages are calculated directly from verified readings.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('upload')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload Data
        </button>
      </div>
    );
  }

  const trend = activeSummary.trend;
  const hasValidRegulatoryWindows = activeSummary.regulatoryWindowTotalCount > 0;
  const totalPages = Math.max(1, Math.ceil(traceableReadings.length / READINGS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * READINGS_PER_PAGE;
  const pagedReadings = traceableReadings.slice(startIdx, startIdx + READINGS_PER_PAGE);

  return (
    <div className="space-y-6">
      {/* Pollutant Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Analyzed pollutants"
          className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg"
        >
          {analysis.pollutantSummaries.map((summary) => {
            const isActive = summary.pollutant === activeSummary.pollutant;
            return (
              <button
                key={summary.pollutant}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setSelectedPollutant(summary.pollutant);
                  setStationFilter('ALL');
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {summary.pollutant} ({summary.totalCount})
              </button>
            );
          })}
        </div>

        <div className="text-xs text-slate-500 font-mono tabular-nums">
          Primary Unit: <strong className="text-slate-900">{activeSummary.primaryUnit}</strong> ·{' '}
          {activeSummary.spanHours}h span · {activeSummary.preliminaryLabel}
        </div>
      </div>

      {/* Averaging & Regulatory Validity Banner */}
      <div
        className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs ${
          hasValidRegulatoryWindows
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            : 'bg-amber-50/80 border-amber-200 text-amber-950'
        }`}
      >
        {hasValidRegulatoryWindows ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
        ) : (
          <Info className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
        )}
        <div className="space-y-0.5">
          <div className="font-semibold">
            {hasValidRegulatoryWindows
              ? `Verified ${activeSummary.thresholdUsed?.averagingHours}-Hour Standard Evaluation`
              : `${activeSummary.preliminaryLabel} — No Regulatory Exceedance Claimed`}
          </div>
          <div className="leading-relaxed">{activeSummary.averagingNote}</div>
        </div>
      </div>

      {activeSummary.unitWarning && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-950">
          <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <span>{activeSummary.unitWarning}</span>
        </div>
      )}

      {/* Deterministic Statistics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-[11px] text-slate-500">Observed Mean</div>
          <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-1">
            {activeSummary.mean}
          </div>
          <div className="text-[11px] text-slate-500">{activeSummary.primaryUnit}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-[11px] text-slate-500">Median</div>
          <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-1">
            {activeSummary.median}
          </div>
          <div className="text-[11px] text-slate-500">{activeSummary.primaryUnit}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-[11px] text-slate-500">90th Pct</div>
          <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-1">
            {activeSummary.p90}
          </div>
          <div className="text-[11px] text-slate-500">{activeSummary.primaryUnit}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (activeSummary.observedPeak) {
              setStationFilter(activeSummary.observedPeak.location);
              setSearchText(String(activeSummary.observedPeak.rowIndex));
              document.getElementById('source-readings-table')?.scrollIntoView({ behavior: 'smooth' });
            }
          }}
          className="text-left bg-white border border-slate-200 hover:border-amber-600 rounded-xl p-4 transition-colors focus-visible:outline-2 focus-visible:outline-teal-700"
          title="Click to trace observed peak to source row"
        >
          <div className="text-[11px] text-slate-500">Observed Peak (Traceable)</div>
          <div className="font-mono tabular-nums text-lg font-bold text-amber-800 mt-1">
            {activeSummary.max}
          </div>
          <div
            className="text-[11px] text-slate-500 truncate"
            title={
              activeSummary.observedPeak
                ? `${activeSummary.observedPeak.location} at ${activeSummary.observedPeak.timestampRaw} (Row #${activeSummary.observedPeak.rowIndex})`
                : ''
            }
          >
            {activeSummary.observedPeak
              ? `Row #${activeSummary.observedPeak.rowIndex} · ${activeSummary.observedPeak.location}`
              : activeSummary.primaryUnit}
          </div>
        </button>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-[11px] text-slate-500">Min / Std Dev</div>
          <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-1">
            {activeSummary.min} / {activeSummary.stdDev}
          </div>
          <div className="text-[11px] text-slate-500">n={activeSummary.totalCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-[11px] text-slate-500">
            {activeSummary.thresholdUsed
              ? `${activeSummary.thresholdUsed.averagingHours}h Standard`
              : 'Standard Check'}
          </div>
          {hasValidRegulatoryWindows ? (
            <>
              <div
                className={`font-mono tabular-nums text-lg font-bold mt-1 ${
                  (activeSummary.regulatoryWindowExceedanceCount ?? 0) > 0
                    ? 'text-red-700'
                    : 'text-emerald-700'
                }`}
              >
                {activeSummary.regulatoryWindowExceedanceCount}/
                {activeSummary.regulatoryWindowTotalCount}
              </div>
              <div className="text-[11px] text-slate-500">valid windows &gt; std</div>
            </>
          ) : (
            <>
              <div className="text-xs font-semibold text-amber-800 mt-1.5">Preliminary</div>
              <div className="text-[11px] text-slate-500">No 24h avg possible</div>
            </>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 sm:col-span-1">
          <div className="text-[11px] text-slate-500">Measured Trend</div>
          <div className="flex items-center gap-1 mt-1 text-sm font-bold text-slate-900">
            {trend.direction === 'rising' && (
              <>
                <ArrowUpRight className="w-4 h-4 text-red-700 shrink-0" />
                <span className="text-red-700">Rising</span>
              </>
            )}
            {trend.direction === 'falling' && (
              <>
                <ArrowDownRight className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-emerald-700">Falling</span>
              </>
            )}
            {trend.direction === 'stable' && (
              <>
                <Minus className="w-4 h-4 text-slate-600 shrink-0" />
                <span>Stable</span>
              </>
            )}
            {trend.direction === 'insufficient_data' && (
              <span className="text-amber-800 text-xs font-semibold">Insufficient Data</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
            {trend.deltaPct !== null
              ? `${trend.deltaPct > 0 ? '+' : ''}${trend.deltaPct}% half-shift`
              : `${trend.sampleCount} pts`}
          </div>
        </div>
      </div>

      {/* Verified Multi-Hour Regulatory Window Table (only rendered when sufficient hourly density exists) */}
      {activeSummary.validWindowAverages.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Verified {activeSummary.thresholdUsed?.averagingHours}-Hour Window Averages
            </h2>
            <p className="text-xs text-slate-500">
              Evaluated against {activeSummary.thresholdUsed?.referenceLabel} using only windows
              meeting minimum hourly completeness.
            </p>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="px-3 py-2 font-medium">Station</th>
                  <th className="px-3 py-2 font-mono font-medium">Window</th>
                  <th className="px-3 py-2 font-mono font-medium text-right">Readings / Span</th>
                  <th className="px-3 py-2 font-mono font-medium text-right">
                    Calculated {activeSummary.thresholdUsed?.averagingHours}h Avg
                  </th>
                  <th className="px-3 py-2 font-mono font-medium text-right">Standard</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeSummary.validWindowAverages.map((w, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 font-medium text-slate-900">{w.location}</td>
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-700">
                      {w.windowLabel}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-right text-slate-600">
                      {w.readingCount} pts / {w.spanHours}h
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-right font-semibold text-slate-900">
                      {w.calculatedAverage} {w.unit}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-right text-slate-600">
                      {w.standardValue} {w.unit}
                    </td>
                    <td className="px-3 py-2">
                      {w.exceedsStandard ? (
                        <span className="text-red-700 font-semibold">Exceeds {w.averagingHours}h standard</span>
                      ) : (
                        <span className="text-emerald-700 font-medium">Within {w.averagingHours}h standard</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              {activeSummary.pollutant} Observed Time-Series Trajectory
            </h2>
            <p className="text-xs text-slate-500">
              {trend.note} Dashed line marks observed ward mean (not a 24h regulatory threshold).
            </p>
          </div>
          <TimeSeriesChart
            readings={analysis.validReadings}
            pollutant={activeSummary.pollutant}
            unit={activeSummary.primaryUnit}
            observedMean={activeSummary.mean}
            observedPeak={activeSummary.observedPeak}
          />
        </div>

        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Location Comparison (Observed Means &amp; Peaks)
            </h2>
            <p className="text-xs text-slate-500">
              Bar shows station observed mean; pale range shows observed peak (
              {activeSummary.primaryUnit})
            </p>
          </div>
          <HotspotBarChart
            hotspots={activeSummary.hotspots}
            unit={activeSummary.primaryUnit}
            wardMean={activeSummary.mean}
          />
        </div>
      </div>

      {/* Station Breakdown Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            Station-by-Station Statistics ({activeSummary.pollutant})
          </h2>
          <p className="text-xs text-slate-500">
            Click any location row to filter the traceable source readings table below.
          </p>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-3 py-2.5 font-medium">Location</th>
                <th className="px-3 py-2.5 font-mono font-medium text-right">Samples / Span</th>
                <th className="px-3 py-2.5 font-mono font-medium text-right">Observed Mean</th>
                <th className="px-3 py-2.5 font-mono font-medium text-right">Median</th>
                <th className="px-3 py-2.5 font-mono font-medium text-right">Observed Peak</th>
                <th className="px-3 py-2.5 font-medium">Averaging / Standard Check</th>
                <th className="px-3 py-2.5 font-medium">Local Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeSummary.locationStats.map((st) => (
                <tr
                  key={st.location}
                  className={`transition-colors ${
                    stationFilter === st.location ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-3 py-2.5 font-medium text-slate-900">
                    <button
                      type="button"
                      aria-pressed={stationFilter === st.location}
                      onClick={() =>
                        setStationFilter((prev) => (prev === st.location ? 'ALL' : st.location))
                      }
                      className="text-left hover:text-teal-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-teal-700 rounded"
                    >
                      {st.location}
                    </button>
                    {st.isLowSample && (
                      <span className="ml-2 text-[11px] text-amber-700 font-normal">
                        (Low sample)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right text-slate-700">
                    {st.count} pts / {st.spanHours}h
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right font-semibold text-slate-900">
                    {st.mean} {st.unit}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right text-slate-700">
                    {st.median}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right text-amber-900 font-medium">
                    {st.max} {st.unit} (#{st.observedPeak.rowIndex})
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {st.validWindowAverages.length > 0 ? (
                      <span
                        className={
                          (st.regulatoryExceedanceCount ?? 0) > 0
                            ? 'text-red-700 font-medium'
                            : 'text-emerald-700 font-medium'
                        }
                      >
                        {st.regulatoryExceedanceCount}/{st.validWindowAverages.length} valid{' '}
                        {activeSummary.thresholdUsed?.averagingHours}h window(s) &gt; std
                      </span>
                    ) : (
                      <span className="text-amber-800">
                        Preliminary (insufficient for{' '}
                        {activeSummary.thresholdUsed?.averagingHours ?? 24}h avg)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {st.trend.direction === 'insufficient_data'
                      ? 'Insufficient data'
                      : `${st.trend.direction} (${
                          st.trend.deltaPct !== null && st.trend.deltaPct > 0 ? '+' : ''
                        }${st.trend.deltaPct ?? 0}%)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Traceable Source Readings */}
      <div id="source-readings-table" className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Traceable Source Readings ({traceableReadings.length})
            </h2>
            <p className="text-xs text-slate-500">
              Every statistic above is derived directly from these unmodified source rows.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div>
              <label htmlFor="analysis-station-filter" className="sr-only">
                Filter source readings by monitoring station
              </label>
              <select
                id="analysis-station-filter"
                value={stationFilter}
                onChange={(e) => setStationFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:border-teal-700"
              >
                <option value="ALL">All Stations</option>
                {activeSummary.locationStats.map((s) => (
                  <option key={s.location} value={s.location}>
                    {s.location}
                  </option>
                ))}
              </select>
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={topDecileOnly}
                onChange={(e) => setTopDecileOnly(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
              />
              Top decile (&ge; {activeSummary.p90} {activeSummary.primaryUnit})
            </label>

            <div className="relative">
              <label htmlFor="analysis-search-input" className="sr-only">
                Search source readings by row number, station, or timestamp
              </label>
              <Search
                className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="analysis-search-input"
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search row # or time..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 w-44 focus:outline-none focus:border-teal-700"
              />
            </div>

            {(stationFilter !== 'ALL' || topDecileOnly || searchText.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  setStationFilter('ALL');
                  setTopDecileOnly(false);
                  setSearchText('');
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-teal-800 hover:text-teal-950 bg-teal-50 border border-teal-200 rounded-lg whitespace-nowrap focus-visible:outline-2 focus-visible:outline-teal-700"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[340px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-mono font-medium">Row #</th>
                <th scope="col" className="px-3 py-2 font-medium">Location</th>
                <th scope="col" className="px-3 py-2 font-mono font-medium">Timestamp</th>
                <th scope="col" className="px-3 py-2 font-mono font-medium text-right">Measured Value</th>
                <th scope="col" className="px-3 py-2 font-mono font-medium">Unit</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedReadings.map((r) => {
                const isPeak = activeSummary.observedPeak?.rowIndex === r.rowIndex;
                return (
                  <tr key={r.rowIndex} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-500">
                      #{r.rowIndex}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.location}</td>
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-600">
                      {r.timestampRaw}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-right font-semibold text-slate-900">
                      {r.value}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600">{r.normalizedUnit}</td>
                    <td className="px-3 py-2">
                      {r.warnings.length > 0 ? (
                        <span className="text-amber-800">Unit mismatch (excluded)</span>
                      ) : isPeak ? (
                        <span className="text-amber-800 font-semibold">Observed peak</span>
                      ) : (
                        <span className="text-emerald-700">Valid reading</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {traceableReadings.length > READINGS_PER_PAGE && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-600">
            <span className="font-mono tabular-nums">
              Showing {startIdx + 1}–{Math.min(startIdx + READINGS_PER_PAGE, traceableReadings.length)} of{' '}
              {traceableReadings.length} rows
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-teal-700"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Prev
              </button>
              <span className="font-mono tabular-nums px-2">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-teal-700"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
