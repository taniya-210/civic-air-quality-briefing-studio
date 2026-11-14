import type {
  AnalysisResult,
  BriefingLanguage,
  FallbackDebugError,
  GeneratedBriefingPack,
  HotspotItem,
  PollutantSummary,
  ReadingLevel,
} from '../types/airQuality';
import { LANG_LABELS } from './constants';

export const FALLBACK_UNAVAILABLE_MESSAGE =
  'Live AI generation is temporarily unavailable. Showing a locally generated Demo / Template Briefing based on validated dataset metrics.';

export const FALLBACK_BANNER_LABEL = 'DEMO / TEMPLATE BRIEFING — NOT LIVE AI GENERATED';

export function sanitizeDebugError(err?: Partial<FallbackDebugError> | null): FallbackDebugError {
  const rawMessage = err?.message || 'Live Gemini generation failed.';
  const sanitizedMessage = rawMessage
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED_KEY]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');

  return {
    code: err?.code || 'GEMINI_UNAVAILABLE',
    message: sanitizedMessage.slice(0, 320),
    ...(typeof err?.statusCode === 'number' ? { statusCode: err.statusCode } : {}),
  };
}

function formatTrendLabel(direction: PollutantSummary['trend']['direction'], lang: BriefingLanguage): string {
  const labels: Record<BriefingLanguage, Record<PollutantSummary['trend']['direction'], string>> = {
    en: {
      rising: 'rising',
      falling: 'falling',
      stable: 'stable',
      insufficient_data: 'insufficient data for trend',
    },
    hi: {
      rising: 'बढ़ता हुआ (rising)',
      falling: 'घटता हुआ (falling)',
      stable: 'स्थिर (stable)',
      insufficient_data: 'रुझान के लिए अपर्याप्त डेटा',
    },
    mr: {
      rising: 'वाढता कल (rising)',
      falling: 'घटता कल (falling)',
      stable: 'स्थिर (stable)',
      insufficient_data: 'कलासाठी अपुरा डेटा',
    },
  };
  return labels[lang][direction];
}

function formatReliabilityLabel(status: AnalysisResult['overallReliability'], lang: BriefingLanguage): string {
  const map: Record<BriefingLanguage, Record<AnalysisResult['overallReliability'], string>> = {
    en: { reliable: 'Reliable', caution: 'Caution / Partial', insufficient: 'Insufficient' },
    hi: { reliable: 'विश्वसनीय', caution: 'सावधानी / आंशिक', insufficient: 'अप्रयाप्त (अपूर्ण)' },
    mr: { reliable: 'विश्वासार्ह', caution: 'सावधानता / आंशिक', insufficient: 'अपुरा डेटा' },
  };
  return map[lang][status];
}

function buildPollutantFactLine(
  p: PollutantSummary,
  lang: BriefingLanguage,
  level: ReadingLevel
): string {
  const peakText = p.observedPeak
    ? `${p.observedPeak.value} ${p.observedPeak.unit} (${p.observedPeak.location}, #${p.observedPeak.rowIndex}, ${p.observedPeak.timestampRaw})`
    : `${p.max} ${p.primaryUnit}`;

  const regText =
    p.thresholdUsed && p.regulatoryWindowTotalCount > 0 && p.regulatoryWindowExceedanceCount !== null
      ? lang === 'hi'
        ? `${p.regulatoryWindowTotalCount} में से ${p.regulatoryWindowExceedanceCount} मान्य ${p.thresholdUsed.averagingHours}h औसत ${p.thresholdUsed.referenceLabel} से अधिक`
        : lang === 'mr'
        ? `${p.regulatoryWindowTotalCount} पैकी ${p.regulatoryWindowExceedanceCount} वैध ${p.thresholdUsed.averagingHours}h सरासरी ${p.thresholdUsed.referenceLabel} पेक्षा जास्त`
        : `${p.regulatoryWindowExceedanceCount}/${p.regulatoryWindowTotalCount} valid ${p.thresholdUsed.averagingHours}h windows exceeded ${p.thresholdUsed.referenceLabel}`
      : lang === 'hi'
      ? `प्रारंभिक (केवल अवलोकित मान; 24h मानक तुलना समर्थित नहीं)`
      : lang === 'mr'
      ? `प्राथमिक (केवळ नोंदवलेले मान; 24h मानक तुलना समर्थित नाही)`
      : `Preliminary (observed values only; 24h/8h regulatory exceedance not determinable)`;

  if (level === 'simple') {
    if (lang === 'hi') {
      return `${p.pollutant}: औसत ${p.mean} ${p.primaryUnit}, अधिकतम अवलोकित ${peakText} (${p.totalCount} मान्य रीडिंग) — ${regText}.`;
    }
    if (lang === 'mr') {
      return `${p.pollutant}: सरासरी ${p.mean} ${p.primaryUnit}, कमाल नोंदवलेले ${peakText} (${p.totalCount} वैध नोंदी) — ${regText}.`;
    }
    return `${p.pollutant}: observed mean ${p.mean} ${p.primaryUnit}, observed peak ${peakText} (${p.totalCount} valid readings) — ${regText}.`;
  }

  const trendExtra =
    p.trend.direction !== 'insufficient_data' && p.trend.deltaPct !== null
      ? `, trend ${formatTrendLabel(p.trend.direction, lang)} (${p.trend.deltaPct > 0 ? '+' : ''}${p.trend.deltaPct}%)`
      : `, ${formatTrendLabel(p.trend.direction, lang)}`;

  if (lang === 'hi') {
    return `${p.pollutant} (${p.primaryUnit}): n=${p.totalCount}, अवधि ${p.spanHours}h, औसत ${p.mean}, माध्यिका ${p.median}, P90 ${p.p90}, न्यूनतम ${p.min}, अधिकतम अवलोकित ${peakText}${trendExtra}. विनियामक स्थिति: ${regText}.`;
  }
  if (lang === 'mr') {
    return `${p.pollutant} (${p.primaryUnit}): n=${p.totalCount}, कालावधी ${p.spanHours}h, सरासरी ${p.mean}, मध्यगा ${p.median}, P90 ${p.p90}, किमान ${p.min}, कमाल नोंदवलेले ${peakText}${trendExtra}. नियामक स्थिती: ${regText}.`;
  }
  return `${p.pollutant} (${p.primaryUnit}): n=${p.totalCount}, span ${p.spanHours}h, mean ${p.mean}, median ${p.median}, P90 ${p.p90}, min ${p.min}, observed peak ${peakText}${trendExtra}. Regulatory check: ${regText}.`;
}

