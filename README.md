# GLP-1 Level Tracker (PWA)

Privacy-first PWA that estimates GLP-1 medication levels (“mg in system”) using a Bateman pharmacokinetics model.
Runs offline, stores data locally (IndexedDB), and supports export/import for backups.

> Note: This app provides **estimates only** and is **not medical advice**.

---

## Status

This project is under active development and currently **pre-release** (`v0.0.0`). Expect occasional breaking changes (including IndexedDB schema bumps); use **Export** for backups when upgrading between versions.

Current scope:
- Offline-first dose logging
- Recurring schedules (materialised past occurrences + projected future occurrences)
- Charting + configurable PK parameters
- Local JSON export/import (replace-all)

---

## Features

### Dose logging
- Medication type (Tirzepatide, Retatrutide; extensible)
- Dose date & time (timezone-aware; default **Pacific/Auckland**)
- Dose strength (mg)
- Add / edit / delete doses
- Stored locally (IndexedDB)

### Scheduling (optional)
- Future-dose schedules (e.g., weekly, daily, custom interval)
- Past occurrences are materialised into Dose History as scheduled doses (deduped per schedule + timestamp)
- Scheduled doses support status tracking (assumed/confirmed/skipped); skipped scheduled doses are excluded from chart estimates
- Schedules generate “virtual” future doses only within the chart horizon

### Charting
- Estimated levels over time (history + future extrapolation)
- Range controls:
  - Lookback: 7d / 30d / 90d / 1y
  - Future horizon: 0d / 7d / 10d / 30d / 4mo
- Sampling resolution configurable (e.g., 15/30/60/120 minutes)

### Data portability
- Export all local data to a single JSON file
- Import JSON (replace-all mode in v1)

### Offline-first PWA
- Installable (manifest + service worker)
- App shell cached; data stored in IndexedDB

---

## Tech Stack
- Vite + React + TypeScript
- Tailwind CSS
- IndexedDB via Dexie
- Charting: Recharts
- Tests: Vitest + React Testing Library
- Lint/format: ESLint + Prettier

---

## Local Development

### Prerequisites
- Node.js 18+ (recommended: latest LTS)
- npm (or pnpm/yarn if you adjust scripts)

### Install
    npm install

### Run dev server
    npm run dev

### Build
    npm run build

### Preview production build
    npm run preview

### Test
    npm run test

### Lint / Format
    npm run lint
    npm run format

---

## Project Structure (suggested)

    /src
      /components     UI building blocks
      /db             Dexie schema + CRUD helpers
      /pk             pharmacokinetics (Bateman) engine
      /pages          route-level pages
      /state          app state hooks/selectors
      /utils          date/time, validation, helpers

---

## Pharmacokinetics Model (Bateman)

For each dose with amount `doseMg` taken at time `t0`, the estimated amount remaining at time `t` is:

- Let `dtHours = (t - t0)` in hours.
- If `dtHours < 0` then contribution is `0`.
- Otherwise:

    A(dt) = doseMg * scale * (ka/(ka - ke)) * (exp(-ke*dt) - exp(-ka*dt))

Where:
- `ka` = absorption rate constant (per hour)
- `ke` = elimination rate constant (per hour)
- `scale` = folds constants so output is in “mg in system” (user-editable)

Stability:
- If `ka ≈ ke`, use limiting form:

    A(dt) = doseMg * scale * (ka * dt) * exp(-ka*dt)

- Clamp tiny negative numeric artifacts to 0.

**Important**: v1 ships with placeholder PK values; users can edit `ka`, `ke`, and `scale` in **Settings**.

---

## Data Storage & Backup

### Local database
- IndexedDB via Dexie
- Versioned schema (currently v3)

### Export
- Produces JSON: `{ schemaVersion, exportedAt, data: { ...tables } }`

### Import
- Validates schema + required tables
- Replace-all import (v1)

---

## PWA Install & Offline
- After first load, the app should function offline
- Install from the browser:
  - Chrome/Edge: “Install app”
  - iOS Safari: Share → “Add to Home Screen”

---

## Deployment (GitHub Pages)
1. In GitHub: **Settings → Pages**
2. Set Source to **GitHub Actions**
3. Ensure the `main` branch is the default branch
4. Push or merge to `main` to trigger the deployment workflow

Notes:
- The deployment workflow sets `VITE_BASE_PATH` to `/<repo>/` so assets resolve at
  `https://<user>.github.io/<repo>/`.
- If you set `VITE_BASE_PATH` manually, include the repository path (trailing slash optional).
- If you rename the repository, update the Pages URL and allow the workflow to re-run.

---

## Privacy
- No accounts, no cloud sync, no analytics by default
- All dose/schedule data stays on-device unless the user exports it

---

## Contributing / PR Discipline
- Keep PRs small and feature-scoped
- Ensure `npm run lint && npm run test && npm run build` pass
- Add/adjust tests for pk math and import/export validation

---

## License
MIT
