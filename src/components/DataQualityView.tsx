import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Search, Upload } from 'lucide-react';
import type { AnalysisResult, DashboardView } from '../types/airQuality';
import { ReliabilityBanner } from './ReliabilityBanner';

interface DataQualityViewProps {
  analysis: AnalysisResult | null;
  onNavigate: (view: DashboardView) => void;
}

const ROWS_PER_PAGE = 100;

export function DataQualityView({ analysis, onNavigate }: DataQualityViewProps) {
  const [tab, setTab] = useState<'flagged' | 'valid'>('flagged');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filteredFlagged = useMemo(() => {
    if (!analysis) return [];
    const q = query.trim().toLowerCase();
    if (!q) return analysis.qualityReport.flaggedRows;
    return analysis.qualityReport.flaggedRows.filter(
      (f) =>
        String(f.rowIndex).includes(q) ||
        JSON.stringify(f.rawRow).toLowerCase().includes(q) ||
        f.issues.some((i) => i.message.toLowerCase().includes(q))
    );
  }, [analysis, query]);

  const filteredValid = useMemo(() => {
    if (!analysis) return [];
    const q = query.trim().toLowerCase();
    if (!q) return analysis.validReadings;
    return analysis.validReadings.filter(
      (r) =>
        String(r.rowIndex).includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.pollutant.toLowerCase().includes(q) ||
        r.timestampRaw.toLowerCase().includes(q)
    );
  }, [analysis, query]);

  useEffect(() => {
    setPage(1);
  }, [tab, query, analysis?.id]);

  if (!analysis) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
        <div className="font-display text-base font-semibold text-slate-900">
          No Data Quality Report Available
        </div>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Upload a CSV file or paste monitoring data to inspect missing values, duplicates, unit
          mismatches, and timestamp validation.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('upload')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          Go to Upload Data
        </button>
      </div>
    );
  }

  const qr = analysis.qualityReport;
  const activeTotal = tab === 'flagged' ? filteredFlagged.length : filteredValid.length;
  const totalPages = Math.max(1, Math.ceil(activeTotal / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * ROWS_PER_PAGE;
  const pageFlagged = filteredFlagged.slice(startIdx, startIdx + ROWS_PER_PAGE);
  const pageValid = filteredValid.slice(startIdx, startIdx + ROWS_PER_PAGE);

  return (
    <div className="space-y-6">
      <ReliabilityBanner status={qr.reliabilityStatus} reasons={qr.reliabilityReasons} />

      {/* Audit Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Raw Rows</div>
          <div className="font-mono tabular-nums text-xl font-bold text-slate-900 mt-1">
            {qr.totalRows}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Valid Readings</div>
          <div className="font-mono tabular-nums text-xl font-bold text-emerald-700 mt-1">
            {qr.validRows}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Flagged / Excluded</div>
          <div className="font-mono tabular-nums text-xl font-bold text-red-700 mt-1">
            {qr.flaggedRowsCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Duplicates</div>
          <div className="font-mono tabular-nums text-xl font-bold text-slate-900 mt-1">
            {qr.duplicateCount + qr.conflictingDuplicateCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Missing / Invalid</div>
          <div className="font-mono tabular-nums text-xl font-bold text-slate-900 mt-1">
            {qr.missingFieldCount + qr.invalidValueCount + qr.invalidTimestampCount + qr.outlierCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Unit Mismatches</div>
          <div className="font-mono tabular-nums text-xl font-bold text-amber-700 mt-1">
            {qr.unitInconsistencyCount}
          </div>
        </div>
      </div>

      {/* Coverage & Unit Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        <div className="space-y-1">
          <div className="font-semibold text-slate-900">Time Window</div>
          <div className="font-mono tabular-nums text-slate-600">
            {qr.timeRangeStart ? new Date(qr.timeRangeStart).toLocaleString() : 'N/A'}
          </div>
          <div className="font-mono tabular-nums text-slate-600">
            to {qr.timeRangeEnd ? new Date(qr.timeRangeEnd).toLocaleString() : 'N/A'} (
            {qr.timeSpanHours ?? 0}h)
          </div>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-slate-900">Stations Detected ({qr.stations.length})</div>
          <div className="text-slate-600 leading-relaxed">
            {qr.stations.length > 0 ? qr.stations.join(' · ') : 'None'}
          </div>
        </div>

        <div className="space-y-1">
          <div className="font-semibold text-slate-900">Pollutants &amp; Units</div>
          <div className="space-y-1 font-mono text-slate-600">
            {Object.entries(qr.unitsByPollutant).map(([pollutant, units]) => (
              <div key={pollutant}>
                <strong className="text-slate-900">{pollutant}:</strong> {units.join(', ')}
                {units.length > 1 && (
                  <span className="text-amber-700 font-sans ml-1">(mixed units flagged)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row-by-row Inspector */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Row audit filter" className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'flagged'}
              onClick={() => setTab('flagged')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 ${
                tab === 'flagged'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Flagged Rows ({qr.flaggedRowsCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'valid'}
              onClick={() => setTab('valid')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 ${
                tab === 'valid'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Validated Readings ({qr.validRows})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <label htmlFor="quality-search-input" className="sr-only">
              Filter by row number, station, or issue
            </label>
            <Search
              className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="quality-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by row #, station, issue..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-teal-700 focus-visible:ring-1 focus-visible:ring-teal-700"
            />
          </div>
        </div>

        {tab === 'flagged' ? (
          filteredFlagged.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 mx-auto" aria-hidden="true" />
              <div className="text-sm font-medium text-slate-900">
                {qr.flaggedRowsCount === 0
                  ? 'Zero flagged rows — all records passed structural validation.'
                  : 'No flagged rows match your filter.'}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th scope="col" className="px-3 py-2.5 font-mono font-medium">Row</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Validation Issue(s)</th>
                    <th scope="col" className="px-3 py-2.5 font-mono font-medium">Raw Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageFlagged.map((row) => (
                    <tr key={row.rowIndex} className="hover:bg-slate-50/70 align-top">
                      <td className="px-3 py-2.5 font-mono tabular-nums text-red-700 font-semibold whitespace-nowrap">
                        #{row.rowIndex}
                      </td>
                      <td className="px-3 py-2.5 space-y-1 text-red-900">
                        {row.issues.map((issue, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                        {Object.entries(row.rawRow)
                          .map(([k, v]) => `${k}=${v || '∅'}`)
                          .join(' | ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : filteredValid.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-600">
            No validated readings match your filter.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[420px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-mono font-medium">Row</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Location</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Pollutant</th>
                  <th scope="col" className="px-3 py-2.5 font-mono font-medium">Timestamp</th>
                  <th scope="col" className="px-3 py-2.5 font-mono font-medium text-right">Value</th>
                  <th scope="col" className="px-3 py-2.5 font-mono font-medium">Unit</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Audit Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageValid.map((r) => (
                  <tr key={r.rowIndex} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-500">
                      #{r.rowIndex}
                    </td>
                    <td className="px-3 py-2 text-slate-900 font-medium">{r.location}</td>
                    <td className="px-3 py-2 font-mono text-slate-800">{r.pollutant}</td>
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {r.timestampRaw}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums text-right font-semibold text-slate-900">
                      {r.value}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600">{r.normalizedUnit}</td>
                    <td className="px-3 py-2 text-[11px]">
                      {r.warnings.length > 0 ? (
                        <span className="text-amber-800">{r.warnings.join(' ')}</span>
                      ) : (
                        <span className="text-emerald-700">Valid reading</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTotal > ROWS_PER_PAGE && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-600">
            <span className="font-mono tabular-nums">
              Showing {startIdx + 1}–{Math.min(startIdx + ROWS_PER_PAGE, activeTotal)} of {activeTotal} rows
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
