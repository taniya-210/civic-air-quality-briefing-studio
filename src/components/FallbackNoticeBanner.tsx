import { Info, RefreshCw } from 'lucide-react';
import type { GeneratedBriefingPack } from '../types/airQuality';
import {
  FALLBACK_BANNER_LABEL,
  FALLBACK_UNAVAILABLE_MESSAGE,
} from '../lib/demoBriefingFallback';

interface FallbackNoticeBannerProps {
  briefingPack: GeneratedBriefingPack;
  isGenerating: boolean;
  onRetryLiveAi: () => void;
}

export function FallbackNoticeBanner({
  briefingPack,
  isGenerating,
  onRetryLiveAi,
}: FallbackNoticeBannerProps) {
  if (briefingPack.source !== 'demo_template') {
    return null;
  }

  const debug = briefingPack.fallbackDebugError;

  return (
    <div
      role="status"
      className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-wrap items-start justify-between gap-3"
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <Info className="w-4 h-4 text-amber-800 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="space-y-1 min-w-0">
          <div className="text-xs font-bold tracking-wide text-amber-950">
            {FALLBACK_BANNER_LABEL}
          </div>
          <p className="text-xs text-amber-900 leading-relaxed">
            {briefingPack.fallbackNotice || FALLBACK_UNAVAILABLE_MESSAGE}
          </p>
          {debug && (
            <div className="text-[11px] font-mono text-amber-900/90 break-words">
              Diagnostic: {debug.code}
              {typeof debug.statusCode === 'number' ? ` (HTTP ${debug.statusCode})` : ''} —{' '}
              {debug.message}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onRetryLiveAi}
        disabled={isGenerating}
        className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-950 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-700"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} aria-hidden="true" />
        {isGenerating ? 'Retrying Live AI...' : 'Retry Live AI'}
      </button>
    </div>
  );
}
