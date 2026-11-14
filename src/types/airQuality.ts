export type DashboardView =
  | 'overview'
  | 'upload'
  | 'quality'
  | 'analysis'
  | 'briefings'
  | 'advisory'
  | 'comparison';

export interface ColumnMapping {
  pollutant: string;
  location: string;
  timestamp: string;
  value: string;
  unit: string;
}

export interface RawParsedTable {
  headers: string[];
  rows: Record<string, string>[];
  detectedDelimiter: string;
  totalRawLines: number;
}

export type ValidationIssueType =
  | 'missing_field'
  | 'invalid_number'
  | 'negative_value'
  | 'implausible_outlier'
  | 'invalid_timestamp'
  | 'duplicate_reading'
  | 'conflicting_duplicate'
  | 'unit_inconsistency';

export interface RowIssue {
  type: ValidationIssueType;
  field: keyof ColumnMapping | 'row';
  message: string;
}

export interface ValidatedReading {
  rowIndex: number;
  rawRow: Record<string, string>;
  location: string;
  pollutant: string;
  timestampRaw: string;
  timestampIso: string;
  timestampMs: number;
  value: number;
  unit: string;
  normalizedUnit: string;
  warnings: string[];
}

export interface FlaggedRow {
  rowIndex: number;
  rawRow: Record<string, string>;
  issues: RowIssue[];
}

export type ReliabilityStatus = 'reliable' | 'caution' | 'insufficient';

export interface DataQualityReport {
  totalRows: number;
  validRows: number;
  flaggedRowsCount: number;
  duplicateCount: number;
  conflictingDuplicateCount: number;
  missingFieldCount: number;
  invalidValueCount: number;
  invalidTimestampCount: number;
  outlierCount: number;
  unitInconsistencyCount: number;
  completenessPct: number;
  timeRangeStart: string | null;
  timeRangeEnd: string | null;
  timeSpanHours: number | null;
  stations: string[];
  pollutants: string[];
  unitsByPollutant: Record<string, string[]>;
  reliabilityStatus: ReliabilityStatus;
  reliabilityReasons: string[];
  flaggedRows: FlaggedRow[];
}

export interface PollutantThreshold {
  pollutant: string;
  unit: string;
  averagingHours: 8 | 24;
  minSamplesPerWindow: number;
  minSpanHoursPerWindow: number;
  whoGuideline: number | null;
  cpcbStandard: number | null;
  referenceValue: number;
  referenceLabel: string;
}

export type AveragingAssessmentStatus =
  | 'regulatory_window_supported'
  | 'preliminary_short_duration'
  | 'preliminary_intermittent_sampling'
  | 'no_standard_configured';

export interface ValidWindowAverage {
  windowLabel: string;
  location: string;
  pollutant: string;
  unit: string;
  averagingHours: 8 | 24;
  calculatedAverage: number;
  readingCount: number;
  spanHours: number;
  standardValue: number;
  standardLabel: string;
  exceedsStandard: boolean;
}

export interface ObservedPeak {
  value: number;
  unit: string;
  location: string;
  timestampRaw: string;
  timestampIso: string;
  rowIndex: number;
}

export type TrendDirection = 'rising' | 'falling' | 'stable' | 'insufficient_data';

export interface TrendAnalysis {
  direction: TrendDirection;
  slopePerHour: number | null;
  slopePerDay: number | null;
  firstHalfMean: number | null;
  secondHalfMean: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
  sampleCount: number;
  spanHours: number;
  note: string;
}

export interface LocationPollutantStats {
  location: string;
  pollutant: string;
  unit: string;
  count: number;
  spanHours: number;
  min: number;
  max: number;
  observedPeak: ObservedPeak;
  mean: number;
  median: number;
  p90: number;
  stdDev: number;
  pctVsWardMean: number;
  isLowSample: boolean;
  isPreliminary: boolean;
  averagingStatus: AveragingAssessmentStatus;
  averagingNote: string;
  validWindowAverages: ValidWindowAverage[];
  regulatoryExceedanceCount: number | null;
  trend: TrendAnalysis;
  readingRowIndices: number[];
}

export interface HotspotItem {
  rank: number;
  location: string;
  pollutant: string;
  unit: string;
  mean: number;
  max: number;
  observedPeakRowIndex: number;
  observedPeakTimestamp: string;
  count: number;
  pctAboveWardMean: number;
  isPreliminary: boolean;
  validWindowExceedances: number | null;
  validWindowCount: number;
  reliabilityNote: string | null;
}

