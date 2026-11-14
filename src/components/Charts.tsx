import { useMemo, useState } from 'react';
import type { HotspotItem, ObservedPeak, ValidatedReading } from '../types/airQuality';

const STATION_COLORS = [
  '#0f766e', // teal-700
  '#1d4ed8', // blue-700
  '#b45309', // amber-700
  '#be123c', // rose-700
  '#4338ca', // indigo-700
  '#047857', // emerald-700
];

function formatShortDate(ms: number): string {
  const d = new Date(ms);
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${month} ${day}, ${hh}:${mm}`;
}

interface TimeSeriesChartProps {
  readings: ValidatedReading[];
  pollutant: string;
  unit: string;
  observedMean: number;
  observedPeak: ObservedPeak | null;
}

function decimateSeriesPoints(
  points: ValidatedReading[],
  peakRowIndex: number | null,
  maxPoints = 220
): ValidatedReading[] {
  if (points.length <= maxPoints) return points;
  const bucketCount = Math.floor(maxPoints / 2);
  const bucketSize = points.length / bucketCount;
  const result: ValidatedReading[] = [];
  const added = new Set<number>();

  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(points.length, Math.floor((b + 1) * bucketSize));
    if (start >= end) continue;
    let minPt = points[start];
    let maxPt = points[start];
    let peakPt: ValidatedReading | null = null;
    for (let i = start; i < end; i++) {
      const p = points[i];
      if (p.value < minPt.value) minPt = p;
      if (p.value > maxPt.value) maxPt = p;
      if (peakRowIndex !== null && p.rowIndex === peakRowIndex) peakPt = p;
    }
    const candidates = minPt.timestampMs <= maxPt.timestampMs ? [minPt, maxPt] : [maxPt, minPt];
    if (peakPt) candidates.push(peakPt);
    candidates.sort((a, bPt) => a.timestampMs - bPt.timestampMs);
    for (const c of candidates) {
      if (!added.has(c.rowIndex)) {
        added.add(c.rowIndex);
        result.push(c);
      }
    }
  }
  return result;
}

export function TimeSeriesChart({
  readings,
  pollutant,
  unit,
  observedMean,
  observedPeak,
}: TimeSeriesChartProps) {
  const [hoveredReading, setHoveredReading] = useState<ValidatedReading | null>(null);

  const seriesData = useMemo(() => {
    const filtered = readings
      .filter((r) => r.pollutant === pollutant && r.normalizedUnit === unit)
      .sort((a, b) => a.timestampMs - b.timestampMs);

    const byStationMap = new Map<string, ValidatedReading[]>();
    for (const r of filtered) {
      let arr = byStationMap.get(r.location);
      if (!arr) {
        arr = [];
        byStationMap.set(r.location, arr);
      }
      arr.push(r);
    }

    const stations = Array.from(byStationMap.keys()).sort();
    const peakRow = observedPeak?.rowIndex ?? null;
    const byStation = stations.map((station, idx) => ({
      station,
      color: STATION_COLORS[idx % STATION_COLORS.length],
      points: decimateSeriesPoints(byStationMap.get(station)!, peakRow),
    }));

    return { filtered, stations, byStation };
  }, [readings, pollutant, unit, observedPeak?.rowIndex]);

  if (seriesData.filtered.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-600">
        No compatible {pollutant} ({unit}) readings to plot.
      </div>
    );
  }

  const width = 760;
  const height = 270;
  const padLeft = 52;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 40;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const minMs = seriesData.filtered[0].timestampMs;
  const maxMs = seriesData.filtered[seriesData.filtered.length - 1].timestampMs;
  const msSpan = Math.max(maxMs - minMs, 3600000);

  let maxDataVal = 0;
  for (let i = 0; i < seriesData.filtered.length; i++) {
    if (seriesData.filtered[i].value > maxDataVal) {
      maxDataVal = seriesData.filtered[i].value;
    }
  }
  const maxY = Math.max(maxDataVal * 1.14, 10);

  const getX = (ms: number) =>
    seriesData.filtered.length === 1
      ? padLeft + plotW / 2
      : padLeft + ((ms - minMs) / msSpan) * plotW;

  const getY = (val: number) => padTop + plotH - (val / maxY) * plotH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: Math.round(maxY * t),
    y: padTop + plotH * (1 - t),
  }));

  const xTicks =
    minMs === maxMs
      ? [{ ms: minMs, x: padLeft + plotW / 2 }]
      : [0, 0.5, 1].map((t) => ({
          ms: minMs + msSpan * t,
          x: padLeft + plotW * t,
        }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
          {seriesData.byStation.map((s) => (
            <div key={s.station} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-0.5 rounded"
                style={{ backgroundColor: s.color }}
              />
              <span>{s.station}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block w-3 h-0.5 border-t border-dashed border-slate-500" />
            <span>
              Observed Mean ({observedMean} {unit})
            </span>
          </div>
          {observedPeak && (
            <div className="flex items-center gap-1.5 text-amber-800">
              <span className="inline-block w-2 h-2 rounded-full border-2 border-amber-700 bg-white" />
              <span>
                Observed Peak ({observedPeak.value} {unit})
              </span>
            </div>
          )}
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-600 min-h-[18px]">
          {hoveredReading ? (
            <span>
              Row #{hoveredReading.rowIndex} · {hoveredReading.location} ·{' '}
              {formatShortDate(hoveredReading.timestampMs)} ·{' '}
              <strong className="text-slate-900">
                {hoveredReading.value} {hoveredReading.normalizedUnit}
              </strong>
            </span>
          ) : (
            <span className="text-slate-500">Hover any point to inspect source reading</span>
          )}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[540px] h-auto select-none"
          role="img"
          aria-label={`${pollutant} observed concentration time-series chart`}
        >
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                y1={tick.y}
                x2={width - padRight}
                y2={tick.y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={tick.y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[11px] font-mono"
              >
                {tick.val}
              </text>
            </g>
          ))}

          {/* Observed ward mean reference line (never a 24h regulatory threshold on hourly points) */}
          <line
            x1={padLeft}
            y1={getY(observedMean)}
            x2={width - padRight}
            y2={getY(observedMean)}
            stroke="#64748b"
            strokeWidth="1.2"
            strokeDasharray="4 4"
          />

          {xTicks.map((tick, idx) => (
            <text
              key={idx}
              x={tick.x}
              y={height - 12}
              textAnchor={idx === 0 ? 'start' : idx === xTicks.length - 1 ? 'end' : 'middle'}
              className="fill-slate-500 text-[11px] font-mono"
            >
              {formatShortDate(tick.ms)}
            </text>
          ))}

          {seriesData.byStation.map((s) => {
            const pathD = s.points
              .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(pt.timestampMs)} ${getY(pt.value)}`)
              .join(' ');
            return (
              <g key={s.station}>
                {s.points.length > 1 && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                )}
                {s.points.map((pt) => {
                  const cx = getX(pt.timestampMs);
                  const cy = getY(pt.value);
                  const isHovered = hoveredReading?.rowIndex === pt.rowIndex;
                  const isPeak = observedPeak?.rowIndex === pt.rowIndex;
                  return (
                    <circle
                      key={pt.rowIndex}
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 6 : isPeak ? 5 : 3.5}
                      fill={isPeak ? '#ffffff' : s.color}
                      stroke={isPeak ? '#b45309' : '#ffffff'}
                      strokeWidth={isPeak ? '2.5' : '1.5'}
                      className="cursor-pointer transition-transform"
                      onMouseEnter={() => setHoveredReading(pt)}
                      onMouseLeave={() => setHoveredReading(null)}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

interface HotspotBarChartProps {
  hotspots: HotspotItem[];
  unit: string;
  wardMean: number;
}

export function HotspotBarChart({
  hotspots,
  unit,
  wardMean,
}: HotspotBarChartProps) {
  if (hotspots.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        No station breakdown available.
      </div>
    );
  }

  const maxScale = Math.max(...hotspots.map((h) => h.max), wardMean, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span>
          Observed Ward Mean:{' '}
          <strong className="font-mono tabular-nums text-slate-900">
            {wardMean} {unit}
          </strong>
        </span>
        <span className="text-slate-500">
          Dark bar = station observed mean · Pale bar = station observed peak
        </span>
      </div>

      <div className="space-y-3">
        {hotspots.map((item) => {
          const meanPct = Math.min(100, (item.mean / maxScale) * 100);
          const maxPct = Math.min(100, (item.max / maxScale) * 100);
          const aboveWardMean = item.mean > wardMean;

          return (
            <div key={item.location} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono tabular-nums text-slate-500">#{item.rank}</span>
                  <span className="font-medium text-slate-900 truncate">{item.location}</span>
                  <span className="text-slate-500 font-mono tabular-nums shrink-0">
                    n={item.count}
                  </span>
                </div>
                <div className="font-mono tabular-nums text-slate-700 shrink-0">
                  Mean <strong className="text-slate-900">{item.mean}</strong> · Peak {item.max}{' '}
                  {unit}
                  {item.pctAboveWardMean !== 0 && (
                    <span
                      className={`ml-2 ${
                        item.pctAboveWardMean > 0 ? 'text-amber-800' : 'text-emerald-700'
                      }`}
                    >
                      ({item.pctAboveWardMean > 0 ? '+' : ''}
                      {item.pctAboveWardMean}% vs ward)
                    </span>
                  )}
                </div>
              </div>

              <div className="relative h-3.5 w-full rounded bg-slate-100 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-slate-200/90"
                  style={{ width: `${maxPct}%` }}
                  title={`Observed peak: ${item.max} ${unit} (Row #${item.observedPeakRowIndex})`}
                />
                <div
                  className={`absolute inset-y-0 left-0 ${
                    aboveWardMean ? 'bg-amber-600' : 'bg-teal-700'
                  }`}
                  style={{ width: `${meanPct}%` }}
                  title={`Observed mean: ${item.mean} ${unit}`}
                />
                <div
                  className="absolute inset-y-0 w-0.5 bg-slate-700/70"
                  style={{
                    left: `${Math.min(100, (wardMean / maxScale) * 100)}%`,
                  }}
                  title={`Observed ward mean: ${wardMean} ${unit}`}
                />
              </div>

              {item.reliabilityNote && (
                <div className="text-[11px] text-amber-800">{item.reliabilityNote}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
