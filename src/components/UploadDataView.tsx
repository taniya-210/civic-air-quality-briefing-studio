import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Play, Trash2, Upload } from 'lucide-react';
import { inferColumnMapping, parseTabularText } from '../lib/csvParser';
import { SAMPLE_DATASETS, type SampleDatasetSpec } from '../lib/sampleDatasets';
import type { ColumnMapping, RawParsedTable } from '../types/airQuality';

interface UploadDataViewProps {
  onAnalyze: (
    table: RawParsedTable,
    mapping: ColumnMapping,
    options: { periodLabel: string; datasetName: string }
  ) => void;
  initialSampleId?: string | null;
}

const REQUIRED_FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: 'location', label: 'Location / Station' },
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'pollutant', label: 'Pollutant' },
  { key: 'value', label: 'Numeric Value' },
  { key: 'unit', label: 'Unit' },
];

export function UploadDataView({ onAnalyze, initialSampleId }: UploadDataViewProps) {
  const [rawText, setRawText] = useState('');
  const [datasetName, setDatasetName] = useState('pasted_monitoring_data.csv');
  const [periodLabel, setPeriodLabel] = useState('Active Reporting Period');
  const [parsedTable, setParsedTable] = useState<RawParsedTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    pollutant: '',
    location: '',
    timestamp: '',
    value: '',
    unit: '',
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const pasteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runParsePreview = (text: string, name?: string) => {
    setParseError(null);
    if (!text.trim()) {
      setParsedTable(null);
      return;
    }
    try {
      const table = parseTabularText(text);
      setParsedTable(table);
      setMapping(inferColumnMapping(table.headers));
      if (name) setDatasetName(name);
    } catch (err) {
      setParsedTable(null);
      setParseError(err instanceof Error ? err.message : 'Unable to parse tabular data.');
    }
  };

  useEffect(() => {
    return () => {
      if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (initialSampleId) {
      const found = SAMPLE_DATASETS.find((s) => s.id === initialSampleId);
      if (found) {
        loadSample(found);
      }
    }
  }, [initialSampleId]);

  const loadSample = (sample: SampleDatasetSpec) => {
    setRawText(sample.csv);
    setDatasetName(sample.filename);
    setPeriodLabel(sample.periodLabel);
    runParsePreview(sample.csv, sample.filename);
  };

  const handleFile = async (file: File) => {
    setParseError(null);
    const maxBytes = 5 * 1024 * 1024;
    if (file.size === 0) {
      setParseError('Selected file is empty (0 bytes).');
      return;
    }
    if (file.size > maxBytes) {
      setParseError('File exceeds 5 MB limit. Please upload a smaller CSV or TSV export.');
      return;
    }
    const lowerName = file.name.toLowerCase();
    if (
      !lowerName.endsWith('.csv') &&
      !lowerName.endsWith('.tsv') &&
      !lowerName.endsWith('.txt')
    ) {
      setParseError('Unsupported file format. Upload a .csv, .tsv, or plain-text tabular file.');
      return;
    }
    try {
      const text = await file.text();
      if (text.includes('\u0000')) {
        setParseError('File appears to contain binary data. Upload plain UTF-8 CSV or TSV text.');
        return;
      }
      setRawText(text);
      setDatasetName(file.name);
      const cleanBase = file.name.replace(/\.(csv|tsv|txt)$/i, '').replace(/[_-]+/g, ' ');
      setPeriodLabel(cleanBase || 'Uploaded Reporting Period');
      runParsePreview(text, file.name);
    } catch {
      setParseError('Could not read the selected file.');
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handleClear = () => {
    setRawText('');
    setParsedTable(null);
    setParseError(null);
    setDatasetName('pasted_monitoring_data.csv');
    setPeriodLabel('Active Reporting Period');
  };

  const allMapped = Boolean(
    mapping.location &&
      mapping.timestamp &&
      mapping.pollutant &&
      mapping.value &&
      mapping.unit
  );

  const handleConfirmAnalyze = () => {
    if (!parsedTable) {
      setParseError('Load or paste valid tabular data first.');
      return;
    }
    if (!allMapped) {
      setParseError('Map all five required monitoring columns before running validation.');
      return;
    }
    onAnalyze(parsedTable, mapping, {
      periodLabel: periodLabel.trim() || datasetName,
      datasetName: datasetName.trim() || 'Uploaded Dataset',
    });
  };

  return (
    <div className="space-y-4">
      {/* Sample Civic Datasets Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Load Reference Civic Monitoring CSV
            </h2>
            <p className="text-xs text-slate-500">
              Test the complete validation, JS statistical engine, Gemini briefing, and comparison
              pipeline with realistic structured datasets.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-start">
          {SAMPLE_DATASETS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => loadSample(sample)}
              className="text-left p-3 rounded-lg border border-slate-200 hover:border-teal-700 hover:bg-teal-50/30 transition-colors space-y-1 focus-visible:outline-2 focus-visible:outline-teal-700"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span className="truncate">{sample.label}</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                {sample.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Upload + Paste Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Upload CSV / TSV File
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Accepts comma, tab, or semicolon-delimited files up to 5 MB.
            </p>
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center border border-dashed rounded-lg px-4 py-6 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-700 ${
              isDragging
                ? 'border-teal-700 bg-teal-50/50'
                : 'border-slate-300 bg-slate-50/60 hover:bg-slate-100/70'
            }`}
          >
            <Upload aria-hidden="true" className="w-5 h-5 text-slate-600 mb-2" />
            <span className="text-sm font-medium text-slate-900 text-center">
              Choose CSV file or drag here
            </span>
            <span className="text-xs text-slate-600 mt-0.5 text-center">
              Required fields: pollutant, location, timestamp, value, unit
            </span>
            <input
              type="file"
              aria-label="Upload air quality CSV or TSV file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          <div className="space-y-3 pt-2">
            <div>
              <label
                htmlFor="period-label-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Reporting Period Label
              </label>
              <input
                id="period-label-input"
                type="text"
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                placeholder="e.g., Ward 14 · Nov 8–10, 2026"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>

            <div>
              <label
                htmlFor="dataset-name-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Source File / Dataset Name
              </label>
              <input
                id="dataset-name-input"
                type="text"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Paste Tabular Monitoring Data
              </h2>
              <p className="text-xs text-slate-500">
                Paste directly from Excel, Google Sheets, CPCB exports, or raw CSV text.
              </p>
            </div>
            {rawText && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 rounded-md hover:bg-red-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>

          <textarea
            aria-label="Paste tabular air quality monitoring data"
            value={rawText}
            onChange={(e) => {
              const val = e.target.value;
              setRawText(val);
              if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current);
              if (val.length > 20000) {
                pasteDebounceRef.current = setTimeout(() => runParsePreview(val), 200);
              } else {
                runParsePreview(val);
              }
            }}
            rows={9}
            placeholder={`location,timestamp,pollutant,value,unit\nSchool Gate Ward 14,2026-11-08 08:00,PM2.5,112,ug/m3\nRing Road Junction,2026-11-08 08:00,PM2.5,168,ug/m3`}
            className="w-full px-3 py-2 text-xs font-mono leading-relaxed border border-slate-300 rounded-lg bg-slate-50/50 text-slate-900 focus:bg-white focus:outline-none focus:border-teal-700"
          />
        </div>
      </div>

      {parseError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-900"
        >
          <AlertCircle aria-hidden="true" className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Column Mapping & Preview */}
      {parsedTable && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>Parsed {parsedTable.rows.length} rows</span>
                <span className="text-slate-500" aria-hidden="true">·</span>
                <span className="font-mono text-xs text-slate-600">
                  {parsedTable.headers.length} columns ({parsedTable.detectedDelimiter} delimited)
                </span>
                {parsedTable.skippedPreambleLines.length > 0 && (
                  <>
                    <span className="text-slate-500" aria-hidden="true">·</span>
                    <span className="text-xs text-teal-800">
                      Skipped {parsedTable.skippedPreambleLines.length} preamble line(s)
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Verify detected column mappings below before running validation and statistical
                analysis.
              </p>
            </div>

            <button
              type="button"
              onClick={handleConfirmAnalyze}
              disabled={!allMapped}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-700"
            >
              <Play aria-hidden="true" className="w-4 h-4" />
              Validate &amp; Analyze Dataset
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {REQUIRED_FIELDS.map((field) => (
              <div key={field.key}>
                <label
                  htmlFor={`map-${field.key}`}
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {field.label}
                </label>
                <select
                  id={`map-${field.key}`}
                  value={mapping[field.key]}
                  onChange={(e) =>
                    setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-full px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-teal-700"
                >
                  <option value="">Select column...</option>
                  {parsedTable.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Raw preview table */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-600">
              Raw Input Preview (first {Math.min(6, parsedTable.rows.length)} of{' '}
              {parsedTable.rows.length} rows — unmodified)
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="px-3 py-2 font-mono font-medium">Line</th>
                    {parsedTable.headers.map((header) => (
                      <th key={header} className="px-3 py-2 font-mono font-medium whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedTable.rows.slice(0, 6).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 align-top">
                      <td className="px-3 py-1.5 font-mono tabular-nums text-slate-500 align-top">
                        #{parsedTable.rowLineNumbers?.[idx] ?? idx + 2}
                      </td>
                      {parsedTable.headers.map((header) => (
                        <td
                          key={header}
                          className="px-3 py-1.5 font-mono tabular-nums text-slate-800 whitespace-nowrap align-top"
                        >
                          {row[header] || <span className="text-red-500 italic">empty</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
