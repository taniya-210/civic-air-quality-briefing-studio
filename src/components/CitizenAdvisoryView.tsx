import { useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  Copy,
  GraduationCap,
  HeartPulse,
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
  VulnerableGroupItem,
} from '../types/airQuality';
import { LANG_LABELS, LANG_SHORT_LABELS } from '../lib/constants';
import { formatVulnerableAdvisoriesCopyText } from '../lib/demoBriefingFallback';
import { FallbackNoticeBanner } from './FallbackNoticeBanner';

interface CitizenAdvisoryViewProps {
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

function VulnerableGroupCard({ item }: { item: VulnerableGroupItem }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div>
        <h4 className="font-display text-base font-bold text-slate-900">{item.groupName}</h4>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{item.riskSummary}</p>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-semibold text-teal-900">Recommended Precautions</div>
        <ul className="space-y-1 text-xs text-slate-700 leading-relaxed">
          {item.precautions.map((p, idx) => (
            <li key={idx}>• {p}</li>
          ))}
        </ul>
      </div>

      <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 space-y-1">
        <div className="text-[11px] font-semibold text-amber-950">When to Seek Medical Care</div>
        <p className="text-xs text-amber-900 leading-relaxed">{item.whenToSeekCare}</p>
      </div>

      <div className="pt-2.5 border-t border-slate-100 text-[11px] font-mono text-slate-500 break-words">
        Evidence: {item.linkedEvidence}
      </div>
    </div>
  );
}