export interface PollutantSummary {
  pollutant: string;
  primaryUnit: string;
  hasMixedUnits: boolean;
  unitsFound: string[];
  unitBreakdown: { unit: string; count: number }[];
  excludedUnitRowCount: number;
  totalCount: number;
  spanHours: number;
  min: number;
  max: number;
  observedPeak: ObservedPeak | null;
  mean: number;
  median: number;
  p90: number;
  stdDev: number;
  thresholdUsed: PollutantThreshold | null;
  averagingStatus: AveragingAssessmentStatus;
  isPreliminary: boolean;
  preliminaryLabel: string;
  averagingNote: string;
  validWindowAverages: ValidWindowAverage[];
  regulatoryWindowExceedanceCount: number | null;
  regulatoryWindowTotalCount: number;
  trend: TrendAnalysis;
  locationStats: LocationPollutantStats[];
  hotspots: HotspotItem[];
  unitWarning: string | null;
}

export interface AnalysisResult {
  id: string;
  periodLabel: string;
  datasetName: string;
  analyzedAtIso: string;
  columnMapping: ColumnMapping;
  qualityReport: DataQualityReport;
  validReadings: ValidatedReading[];
  pollutantSummaries: PollutantSummary[];
  overallReliability: ReliabilityStatus;
  isPreliminary: boolean;
  preliminarySummaryNote: string;
  reliabilityNotes: string[];
}

export type BriefingLanguage = 'en' | 'hi';
export type ReadingLevel = 'simple' | 'detailed';

export interface GroundingAudit {
  datasetPeriod: string;
  totalValidReadings: number;
  reliabilityStatus: ReliabilityStatus;
  verifiedMetricsCited: string[];
}

export interface WardOfficerBriefing {
  title: string;
  executiveSummary: string;
  measuredFacts: string[];
  aiInterpretations: string[];
  hotspotPriorities: {
    location: string;
    priorityLevel: string;
    action: string;
    evidence: string;
  }[];
  recommendations: {
    action: string;
    rationale: string;
    linkedMetric: string;
  }[];
  dataCaveats: string[];
}

export interface HousingSocietyAdvisory {
  title: string;
  summary: string;
  measuredFacts: string[];
  practicalActions: {
    action: string;
    timingOrCondition: string;
    whyItHelps: string;
  }[];
  residentNoticeDraft: string;
  caveats: string[];
}

export interface SchoolAdvisory {
  title: string;
  summary: string;
  measuredFacts: string[];
  outdoorActivityGuidance: string;
  classroomPrecautions: string[];
  sensitiveGroupNotes: string[];
  parentMessageDraft: string;
  caveats: string[];
}

export interface GeneratedBriefingPack {
  language: BriefingLanguage;
  readingLevel: ReadingLevel;
  generatedAtIso: string;
  modelUsed: string;
  groundingAudit: GroundingAudit;
  wardOfficerBriefing: WardOfficerBriefing;
  housingSocietyAdvisory: HousingSocietyAdvisory;
  schoolAdvisory: SchoolAdvisory;
}

export interface SavedPeriodRecord {
  id: string;
  periodLabel: string;
  datasetName: string;
  savedAtIso: string;
  analysis: AnalysisResult;
  briefingPacks?: Record<string, GeneratedBriefingPack>;
}

export interface PollutantComparisonItem {
  pollutant: string;
  comparable: boolean;
  nonComparableReason: string | null;
  unitA: string | null;
  unitB: string | null;
  countA: number;
  countB: number;
  overlappingStations: string[];
  meanA: number | null;
  meanB: number | null;
  maxA: number | null;
  maxB: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
  direction: 'improved' | 'worsened' | 'unchanged' | 'not_comparable';
  stationComparisons: {
    location: string;
    comparable: boolean;
    reason: string | null;
    countA: number;
    countB: number;
    meanA: number | null;
    meanB: number | null;
    deltaAbs: number | null;
    deltaPct: number | null;
  }[];
}

export interface PeriodComparisonResult {
  periodAId: string;
  periodALabel: string;
  periodBId: string;
  periodBLabel: string;
  comparableCount: number;
  nonComparableCount: number;
  overlappingStations: string[];
  pollutantComparisons: PollutantComparisonItem[];
  overallVerdict: string;
  cautionNotes: string[];
}

export interface ComparativeBriefingResponse {
  generatedAtIso: string;
  modelUsed: string;
  language: BriefingLanguage;
  headline: string;
  verifiedChanges: string[];
  aiInterpretation: string[];
  uncomparableWarnings: string[];
  recommendedNextSteps: string[];
}
