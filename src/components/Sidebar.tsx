import {
  BarChart3,
  Building2,
  ClipboardCheck,
  FileSpreadsheet,
  GitCompareArrows,
  LayoutDashboard,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { AnalysisResult, DashboardView } from '../types/airQuality';

interface SidebarProps {
  activeView: DashboardView;
  onSelectView: (view: DashboardView) => void;
  analysis: AnalysisResult | null;
  savedCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: DashboardView;
  label: string;
  step: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', step: '01', icon: LayoutDashboard },
  { id: 'upload', label: 'Upload Data', step: '02', icon: FileSpreadsheet },
  { id: 'quality', label: 'Data Quality', step: '03', icon: ClipboardCheck },
  { id: 'analysis', label: 'Analysis', step: '04', icon: BarChart3 },
  { id: 'briefings', label: 'AI Briefings', step: '05', icon: ShieldAlert },
  { id: 'advisory', label: 'Citizen Advisory', step: '06', icon: Building2 },
  { id: 'comparison', label: 'Historical Comparison', step: '07', icon: GitCompareArrows },
];

export function Sidebar({
  activeView,
  onSelectView,
  analysis,
  savedCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white border-r border-slate-200 px-4 py-5">
      <div>
        <div className="flex items-center justify-between px-2 pb-5 border-b border-slate-100">
          <div>
            <div className="font-display text-sm font-bold tracking-tight text-slate-900">
              Civic Air Studio
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Ward & School Briefing Desk
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md focus-visible:outline-2 focus-visible:outline-teal-700"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="mt-5 space-y-1" aria-label="Workspace sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectView(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-sm rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-teal-700 ${
                  isActive
                    ? 'bg-slate-900 text-white font-medium'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-teal-300' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                </span>
                <span
                  className={`font-mono text-[11px] tabular-nums shrink-0 ${
                    isActive ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  {item.step}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="pt-4 border-t border-slate-200 px-2 space-y-2 text-xs text-slate-600">
        <div className="font-medium text-slate-900">Active Dataset</div>
        {analysis ? (
          <div className="space-y-1 leading-relaxed">
            <div className="text-slate-800 font-medium truncate" title={analysis.periodLabel}>
              {analysis.periodLabel}
            </div>
            <div className="font-mono tabular-nums text-[11px] text-slate-500">
              {analysis.qualityReport.validRows} valid / {analysis.qualityReport.totalRows} rows
            </div>
            <div className="text-[11px] text-slate-500">
              {analysis.qualityReport.stations.length} stations ·{' '}
              {analysis.qualityReport.pollutants.length} pollutants
            </div>
          </div>
        ) : (
          <div className="text-slate-500">
            No monitoring dataset loaded yet.
          </div>
        )}
        <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-mono tabular-nums">
          Saved periods: {savedCount}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside className="hidden lg:block w-[248px] shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-[264px] max-w-[82vw] h-full z-10">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
