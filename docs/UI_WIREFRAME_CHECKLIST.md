
```markdown
# docs/UI_WIREFRAME_CHECKLIST.md

# UI Wireframe Checklist (Minimal)

Use this as a build checklist and as guardrails for Codex/agents.

---

## Global Layout
- [ ] Mobile-first layout (works well at 360px wide)
- [ ] Top app header with title + subtle status area (optional)
- [ ] Primary navigation tabs:
  - [ ] Doses
  - [ ] Chart
  - [ ] Settings
  - [ ] Data
- [ ] Toast/alert system for success/error/info
- [ ] Empty-state components (no doses, no schedules, etc.)

---

## Page: Doses

### Add Dose Card
**Fields**
- [ ] Medication dropdown (Tirzepatide, Retatrutide; supports more later)
- [ ] Date & time input (datetime-local)
- [ ] Dose mg input (number, step 0.1)
- [ ] Save button

**Validation**
- [ ] medication required
- [ ] dose mg > 0
- [ ] datetime valid
- [ ] show inline errors (not just alerts)
- [ ] on successful save: clear inputs + toast

### Dose List
- [ ] List newest-first
- [ ] Each row shows:
  - [ ] Medication name
  - [ ] Dose mg
  - [ ] Date/time (rendered in selected timezone)
- [ ] Row actions:
  - [ ] Edit (opens inline edit or modal)
  - [ ] Delete (confirm prompt)
- [ ] Smooth scrolling for long lists

### Schedule Builder (optional section)
- [ ] Toggle: “Enable schedule”
- [ ] Medication dropdown
- [ ] Start date/time
- [ ] Dose mg
- [ ] Frequency selector:
  - [ ] Weekly (default)
  - [ ] Daily
  - [ ] Custom interval (days)
- [ ] Enabled toggle per schedule row
- [ ] Show a small preview line: “Next dose: <datetime>”
- [ ] Schedule list with edit/delete

**Rules**
- [ ] Scheduling does not pre-create infinite future rows
- [ ] Future doses generated only within the active chart horizon

---

## Page: Chart

### Controls (top)
- [ ] Lookback selector:
  - [ ] 7d / 30d / 90d / 1y (+ optional Custom)
- [ ] Future horizon selector:
  - [ ] 0d / 7d / 10d / 30d / 4mo
- [ ] Sampling selector (or in Settings, but show current):
  - [ ] 15 / 30 / 60 / 120 minutes (display only if set in Settings)
- [ ] Medication toggles:
  - [ ] per-medication line on/off
  - [ ] optional “Total” line on/off

### Chart Area
- [ ] Time-series line chart
- [ ] Tooltip: datetime + amount (mg)
- [ ] Y-axis labeled “mg in system”
- [ ] Handles empty state (no doses) gracefully
- [ ] Performance:
  - [ ] memoize series generation
  - [ ] avoid recompute on unrelated state changes

### Extrapolation behavior
- [ ] Chart includes actual historical doses and computed future schedule doses
- [ ] Future region visually continuous (optional: shaded future area)
- [ ] “Now” vertical marker (optional)

---

## Page: Settings

### General Settings
- [ ] Default timezone
  - [ ] default: Pacific/Auckland
- [ ] Chart sampling minutes (15/30/60/120)
- [ ] Default lookback (days)
- [ ] Default future horizon (days)

### Medication Profiles Editor
For each medication:
- [ ] Name (string)
- [ ] kaPerHour (number)
- [ ] kePerHour (number)
- [ ] scale (number)
- [ ] notes (optional)

Actions:
- [ ] Add medication profile
- [ ] Save changes
- [ ] Reset to defaults (for built-ins)

Safety copy:
- [ ] “Estimates only; not medical advice.”

---

## Page: Data (Export/Import)

### Export
- [ ] “Export JSON” button
- [ ] Downloads a single JSON file with schemaVersion + exportedAt
- [ ] Success toast

### Import
- [ ] File picker (accept .json)
- [ ] Validate schemaVersion + required tables
- [ ] Replace-all checkbox (v1 default on)
- [ ] Success toast + option to reload view
- [ ] Clear error messages if import fails

---

## PWA / Offline UX
- [ ] PWA installable (manifest present, SW active)
- [ ] Offline indicator toast:
  - [ ] “Offline ready” when SW is installed
- [ ] App still loads when offline (after first visit)

---

## Accessibility & Quality
- [ ] Keyboard navigation works for core flows
- [ ] Form labels properly associated
- [ ] Buttons have clear disabled/loading states
- [ ] Unit tests:
  - [ ] Bateman calculations (dt<0, ka≈ke)
  - [ ] export/import validation
