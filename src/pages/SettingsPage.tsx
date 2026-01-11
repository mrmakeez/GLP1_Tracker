import { useEffect, useState } from 'react'
import {
  DEFAULT_TIMEZONE,
  addMedication,
  getSettings,
  listMedications,
  upsertSettings,
  updateMedication,
  type MedicationRecord,
} from '../db'

type SettingsFormState = {
  defaultTimezone: string
  chartSampleMinutes: number
  defaultLookbackDays: number
  defaultFutureDays: number
}

type MedicationDraft = {
  id: string
  name: string
  kaPerHour: string
  kePerHour: string
  scale: string
  notes: string
}

type NoticeState = {
  message: string
  tone: 'success' | 'error'
}

const DEFAULT_SETTINGS: SettingsFormState = {
  defaultTimezone: DEFAULT_TIMEZONE,
  chartSampleMinutes: 60,
  defaultLookbackDays: 30,
  defaultFutureDays: 7,
}

const DEFAULT_MEDICATIONS = [
  {
    name: 'Tirzepatide',
    kaPerHour: 0.12,
    kePerHour: 0.0058,
    scale: 1,
    notes: 'Approximate PK defaults (t1/2 ≈ 5 days, tmax ≈ 24-36h).',
  },
  {
    name: 'Retatrutide',
    kaPerHour: 0.1,
    kePerHour: 0.0048,
    scale: 1,
    notes: 'Approximate PK defaults (t1/2 ≈ 6 days, tmax ≈ 24-36h).',
  },
]

const DEFAULT_NEW_MEDICATION = {
  name: '',
  kaPerHour: String(DEFAULT_MEDICATIONS[0].kaPerHour),
  kePerHour: String(DEFAULT_MEDICATIONS[0].kePerHour),
  scale: String(DEFAULT_MEDICATIONS[0].scale),
  notes: '',
}

const TIMEZONE_OPTIONS = [
  'Pacific/Auckland',
  'UTC',
  'Australia/Sydney',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
]

const SAMPLE_OPTIONS = [15, 30, 60, 120]

const LOOKBACK_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
]

const FUTURE_OPTIONS = [
  { label: '0 days', value: 0 },
  { label: '7 days', value: 7 },
  { label: '10 days', value: 10 },
  { label: '30 days', value: 30 },
  { label: '4 months', value: 120 },
]

const toMedicationDraft = (medication: MedicationRecord): MedicationDraft => ({
  id: medication.id,
  name: medication.name,
  kaPerHour: String(medication.kaPerHour),
  kePerHour: String(medication.kePerHour),
  scale: String(medication.scale),
  notes: medication.notes,
})

const isPositiveNumber = (value: number) =>
  Number.isFinite(value) && value > 0

