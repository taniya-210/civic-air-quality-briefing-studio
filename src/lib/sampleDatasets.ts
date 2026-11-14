export interface SampleDatasetSpec {
  id: string;
  label: string;
  periodLabel: string;
  filename: string;
  description: string;
  csv: string;
}

export const SAMPLE_DATASETS: SampleDatasetSpec[] = [
  {
    id: 'ward14_nov_episode',
    label: 'Ward 14 Winter Episode — Intermittent (Nov 8–10)',
    periodLabel: 'Ward 14 · Nov 8–10, 2026 (Intermittent)',
    filename: 'ward14_winter_episode_nov2026.csv',
    description:
      '4-hourly spot monitoring across 4 stations with 4 realistic anomalies (duplicate, missing value, negative glitch, unit mismatch). Lacks >=16h/day density, so findings are flagged Preliminary with Observed Peaks only.',
    csv: `location,timestamp,pollutant,value,unit
School Gate Ward 14,2026-11-08 06:00,PM2.5,94,ug/m3
School Gate Ward 14,2026-11-08 10:00,PM2.5,112,ug/m3
School Gate Ward 14,2026-11-08 14:00,PM2.5,86,ug/m3
School Gate Ward 14,2026-11-08 18:00,PM2.5,124,ug/m3
School Gate Ward 14,2026-11-09 06:00,PM2.5,108,ug/m3
School Gate Ward 14,2026-11-09 10:00,PM2.5,119,ug/m3
School Gate Ward 14,2026-11-09 14:00,PM2.5,95,ug/m3
School Gate Ward 14,2026-11-09 18:00,PM2.5,131,ug/m3
School Gate Ward 14,2026-11-10 06:00,PM2.5,116,ug/m3
School Gate Ward 14,2026-11-10 10:00,PM2.5,128,ug/m3
Ring Road Junction,2026-11-08 06:00,PM2.5,142,ug/m3
Ring Road Junction,2026-11-08 10:00,PM2.5,168,ug/m3
Ring Road Junction,2026-11-08 14:00,PM2.5,134,ug/m3
Ring Road Junction,2026-11-08 18:00,PM2.5,186,ug/m3
Ring Road Junction,2026-11-09 06:00,PM2.5,155,ug/m3
Ring Road Junction,2026-11-09 10:00,PM2.5,179,ug/m3
Ring Road Junction,2026-11-09 14:00,PM2.5,148,ug/m3
Ring Road Junction,2026-11-09 18:00,PM2.5,198,ug/m3
Ring Road Junction,2026-11-10 06:00,PM2.5,172,ug/m3
Ring Road Junction,2026-11-10 10:00,PM2.5,204,ug/m3
Shanti Vihar RWA,2026-11-08 06:00,PM2.5,78,ug/m3
Shanti Vihar RWA,2026-11-08 10:00,PM2.5,91,ug/m3
Shanti Vihar RWA,2026-11-08 14:00,PM2.5,72,ug/m3
Shanti Vihar RWA,2026-11-08 18:00,PM2.5,98,ug/m3
Shanti Vihar RWA,2026-11-09 06:00,PM2.5,84,ug/m3
Shanti Vihar RWA,2026-11-09 10:00,PM2.5,96,ug/m3
Shanti Vihar RWA,2026-11-09 14:00,PM2.5,79,ug/m3
Shanti Vihar RWA,2026-11-09 18:00,PM2.5,106,ug/m3
Shanti Vihar RWA,2026-11-10 06:00,PM2.5,89,ug/m3
Shanti Vihar RWA,2026-11-10 10:00,PM2.5,103,ug/m3
Industrial Nala Corridor,2026-11-08 06:00,PM2.5,164,ug/m3
Industrial Nala Corridor,2026-11-08 10:00,PM2.5,192,ug/m3
Industrial Nala Corridor,2026-11-08 14:00,PM2.5,158,ug/m3
Industrial Nala Corridor,2026-11-08 18:00,PM2.5,214,ug/m3
Industrial Nala Corridor,2026-11-09 06:00,PM2.5,176,ug/m3
Industrial Nala Corridor,2026-11-09 10:00,PM2.5,205,ug/m3
Industrial Nala Corridor,2026-11-09 14:00,PM2.5,171,ug/m3
Industrial Nala Corridor,2026-11-09 18:00,PM2.5,226,ug/m3
Industrial Nala Corridor,2026-11-10 06:00,PM2.5,188,ug/m3
Industrial Nala Corridor,2026-11-10 10:00,PM2.5,232,ug/m3
Ring Road Junction,2026-11-08 10:00,PM10,248,ug/m3
Ring Road Junction,2026-11-09 10:00,PM10,266,ug/m3
Ring Road Junction,2026-11-10 10:00,PM10,294,ug/m3
Industrial Nala Corridor,2026-11-08 10:00,PM10,282,ug/m3
Industrial Nala Corridor,2026-11-09 10:00,PM10,305,ug/m3
Industrial Nala Corridor,2026-11-10 10:00,PM10,329,ug/m3
School Gate Ward 14,2026-11-08 10:00,NO2,46,ug/m3
School Gate Ward 14,2026-11-09 10:00,NO2,51,ug/m3
School Gate Ward 14,2026-11-10 10:00,NO2,54,ug/m3
Ring Road Junction,2026-11-08 10:00,NO2,88,ug/m3
Ring Road Junction,2026-11-09 10:00,NO2,94,ug/m3
Ring Road Junction,2026-11-10 10:00,NO2,102,ug/m3
School Gate Ward 14,2026-11-09 10:00,PM2.5,119,ug/m3
Shanti Vihar RWA,2026-11-09 12:00,PM2.5,-14,ug/m3
Industrial Nala Corridor,2026-11-09 12:00,PM2.5,,ug/m3
Shanti Vihar RWA,2026-11-10 12:00,PM2.5,0.11,mg/m3`,
  },
  {
    id: 'ward14_full_24h_hourly',
    label: 'Ward 14 Full 24h Hourly Station Log (Nov 12)',
    periodLabel: 'Ward 14 · Nov 12, 2026 (24h Continuous)',
    filename: 'ward14_continuous_24h_nov12.csv',
    description:
      'Complete 24-hour continuous hourly PM2.5 monitoring across 2 stations (24 readings/day each) supporting valid CPCB 24-hour average calculation and verified exceedance checks.',
    csv: `location,timestamp,pollutant,value,unit
School Gate Ward 14,2026-11-12 00:00,PM2.5,58,ug/m3
School Gate Ward 14,2026-11-12 01:00,PM2.5,56,ug/m3
School Gate Ward 14,2026-11-12 02:00,PM2.5,54,ug/m3
School Gate Ward 14,2026-11-12 03:00,PM2.5,52,ug/m3
School Gate Ward 14,2026-11-12 04:00,PM2.5,53,ug/m3
School Gate Ward 14,2026-11-12 05:00,PM2.5,59,ug/m3
School Gate Ward 14,2026-11-12 06:00,PM2.5,66,ug/m3
School Gate Ward 14,2026-11-12 07:00,PM2.5,74,ug/m3
School Gate Ward 14,2026-11-12 08:00,PM2.5,81,ug/m3
School Gate Ward 14,2026-11-12 09:00,PM2.5,76,ug/m3
School Gate Ward 14,2026-11-12 10:00,PM2.5,68,ug/m3
School Gate Ward 14,2026-11-12 11:00,PM2.5,61,ug/m3
School Gate Ward 14,2026-11-12 12:00,PM2.5,54,ug/m3
School Gate Ward 14,2026-11-12 13:00,PM2.5,49,ug/m3
School Gate Ward 14,2026-11-12 14:00,PM2.5,47,ug/m3
School Gate Ward 14,2026-11-12 15:00,PM2.5,48,ug/m3
School Gate Ward 14,2026-11-12 16:00,PM2.5,52,ug/m3
School Gate Ward 14,2026-11-12 17:00,PM2.5,59,ug/m3
School Gate Ward 14,2026-11-12 18:00,PM2.5,64,ug/m3
School Gate Ward 14,2026-11-12 19:00,PM2.5,67,ug/m3
School Gate Ward 14,2026-11-12 20:00,PM2.5,65,ug/m3
School Gate Ward 14,2026-11-12 21:00,PM2.5,61,ug/m3
School Gate Ward 14,2026-11-12 22:00,PM2.5,57,ug/m3
School Gate Ward 14,2026-11-12 23:00,PM2.5,55,ug/m3
Ring Road Junction,2026-11-12 00:00,PM2.5,88,ug/m3
Ring Road Junction,2026-11-12 01:00,PM2.5,84,ug/m3
Ring Road Junction,2026-11-12 02:00,PM2.5,79,ug/m3
Ring Road Junction,2026-11-12 03:00,PM2.5,76,ug/m3
Ring Road Junction,2026-11-12 04:00,PM2.5,82,ug/m3
Ring Road Junction,2026-11-12 05:00,PM2.5,91,ug/m3
Ring Road Junction,2026-11-12 06:00,PM2.5,104,ug/m3
Ring Road Junction,2026-11-12 07:00,PM2.5,118,ug/m3
Ring Road Junction,2026-11-12 08:00,PM2.5,129,ug/m3
Ring Road Junction,2026-11-12 09:00,PM2.5,124,ug/m3
Ring Road Junction,2026-11-12 10:00,PM2.5,112,ug/m3
Ring Road Junction,2026-11-12 11:00,PM2.5,98,ug/m3
Ring Road Junction,2026-11-12 12:00,PM2.5,89,ug/m3
Ring Road Junction,2026-11-12 13:00,PM2.5,83,ug/m3
Ring Road Junction,2026-11-12 14:00,PM2.5,79,ug/m3
Ring Road Junction,2026-11-12 15:00,PM2.5,84,ug/m3
Ring Road Junction,2026-11-12 16:00,PM2.5,93,ug/m3
Ring Road Junction,2026-11-12 17:00,PM2.5,108,ug/m3
Ring Road Junction,2026-11-12 18:00,PM2.5,122,ug/m3
Ring Road Junction,2026-11-12 19:00,PM2.5,126,ug/m3
Ring Road Junction,2026-11-12 20:00,PM2.5,117,ug/m3
Ring Road Junction,2026-11-12 21:00,PM2.5,109,ug/m3
Ring Road Junction,2026-11-12 22:00,PM2.5,99,ug/m3
Ring Road Junction,2026-11-12 23:00,PM2.5,92,ug/m3`,
  },
  {
    id: 'ward14_oct_baseline',
    label: 'Ward 14 October Baseline (Oct 18–20)',
    periodLabel: 'Ward 14 · Oct 18–20, 2026',
    filename: 'ward14_october_baseline_2026.csv',
    description:
      'Earlier reporting period across the same 4 Ward 14 stations for Period-over-Period Historical Comparison.',
    csv: `location,timestamp,pollutant,value,unit
School Gate Ward 14,2026-10-18 06:00,PM2.5,52,ug/m3
School Gate Ward 14,2026-10-18 10:00,PM2.5,61,ug/m3
School Gate Ward 14,2026-10-18 14:00,PM2.5,48,ug/m3
School Gate Ward 14,2026-10-18 18:00,PM2.5,64,ug/m3
School Gate Ward 14,2026-10-19 06:00,PM2.5,55,ug/m3
School Gate Ward 14,2026-10-19 10:00,PM2.5,62,ug/m3
School Gate Ward 14,2026-10-19 14:00,PM2.5,49,ug/m3
School Gate Ward 14,2026-10-19 18:00,PM2.5,66,ug/m3
Ring Road Junction,2026-10-18 06:00,PM2.5,84,ug/m3
Ring Road Junction,2026-10-18 10:00,PM2.5,96,ug/m3
Ring Road Junction,2026-10-18 14:00,PM2.5,79,ug/m3
Ring Road Junction,2026-10-18 18:00,PM2.5,104,ug/m3
Ring Road Junction,2026-10-19 06:00,PM2.5,88,ug/m3
Ring Road Junction,2026-10-19 10:00,PM2.5,98,ug/m3
Ring Road Junction,2026-10-19 14:00,PM2.5,81,ug/m3
Ring Road Junction,2026-10-19 18:00,PM2.5,107,ug/m3
Shanti Vihar RWA,2026-10-18 06:00,PM2.5,44,ug/m3
Shanti Vihar RWA,2026-10-18 10:00,PM2.5,53,ug/m3
Shanti Vihar RWA,2026-10-18 14:00,PM2.5,41,ug/m3
Shanti Vihar RWA,2026-10-18 18:00,PM2.5,56,ug/m3
Shanti Vihar RWA,2026-10-19 06:00,PM2.5,47,ug/m3
Shanti Vihar RWA,2026-10-19 10:00,PM2.5,54,ug/m3
Shanti Vihar RWA,2026-10-19 14:00,PM2.5,42,ug/m3
Shanti Vihar RWA,2026-10-19 18:00,PM2.5,58,ug/m3
Industrial Nala Corridor,2026-10-18 06:00,PM2.5,101,ug/m3
Industrial Nala Corridor,2026-10-18 10:00,PM2.5,116,ug/m3
Industrial Nala Corridor,2026-10-18 14:00,PM2.5,95,ug/m3
Industrial Nala Corridor,2026-10-18 18:00,PM2.5,124,ug/m3
Industrial Nala Corridor,2026-10-19 06:00,PM2.5,104,ug/m3
Industrial Nala Corridor,2026-10-19 10:00,PM2.5,119,ug/m3
Industrial Nala Corridor,2026-10-19 14:00,PM2.5,98,ug/m3
Industrial Nala Corridor,2026-10-19 18:00,PM2.5,127,ug/m3
Ring Road Junction,2026-10-18 10:00,PM10,162,ug/m3
Ring Road Junction,2026-10-19 10:00,PM10,168,ug/m3
Ring Road Junction,2026-10-20 10:00,PM10,174,ug/m3
Industrial Nala Corridor,2026-10-18 10:00,PM10,189,ug/m3
Industrial Nala Corridor,2026-10-19 10:00,PM10,196,ug/m3
Industrial Nala Corridor,2026-10-20 10:00,PM10,202,ug/m3
School Gate Ward 14,2026-10-18 10:00,NO2,34,ug/m3
School Gate Ward 14,2026-10-19 10:00,NO2,36,ug/m3
School Gate Ward 14,2026-10-20 10:00,NO2,35,ug/m3
Ring Road Junction,2026-10-18 10:00,NO2,62,ug/m3
Ring Road Junction,2026-10-19 10:00,NO2,65,ug/m3
Ring Road Junction,2026-10-20 10:00,NO2,64,ug/m3`,
  },
  {
    id: 'low_sample_sparse',
    label: 'Short-Duration Spot Check (1.5h, 3 Valid Rows)',
    periodLabel: 'Ward 7 · Short Spot-Check',
    filename: 'low_sample_sensor_test.csv',
    description:
      'Minimal 5-row dataset spanning 1.5 hours with 2 invalid rows to demonstrate Preliminary / Insufficient Data safeguards.',
    csv: `station,datetime,parameter,concentration,units
Primary School Gate,2026-11-11 08:00,PM2.5,88,ug/m3
Primary School Gate,2026-11-11 09:00,PM2.5,94,ug/m3
Market Crossing,2026-11-11 08:30,PM2.5,N/A,ug/m3
Market Crossing,bad-date-here,PM2.5,112,ug/m3
Community Park,2026-11-11 09:30,PM2.5,79,ug/m3`,
  },
];