function buildCaveatsList(analysis: AnalysisResult, lang: BriefingLanguage): string[] {
  const caveats: string[] = [];
  const q = analysis.qualityReport;

  if (analysis.isPreliminary) {
    if (lang === 'hi') {
      caveats.push(
        `प्रारंभिक आकलन: इस डेटासेट में पर्याप्त सतत 24-घंटे/8-घंटे विंडो नहीं हैं; अवलोकित शिखर को विनियामक उल्लंघन न मानें। (${analysis.preliminarySummaryNote})`
      );
    } else if (lang === 'mr') {
      caveats.push(
        `प्राथमिक मूल्यांकन: या डेटामध्ये पुरेसा सलग 24-तास/8-तास कालावधी नाही; कमाल नोंदीला नियामक उल्लंघन मानू नये. (${analysis.preliminarySummaryNote})`
      );
    } else {
      caveats.push(analysis.preliminarySummaryNote);
    }
  }

  if (q.flaggedRowsCount > 0) {
    if (lang === 'hi') {
      caveats.push(
        `${q.totalRows} में से ${q.flaggedRowsCount} पंक्तियाँ डेटा गुणवत्ता जाँच में चिह्नित हुईं (पूर्णता: ${q.completenessPct}%, डुप्लिकेट: ${q.duplicateCount}, अमान्य मान: ${q.invalidValueCount}).`
      );
    } else if (lang === 'mr') {
      caveats.push(
        `${q.totalRows} पैकी ${q.flaggedRowsCount} नोंदी डेटा तपासणीत वेगळ्या केल्या आहेत (पूर्णता: ${q.completenessPct}%, डुप्लिकेट: ${q.duplicateCount}, अवैध मूल्ये: ${q.invalidValueCount}).`
      );
    } else {
      caveats.push(
        `${q.flaggedRowsCount} of ${q.totalRows} rows were flagged during quality validation (completeness: ${q.completenessPct}%, duplicates: ${q.duplicateCount}, invalid values: ${q.invalidValueCount}).`
      );
    }
  }

  for (const p of analysis.pollutantSummaries) {
    if (p.unitWarning) {
      caveats.push(p.unitWarning);
    }
    if (p.trend.direction === 'insufficient_data') {
      if (lang === 'hi') {
        caveats.push(`${p.pollutant} रुझान अपर्याप्त डेटा के कारण अनिर्धारित है (${p.trend.note}).`);
      } else if (lang === 'mr') {
        caveats.push(`${p.pollutant} कल अपुऱ्या डेटामुळे निश्चित करता येत नाही (${p.trend.note}).`);
      } else {
        caveats.push(`${p.pollutant} trend is undetermined: ${p.trend.note}`);
      }
    }
  }

  if (caveats.length === 0) {
    if (lang === 'hi') {
      caveats.push(
        `डेटा पूर्णता ${q.completenessPct}% (${q.validRows} मान्य रीडिंग); स्थानीय स्थल जाँच के बाद ही प्रवर्तन कार्रवाई करें।`
      );
    } else if (lang === 'mr') {
      caveats.push(
        `डेटा पूर्णता ${q.completenessPct}% (${q.validRows} वैध नोंदी); प्रत्यक्ष पाहणी करूनच पुढील कारवाई करावी.`
      );
    } else {
      caveats.push(
        `Dataset completeness is ${q.completenessPct}% across ${q.validRows} valid readings; confirm local site conditions before field enforcement.`
      );
    }
  }

  return caveats;
}

function formatHotspotEvidence(h: HotspotItem): string {
  const regPart =
    h.validWindowCount > 0 && h.validWindowExceedances !== null
      ? `; ${h.validWindowExceedances}/${h.validWindowCount} valid windows > standard`
      : '; preliminary (no 24h/8h regulatory exceedance claimed)';
  return `${h.pollutant}: mean ${h.mean} ${h.unit}, observed peak ${h.max} ${h.unit} (Row #${h.observedPeakRowIndex}, ${h.observedPeakTimestamp}), n=${h.count}, ${h.pctAboveWardMean >= 0 ? '+' : ''}${h.pctAboveWardMean}% vs ward mean${regPart}`;
}

