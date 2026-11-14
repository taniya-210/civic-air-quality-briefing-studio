import { useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  Copy,
  GraduationCap,
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
  const [audienceTab, setAudienceTab] = useState<'housing' | 'schools'>('housing');
  const [copiedNotice, setCopiedNotice] = useState(false);

  if (!analysis) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
        <div className="font-display text-base font-semibold text-slate-900">
          No Monitoring Data Loaded for Citizen Advisories
        </div>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Upload and validate air-quality measurements first to generate advisories for Housing
          Societies and Schools.
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
    await navigator.clipboard.writeText(text);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setAudienceTab('housing')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              audienceTab === 'housing'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Housing Societies (RWAs)
          </button>
          <button
            type="button"
            onClick={() => setAudienceTab('schools')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              audienceTab === 'schools'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Schools &amp; Students
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => onChangeLanguage('en')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                language === 'en'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => onChangeLanguage('hi')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                language === 'hi'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              हिन्दी (Hindi)
            </button>
          </div>

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
            disabled={isGenerating || analysis.qualityReport.validRows === 0}
            onClick={() => onGenerate(language, readingLevel)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            {isGenerating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
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
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2.5 text-sm text-red-900">
          <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
          <div className="text-xs">{error}</div>
        </div>
      )}

      {isGenerating && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
          <div className="h-5 w-1/2 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-32 w-full bg-slate-100 rounded-lg animate-pulse" />
        </div>
      )}

      {!isGenerating && !briefingPack && !error && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <div className="font-display text-base font-semibold text-slate-900">
            Generate Practical Housing Society &amp; School Advisories
          </div>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Click <strong>Generate Advisories</strong> to produce plain-language English or Hindi
            guidance grounded strictly in your validated ward telemetry.
          </p>
        </div>
      )}

      {!isGenerating && briefingPack && audienceTab === 'housing' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="text-xs text-slate-500">
              Housing Society RWA Advisory · {briefingPack.language === 'hi' ? 'हिन्दी' : 'English'} ·{' '}
              {briefingPack.readingLevel} level
            </div>
            <h3 className="font-display text-xl font-bold text-slate-900">
              {briefingPack.housingSocietyAdvisory.title}
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {briefingPack.housingSocietyAdvisory.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <h4 className="font-display text-base font-semibold text-slate-900">
                Practical Society Actions
              </h4>
              <div className="divide-y divide-slate-100">
                {briefingPack.housingSocietyAdvisory.practicalActions.map((act, idx) => (
                  <div key={idx} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <div className="text-sm font-semibold text-slate-900">{act.action}</div>
                    <div className="text-xs font-medium text-teal-800">
                      When / Condition: {act.timingOrCondition}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{act.whyItHelps}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
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
                <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3.5">
                  {briefingPack.housingSocietyAdvisory.residentNoticeDraft}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                <div className="text-xs font-semibold text-emerald-800">
                  Measured Facts Supporting This Notice
                </div>
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {briefingPack.housingSocietyAdvisory.measuredFacts.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
                {briefingPack.housingSocietyAdvisory.caveats.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 text-[11px] text-amber-800 space-y-1">
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
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="text-xs text-slate-500">
              School Health-Conscious Advisory ·{' '}
              {briefingPack.language === 'hi' ? 'हिन्दी' : 'English'} · {briefingPack.readingLevel}{' '}
              level
            </div>
            <h3 className="font-display text-xl font-bold text-slate-900">
              {briefingPack.schoolAdvisory.title}
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {briefingPack.schoolAdvisory.summary}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                <h4 className="font-display text-sm font-semibold text-slate-900">
                  Outdoor Assembly &amp; Sports Guidance
                </h4>
                <p className="text-sm text-slate-800 leading-relaxed">
                  {briefingPack.schoolAdvisory.outdoorActivityGuidance}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
                  <h4 className="font-display text-sm font-semibold text-slate-900">
                    Classroom Precautions
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 leading-relaxed">
                    {briefingPack.schoolAdvisory.classroomPrecautions.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
                  <h4 className="font-display text-sm font-semibold text-slate-900">
                    Sensitive Students &amp; Health Notes
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 leading-relaxed">
                    {briefingPack.schoolAdvisory.sensitiveGroupNotes.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
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
                <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3.5">
                  {briefingPack.schoolAdvisory.parentMessageDraft}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                <div className="text-xs font-semibold text-emerald-800">
                  Measured Facts Supporting School Guidance
                </div>
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {briefingPack.schoolAdvisory.measuredFacts.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
                {briefingPack.schoolAdvisory.caveats.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 text-[11px] text-amber-800 space-y-1">
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
    </div>
  );
}