function SettingsPage() {
  const [settingsForm, setSettingsForm] =
    useState<SettingsFormState>(DEFAULT_SETTINGS)
  const [medicationDrafts, setMedicationDrafts] = useState<
    MedicationDraft[]
  >([])
  const [newMedication, setNewMedication] = useState<
    Omit<MedicationDraft, 'id'>
  >(DEFAULT_NEW_MEDICATION)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [medicationErrors, setMedicationErrors] = useState<
    Record<string, string>
  >({})

  const loadData = async () => {
    const [loadedSettings, loadedMedications] = await Promise.all([
      getSettings(),
      listMedications(),
    ])

    let resolvedMedications = loadedMedications
    if (resolvedMedications.length === 0) {
      const defaults = await Promise.all(
        DEFAULT_MEDICATIONS.map((medication) => addMedication(medication)),
      )
      resolvedMedications = defaults
    }

    setSettingsForm({
      defaultTimezone: loadedSettings.defaultTimezone,
      chartSampleMinutes: loadedSettings.chartSampleMinutes,
      defaultLookbackDays: loadedSettings.defaultLookbackDays,
      defaultFutureDays: loadedSettings.defaultFutureDays,
    })
    setMedicationDrafts(resolvedMedications.map(toMedicationDraft))
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const handleSettingsChange = <T extends keyof SettingsFormState>(
    field: T,
    value: SettingsFormState[T],
  ) => {
    setSettingsForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleMedicationChange = <T extends keyof MedicationDraft>(
    id: string,
    field: T,
    value: MedicationDraft[T],
  ) => {
    setMedicationDrafts((prev) =>
      prev.map((medication) =>
        medication.id === id ? { ...medication, [field]: value } : medication,
      ),
    )
  }

  const handleSaveSettings = async () => {
    await upsertSettings({
      defaultTimezone: settingsForm.defaultTimezone,
      chartSampleMinutes: settingsForm.chartSampleMinutes,
      defaultLookbackDays: settingsForm.defaultLookbackDays,
      defaultFutureDays: settingsForm.defaultFutureDays,
    })
    setNotice({ message: 'Settings saved.', tone: 'success' })
  }

  const handleResetSettings = async () => {
    await upsertSettings(DEFAULT_SETTINGS)
    setSettingsForm(DEFAULT_SETTINGS)
    setNotice({ message: 'Settings reset to defaults.', tone: 'success' })
  }

  const handleSaveMedications = async () => {
    const errors: Record<string, string> = {}

    for (const medication of medicationDrafts) {
      const ka = Number(medication.kaPerHour)
      const ke = Number(medication.kePerHour)
      const scale = Number(medication.scale)
      if (!isPositiveNumber(ka) || !isPositiveNumber(ke)) {
        errors[medication.id] = 'ka and ke must be positive numbers.'
        continue
      }
      if (!isPositiveNumber(scale)) {
        errors[medication.id] = 'Scale must be a positive number.'
      }
    }

    if (Object.keys(errors).length > 0) {
      setMedicationErrors(errors)
      setNotice({
        message: 'Fix medication validation errors before saving.',
        tone: 'error',
      })
      return
    }

    await Promise.all(
      medicationDrafts.map((medication) =>
        updateMedication(medication.id, {
          kaPerHour: Number(medication.kaPerHour),
          kePerHour: Number(medication.kePerHour),
          scale: Number(medication.scale),
          notes: medication.notes,
        }),
      ),
    )
    setMedicationErrors({})
    setNotice({ message: 'Medication profiles updated.', tone: 'success' })
  }

  const handleAddMedication = async () => {
    const name = newMedication.name.trim()
    const ka = Number(newMedication.kaPerHour)
    const ke = Number(newMedication.kePerHour)
    const scale = Number(newMedication.scale)

    if (!name) {
      setNotice({ message: 'Medication name is required.', tone: 'error' })
      return
    }

    if (!isPositiveNumber(ka) || !isPositiveNumber(ke)) {
      setNotice({
        message: 'Provide positive ka and ke values.',
        tone: 'error',
      })
      return
    }

    if (!isPositiveNumber(scale)) {
      setNotice({
        message: 'Provide a positive scale value.',
        tone: 'error',
      })
      return
    }

    const record = await addMedication({
      name,
      kaPerHour: ka,
      kePerHour: ke,
      scale,
      notes: newMedication.notes,
    })

    setMedicationDrafts((prev) => [...prev, toMedicationDraft(record)])
    setNewMedication(DEFAULT_NEW_MEDICATION)
    setNotice({ message: 'Medication profile added.', tone: 'success' })
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400">
          Customize PK parameters, timezone, and chart defaults.
        </p>
        <p className="text-xs text-slate-500">
          Estimates only; not medical advice.
        </p>
      </div>

      {notice ? (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            notice.tone === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
          <p className="text-sm font-semibold text-slate-200">
            Default timezone
          </p>
          <p className="text-xs text-slate-500">
            Used for dose logging and chart labels.
          </p>
          <select
            className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={settingsForm.defaultTimezone}
            onChange={(event) =>
              handleSettingsChange('defaultTimezone', event.target.value)
            }
          >
            {TIMEZONE_OPTIONS.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
          <p className="text-sm font-semibold text-slate-200">
            Chart sampling minutes
          </p>
          <p className="text-xs text-slate-500">
            Smaller values show more detailed curves.
          </p>
          <select
            className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={settingsForm.chartSampleMinutes}
            onChange={(event) =>
              handleSettingsChange(
                'chartSampleMinutes',
                Number(event.target.value),
              )
            }
          >
            {SAMPLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} minutes
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
          <p className="text-sm font-semibold text-slate-200">
            Default chart range
          </p>
          <p className="text-xs text-slate-500">
            Used when opening the chart view.
          </p>
          <div className="mt-3 space-y-3">
            <label className="block text-xs uppercase tracking-wide text-slate-500">
              Lookback
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={settingsForm.defaultLookbackDays}
              onChange={(event) =>
                handleSettingsChange(
                  'defaultLookbackDays',
                  Number(event.target.value),
                )
              }
            >
              {LOOKBACK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="block text-xs uppercase tracking-wide text-slate-500">
              Future horizon
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={settingsForm.defaultFutureDays}
              onChange={(event) =>
                handleSettingsChange(
                  'defaultFutureDays',
                  Number(event.target.value),
                )
              }
            >
              {FUTURE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSaveSettings}
          className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950"
        >
          Save settings
        </button>
        <button
          type="button"
          onClick={handleResetSettings}
          className="rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-200"
        >
          Reset to defaults
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-200">
              Medication profiles
            </p>
            <p className="text-xs text-slate-500">
              Update ka, ke, scale, and notes for each medication.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveMedications}
            className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950"
          >
            Save profiles
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {medicationDrafts.map((medication) => (
            <div
              key={medication.id}
              className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-200">
                  {medication.name}
                </p>
                {medicationErrors[medication.id] ? (
                  <span className="text-xs text-rose-300">
                    {medicationErrors[medication.id]}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <label className="text-xs text-slate-400">
                  ka / hour
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={medication.kaPerHour}
                    onChange={(event) =>
                      handleMedicationChange(
                        medication.id,
                        'kaPerHour',
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label className="text-xs text-slate-400">
                  ke / hour
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={medication.kePerHour}
                    onChange={(event) =>
                      handleMedicationChange(
                        medication.id,
                        'kePerHour',
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Scale
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={medication.scale}
                    onChange={(event) =>
                      handleMedicationChange(
                        medication.id,
                        'scale',
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Notes
                  <input
                    type="text"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={medication.notes}
                    onChange={(event) =>
                      handleMedicationChange(
                        medication.id,
                        'notes',
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-4">
          <p className="text-sm font-semibold text-slate-200">
            Add a medication
          </p>
          <p className="text-xs text-slate-500">
            Create additional profiles for new medications.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-5">
            <label className="text-xs text-slate-400 md:col-span-2">
              Name
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={newMedication.name}
                onChange={(event) =>
                  setNewMedication((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="text-xs text-slate-400">
              ka / hour
              <input
                type="number"
                min="0"
                step="0.001"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={newMedication.kaPerHour}
                onChange={(event) =>
                  setNewMedication((prev) => ({
                    ...prev,
                    kaPerHour: event.target.value,
                  }))
                }
              />
            </label>
            <label className="text-xs text-slate-400">
              ke / hour
              <input
                type="number"
                min="0"
                step="0.001"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={newMedication.kePerHour}
                onChange={(event) =>
                  setNewMedication((prev) => ({
                    ...prev,
                    kePerHour: event.target.value,
                  }))
                }
              />
            </label>
            <label className="text-xs text-slate-400">
              Scale
              <input
                type="number"
                min="0"
                step="0.001"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={newMedication.scale}
                onChange={(event) =>
                  setNewMedication((prev) => ({
                    ...prev,
                    scale: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="mt-3 block text-xs text-slate-400">
            Notes
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={newMedication.notes}
              onChange={(event) =>
                setNewMedication((prev) => ({
                  ...prev,
                  notes: event.target.value,
                }))
              }
            />
          </label>
          <button
            type="button"
            onClick={handleAddMedication}
            className="mt-4 rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-200"
          >
            Add medication
          </button>
        </div>
      </div>
    </section>
  )
}

export default SettingsPage