export function buildDemoFallbackBriefingPack(
  analysis: AnalysisResult,
  language: BriefingLanguage,
  readingLevel: ReadingLevel,
  rawDebugError?: Partial<FallbackDebugError> | null
): GeneratedBriefingPack {
  const q = analysis.qualityReport;
  const primary =
    analysis.pollutantSummaries.find((p) => p.pollutant === 'PM2.5') ??
    analysis.pollutantSummaries[0];
  const hotspots = primary?.hotspots ?? [];
  const topHotspot = hotspots[0] ?? null;

  const prelimTag =
    analysis.isPreliminary || analysis.overallReliability !== 'reliable'
      ? language === 'hi'
        ? '[प्रारंभिक] '
        : language === 'mr'
        ? '[प्राथमिक] '
        : '[PRELIMINARY] '
      : '';

  const measuredFacts: string[] = [
    language === 'hi'
      ? `डेटासेट: ${analysis.datasetName} (${analysis.periodLabel}) — ${q.totalRows} में से ${q.validRows} मान्य रीडिंग (${q.completenessPct}% पूर्णता, ${q.flaggedRowsCount} चिह्नित), ${q.stations.length} स्टेशन, अवधि ${q.timeSpanHours ?? 0}h.`
      : language === 'mr'
      ? `डेटासेट: ${analysis.datasetName} (${analysis.periodLabel}) — ${q.totalRows} पैकी ${q.validRows} वैध नोंदी (${q.completenessPct}% पूर्णता, ${q.flaggedRowsCount} चिन्हांकित), ${q.stations.length} केंद्रे, कालावधी ${q.timeSpanHours ?? 0}h.`
      : `Dataset: ${analysis.datasetName} (${analysis.periodLabel}) — ${q.validRows} valid readings of ${q.totalRows} rows (${q.completenessPct}% completeness, ${q.flaggedRowsCount} flagged) across ${q.stations.length} stations over ${q.timeSpanHours ?? 0}h.`,
    ...analysis.pollutantSummaries.map((p) => buildPollutantFactLine(p, language, readingLevel)),
  ];

  if (topHotspot) {
    measuredFacts.push(
      language === 'hi'
        ? `शीर्ष औसत स्टेशन (#1): ${topHotspot.location} — ${topHotspot.pollutant} औसत ${topHotspot.mean} ${topHotspot.unit}, अवलोकित शिखर ${topHotspot.max} ${topHotspot.unit} (पंक्ति #${topHotspot.observedPeakRowIndex}, ${topHotspot.observedPeakTimestamp}, वार्ड औसत से ${topHotspot.pctAboveWardMean >= 0 ? '+' : ''}${topHotspot.pctAboveWardMean}%).`
        : language === 'mr'
        ? `सर्वाधिक सरासरी केंद्र (#1): ${topHotspot.location} — ${topHotspot.pollutant} सरासरी ${topHotspot.mean} ${topHotspot.unit}, कमाल नोंद ${topHotspot.max} ${topHotspot.unit} (ओळ #${topHotspot.observedPeakRowIndex}, ${topHotspot.observedPeakTimestamp}, वॉर्ड सरासरीपेक्षा ${topHotspot.pctAboveWardMean >= 0 ? '+' : ''}${topHotspot.pctAboveWardMean}%).`
        : `Highest observed station mean (#1): ${topHotspot.location} — ${topHotspot.pollutant} mean ${topHotspot.mean} ${topHotspot.unit}, observed peak ${topHotspot.max} ${topHotspot.unit} (Row #${topHotspot.observedPeakRowIndex}, ${topHotspot.observedPeakTimestamp}, ${topHotspot.pctAboveWardMean >= 0 ? '+' : ''}${topHotspot.pctAboveWardMean}% vs ward mean).`
    );
  }

  const caveats = buildCaveatsList(analysis, language);

  const aiInterpretations: string[] = [];
  if (primary) {
    if (topHotspot) {
      aiInterpretations.push(
        language === 'hi'
          ? `टेम्पलेट विश्लेषण (अवलोकित रैंकिंग पर आधारित): ${topHotspot.location} पर ${primary.pollutant} का औसत (${topHotspot.mean} ${topHotspot.unit}) वार्ड औसत (${primary.mean} ${primary.primaryUnit}) से अधिक है, इसलिए फील्ड निरीक्षण की प्राथमिकता यहाँ रखी जानी चाहिए।`
          : language === 'mr'
          ? `टेम्पलेट विश्लेषण (नोंदवलेल्या क्रमवारीवर आधारित): ${topHotspot.location} येथे ${primary.pollutant} सरासरी (${topHotspot.mean} ${topHotspot.unit}) वॉर्ड सरासरीपेक्षा (${primary.mean} ${primary.primaryUnit}) जास्त असल्याने येथे प्रत्यक्ष पाहणीस प्राधान्य द्यावे.`
          : `Template interpretation (based on ranked station means): ${topHotspot.location} recorded the highest ${primary.pollutant} mean (${topHotspot.mean} ${topHotspot.unit} vs ward mean ${primary.mean} ${primary.primaryUnit}), indicating a priority zone for local source inspection.`
      );
    }
    aiInterpretations.push(
      language === 'hi'
        ? `रुझान संदर्भ: ${primary.pollutant} की दिशा "${formatTrendLabel(primary.trend.direction, language)}" है (${primary.trend.sampleCount} नमूने, ${primary.trend.spanHours}h). किसी भी स्थानीय स्रोत निष्कर्ष की पुष्टि स्थल जाँच से करें।`
        : language === 'mr'
        ? `कल संदर्भ: ${primary.pollutant} चा कल "${formatTrendLabel(primary.trend.direction, language)}" आहे (${primary.trend.sampleCount} नमुने, ${primary.trend.spanHours}h). कोणत्याही स्रोताबाबतचा निष्कर्ष प्रत्यक्ष तपासणीनेच निश्चित करावा.`
        : `Trend context: ${primary.pollutant} shows "${formatTrendLabel(primary.trend.direction, language)}" across ${primary.trend.sampleCount} samples over ${primary.trend.spanHours}h; field verification is required before attributing emission sources.`
    );
    if (analysis.isPreliminary || analysis.overallReliability !== 'reliable') {
      aiInterpretations.push(
        language === 'hi'
          ? `डेटा विश्वसनीयता स्थिति "${formatReliabilityLabel(analysis.overallReliability, language)}" है; इसे प्रारंभिक मार्गदर्शन मानें और सतत 24-घंटे मॉनिटरिंग जारी रखें।`
          : language === 'mr'
          ? `डेटा विश्वासार्हता स्थिती "${formatReliabilityLabel(analysis.overallReliability, language)}" आहे; हे प्राथमिक मार्गदर्शन मानून सलग 24-तास निरीक्षण सुरू ठेवावे.`
          : `Because data reliability is "${formatReliabilityLabel(analysis.overallReliability, language)}", treat these patterns as preliminary operational guidance rather than formal compliance determination.`
      );
    }
  }

  const hotspotPriorities =
    hotspots.length > 0
      ? hotspots.slice(0, 5).map((h) => ({
          location: h.location,
          priorityLevel:
            h.rank === 1
              ? language === 'hi'
                ? 'उच्च (रैंक #1)'
                : language === 'mr'
                ? 'उच्च (क्रम #1)'
                : 'High (Rank #1)'
              : h.pctAboveWardMean > 0
              ? language === 'hi'
                ? `मध्यम (रैंक #${h.rank})`
                : language === 'mr'
                ? `मध्यम (क्रम #${h.rank})`
                : `Elevated (Rank #${h.rank})`
              : language === 'hi'
              ? `निगरानी (रैंक #${h.rank})`
              : language === 'mr'
              ? `निरीक्षण (क्रम #${h.rank})`
              : `Monitor (Rank #${h.rank})`,
          action:
            language === 'hi'
              ? `${h.location} के आसपास धूल नियंत्रण, खुले कचरे के जलने और निर्माण स्थल कवरिंग की जाँच करें।`
              : language === 'mr'
              ? `${h.location} परिसरात धूळ नियंत्रण, कचरा जाळणे आणि बांधकाम साहित्य झाकले आहे का याची तपासणी करा.`
              : `Conduct visual field inspection near ${h.location} for road dust, uncovered construction material, or localized burning.`,
          evidence: formatHotspotEvidence(h),
        }))
      : [
          {
            location: q.stations[0] || analysis.periodLabel,
            priorityLevel: language === 'hi' ? 'प्रारंभिक' : language === 'mr' ? 'प्राथमिक' : 'Preliminary',
            action:
              language === 'hi'
                ? 'स्थानीय मॉनिटरिंग लॉग और सेंसर कैलिब्रेशन की समीक्षा करें।'
                : language === 'mr'
                ? 'स्थानिक मॉनिटरिंग नोंदी आणि सेन्सर तपासणी पूर्ण करा.'
                : 'Review station coverage and continue continuous hourly logging.',
            evidence: `${q.validRows} valid rows over ${q.timeSpanHours ?? 0}h`,
          },
        ];

  const primaryMetricRef = primary
    ? `${primary.pollutant} mean ${primary.mean} ${primary.primaryUnit}; observed peak ${primary.max} ${primary.primaryUnit} (n=${primary.totalCount})`
    : `${q.validRows} valid readings`;

  const recommendations = [
    {
      action:
        language === 'hi'
          ? topHotspot
            ? `${topHotspot.location} पर प्राथमिकता फील्ड जाँच और गीली सफाई (wet sweeping) सुनिश्चित करें`
            : 'मुख्य सड़कों पर गीली सफाई और धूल नियंत्रण की समीक्षा करें'
          : language === 'mr'
          ? topHotspot
            ? `${topHotspot.location} येथे प्राधान्याने प्रत्यक्ष पाहणी व ओल्या पद्धतीने धूळ साफसफाई करा`
            : 'प्रमुख रस्त्यांवर धूळ नियंत्रण व ओल्या साफसफाईची पाहणी करा'
          : topHotspot
          ? `Prioritize field inspection and wet dust-suppression checks around ${topHotspot.location}`
          : 'Verify street sweeping and construction dust controls across covered stations',
      rationale:
        language === 'hi'
          ? 'अवलोकित उच्चतम स्टेशन औसत के आधार पर त्वरित निवारक कदम स्थानीय धूल स्रोतों को कम करने में मदद करते हैं।'
          : language === 'mr'
          ? 'नोंदवलेल्या सर्वाधिक सरासरी केंद्राभोवतीची पाहणी स्थानिक धूळ स्रोत कमी करण्यास मदत करते.'
          : 'Targeting field inspections to the highest-mean station focuses civic resources using verified measurements.',
      linkedMetric: topHotspot ? formatHotspotEvidence(topHotspot) : primaryMetricRef,
    },
    {
      action:
        language === 'hi'
          ? 'निरीक्षण डेटा की कमियों को पूरा करने के लिए सतत 24-घंटे लॉगिंग सत्यापित करें'
          : language === 'mr'
          ? 'डेटातील अंतर भरून काढण्यासाठी सलग 24-तास नोंदी सुनिश्चित करा'
          : 'Maintain continuous hourly telemetry across all ward stations to enable 24-hour window checks',
      rationale:
        language === 'hi'
          ? `वर्तमान डेटा पूर्णता ${q.completenessPct}% (${q.flaggedRowsCount} चिह्नित पंक्तियाँ) है; सतत रीडिंग से सटीक 24h तुलना संभव होती है।`
          : language === 'mr'
          ? `सध्याची डेटा पूर्णता ${q.completenessPct}% (${q.flaggedRowsCount} चिन्हांकित नोंदी) आहे; सलग नोंदींमुळे अचूक 24h तुलना शक्य होते.`
          : `Current completeness is ${q.completenessPct}% with ${q.flaggedRowsCount} flagged rows; continuous hourly coverage supports verified 24h regulatory averages.`,
      linkedMetric: `${q.validRows}/${q.totalRows} valid rows, span ${q.timeSpanHours ?? 0}h`,
    },
  ];

  const wardTitle =
    language === 'hi'
      ? `${prelimTag}वार्ड अधिकारी वायु गुणवत्ता ब्रीफिंग — ${analysis.periodLabel}`
      : language === 'mr'
      ? `${prelimTag}वॉर्ड अधिकारी हवा गुणवत्ता ब्रीफिंग — ${analysis.periodLabel}`
      : `${prelimTag}Civic Air Quality Briefing — ${analysis.periodLabel}`;

  const executiveSummary =
    language === 'hi'
      ? `${analysis.periodLabel} (${analysis.datasetName}) के लिए ${q.validRows}/${q.totalRows} मान्य रीडिंग (पूर्णता ${q.completenessPct}%) का विश्लेषण किया गया। ${
          primary
            ? `${primary.pollutant} का औसत ${primary.mean} ${primary.primaryUnit} और अधिकतम अवलोकित मान ${primary.max} ${primary.primaryUnit} दर्ज हुआ।`
            : ''
        } ${
          topHotspot
            ? `${topHotspot.location} में सर्वाधिक औसत (${topHotspot.mean} ${topHotspot.unit}) रहा।`
            : ''
        } डेटा स्थिति: ${formatReliabilityLabel(analysis.overallReliability, language)}.`
      : language === 'mr'
      ? `${analysis.periodLabel} (${analysis.datasetName}) साठी ${q.validRows}/${q.totalRows} वैध नोंदी (पूर्णता ${q.completenessPct}%) तपासल्या गेल्या. ${
          primary
            ? `${primary.pollutant} ची सरासरी ${primary.mean} ${primary.primaryUnit} आणि कमाल नोंदवलेले मूल्य ${primary.max} ${primary.primaryUnit} आहे.`
            : ''
        } ${
          topHotspot
            ? `${topHotspot.location} येथे सर्वाधिक सरासरी (${topHotspot.mean} ${topHotspot.unit}) आढळली.`
            : ''
        } डेटा स्थिती: ${formatReliabilityLabel(analysis.overallReliability, language)}.`
      : `Validated analysis of ${analysis.periodLabel} (${analysis.datasetName}) covers ${q.validRows} valid readings of ${q.totalRows} rows (${q.completenessPct}% completeness) across ${q.stations.length} stations. ${
          primary
            ? `${primary.pollutant} observed mean is ${primary.mean} ${primary.primaryUnit} with an observed peak of ${primary.max} ${primary.primaryUnit}. `
            : ''
        }${
          topHotspot
            ? `${topHotspot.location} recorded the highest station mean (${topHotspot.mean} ${topHotspot.unit}). `
            : ''
        }Data reliability status: ${formatReliabilityLabel(analysis.overallReliability, language)}.`;

  const demoTagLine = `[${FALLBACK_BANNER_LABEL}]`;

  const housingSummary =
    language === 'hi'
      ? `${analysis.periodLabel} की मान्य रीडिंग (${q.validRows} मान्य रिकॉर्ड) के आधार पर सोसायटी निवासियों के लिए व्यावहारिक सावधानियाँ। ${
          primary ? `${primary.pollutant} औसत ${primary.mean} ${primary.primaryUnit}, अवलोकित शिखर ${primary.max} ${primary.primaryUnit}।` : ''
        }`
      : language === 'mr'
      ? `${analysis.periodLabel} मधील वैध नोंदींवर (${q.validRows} वैध नोंदी) आधारित गृहनिर्माण सोसायट्यांसाठी व्यावहारिक सूचना. ${
          primary ? `${primary.pollutant} सरासरी ${primary.mean} ${primary.primaryUnit}, कमाल नोंद ${primary.max} ${primary.primaryUnit}.` : ''
        }`
      : `Practical resident guidance for ${analysis.periodLabel} grounded in ${q.validRows} validated readings. ${
          primary
            ? `Observed ${primary.pollutant} mean is ${primary.mean} ${primary.primaryUnit} (observed peak ${primary.max} ${primary.primaryUnit}).`
            : ''
        }`;

  const residentNoticeDraft =
    language === 'hi'
      ? `${demoTagLine}\nनिवासी सूचना — ${analysis.periodLabel}\nमान्य डेटा (${q.validRows} रीडिंग${
          primary ? `, ${primary.pollutant} औसत ${primary.mean} ${primary.primaryUnit}, शिखर ${primary.max} ${primary.primaryUnit}` : ''
        }) के आधार पर:\n1. परिसर में सूखी झाड़ू के बजाय गीली पोंछा/सफाई अपनाएँ और कचरा या सूखे पत्ते न जलाएँ।\n2. निर्माण या मरम्मत सामग्री को ढककर रखें और धूल उड़ने पर पानी का छिड़काव करें।\n3. संवेदनशील निवासी और बुजुर्ग अधिक धूल/धुएँ के समय खिड़कियाँ बंद रखें और बाहर भारी व्यायाम सीमित करें।\n(${analysis.isPreliminary ? 'नोट: यह प्रारंभिक डेटा सारांश है, 24h विनियामक मानक निर्णय नहीं।' : 'सत्यापित वार्ड डेटा सारांश।'})`
      : language === 'mr'
      ? `${demoTagLine}\nरहिवासी सूचना — ${analysis.periodLabel}\nवैध नोंदींवर (${q.validRows} नोंदी${
          primary ? `, ${primary.pollutant} सरासरी ${primary.mean} ${primary.primaryUnit}, कमाल ${primary.max} ${primary.primaryUnit}` : ''
        }) आधारित:\n1. आवारात कोरड्या झाडण्याऐवजी ओल्या स्वच्छतेचा वापर करा आणि पालापाचोळा किंवा कचरा जाळू नका.\n2. बांधकाम व दुरुस्तीचे साहित्य झाकून ठेवा आणि धूळ उडताना पाण्याची फवारणी करा.\n3. ज्येष्ठ नागरिक व संवेदनशील व्यक्तींनी धूर/धूळ जास्त असताना खिडक्या बंद ठेवाव्यात आणि बाहेरचे जड श्रम टाळावेत.\n(${analysis.isPreliminary ? 'टीप: हा प्राथमिक डेटा सारांश आहे, 24h नियामक उल्लंघन निष्कर्ष नाही.' : 'पडताळलेला वॉर्ड डेटा सारांश.'})`
      : `${demoTagLine}\nResident Notice — ${analysis.periodLabel}\nBased on ${q.validRows} validated readings${
          primary ? ` (${primary.pollutant} observed mean ${primary.mean} ${primary.primaryUnit}, observed peak ${primary.max} ${primary.primaryUnit})` : ''
        }:\n1. Use wet mopping/sweeping in common courtyards and strictly avoid burning garden waste or trash.\n2. Keep repair or construction materials covered and dampened to prevent dust dispersion.\n3. Children, older adults, and sensitive residents should limit strenuous outdoor activity during visible dust or peak traffic hours.\n(${analysis.isPreliminary ? 'Note: Preliminary assessment based on available samples; not a 24h regulatory exceedance claim.' : 'Verified monitoring summary.'})`;

  const parentMessageDraft =
    language === 'hi'
      ? `${demoTagLine}\nअभिभावक सूचना — ${analysis.periodLabel}\nस्कूल परिसर के आसपास ${q.validRows} मान्य वायु-गुणवत्ता रीडिंग${
          primary ? ` (${primary.pollutant} औसत ${primary.mean} ${primary.primaryUnit}, अवलोकित शिखर ${primary.max} ${primary.primaryUnit})` : ''
        } के आधार पर स्कूल बाहरी गतिविधियों को मध्यम रख रहा है। अस्थमा या श्वसन संवेदनशीलता वाले विद्यार्थियों के साथ निर्धारित रिलीवर इनहेलर और चिकित्सक की कार्य-योजना अवश्य भेजें।`
      : language === 'mr'
      ? `${demoTagLine}\nपालक सूचना — ${analysis.periodLabel}\nशाळा परिसरातील ${q.validRows} वैध हवा गुणवत्ता नोंदींनुसार${
          primary ? ` (${primary.pollutant} सरासरी ${primary.mean} ${primary.primaryUnit}, कमाल नोंद ${primary.max} ${primary.primaryUnit})` : ''
        } मैदानी खेळ व उपक्रम नियंत्रित ठेवले जात आहेत. दमा किंवा श्वसन संवेदनशीलता असलेल्या विद्यार्थ्यांसोबत डॉक्टरांनी दिलेला इनहेलर व आवश्यक सूचना शाळेत पाठवाव्यात.`
      : `${demoTagLine}\nParent Circular — ${analysis.periodLabel}\nBased on ${q.validRows} validated local readings${
          primary ? ` (${primary.pollutant} observed mean ${primary.mean} ${primary.primaryUnit}, observed peak ${primary.max} ${primary.primaryUnit})` : ''
        }, the school is moderating vigorous outdoor sports during dusty/peak periods and monitoring indoor classroom air. Please ensure students with asthma carry their prescribed reliever inhaler and updated medical action plan.`;

  const primaryEvidence = primary
    ? `${primary.pollutant}: mean ${primary.mean} ${primary.primaryUnit}, observed peak ${primary.max} ${primary.primaryUnit}${
        primary.observedPeak ? ` at ${primary.observedPeak.location} (Row #${primary.observedPeak.rowIndex})` : ''
      }, n=${primary.totalCount}`
    : `${q.validRows} valid readings`;

  return {
    source: 'demo_template',
    fallbackNotice: FALLBACK_UNAVAILABLE_MESSAGE,
    ...(rawDebugError ? { fallbackDebugError: sanitizeDebugError(rawDebugError) } : {}),
    language,
    readingLevel,
    generatedAtIso: new Date().toISOString(),
    modelUsed: 'deterministic-demo-template',
    groundingAudit: {
      datasetPeriod: analysis.periodLabel,
      totalValidReadings: q.validRows,
      reliabilityStatus: analysis.overallReliability,
      verifiedMetricsCited: measuredFacts.slice(0, 5),
    },
    wardOfficerBriefing: {
      title: wardTitle,
      executiveSummary,
      measuredFacts,
      aiInterpretations,
      hotspotPriorities,
      recommendations,
      dataCaveats: caveats,
    },
    housingSocietyAdvisory: {
      title:
        language === 'hi'
          ? `${prelimTag}हाउसिंग सोसायटी और RWA सलाह — ${analysis.periodLabel}`
          : language === 'mr'
          ? `${prelimTag}गृहनिर्माण सोसायटी व RWA मार्गदर्शन — ${analysis.periodLabel}`
          : `${prelimTag}Housing Society & RWA Advisory — ${analysis.periodLabel}`,
      summary: housingSummary,
      measuredFacts: measuredFacts.slice(0, readingLevel === 'simple' ? 2 : 4),
      practicalActions: [
        {
          action:
            language === 'hi'
              ? 'कॉमन एरिया और पार्किंग में सूखी झाड़ू बंद कर गीली सफाई करें'
              : language === 'mr'
              ? 'आवार व पार्किंगमध्ये कोरड्या झाडण्याऐवजी ओल्या पद्धतीने स्वच्छता करा'
              : 'Replace dry sweeping with damp sweeping or wet mopping in driveways and courtyards',
          timingOrCondition:
            language === 'hi'
              ? 'सुबह और शाम के व्यस्त समय में'
              : language === 'mr'
              ? 'सकाळ व संध्याकाळच्या वर्दळीच्या वेळेत'
              : 'During morning and evening peak hours',
          whyItHelps:
            language === 'hi'
              ? 'जमी हुई धूल को फिर से हवा में उड़ने से रोकता है।'
              : language === 'mr'
              ? 'जमिनीवरील धूळ पुन्हा हवेत उडणे थांबवते.'
              : 'Prevents settled particulate dust from re-suspending near ground-level entrances.',
        },
        {
          action:
            language === 'hi'
              ? 'कचरा/सूखे पत्ते जलाने पर रोक और निर्माण सामग्री को ढकना अनिवार्य करें'
              : language === 'mr'
              ? 'कचरा व पालापाचोळा जाळण्यास मनाई करा आणि बांधकाम साहित्य झाकून ठेवा'
              : 'Enforce zero waste burning and cover sand, cement, or repair debris',
          timingOrCondition:
            language === 'hi'
              ? 'सोसायटी रखरखाव और बागवानी कार्य के दौरान'
              : language === 'mr'
              ? 'सोसायटी देखभाल व बागकामादरम्यान'
              : 'Across all society maintenance and gardening work',
          whyItHelps:
            language === 'hi'
              ? 'स्थानीय धुएँ और कण प्रदूषण के अचानक बढ़ने को कम करता है।'
              : language === 'mr'
              ? 'स्थानिक धूर व धूलिकण अचानक वाढणे कमी करते.'
              : 'Eliminates avoidable local combustion smoke and fugitive dust.',
        },
        {
          action:
            language === 'hi'
              ? 'सड़क की ओर की खिड़कियों और वेंटिलेशन का समय समायोजित करें'
              : language === 'mr'
              ? 'रस्त्याकडील खिडक्या व वायुवीजनाची वेळ परिस्थितीनुसार ठरवा'
              : 'Schedule cross-ventilation away from peak traffic hours and wipe indoor surfaces damply',
          timingOrCondition:
            language === 'hi'
              ? 'जब दृश्य धुंध या यातायात अधिक हो'
              : language === 'mr'
              ? 'जेव्हा वाहतूक किंवा धूळ जास्त असेल तेव्हा'
              : 'When visible haze or traffic emissions are elevated',
          whyItHelps:
            language === 'hi'
              ? 'घरों के भीतर बाहरी धूल के प्रवेश को कम करता है।'
              : language === 'mr'
              ? 'घरामध्ये बाहेरील धूळ आणि धूर येणे कमी होते.'
              : 'Reduces indoor infiltration of roadside particulate pollution.',
        },
      ],
      residentNoticeDraft,
      caveats,
    },
    schoolAdvisory: {
      title:
        language === 'hi'
          ? `${prelimTag}स्कूल स्वास्थ्य-सचेत सलाह — ${analysis.periodLabel}`
          : language === 'mr'
          ? `${prelimTag}शाळा आरोग्य-दक्ष मार्गदर्शन — ${analysis.periodLabel}`
          : `${prelimTag}School Health-Conscious Advisory — ${analysis.periodLabel}`,
      summary:
        language === 'hi'
          ? `${analysis.periodLabel} के मान्य आंकड़ों (${q.validRows} रीडिंग) के अनुसार विद्यार्थियों के लिए सावधानीपूर्ण कक्षा एवं बाहरी गतिविधि मार्गदर्शन।`
          : language === 'mr'
          ? `${analysis.periodLabel} मधील वैध नोंदींनुसार (${q.validRows} नोंदी) विद्यार्थ्यांसाठी वर्ग आणि मैदानी उपक्रमांचे सावधगिरीचे मार्गदर्शन.`
          : `Precautionary classroom and outdoor activity guidance for ${analysis.periodLabel} grounded in ${q.validRows} validated readings.`,
      measuredFacts: measuredFacts.slice(0, readingLevel === 'simple' ? 2 : 4),
      outdoorActivityGuidance:
        language === 'hi'
          ? `अवलोकित रीडिंग (${primaryMetricRef}) को देखते हुए, भारी दौड़-भाग वाले बाहरी खेलों की तीव्रता कम रखें या इन्हें इनडोर हॉल में आयोजित करें—विशेषकर मुख्य सड़क के पास या जब दृश्य धूल अधिक हो।`
          : language === 'mr'
          ? `नोंदवलेल्या आकडेवारीनुसार (${primaryMetricRef}), तीव्र मैदानी खेळ व कवायत कमी ठेवावी किंवा बंद सभागृहात घ्यावी—विशेषतः मुख्य रस्त्याजवळ किंवा धूळ जास्त असताना.`
          : `Given observed readings (${primaryMetricRef}), moderate vigorous outdoor sports and shift prolonged physical drills indoors when visible dust or roadside traffic emissions are elevated.`,
      classroomPrecautions: [
        language === 'hi'
          ? 'कक्षाओं की सफाई सूखी झाड़ू के बजाय गीले पोंछे से कराएँ।'
          : language === 'mr'
          ? 'वर्गांची स्वच्छता कोरड्या झाडण्याऐवजी ओल्या फडक्याने करा.'
          : 'Clean classrooms with damp mops and wet dusters rather than dry brooms.',
        language === 'hi'
          ? 'स्कूल बस पार्किंग क्षेत्र में वाहनों के इंजन निष्क्रिय (idling) न चलने दें।'
          : language === 'mr'
          ? 'शाळेच्या बस व वाहनांचे इंजिन पार्किंगमध्ये विनाकारण सुरू ठेवू नका.'
          : 'Enforce no-idling rules for school buses and parent pick-up vehicles near gates.',
        language === 'hi'
          ? 'सड़क की ओर की खिड़कियाँ व्यस्त यातायात समय में बंद रखें और शांत समय में वेंटिलेशन करें।'
          : language === 'mr'
          ? 'वर्दळीच्या वेळी रस्त्याकडील खिडक्या बंद ठेवा आणि शांत वेळेत वायुवीजन करा.'
          : 'Keep roadside windows closed during peak commute periods and ventilate during quieter hours.',
      ],
      sensitiveGroupNotes: [
        language === 'hi'
          ? 'अस्थमा या श्वसन संवेदनशीलता वाले छात्रों को बाहरी दौड़ से छूट और छायादार इनडोर विकल्प दें।'
          : language === 'mr'
          ? 'दमा किंवा श्वसन संवेदनशीलता असलेल्या विद्यार्थ्यांना तीव्र मैदानी उपक्रमातून सूट द्या.'
          : 'Allow students with asthma or respiratory sensitivity to skip strenuous outdoor drills without penalty.',
        language === 'hi'
          ? 'स्कूल नर्स/स्टाफ कक्ष में अभिभावक-स्वीकृत आपातकालीन संपर्क व निर्धारित इनहेलर प्रोटोकॉल तैयार रखें।'
          : language === 'mr'
          ? 'शाळेच्या आरोग्य कक्षात पालकांनी दिलेली औषध सूचना व आपत्कालीन संपर्क अद्ययावत ठेवा.'
          : 'Verify the school infirmary holds parent-approved asthma action plans and quick access to prescribed inhalers.',
      ],
      parentMessageDraft,
      caveats,
    },
    vulnerableGroupAdvisories: {
      children: {
        groupName:
          language === 'hi'
            ? 'बच्चे और स्कूली विद्यार्थी (Children)'
            : language === 'mr'
            ? 'लहान मुले आणि शालेय विद्यार्थी (Children)'
            : 'Children & School-Age Youth',
        riskSummary:
          language === 'hi'
            ? 'तेज सांस लेने की दर और बाहरी खेल समय के कारण बच्चों को धूल और धुएँ के संपर्क से बचाने के लिए एहतियात आवश्यक है।'
            : language === 'mr'
            ? 'जलद श्वसन दर आणि मैदानी खेळांमुळे मुलांना धूळ व धुरापासून वाचवण्यासाठी खबरदारी आवश्यक आहे.'
            : 'Because children breathe faster per body weight and spend active hours outdoors, moderating heavy exertion during elevated readings helps reduce exposure.',
        precautions: [
          language === 'hi'
            ? 'मुख्य सड़कों या निर्माण स्थलों के पास भारी बाहरी खेल सीमित रखें।'
            : language === 'mr'
            ? 'मुख्य रस्ते किंवा बांधकाम स्थळांजवळ तीव्र मैदानी खेळ मर्यादित ठेवा.'
            : 'Shift vigorous outdoor play indoors or away from busy roads when dust is elevated.',
          language === 'hi'
            ? 'बाहर से लौटने के बाद हाथ-मुँह साफ करें और पर्याप्त पानी पिएँ।'
            : language === 'mr'
            ? 'बाहेरून आल्यावर हात-तोंड स्वच्छ धुवा आणि पुरेसे पाणी प्या.'
            : 'Encourage hydration and washing face and hands after outdoor play.',
        ],
        whenToSeekCare:
          language === 'hi'
            ? 'यदि लगातार खांसी, घरघराहट (wheezing), या सांस फूलने की शिकायत दिखे तो तुरंत चिकित्सक से परामर्श लें।'
            : language === 'mr'
            ? 'सतत खोकला, श्वासात घरघर किंवा दम लागल्यास तात्काळ डॉक्टरांचा सल्ला घ्या.'
            : 'Consult a qualified clinician promptly if persistent coughing, wheezing, or shortness of breath develops.',
        linkedEvidence: primaryEvidence,
      },
      olderAdults: {
        groupName:
          language === 'hi'
            ? 'वरिष्ठ नागरिक (Older Adults)'
            : language === 'mr'
            ? 'ज्येष्ठ नागरिक (Older Adults)'
            : 'Older Adults (60+)',
        riskSummary:
          language === 'hi'
            ? 'अवलोकित कण व गैस स्तरों को देखते हुए सुबह की सैर का समय और मार्ग सुरक्षित चुनना उपयोगी है।'
            : language === 'mr'
            ? 'नोंदवलेल्या प्रदूषण पातळीनुसार सकाळच्या चालण्याची वेळ व मार्ग सुरक्षित निवडणे उपयुक्त ठरते.'
            : 'Adjusting outdoor walking routes and times away from busy traffic corridors limits exposure during elevated periods.',
        precautions: [
          language === 'hi'
            ? 'व्यस्त यातायात मार्गों के बजाय पार्कों या घर के अंदर हल्का व्यायाम करें।'
            : language === 'mr'
            ? 'वर्दळीच्या रस्त्यांऐवजी बागेत किंवा घरातच हलका व्यायाम करा.'
            : 'Prefer indoor stretching or quieter green paths over roadside morning walks.',
          language === 'hi'
            ? 'नियमित निर्धारित दवाएँ समय पर जारी रखें और धूल भरी हवा में घर के अंदर रहें।'
            : language === 'mr'
            ? 'नियमित औषधे वेळेत घ्या आणि धूळ जास्त असताना घरातच थांबा.'
            : 'Continue prescribed medications on schedule and keep windows closed during dusty hours.',
        ],
        whenToSeekCare:
          language === 'hi'
            ? 'सांस लेने में कठिनाई, सीने में जकड़न या असामान्य थकान होने पर तुरंत चिकित्सा सहायता लें।'
            : language === 'mr'
            ? 'श्वास घेण्यास त्रास, छातीत जडपणा किंवा अचानक थकवा जाणवल्यास त्वरित वैद्यकीय मदत घ्या.'
            : 'Seek prompt medical care if shortness of breath, chest tightness, dizziness, or unusual fatigue occurs.',
        linkedEvidence: primaryEvidence,
      },
      sensitiveIndividuals: {
        groupName:
          language === 'hi'
            ? 'संवेदनशील समूह — अस्थमा, हृदय/श्वसन रोगी व बाहरी कर्मी'
            : language === 'mr'
            ? 'संवेदनशील व्यक्ती — दमा, श्वसन/हृदयरोग व मैदानी कामगार'
            : 'Sensitive Individuals (Asthma, COPD, Heart Conditions & Outdoor Workers)',
        riskSummary:
          language === 'hi'
            ? 'अवलोकित शिखर रीडिंग के समय श्वसन और हृदय संवेदनशील व्यक्तियों व बाहरी श्रमिकों को अतिरिक्त बचाव अपनाना चाहिए।'
            : language === 'mr'
            ? 'कमाल नोंदींच्या काळात श्वसन व हृदय संवेदनशील व्यक्ती तसेच मैदानी कामगारांनी अतिरिक्त काळजी घ्यावी.'
            : 'People managing respiratory or cardiovascular conditions and outdoor workers benefit from reduced dust exposure and scheduled rest breaks.',
        precautions: [
          language === 'hi'
            ? 'निर्धारित रिलीवर दवा/इनहेलर साथ रखें और धूल भरे कार्य क्षेत्रों में फिट-टेस्टेड N95/FFP2 मास्क का उपयोग करें।'
            : language === 'mr'
            ? 'डॉक्टरांनी दिलेला इनहेलर सोबत ठेवा आणि धूळ असलेल्या ठिकाणी योग्य बसणारा N95/FFP2 मास्क वापरा.'
            : 'Keep prescribed rescue medication within reach and use a well-fitted N95/FFP2 mask when outdoor dust cannot be avoided.',
          language === 'hi'
            ? 'प्रत्यक्ष धूल/धुएँ के स्रोतों के पास लंबे समय तक काम टालें और नियमित ब्रेक लें।'
            : language === 'mr'
            ? 'थेट धूळ किंवा धुराच्या स्रोताजवळ सलग काम टाळून नियमित विश्रांती घ्या.'
            : 'Rotate outdoor shifts away from roadside dust or combustion sources where feasible.',
        ],
        whenToSeekCare:
          language === 'hi'
            ? 'यदि नियमित इनहेलर से लक्षण कम न हों या सांस लेने में गंभीर दिक्कत हो तो तुरंत आपातकालीन चिकित्सा सहायता लें।'
            : language === 'mr'
            ? 'नियमित इनहेलरने आराम न मिळाल्यास किंवा श्वासोच्छ्वास कठीण झाल्यास तात्काळ वैद्यकीय मदत घ्या.'
            : 'Seek immediate medical attention if breathing symptoms worsen or fail to improve with prescribed medication.',
        linkedEvidence: primaryEvidence,
      },
    },
  };
}

export function formatWardBriefingCopyText(
  briefingPack: GeneratedBriefingPack,
  analysis: AnalysisResult
): string {
  const b = briefingPack.wardOfficerBriefing;
  const v = briefingPack.vulnerableGroupAdvisories;
  const lines: string[] = [];

  if (briefingPack.source === 'demo_template') {
    lines.push(FALLBACK_BANNER_LABEL);
    lines.push(briefingPack.fallbackNotice || FALLBACK_UNAVAILABLE_MESSAGE);
    lines.push('');
  }

  lines.push(
    b.title,
    `Period: ${analysis.periodLabel} | Language: ${LANG_LABELS[briefingPack.language]} | Level: ${briefingPack.readingLevel} | Source: ${briefingPack.source}`,
    '',
    'EXECUTIVE SUMMARY',
    b.executiveSummary,
    '',
    'MEASURED FACTS (VERIFIED TELEMETRY)',
    ...b.measuredFacts.map((m) => `- ${m}`),
    '',
    'INTERPRETATIONS (ANALYTICAL CONTEXT)',
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
    ...b.dataCaveats.map((c) => `- ${c}`)
  );

  return lines.join('\n');
}

export function formatVulnerableAdvisoriesCopyText(briefingPack: GeneratedBriefingPack): string {
  const v = briefingPack.vulnerableGroupAdvisories;
  const prefix =
    briefingPack.source === 'demo_template'
      ? `${FALLBACK_BANNER_LABEL}\n${briefingPack.fallbackNotice || FALLBACK_UNAVAILABLE_MESSAGE}\n\n`
      : '';

  const body = [v.children, v.olderAdults, v.sensitiveIndividuals]
    .map(
      (g) =>
        `${g.groupName}\nRisk: ${g.riskSummary}\nPrecautions:\n${g.precautions
          .map((p) => `- ${p}`)
          .join('\n')}\nSeek Care: ${g.whenToSeekCare}\nEvidence: ${g.linkedEvidence}`
    )
    .join('\n\n');

  return `${prefix}${body}`;
}
