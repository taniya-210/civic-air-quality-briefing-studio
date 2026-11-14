import { ArrowRight, FileSpreadsheet, ShieldAlert, Upload } from 'lucide-react';
import type { AnalysisResult, DashboardView, GeneratedBriefingPack } from '../types/airQuality';
import { HotspotBarChart, TimeSeriesChart } from './Charts';
import { ReliabilityBanner } from './ReliabilityBanner';

interface OverviewViewProps {
  analysis: AnalysisResult | null;
  activeBriefing: GeneratedBriefingPack | null;
  onNavigate: (view: DashboardView) => void;
  onLoadDefaultSample: () => void;
}

export function OverviewView({
  analysis,
  activeBriefing,
  onNavigate,
  onLoadDefaultSample,
}: OverviewViewProps) {
  if (!analysis) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 lg:p-10">
          <div className="max-w-2xl space-y-4">
            <div className="text-xs font-medium text-teal-800">
              Evidence-Grounded Environmental Briefing Workflow
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              Convert raw monitoring tables into verified civic briefings
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Upload CSV monitoring logs or paste tabular sensor exports. Every row is audited for
              missing values, duplicates, and unit mismatches before JavaScript computes station
              averages, trends, observed peaks, and 24-hour averages (when hourly density allows)—and
              before Gemini drafts briefings for ward officers, housing societies, and schools.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('upload')}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="w-4 h-4" />
                Upload or Paste Data
              </button>
              <button
                type="button"
                onClick={onLoadDefaultSample}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-800 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200/70 transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Load Ward 14 Sample CSV
              </button>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div className="space-y-1">
              <div className="font-semibold text-slate-900">1. Strict Row Validation</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Detects missing cells, negative readings, conflicting duplicates, and unit
                mismatches without silently altering raw records.
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-slate-900">2. Averaging-Aware Analysis</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Evaluates 24h regulatory standards only when sufficient hourly readings exist;
                short or intermittent logs are flagged preliminary with observed peaks only.
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-slate-900">3. Grounded Gemini Briefings</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Generates English or Hindi advisories tailored for ward officers, RWAs, and schools
                while separating measured facts from AI interpretation.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const primaryPollutant =
    analysis.pollutantSummaries.find((p) => p.pollutant === 'PM2.5') ??
    analysis.pollutantSummaries[0];

  const topHotspot = primaryPollutant?.hotspots[0];

  return (
    <div className="space-y-6">
      <ReliabilityBanner
        status={analysis.overallReliability}
        reasons={analysis.reliabilityNotes}
        compact
      />

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">Validated Readings</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {analysis.qualityReport.validRows}
            <span className="text-sm font-normal text-slate-500">
              {' '}
              / {analysis.qualityReport.totalRows}
            </span>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            {analysis.qualityReport.completenessPct}% completeness ·{' '}
            {analysis.qualityReport.flaggedRowsCount} flagged
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">Monitoring Coverage</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {analysis.qualityReport.stations.length} Stations
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            {analysis.qualityReport.pollutants.length} pollutants ·{' '}
            {analysis.qualityReport.timeSpanHours ?? 0}h span
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">
            {primaryPollutant
              ? `${primaryPollutant.pollutant} Observed Mean / Peak`
              : 'Primary Pollutant'}
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {primaryPollutant ? (
              <>
                {primaryPollutant.mean}
                <span className="text-sm font-normal text-slate-500">
                  {' '}
                  / {primaryPollutant.max} {primaryPollutant.primaryUnit}
                </span>
              </>
            ) : (
              'N/A'
            )}
          </div>
          <div className="text-xs text-slate-600">
            {primaryPollutant?.regulatoryWindowTotalCount && primaryPollutant.thresholdUsed ? (
              <span className="font-mono tabular-nums">
                {primaryPollutant.regulatoryWindowExceedanceCount}/
                {primaryPollutant.regulatoryWindowTotalCount} valid{' '}
                {primaryPollutant.thresholdUsed.averagingHours}h windows &gt; standard
              </span>
            ) : (
              <span className="text-amber-800">
                {primaryPollutant?.preliminaryLabel ?? 'Preliminary · Observed peak only'}
              </span>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">Highest Observed Mean Location</div>
          <div className="text-lg font-bold text-slate-900 truncate" title={topHotspot?.location}>
            {topHotspot ? topHotspot.location : 'Insufficient data'}
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            {topHotspot
              ? `${topHotspot.mean} ${topHotspot.unit} mean · peak ${topHotspot.max} (${
                  topHotspot.pctAboveWardMean > 0 ? '+' : ''
                }${topHotspot.pctAboveWardMean}% vs ward)`
              : 'Upload multi-station data'}
          </div>
        </div>
      </div>

      {/* Main Chart + Action Hub */}
      {primaryPollutant && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  {primaryPollutant.pollutant} Observed Readings Timeline
                </h2>
                <p className="text-xs text-slate-500">
                  {primaryPollutant.totalCount} verified readings in {primaryPollutant.primaryUnit}{' '}
                  · {primaryPollutant.preliminaryLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('analysis')}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800 hover:text-teal-950 whitespace-nowrap shrink-0"
              >
                Full Statistical Analysis <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <TimeSeriesChart
              readings={analysis.validReadings}
              pollutant={primaryPollutant.pollutant}
              unit={primaryPollutant.primaryUnit}
              observedMean={primaryPollutant.mean}
              observedPeak={primaryPollutant.observedPeak}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Station Comparison
                </h2>
                <p className="text-xs text-slate-500">
                  Ranked by observed station mean ({primaryPollutant.pollutant})
                </p>
              </div>
              <HotspotBarChart
                hotspots={primaryPollutant.hotspots}
                unit={primaryPollutant.primaryUnit}
                wardMean={primaryPollutant.mean}
              />
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2.5">
              <div className="text-xs text-slate-600">
                {activeBriefing
                  ? `Briefings ready (${activeBriefing.language.toUpperCase()} · ${activeBriefing.readingLevel})`
                  : 'Generate evidence-grounded Gemini briefings from these validated numbers.'}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('briefings')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {activeBriefing ? 'View Ward Briefing' : 'Generate AI Briefings'}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('quality')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  Inspect Quality Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