export function CitizenAdvisoryView({
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
}: CitizenAdvisoryViewProps) {
  const [audienceTab, setAudienceTab] = useState<'housing' | 'schools' | 'vulnerable'>('housing');
  const [copiedNotice, setCopiedNotice] = useState(false);

  if (!analysis) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-2.5">
        <div className="font-display text-base font-semibold text-slate-900">
          No Monitoring Data Loaded for Citizen Advisories
        </div>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Upload and validate air-quality measurements first to generate advisories for Housing
          Societies, Schools, and Vulnerable Groups.
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

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2000);
    } catch {
      // Clipboard API may be blocked in restricted frames
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Citizen advisory audience" className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            role="tab"
            aria-selected={audienceTab === 'housing'}
            onClick={() => setAudienceTab('housing')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 ${
              audienceTab === 'housing'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
            Housing Societies
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={audienceTab === 'schools'}
            onClick={() => setAudienceTab('schools')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 ${
              audienceTab === 'schools'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" aria-hidden="true" />
            Schools
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={audienceTab === 'vulnerable'}
            onClick={() => setAudienceTab('vulnerable')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 ${
              audienceTab === 'vulnerable'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HeartPulse className="w-3.5 h-3.5" aria-hidden="true" />
            Vulnerable Groups
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Advisory language" className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['en', 'hi', 'mr'] as BriefingLanguage[]).map((lang) => (
              <button
                key={lang}
                type="button"
                aria-pressed={language === lang}
                onClick={() => onChangeLanguage(lang)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 ${
                  language === lang
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {LANG_SHORT_LABELS[lang]}
              </button>
            ))}
          </div>

          <div role="group" aria-label="Reading level" className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              aria-pressed={readingLevel === 'simple'}
              onClick={() => onChangeReadingLevel('simple')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 ${
                readingLevel === 'simple'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              aria-pressed={readingLevel === 'detailed'}
              onClick={() => onChangeReadingLevel('detailed')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700 ${
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
            disabled={isGenerating || analysis.qualityReport.validRows === 0}
            onClick={() => onGenerate(language, readingLevel)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {isGenerating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {isGenerating ? 'Generating...' : briefingPack ? 'Regenerate' : 'Generate Advisories'}
          </button>
        </div>
      </div>

      {analysis.isPreliminary && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-950">
          <strong className="font-semibold">Preliminary Assessment:</strong>{' '}
          {analysis.preliminarySummaryNote}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between gap-4"
        >
          <div className="flex items-start gap-2.5 text-sm text-red-900">
            <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="text-xs leading-relaxed">{error}</div>
          </div>
          <button
            type="button"
            onClick={() => onGenerate(language, readingLevel)}
            disabled={isGenerating || analysis.qualityReport.validRows === 0}
            className="px-3 py-1.5 text-xs font-medium text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-100 whitespace-nowrap shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {isGenerating && (
        <div
          role="status"
          aria-busy="true"
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
        >
          <span className="sr-only">Generating citizen and school advisories...</span>
          <div className="h-5 w-1/2 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-24 w-full bg-slate-100 rounded-lg animate-pulse" />
        </div>
      )}

      {!isGenerating && !briefingPack && !error && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-2">
          <div className="font-display text-base font-semibold text-slate-900">
            Generate Practical Housing Society, School &amp; Vulnerable-Group Advisories
          </div>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Click <strong>Generate Advisories</strong> to produce plain-language{' '}
            {LANG_LABELS[language]} guidance grounded strictly in your validated ward telemetry.
          </p>
        </div>
      )}

      {!isGenerating && briefingPack && (
        <FallbackNoticeBanner
          briefingPack={briefingPack}
          isGenerating={isGenerating}
          onRetryLiveAi={() => onGenerate(language, readingLevel)}
        />
      )}

      {!isGenerating && briefingPack && audienceTab === 'housing' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                Housing Society RWA Advisory ·{' '}
                {briefingPack.source === 'demo_template'
                  ? 'Demo / Template Briefing'
                  : `Live Gemini AI (${briefingPack.modelUsed})`}{' '}
                · {LANG_LABELS[briefingPack.language]} · {briefingPack.readingLevel} level
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="no-print inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
            </div>
            <h3 className="font-display text-lg sm:text-xl font-bold text-slate-900">
              {briefingPack.housingSocietyAdvisory.title}
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {briefingPack.housingSocietyAdvisory.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="font-display text-base font-semibold text-slate-900">
                Practical Society Actions (Recommendations)
              </h4>
              <div className="divide-y divide-slate-100">
                {briefingPack.housingSocietyAdvisory.practicalActions.map((act, idx) => (
                  <div key={idx} className="py-2 first:pt-0 last:pb-0 space-y-1">
                    <div className="text-sm font-semibold text-slate-900">{act.action}</div>
                    <div className="text-xs font-medium text-teal-800">
                      When / Condition: {act.timingOrCondition}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{act.whyItHelps}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-display text-sm font-semibold text-slate-900">
                    Copyable Resident Notice Draft
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      copyText(briefingPack.housingSocietyAdvisory.residentNoticeDraft)
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-800 hover:text-teal-950"
                  >
                    {copiedNotice ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedNotice ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3">
                  {briefingPack.housingSocietyAdvisory.residentNoticeDraft}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="text-xs font-semibold text-emerald-800">
                  Measured Facts Supporting This Notice
                </div>
                <ul className="space-y-1 text-xs text-slate-700 leading-relaxed">
                  {briefingPack.housingSocietyAdvisory.measuredFacts.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
                {briefingPack.housingSocietyAdvisory.caveats.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-100 text-[11px] text-amber-800 space-y-1">
                    {briefingPack.housingSocietyAdvisory.caveats.map((c, i) => (
                      <div key={i}>Caveat: {c}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isGenerating && briefingPack && audienceTab === 'schools' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                School Health-Conscious Advisory ·{' '}
                {briefingPack.source === 'demo_template'
                  ? 'Demo / Template Briefing'
                  : `Live Gemini AI (${briefingPack.modelUsed})`}{' '}
                · {LANG_LABELS[briefingPack.language]} · {briefingPack.readingLevel} level
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="no-print inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
            </div>
            <h3 className="font-display text-lg sm:text-xl font-bold text-slate-900">
              {briefingPack.schoolAdvisory.title}
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {briefingPack.schoolAdvisory.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="font-display text-sm font-semibold text-slate-900">
                  Outdoor Assembly &amp; Sports Guidance
                </h4>
                <p className="text-sm text-slate-800 leading-relaxed">
                  {briefingPack.schoolAdvisory.outdoorActivityGuidance}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h4 className="font-display text-sm font-semibold text-slate-900">
                    Classroom Precautions
                  </h4>
                  <ul className="space-y-1 text-xs text-slate-700 leading-relaxed">
                    {briefingPack.schoolAdvisory.classroomPrecautions.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <h4 className="font-display text-sm font-semibold text-slate-900">
                    Students with Asthma / Sensitivity
                  </h4>
                  <ul className="space-y-1 text-xs text-slate-700 leading-relaxed">
                    {briefingPack.schoolAdvisory.sensitiveGroupNotes.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-display text-sm font-semibold text-slate-900">
                    Parent Circular / SMS Draft
                  </h4>
                  <button
                    type="button"
                    onClick={() => copyText(briefingPack.schoolAdvisory.parentMessageDraft)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-800 hover:text-teal-950"
                  >
                    {copiedNotice ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedNotice ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3">
                  {briefingPack.schoolAdvisory.parentMessageDraft}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="text-xs font-semibold text-emerald-800">
                  Measured Facts Supporting School Guidance
                </div>
                <ul className="space-y-1 text-xs text-slate-700 leading-relaxed">
                  {briefingPack.schoolAdvisory.measuredFacts.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
                {briefingPack.schoolAdvisory.caveats.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-100 text-[11px] text-amber-800 space-y-1">
                    {briefingPack.schoolAdvisory.caveats.map((c, i) => (
                      <div key={i}>Caveat: {c}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isGenerating && briefingPack && audienceTab === 'vulnerable' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs text-slate-500">
                Targeted Health Precautions ·{' '}
                {briefingPack.source === 'demo_template'
                  ? 'Demo / Template Briefing'
                  : `Live Gemini AI (${briefingPack.modelUsed})`}{' '}
                · {LANG_LABELS[briefingPack.language]} · {briefingPack.readingLevel} level
              </div>
              <h3 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                Precautionary Advisories for Vulnerable Groups
              </h3>
              <p className="text-xs text-slate-600">
                Specific protective guidance for children, older adults, and individuals sensitive to
                air pollution, grounded in {analysis.periodLabel}.
              </p>
            </div>
            <div className="no-print flex items-center gap-2">
              {briefingPack.vulnerableGroupAdvisories && (
                <button
                  type="button"
                  onClick={() => {
                    void copyText(formatVulnerableAdvisoriesCopyText(briefingPack));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                >
                  {copiedNotice ? (
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedNotice ? 'Copied' : 'Copy Text'}
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
            </div>
          </div>

          {briefingPack.vulnerableGroupAdvisories ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <VulnerableGroupCard item={briefingPack.vulnerableGroupAdvisories.children} />
              <VulnerableGroupCard item={briefingPack.vulnerableGroupAdvisories.olderAdults} />
              <VulnerableGroupCard
                item={briefingPack.vulnerableGroupAdvisories.sensitiveIndividuals}
              />
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
              Regenerate briefings to populate the vulnerable-group advisory breakdown.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
