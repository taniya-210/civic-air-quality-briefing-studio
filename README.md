# Civic Air Quality Briefing Studio

Full-stack web application that transforms raw air-quality monitoring tables into validated quality audits, deterministic statistical analyses, period-over-period comparisons, and evidence-grounded civic briefings for ward officers, housing societies, schools, and vulnerable populations.

## Core Capabilities

- **Messy Tabular Data Ingestion**: Upload `.csv`/`.tsv`/`.txt` files or paste tabular monitoring logs (`;`, `,`, `\t`, `|`, and multi-space delimited), with UTF-8 BOM stripping, preamble/separator banner skipping, RFC-4180 quote handling, physical source row tracking, and manual column mapping overrides.
- **Transparent Data Quality Validation**: Flags missing values/sentinels (`NA`, `N/A`, `BDL`, `null`, `--`), negative or non-numeric concentrations, implausible sensor outliers, unparseable dates, exact and conflicting duplicates, and mixed measurement units (quarantined without silently fabricating cross-unit conversions).
- **Deterministic JavaScript Analytics & Scientific Guardrails**:
  - Calculates observed mean, median, P90, min/max observed peak, standard deviation, linear/half-shift trend direction, and station hotspot rankings deterministically in JavaScript.
  - Enforces averaging-period validity: never compares individual hourly or spot readings directly to 24-hour/8-hour regulatory standards; evaluates CPCB/WHO 24h or 8h exceedances only when hourly completeness criteria are satisfied (`>= 16` hourly readings across `>= 16h` for 24h PM2.5/PM10/NO2/SO2/AQI; `>= 6` readings across `>= 6h` for 8h O3/CO), clearly labeling shorter/intermittent windows as **Preliminary**.
- **Server-Side Gemini Briefings (`@google/genai`)**:
  - Generates distinct briefings for **Ward Officers**, **Housing Societies**, **Schools**, and **Vulnerable Groups** (children, older adults, and sensitive individuals) grounded verbatim in validated telemetry.
  - Supports **English**, **Hindi (`हिन्दी`)**, and **Marathi (`मराठी`)** in **Simple** and **Detailed** reading levels.
  - Strictly separates **Measured Facts**, **AI Interpretations**, and **Recommendations**.
- **Period-Over-Period Comparison**: Persists validated reporting periods on the backend and compares two reporting periods with shared-station, unit, and sample-imbalance comparability checks before reporting change.

## Architecture

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS (`src/`)
- **Backend**: Express API + Vite/static middleware (`server.ts`, `server/app.ts`, `server/gemini.ts`, `server/storage.ts`)
- **Automated Tests**: Node built-in test runner via `tsx` (`tests/`)

### API Endpoints

- `GET /api/health` — Server readiness check (`geminiConfigured` boolean only; never exposes API keys)
- `GET /api/periods` — List saved historical reporting periods
- `POST /api/periods` — Validate and persist a reporting period
- `DELETE /api/periods/:id` — Remove a saved reporting period
- `POST /api/briefings/generate` — Generate audience-specific briefings via server-side Gemini integration
- `POST /api/briefings/compare` — Generate a factual period-over-period comparative synthesis

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Configure environment variables**:
   Copy `.env.example` to `.env` (never commit `.env`) and set `GEMINI_API_KEY`:
   ```env
   GEMINI_API_KEY="your_gemini_api_key"
   ```
3. **Run in development (port 3000)**:
   ```bash
   npm run dev
   ```
4. **Run automated tests, typecheck, and production build**:
   ```bash
   npm test
   npm run lint
   npm run build
   ```
5. **Run production server**:
   ```bash
   npm start
   ```
