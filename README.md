# WindSight — UK Wind Forecast & Day-Ahead Trading Intelligence Platform

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)]()
[![Python](https://img.shields.io/badge/python-3.12%2B-blue.svg)]()
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg)]()
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)]()
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC.svg)]()
[![Docker](https://img.shields.io/badge/Docker-enabled-2496ED.svg)]()

> **Live Application URL**: [https://ais-pre-3cnr5hl6t7diod4rgmlfb2-848281282336.asia-southeast1.run.app](https://ais-pre-3cnr5hl6t7diod4rgmlfb2-848281282336.asia-southeast1.run.app)  
> **Development Preview URL**: [https://ais-dev-3cnr5hl6t7diod4rgmlfb2-848281282336.asia-southeast1.run.app](https://ais-dev-3cnr5hl6t7diod4rgmlfb2-848281282336.asia-southeast1.run.app)

---

## Table of Contents

1. [Executive Summary & Business Context](#1-executive-summary--business-context)
2. [Elexon BMRS Datasets & Granularity Nuances](#2-elexon-bmrs-datasets--granularity-nuances)
3. [Day-Ahead Decision Cutoff & Forecast Selection Methodology](#3-day-ahead-decision-cutoff--forecast-selection-methodology)
4. [Statistical Accuracy Metrics & Mathematical Formulations](#4-statistical-accuracy-metrics--mathematical-formulations)
5. [System Architecture & Data Pipeline](#5-system-architecture--data-pipeline)
6. [Application Feature Walkthrough](#6-application-feature-walkthrough)
7. [Technology Stack](#7-technology-stack)
8. [Repository Folder Structure](#8-repository-folder-structure)
9. [Local Setup & Running Instructions](#9-local-setup--running-instructions)
10. [Docker & Containerized Deployment](#10-docker--containerized-deployment)
11. [Automated Testing Suite](#11-automated-testing-suite)
12. [Environment Variables Reference](#12-environment-variables-reference)
13. [Limitations & Market Boundary Disclosures](#13-limitations--market-boundary-disclosures)
14. [Assignment Submission Guide](#14-assignment-submission-guide)
15. [AI Tools Usage Disclosure](#15-ai-tools-usage-disclosure)

---

## 1. Executive Summary & Business Context

UK electricity utilities operate under statutory balancing obligations. To meet consumer demand while minimising exposure to punitive system buy prices in the Balancing Mechanism, energy procurement teams must contract electricity in day-ahead wholesale power auctions.

Wind generation is highly intermittent and weather-dependent. Day-ahead forecast errors create volume uncertainty for procurement desks:
- **Overforecasting** ($\text{Forecast} > \text{Actual}$): The utility enters the delivery day expecting higher wind volume than physically generates, leaving an unhedged deficit that must be covered in intraday markets or settled at cash-out imbalance prices.
- **Underforecasting** ($\text{Forecast} < \text{Actual}$): The utility over-procures conventional or imported power at day-ahead prices, leaving surplus generation that must be spilled or sold back into the market at potentially depressed prices.

**WindSight** provides energy trading desks with an institutional analytical workstation that ingests real **January 2026** actuals and multi-vintage forecasts from the official **Elexon BMRS** API. It enforces strict time-aware decision gating (`publishTime <= cutoffTime`) to prevent hindsight contamination, compares interval energy against average power, quantifies forecast error distributions, and provides granular auditability for every 30-minute settlement period.

---

## 2. Elexon BMRS Datasets & Granularity Nuances

WindSight strictly utilizes only the two official public Elexon Balancing Mechanism Reporting Service (BMRS) stream endpoints:

```text
+---------------------------------------------------------------------------------------------------------+
| Dataset 1: Actual Wind Generation (FUELHH)                                                              |
| Endpoint:   GET /datasets/FUELHH/stream?settlementDateFrom=2026-01-01&settlementDateTo=2026-01-31       |
|             &fuelType=WIND                                                                              |
| Cadence:    30-Minute Settlement Periods (SP 1 to SP 48 per day; 1,488 records in Jan 2026)            |
| Key Fields: startTime (UTC), publishTime, settlementDate, settlementPeriod (1-48), fuelType, generation (MW)|
+---------------------------------------------------------------------------------------------------------+
| Dataset 2: Wind Generation Forecasts (WINDFOR)                                                          |
| Endpoint:   GET /datasets/WINDFOR/stream?publishDateTimeFrom=2025-12-28T00:00:00Z                       |
|             &publishDateTimeTo=2026-01-31T23:59:59Z                                                     |
| Cadence:    60-Minute target startTime (:00:00Z; 744 target hours in Jan 2026)                          |
| Runs:       8 daily forecast runs published at 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC |
| Volume:     18,080 forecast records targeting Jan 2026 (out of 20,440 total raw records fetched)       |
| Key Fields: startTime (UTC), publishTime (UTC), generation (MW)                                         |
+---------------------------------------------------------------------------------------------------------+
```

### Critical Temporal Granularity Discovery & Alignment Modes
In the official Elexon schema:
- `FUELHH` actuals are recorded at **30-minute settlement periods** (`:00:00Z` and `:30:00Z`).
- `WINDFOR` forecasts are published at **60-minute target start times** (`:00:00Z`).

WindSight handles this schema reality transparently through two selectable alignment modes:
1. **Strict Exact `startTime` Match (`strict_exact`, Default)**:
   - Matches records only where `startTime` matches identically without interpolation (`744` hourly matched intervals across January 2026).
   - The `744` half-hourly `:30:00Z` actual settlement periods are preserved in the database and transparently displayed in the **Forecast Explorer** and **Data Quality** views with status `ACTUAL_ONLY_UNMATCHED_HH`. They are never replaced with zero or fabricated values.
2. **Half-Hourly Settlement Step-Hold (`hh_step`)**:
   - Maps each hourly `WINDFOR` forecast across both 30-minute settlement periods (`HH:00` and `HH:30`) of that hour (`1,488` matched intervals).
   - Energy is rigorously calculated as: $\text{Interval Energy (MWh)} = \text{Power (MW)} \times 0.5\text{ hours}$.

---

## 3. Day-Ahead Decision Cutoff & Forecast Selection Methodology

### The Decision-Time Dilemma
In historical backtesting, a common flaw is picking the forecast with the highest `publishTime` overall (or the latest forecast available today). However, in real day-ahead operations, trading desks must lock order bids **before the day-ahead auction closes on day $D-1$**. Intraday forecast updates published later that evening or on the morning of delivery were not available when procurement commitments were executed.

### Decision Cutoff Rules Supported in WindSight

For a delivery interval starting at `startTime` on date $D$ (interpreted in `Europe/London`, which is GMT in January 2026):

| Cutoff Mode | Predicate | Industry Rationale & Selected Forecast Run |
| :--- | :--- | :--- |
| **`d_minus_1_1100` (Default)** | $\text{publishTime} \le (D-1)\text{ 11:00 GMT}$ | **Great Britain Day-Ahead Coupled Auction Gate Closure** (EPEX SPOT / Nord Pool GB). Order books close at 11:00 GMT on $D-1$. Selects the Elexon `09:30Z` WINDFOR run. |
| **`d_minus_1_1200`** | $\text{publishTime} \le (D-1)\text{ 12:00 GMT}$ | **Midday Post-Auction OTC Hedging**. Captures the Elexon `11:30Z` forecast run used for midday bilateral position balancing. |
| **`d_minus_1_1830`** | $\text{publishTime} \le (D-1)\text{ 18:30 GMT}$ | **Evening EFA Block Cutoff**. Captures the Elexon `18:30Z` forecast run before overnight delivery. |
| **`lead_time_12h`** | $\text{publishTime} \le \text{startTime} - 12\text{ hours}$ | Rolling minimum 12-hour lookahead horizon. |
| **`lead_time_4h`** | $\text{publishTime} \le \text{startTime} - 4\text{ hours}$ | Intraday trading benchmark (residual forecast uncertainty 4h before delivery). |

### Selection Algorithm
$$\text{Selected Forecast} = \arg\max_{\text{publishTime} \le \text{Cutoff}} \left\{ \text{WINDFOR}(\text{startTime}, \text{publishTime}) \right\}$$

- Forecasts published **after** the cutoff are strictly excluded from KPI and accuracy calculations.
- All historical vintages (both eligible and post-cutoff excluded) are preserved in the database and displayed in the **Historical Forecast Vintage Audit Drawer** for complete compliance verification.
- Month-boundary transitions (e.g. delivery on `2026-01-01 00:00Z`) correctly resolve the cutoff date to `2025-12-31 11:00Z` in UTC and `Europe/London`.

---

## 4. Statistical Accuracy Metrics & Mathematical Formulations

All metrics are calculated strictly across the population of **valid matched pairs** ($N$) where both actual and forecast generation are present. Missing intervals are **never replaced with zero**.

### 1. Signed Forecast Error (MW)
$$\text{Error}_i = \text{Forecast}_i - \text{Actual}_i$$
- $\text{Error}_i > 0$: **Overforecast** (expected more wind than generated).
- $\text{Error}_i < 0$: **Underforecast** (generated more wind than expected).

### 2. Absolute Forecast Error (MW)
$$|\text{Error}_i| = |\text{Forecast}_i - \text{Actual}_i|$$

### 3. Mean Absolute Error (MAE, MW)
$$\text{MAE} = \frac{1}{N} \sum_{i=1}^{N} |\text{Forecast}_i - \text{Actual}_i|$$
Measures the average magnitude of forecast deviation without directional offsetting.

### 4. Root Mean Squared Error (RMSE, MW)
$$\text{RMSE} = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (\text{Forecast}_i - \text{Actual}_i)^2}$$
Quadratic penalty that places greater weight on large tail deviations (e.g., unexpected storm front timing shifts).

### 5. Mean Signed Bias (MW)
$$\text{Bias} = \frac{1}{N} \sum_{i=1}^{N} (\text{Forecast}_i - \text{Actual}_i)$$
Indicates systematic over-prediction ($\text{Bias} > 0$) or under-prediction ($\text{Bias} < 0$).

### 6. Mean Absolute Percentage Error (MAPE, %) with Denominator Guard
$$\text{MAPE} = \frac{100}{N_{\text{valid}}} \sum_{i=1, \text{Actual}_i > \tau}^{N_{\text{valid}}} \frac{|\text{Forecast}_i - \text{Actual}_i|}{\text{Actual}_i}$$
- **Documented Denominator Guard**: During calm weather regimes where actual generation approaches zero, percentage error diverges to infinity. WindSight enforces an explicit guard threshold $\tau = 100\text{ MW}$ (configurable in Settings). Intervals where $\text{Actual}_i \le 100\text{ MW}$ are excluded from MAPE calculation, and the count of excluded intervals ($N - N_{\text{valid}}$) is explicitly disclosed on the KPI card.

### 7. Power (MW) vs. Energy (MWh)
- **Power (MW)**: Instantaneous rate of electricity generation reported by Elexon.
- **Interval Energy (MWh)**: Derived by integrating power over the settlement period duration:
  $$\text{Energy (MWh)} = \text{Power (MW)} \times \Delta t_{\text{hours}}$$
  where $\Delta t = 0.5\text{ h}$ for 30-minute settlement periods or $\Delta t = 1.0\text{ h}$ for hourly exact matching.

---

## 5. System Architecture & Data Pipeline

```text
+---------------------------------------------------------------------------------------+
|                                    DATA INGESTION                                     |
|  - Elexon BMRS Stream API: FUELHH (Actuals) & WINDFOR (Forecasts)                     |
|  - Resilient Local Disk Cache: data/elexon_jan2026_cache.json (2.20 MB)               |
|  - In-memory cache + live re-fetch endpoint: POST /api/v1/refresh                     |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                                DATA VALIDATION ENGINE                                 |
|  - Pydantic v2 schemas validate types, ISO-8601 timestamps, and positive MW numbers   |
|  - Deduplication: Keeps latest publishTime on duplicate startTimes                    |
|  - Non-negative validation & malformed record tracking                                |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                               DECISION GATING & MATCHING                              |
|  - Canonical 30-min timeline generated for Jan 01 00:00 to Jan 31 23:30 (1,488 slots) |
|  - Cutoff timestamp evaluated in Europe/London timezone                               |
|  - WINDFOR vintages filtered: publishTime <= cutoffTime                               |
|  - Latest eligible forecast assigned; remaining vintages preserved for auditing      |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                                  ANALYTICS & METRICS                                  |
|  - Computes MAE, RMSE, Bias, guarded MAPE, and P05-P95 percentiles                    |
|  - Computes Diurnal 24-hour error profile & 500 MW histogram distributions            |
|  - Computes 5-way Cutoff Sensitivity Comparison Matrix                                |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                              FASTAPI & EXPRESS API LAYER                              |
|  - GET  /api/v1/health              -> Service status, Elexon sync, record counts     |
|  - GET  /api/v1/overview            -> Executive KPIs, time series, top deviations    |
|  - GET  /api/v1/forecasts           -> Paginated interval explorer with filtering     |
|  - GET  /api/v1/forecasts/vintages  -> Chronological audit for single delivery target |
|  - GET  /api/v1/accuracy            -> Statistical metrics, daily table, diurnal      |
|  - GET  /api/v1/data-quality        -> Completeness audit, duplicate logs, schema     |
|  - POST /api/v1/refresh             -> Live re-fetch from Elexon BMRS API             |
+---------------------------------------------------------------------------------------+
```

---

## 6. Application Feature Walkthrough

### 1. Top Navigation & Global Controls
- **Page Breadcrumbs**: Clear section hierarchy (`WindSight / <Active Section>`).
- **Historical Scope Indicator**: Prominent badge reminding traders that this is a historical January 2026 evaluation workstation, not real-time live trading.
- **Timezone**: Explicitly pinned to `Europe/London (GMT)`.
- **Date Filter & Quick Presets**: Restricts range strictly to January 2026 (`Full Month`, `Week 1`, `Week 2`, `Week 3`, `Week 4`) with on-the-fly Day-Ahead Cutoff and Alignment selectors.
- **Data Sync Telemetry**: Status indicator with timestamp of latest Elexon data sync and a live **Refresh Elexon Data** button.

### 2. Overview Dashboard
- **5 Executive KPI Cards**:
  1. *Actual Wind Generation*: MWh total with secondary average MW power.
  2. *Forecast Wind Generation*: MWh total with secondary average MW power.
  3. *Mean Absolute Error (MAE)*: MW magnitude with secondary signed bias.
  4. *Root Mean Squared Error (RMSE)*: MW magnitude with secondary P95 tail error.
  5. *Guarded MAPE*: Percentage error with secondary valid denominator count ($N_{\text{valid}} / N$).
  - Every card features an **Interactive Methodology Tooltip** on hover/focus explaining the exact mathematical formula and denominator treatment.
- **Main Time-Series Chart**:
  - Compares Actual Wind Generation (emerald line) against Selected Day-Ahead Forecast (cyan dashed line).
  - Optional Signed Error area overlay (amber fill).
  - Quick window slices: `All Selected`, `First 72 Intervals`, or `Peak Error Window`.
  - Range brush control for custom time-window zooming.
  - Hover tooltip displaying London time, Settlement Period (SP), Actual MW, Forecast MW, Signed Error MW, Forecast Publication Time, Decision Cutoff, and Lead Time Hours.
  - **Click-to-Audit**: Clicking any point on the chart opens the vintage audit drawer for that delivery interval.
- **Forecast Error Panel**:
  - Toggle between **Signed Error (`Forecast − Actual`)** and **Absolute Error (`|Forecast − Actual|`)** bar charts.
  - Empirical percentile summary strip: `P05` (tail underforecast), `P25`, `Median P50`, `Mean Bias`, `P75`, and `P95` (tail overforecast).
  - **Largest Observed Deviations Table**: Lists top high-error intervals with quick-audit links.
- **Operational Period Summary**: Objective, data-derived breakdown of matched population, error bias, largest deviation, and missing data counts.

### 3. Forecast Explorer (Analyst Workspace)
- Granular 30-minute delivery interval table.
- Search by date, London time (`14:00`), or settlement period (`SP 29`).
- Filters: Specific single calendar date, 6 time-of-day blocks (`Overnight`, `Morning Ramp`, `Afternoon`, `UK Peak 16–20`, `Evening`), and Record Status (`Matched Only`, `Overforecast Only`, `Underforecast Only`, `Unmatched HH`).
- Column sorting: Chronological, Absolute Error, Signed Error, Actual Generation, Forecast Generation, Lead Time.
- Pagination: 24, 48, 96, or 168 rows per page.
- **One-Click CSV Export**: Downloads the exact filtered view with full audit metadata.
- **Audit Button**: Inspects every Elexon publication run for that interval.

### 4. Historical Decision-Time Vintage Audit Drawer
- Accessible by clicking any interval across charts or tables.
- Displays the target delivery time in London time and Settlement Period.
- Renders a multi-run evolution line chart showing how Elexon's forecast for that target hour changed across all 8 daily runs.
- Chronological audit table marking each run as:
  - `SELECTED`: The latest forecast published at or before the decision cutoff.
  - `Eligible (Superseded)`: Published before cutoff, but superseded by a later pre-cutoff run.
  - `Excluded (Post-Cutoff)`: Published after gate closure; strictly excluded to prevent hindsight bias.

### 5. Accuracy Analysis
- **Cutoff Sensitivity Benchmark Table**: Directly compares all 5 market cutoff conventions on January 2026 data, demonstrating how average lead time and MAE/RMSE change.
- **Diurnal Error Profile Chart**: 24-hour curve showing how forecast error fluctuates by delivery hour.
- **Signed Error Distribution Histogram**: 500 MW bin frequency chart comparing overforecast vs. underforecast spreads.
- **31-Day Daily Accuracy Breakdown**: Comprehensive ledger for all 31 days with energy totals, average power, MAE, RMSE, bias, max deviation, and MAPE.

### 6. Data Quality & Transparency
- Complete audit summary: Total raw records (`1,488` actuals, `20,440` forecasts), valid records, duplicate records, invalid values, and publication bounds.
- Schema documentation highlighting the half-hourly (`FUELHH`) vs. hourly (`WINDFOR`) granularity reality.
- 31-day January 2026 completeness coverage table detailing matched pairs, unmatched `:30` half-hours, and data coverage percentages.

### 7. Market Convention Settings
- Interactive radio selectors to switch between the 5 cutoff conventions.
- Toggle between `Strict Exact` and `Half-Hourly Step-Hold` alignment modes.
- Configurable MAPE denominator threshold (`0 MW`, `100 MW`, `500 MW`, `1,000 MW`).

---

## 7. Technology Stack

| Layer | Technologies | Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19, TypeScript, Vite | Modern component model, strict typing, high compilation speed |
| **Styling** | Tailwind CSS v4 | Zero-pill discipline, tabular numerals, enterprise dark theme |
| **Visualizations** | Recharts | Composed charts, area bands, bar histograms, interactive brushes |
| **Icons** | Lucide React | Clean, domain-native institutional icons |
| **Python Backend** | Python 3.12, FastAPI, Pydantic v2 | High-performance asynchronous API, strict schema validation |
| **Data Processing** | Python standard library / NumPy | Exact mathematical formulas for MAE, RMSE, percentiles |
| **Full-Stack Runtime** | Express, tsx, Node.js 22 | Unified development server on port 3000 hosting API & Vite |
| **Testing** | Python `unittest` | Automated validation of cutoff gating and error calculations |
| **Containers** | Docker, Docker Compose | Production multi-stage images with automated health checks |

---

## 8. Repository Folder Structure

```text
.
├── backend/
│   ├── Dockerfile                 # Python 3.12 FastAPI production container
│   ├── requirements.txt           # Python dependencies (FastAPI, Pydantic, httpx, etc.)
│   ├── schemas.py                 # Pydantic v2 request/response models
│   ├── forecast_selector.py       # Cutoff calculation & time-aware vintage selection
│   ├── metrics.py                 # MAE, RMSE, Bias, guarded MAPE, and percentiles
│   ├── elexon_client.py           # Elexon BMRS stream fetcher with local caching
│   ├── main.py                    # FastAPI REST application (/api/v1/*)
│   └── tests/
│       └── test_analytics.py      # Unit tests for cutoff gating & accuracy math
├── data/
│   └── elexon_jan2026_cache.json  # Pre-cached real January 2026 Elexon dataset (2.20 MB)
├── src/
│   ├── components/
│   │   ├── AccuracyView.tsx       # Accuracy workspace (cutoff benchmark, diurnal chart)
│   │   ├── AppLayout.tsx          # Institutional layout shell
│   │   ├── DataQualityView.tsx    # Completeness audit & Elexon schema documentation
│   │   ├── DateFilter.tsx         # January 2026 date & cutoff selector bar
│   │   ├── ErrorChart.tsx         # Signed/absolute error charts & percentile strip
│   │   ├── ForecastTable.tsx      # 30-minute delivery interval explorer with CSV export
│   │   ├── GenerationChart.tsx    # Actual vs Forecast chart with zoom brush & tooltip
│   │   ├── MetricCard.tsx         # KPI card with formula tooltip & MW/MWh distinction
│   │   ├── SettingsView.tsx       # Market convention & cutoff configuration
│   │   ├── Sidebar.tsx            # Collapsible navigation with Elexon telemetry footer
│   │   ├── States.tsx             # LoadingState, ErrorState, EmptyState, DataStatus
│   │   ├── TopBar.tsx             # Header with breadcrumbs, GMT clock, and refresh CTA
│   │   └── VintageAuditModal.tsx  # Historical forecast vintage audit drawer
│   ├── lib/
│   │   └── formatters.ts          # MW/MWh formatting, Europe/London time, CSV export
│   ├── services/
│   │   └── api.ts                 # Typed API client with AbortController cancellation
│   ├── types/
│   │   └── analytics.ts           # Strict TypeScript interfaces
│   ├── App.tsx                    # Root component with state management & routing
│   ├── index.css                  # Tailwind CSS rules & tabular-nums enforcement
│   └── main.tsx                   # React 19 application entry point
├── server.ts                      # Full-stack Node + Express server mounting Vite
├── Dockerfile                     # Multi-stage Dockerfile for web application
├── docker-compose.yml             # Docker Compose orchestrating frontend + backend
├── .dockerignore                  # Docker build exclusions
├── .env.example                   # Environment configuration template
├── package.json                   # NPM dependencies and scripts
├── tsconfig.json                  # TypeScript compiler configuration
├── vite.config.ts                 # Vite build & Tailwind configuration
└── README.md                      # Comprehensive project documentation
```

---

## 9. Local Setup & Running Instructions

### Option A: Full-Stack Web Application (Recommended for Development)
Runs the unified full-stack server serving the React interface and the `/api/v1/*` endpoints simultaneously on Port 3000.

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Application**:
   ```bash
   npm run dev
   ```

3. **Open in Browser**:
   Navigate to [http://localhost:3000](http://localhost:3000).

### Option B: Standalone Python FastAPI Backend
Runs the Python 3.12+ FastAPI backend independently on Port 8000.

1. **Create and Activate a Virtual Environment**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. **Install Python Dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Start the FastAPI Server**:
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. **Verify API Docs**:
   Open [http://localhost:8000/docs](http://localhost:8000/docs) to view Swagger UI.

---

## 10. Docker & Containerized Deployment

WindSight provides a multi-container **Docker Compose** configuration that builds and orchestrates both the Python FastAPI backend and the web application with integrated healthchecks.

### Build and Launch Containers
```bash
docker compose up --build
```

### Container Endpoints:
- **WindSight Web Interface**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Backend**: [http://localhost:8000](http://localhost:8000)
- **FastAPI Interactive Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

### Stopping Containers
```bash
docker compose down
```

---

## 11. Automated Testing Suite

WindSight includes automated unit tests covering all critical business rules:
- Forecast selection at or before decision cutoff.
- Exclusion of post-cutoff forecast revisions.
- Duplicate record handling (preserving the latest publish timestamp).
- MAE, RMSE, and Signed Bias calculations verified against known synthetic examples.
- Non-replacement of missing values with zero.
- Year/month boundary cutoff calculations (`2026-01-01 00:00Z` resolving to `2025-12-31 11:00Z`).

### Run Backend Unit Tests:
```bash
python3 -m unittest discover -s backend/tests -v
```

### Run TypeScript Linter & Type Check:
```bash
npm run lint
```

### Run Production Build Verification:
```bash
npm run build
```

---

## 12. Environment Variables Reference

Copy `.env.example` to `.env` to customize settings:

```bash
# Server Port
PORT=3000

# Frontend API URL
VITE_API_BASE_URL="/api/v1"

# Official Elexon BMRS API Base URL
ELEXON_API_BASE_URL="https://data.elexon.co.uk/bmrs/api/v1"

# Default Day-Ahead Decision Cutoff Mode
# Options: d_minus_1_1100 | d_minus_1_1200 | d_minus_1_1830 | lead_time_12h | lead_time_4h
DAY_AHEAD_CUTOFF_MODE="d_minus_1_1100"

# Default Interval Alignment Mode
# Options: strict_exact | hh_step
INTERVAL_ALIGNMENT_MODE="strict_exact"

# Guard Threshold for MAPE Calculation (in MW)
MAPE_MIN_ACTUAL_MW_THRESHOLD="100"

# Path to Local Historical Elexon Cache File
CACHE_FILE_PATH="./data/elexon_jan2026_cache.json"
```

---

## 13. Limitations & Market Boundary Disclosures

In accordance with institutional standards, the following technical and domain boundaries are explicitly stated:

1. **Historical Data Scope**: The platform is configured strictly for **January 2026** historical data. It does not ingest live telemetry for today's trading day.
2. **Wind Generation Scope**: Scope is strictly limited to UK national-level wind generation actuals (`FUELHH`) and forecasts (`WINDFOR`). Total electricity demand, solar, nuclear, gas (CCGT), interconnectors, and market clearing prices are intentionally outside this project's scope.
3. **Imbalance Volume Distinction**: A wind forecast error of $+500\text{ MW}$ does **not** imply a required power procurement volume of $+500\text{ MW}$. Net utility procurement obligations depend on simultaneous customer demand deviations, retail hedge books, and portfolio positions not present in these two Elexon datasets.
4. **Temporal Granularity**: `WINDFOR` is published at hourly resolution, while `FUELHH` is half-hourly. In default `strict_exact` mode, `:30` half-hour actual intervals are reported as `ACTUAL_ONLY_UNMATCHED_HH` without synthetic interpolation.

---

## 14. Assignment Submission Guide

### Deliverable 1: Demo Video (Maximum 10 Minutes)
The evaluation begins with the unlisted YouTube video demonstration:
- **Part 1: Client & Trading Desk Presentation (<= 5 Minutes)**:
  - Demonstrate the executive dashboard, KPI cards (distinguishing MW power from MWh energy), and the main Actual vs. Forecast generation chart.
  - Explain the business value of Day-Ahead Decision Cutoffs (`D-1 11:00 GMT`) in preventing costly volume errors.
  - Walk through the Forecast Explorer and demonstrate drilling into a high-error interval to audit forecast vintages.
- **Part 2: Technical Lead Architecture & Code Walkthrough (<= 5 Minutes)**:
  - Explain the Elexon ingestion pipeline (`FUELHH` 30-min vs. `WINDFOR` 60-min).
  - Walk through `backend/forecast_selector.py` and show how post-cutoff forecasts are strictly filtered out.
  - Show the statistical accuracy engine in `backend/metrics.py` (MAE, RMSE, bias, guarded MAPE).
  - Demonstrate running `python3 -m unittest discover -s backend/tests -v` and starting the app with Docker.
- **Upload**: Upload to YouTube with visibility set to **Unlisted** and paste the link in the submission form.

### Deliverable 2: Public GitHub Repository
- Create a public GitHub repository with an **anonymous/random name** (e.g., `kjhwr` or `windsight-gb`).
- Push all source code, `backend/`, `src/`, `data/`, `server.ts`, `Dockerfile`, `docker-compose.yml`, and `README.md`.

### Deliverable 3: Final Submission Verification
Before submitting, open all links in an **Incognito / Private browser window** to ensure:
- The deployed application URL loads without requiring authentication.
- The GitHub repository is public and accessible.
- The YouTube video is playable via the unlisted link.

---

## 15. AI Tools Usage Disclosure

In compliance with assignment guidelines, AI-assisted development tools (Claude, Gemini, Cursor) were utilized during the development of this project for:
- Structuring initial TypeScript interfaces and Pydantic validation models matching Elexon's raw BMRS stream payloads.
- Assisting with Recharts configuration syntax (e.g. customized Brush components and tooltips).
- Identifying unit test boundary scenarios for month/year transitions (`2026-01-01` resolving its D-1 cutoff to `2025-12-31`).

All mathematical formulations, cutoff selection algorithms, data alignment logic, and domain interpretations were independently authored, audited, and verified against official Elexon market documentation.
