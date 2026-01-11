# GLP-1 Level Tracker (PWA) — PRD / Agent Spec

## Summary
Build a privacy-first Progressive Web App that estimates GLP-1 medication levels in the body (expressed as “mg in system”) using a Bateman pharmacokinetics model. The app is inspired by the general concept of “Shotsy”-style tracking, but is an original implementation.

The app runs fully offline, stores data locally (IndexedDB), and supports export/import of the local database.

## Goals
- Fast, offline-capable logging of doses (medication, dose amount, timestamp).
- Optional scheduling of future doses (e.g., 2 mg every week) for forward extrapolation.
- Clear chart of estimated medication levels over time:
  - historical levels from logged doses
  - extrapolated future levels from schedules
- Local-only data storage with export/import for backups and device migration.
- Configurable medication PK parameters (ka, ke, scale) to support additional medications later.

## Non-goals
- Medical advice, dosing recommendations, or clinical decision support.
- User accounts, cloud sync, sharing, or analytics by default.
- Precise individual calibration (weight/sex/renal function, etc.) in v1.

## Target Users
- Individuals tracking GLP-1 injection schedules who want a visual estimate of “levels” over time.
- Users who value privacy/offline use.

## Key User Stories
1. As a user, I can log a dose (medication, mg, date/time) in under 15 seconds.
2. As a user, I can define a weekly schedule and see projected future levels.
3. As a user, I can view the chart for the last 7/30/90 days or last year, plus a chosen future horizon.
4. As a user, I can export my data to a JSON file and import it later.
5. As a user, I can edit PK constants per medication (ka, ke, scale) and immediately see chart changes.

## Functional Requirements

### Dose Inputs
- Fields:
  - Medication type: Tirzepatide or Retatrutide (extensible list).
  - Dose date & time (timezone-aware; default Pacific/Auckland).
  - Dose strength in mg (decimal allowed).
- CRUD:
  - Add, edit, delete doses.
  - List doses sorted newest-first.
- Validation:
  - Dose mg > 0
  - datetime must be valid

### Scheduling Future Doses
- User can define schedules per medication:
  - start date & time
  - dose mg
  - frequency: daily, weekly, or custom interval (days)
  - enabled toggle
- The system generates “virtual future doses” only within the requested chart horizon (no infinite pre-generation).

### Local Storage + Export/Import
- Storage: IndexedDB (Dexie) with a schema version.
- Export: single JSON file containing all tables and metadata (schemaVersion, exportedAt).
- Import:
  - Validate schemaVersion and required tables.
  - Provide “Replace all data” mode (v1).
  - Show success/error messages.

### Output Chart
- Displays estimated medication levels (mg in system) over time.
- Range selection:
  - Lookback: 7d, 30d, 90d, 1y (and optional custom).
  - Future horizon: 0d, 7d, 10d, 30d, 4mo (months allowed).
  - Display range = [now - lookback, now + futureHorizon].
- Sampling resolution:
  - default 60 minutes (configurable in Settings).
- Chart should be readable on mobile; tooltip shows timestamp + value.
- Multi-medication behavior:
  - Prefer separate lines per medication + optional total line, with toggles.

### PK / Bateman Model
- Compute estimated amount (mg) using extravascular Bateman function with first-order absorption and elimination.
- For each dose at time t0:
  - dtHours = (t - t0) in hours
  - if dtHours < 0: contribution = 0
  - else:
    - contribution = doseMg * scale * (ka/(ka - ke)) * (exp(-ke*dt) - exp(-ka*dt))
- Stability:
  - If |ka - ke| is extremely small, use limiting form:
    - contribution = doseMg * scale * (ka * dt) * exp(-ka*dt)
  - Clamp negative numeric artifacts to 0.
- Constants:
  - kaPerHour, kePerHour, scale are per-medication and user-editable.
  - No hardcoded “authoritative” medical constants in v1; ship placeholders and require user configuration.

### Settings
- Default timezone (prepopulate Pacific/Auckland).
- Chart sampling minutes (e.g., 15/30/60/120).
- Default lookback and future horizon.
- Medication profiles editor:
  - Edit ka, ke, scale, notes.
  - Add new medication profile.

### PWA + Offline
- Installable PWA with manifest and service worker.
- Offline-first:
  - App shell cached
  - Data stays in IndexedDB
- Provide a small “offline ready” indicator when the service worker is active.

## UX / IA
- Navigation tabs: Doses, Chart, Settings, Data.
- Mobile-first layout; minimal taps to add a dose.
- Clear empty states (no doses yet, no schedules yet).

## Data Model (v1)
Tables:
- medications: id, name, kaPerHour, kePerHour, scale, notes, createdAt, updatedAt
- doses: id, medicationId, doseMg, datetimeIso, timezone, createdAt, updatedAt
- schedules: id, medicationId, startDatetimeIso, timezone, doseMg, frequency, interval, enabled, createdAt, updatedAt
- settings: singleton record with defaultTimezone, chartSampleMinutes, defaultLookbackDays, defaultFutureDays

## Acceptance Criteria
- User can add/edit/delete doses and they persist after refresh.
- User can create a weekly schedule and the chart shows future extrapolation.
- Chart range controls correctly adjust historical + future span.
- Export produces valid JSON; import restores identical chart output.
- PK engine passes unit tests and handles ka≈ke without NaNs.
- PWA is installable and usable offline after first load.

## Quality / Engineering Notes
- Use TypeScript everywhere; keep pk calculations in a pure module with tests.
- Memoize time-series generation to avoid sluggish UI.
- No network calls required for core functionality.
- Keep PRs small and feature-scoped; CI must pass (lint/test/build).
