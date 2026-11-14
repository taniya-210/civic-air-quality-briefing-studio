import { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Printer,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import type {
  AnalysisResult,
  BriefingLanguage,
  DashboardView,
  GeneratedBriefingPack,
  ReadingLevel,
} from '../types/airQuality';
import { ReliabilityBanner } from './ReliabilityBanner';

interface BriefingsViewProps {
  analysis: AnalysisResult | null;
  briefingPack: GeneratedBriefingPack | null;
  language: BriefingLanguage;
  readingLevel: ReadingLevel;
  isGenerating: boolean;
  error: string | null;
  onChangeLanguage: (lang: BriefingLanguage) => void;
  onChangeReadingLevel: (level: ReadingLevel) => void;
  onGenerate: (lang: BriefingLanguage, level: ReadingLevel) => void;
  onNavigate: (view: DashboardView) => void;
}

const LANG_LABELS: Record<BriefingLanguage, string> = {
  en: 'English',
  hi: 'हिन्दी (Hindi)',
  mr: 'मराठी (Marathi)',
};

export function BriefingsView({
  analysis,
  briefingPack,
  language,
  readingLevel,
  isGenerating,
  error,
  onChangeLanguage,
  onChangeReadingLevel,
  onGenerate,
  onNavigate,
}: BriefingsViewProps) {
  const [copied, setCopied] = useState(false);
  const [showTraceability, setShowTraceability] = useState(false);

  if (!analysis) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
        <div className="font-display text-base font-semibold text-slate-900">
          Upload &amp; Validate Data Before Generating Briefings
        </div>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          AI briefings are strictly grounded in your validated measurements and JS statistics.
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

  const handleCopyBriefing = async () => {
    if (!briefingPack) return;
    const b = briefingPack.wardOfficerBriefing;
    const v = briefingPack.vulnerableGroupAdvisories;
    const text = [
      b.title,
      `Period: ${analysis.periodLabel} | Language: ${LANG_LABELS[briefingPack.language]} | Level: ${briefingPack.readingLevel}`,
      '',
      'EXECUTIVE SUMMARY',
      b.executiveSummary,
      '',
      'MEASURED FACTS (VERIFIED TELEMETRY)',
      ...b.measuredFacts.map((m) => `- ${m}`),
      '',
      'AI INTERPRETATIONS (ANALYTICAL HYPOTHESES)',
      ...b.aiInterpretations.map((i) => `- ${i}`),
      '',
      'HOTSPOT PRIORITIES',
      ...b.hotspotPriorities.map(
        (h) => `- ${h.location} [${h.priorityLevel}]: ${h.action} (Evidence: ${h.evidence})`
      ),
      '',
      'RECOMMENDATIONS',
      ...b.recommendations.map(
        (r) => `- ${r.action} — ${r.rationale} (Metric: ${r.linkedMetric})`
      ),
      '',
      'VULNERABLE GROUP OUTREACH',
      `- ${v.children.groupName}: ${v.children.riskSummary} (${v.children.linkedEvidence})`,
      `- ${v.olderAdults.groupName}: ${v.olderAdults.riskSummary} (${v.olderAdults.linkedEvidence})`,
      `- ${v.sensitiveIndividuals.groupName}: ${v.sensitiveIndividuals.riskSummary} (${v.sensitiveIndividuals.linkedEvidence})`,
      '',
      'DATA LIMITATIONS & CAVEATS',
      ...b.dataCaveats.map((c) => `- ${c}`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be blocked in restricted frames
    }
  };

  const zeroValid = analysis.qualityReport.validRows === 0;

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Ward Officer Internal Briefing Generator
          </h2>
          <p className="text-xs text-slate-500">
            Sends validated summary metrics from{' '}
            <strong className="text-slate-800">{analysis.periodLabel}</strong> to Gemini via the
            backend API.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Language selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['en', 'hi', 'mr'] as BriefingLanguage[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => onChangeLanguage(lang)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  language === lang
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lang === 'en' ? 'English' : lang === 'hi' ? 'हिन्दी' : 'मराठी'}
              </button>
            ))}
          </div>

          {/* Reading level selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => onChangeReadingLevel('simple')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                readingLevel === 'simple'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => onChangeReadingLevel('detailed')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                readingLevel === 'detailed'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Detailed
            </button>
          </div>

          <button
            type="button"
            disabled={isGenerating || zeroValid}
            onClick={() => onGenerate(language, readingLevel)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            {isGenerating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {isGenerating
              ? 'Generating Briefings...'
              : briefingPack
              ? 'Regenerate Briefings'
              : `Generate ${LANG_LABELS[language].split(' ')[0]} (${readingLevel})`}
          </button>
        </div>
      </div>

      {(analysis.overallReliability !== 'reliable' || analysis.isPreliminary) && (
        <ReliabilityBanner
          status={analysis.overallReliability}
          reasons={[analysis.preliminarySummaryNote, ...analysis.reliabilityNotes]}
          compact
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5 text-sm text-red-900">
            <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="font-semibold">AI Briefing Generation Unavailable</div>
              <div className="text-xs text-red-800 leading-relaxed">{error}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onGenerate(language, readingLevel)}
            disabled={isGenerating || zeroValid}
            className="px-3 py-1.5 text-xs font-medium text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-100 whitespace-nowrap shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {isGenerating && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
          <div className="h-5 w-2/3 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-slate-100 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            <div className="h-32 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-32 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        </div>
      )}

      {!isGenerating && !briefingPack && !error && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <div className="font-display text-base font-semibold text-slate-900">
            Ready to Draft Evidence-Grounded Civic Briefings
          </div>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Select language ({LANG_LABELS[language]}) and reading level ({readingLevel}), then
            click <strong>Generate</strong>. This produces grounded briefings for Ward Officers,
            Housing Societies, Schools, and Vulnerable Groups.
          </p>
        </div>
      )}

      {!isGenerating && briefingPack && (
        <div className="space-y-6">
          {/* Header & Export */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="space-y-1">
                <div className="text-xs text-slate-500">
                  Ward Officer Internal Briefing · {LANG_LABELS[briefingPack.language]} ·{' '}
                  {briefingPack.readingLevel === 'simple' ? 'Simple level' : 'Detailed level'} ·
                  Generated {new Date(briefingPack.generatedAtIso).toLocaleTimeString()}
                </div>
                <h3 className="font-display text-xl font-bold text-slate-900">
                  {briefingPack.wardOfficerBriefing.title}
                </h3>
              </div>

              <div className="no-print flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyBriefing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? 'Copied' : 'Copy Text'}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
              </div>
            </div>

            <p className="text-sm text-slate-800 leading-relaxed">
              {briefingPack.wardOfficerBriefing.executiveSummary}
            </p>
          </div>

          {/* Explicit Separation: Measured Facts vs AI Interpretations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div>
                <div className="text-xs font-semibold text-emerald-800">
                  Measured Facts (Verified Telemetry)
                </div>
                <p className="text-[11px] text-slate-500">
                  Direct figures derived from validated monitoring records
                </p>
              </div>
              <ul className="space-y-2 text-sm text-slate-800">
                {briefingPack.wardOfficerBriefing.measuredFacts.map((fact, idx) => (
                  <li key={idx} className="pb-2 border-b border-slate-100 last:border-0 last:pb-0">
                    {fact}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
              <div>
                <div className="text-xs font-semibold text-teal-900">
                  AI Interpretations &amp; Operational Context
                </div>
                <p className="text-[11px] text-slate-500">
                  Analytical synthesis generated by {briefingPack.modelUsed} — verify local site
                  conditions before enforcement
                </p>
              </div>
              <ul className="space-y-2 text-sm text-slate-800">
                {briefingPack.wardOfficerBriefing.aiInterpretations.map((item, idx) => (
                  <li key={idx} className="pb-2 border-b border-slate-200/70 last:border-0 last:pb-0">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Hotspot Priorities */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h4 className="font-display text-base font-semibold text-slate-900">
              Hotspot Inspection Priorities
            </h4>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="px-3 py-2.5 font-medium">Location</th>
                    <th className="px-3 py-2.5 font-medium">Priority</th>
                    <th className="px-3 py-2.5 font-medium">Recommended Field Action</th>
                    <th className="px-3 py-2.5 font-medium">Measured Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {briefingPack.wardOfficerBriefing.hotspotPriorities.map((item, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="px-3 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                        {item.location}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                        {item.priorityLevel}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 leading-relaxed">{item.action}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                        {item.evidence}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recommendations & Caveats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h4 className="font-display text-base font-semibold text-slate-900">
                Evidence-Based Recommendations
              </h4>
              <div className="divide-y divide-slate-100">
                {briefingPack.wardOfficerBriefing.recommendations.map((rec, idx) => (
                  <div key={idx} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <div className="text-sm font-semibold text-slate-900">{rec.action}</div>
                    <p className="text-xs text-slate-600 leading-relaxed">{rec.rationale}</p>
                    <div className="text-[11px] font-mono text-teal-800">
                      Linked metric: {rec.linkedMetric}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-5 space-y-3">
              <h4 className="font-display text-sm font-semibold text-amber-950">
                Data Limitations &amp; Caveats
              </h4>
              <ul className="space-y-2 text-xs text-amber-900 leading-relaxed">
                {briefingPack.wardOfficerBriefing.dataCaveats.map((c, idx) => (
                  <li key={idx}>• {c}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Traceability Verification Panel */}
          <div className="no-print bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <button
              type="button"
              onClick={() => setShowTraceability((prev) => !prev)}
              className="w-full flex items-center justify-between text-left"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Source Evidence &amp; Grounding Audit
                </div>
                <div className="text-xs text-slate-500">
                  Trace briefing claims directly back to deterministic JS calculations and peak
                  source rows
                </div>
              </div>
              {showTraceability ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {showTraceability && (
              <div className="pt-3 border-t border-slate-200 space-y-3 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {analysis.pollutantSummaries.map((p) => (
                    <div key={p.pollutant} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                      <div className="font-semibold text-slate-900">
                        {p.pollutant} ({p.primaryUnit}) · {p.preliminaryLabel}
                      </div>
                      <div className="font-mono tabular-nums text-slate-700">
                        Mean: {p.mean} · Median: {p.median} · P90: {p.p90} · n={p.totalCount}
                      </div>
                      {p.observedPeak && (
                        <div className="font-mono tabular-nums text-amber-900">
                          Observed Peak: {p.observedPeak.value} {p.observedPeak.unit} at{' '}
                          {p.observedPeak.location} (Row #{p.observedPeak.rowIndex},{' '}
                          {p.observedPeak.timestampRaw})
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onNavigate('analysis')}
                    className="text-xs font-medium text-teal-800 hover:text-teal-950"
                  >
                    Open Full Source Readings Table →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
