import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_TIMEZONE,
  addDose,
  addMedication,
  addSchedule,
  deleteDose,
  deleteSchedule,
  getSettings,
  listDoses,
  listMedications,
  listSchedules,
  updateDose,
  updateSchedule,
  type DoseRecord,
  type MedicationRecord,
  type ScheduleFrequency,
  type ScheduleRecord,
  type SettingsRecord,
} from '../db'
import { reconcileScheduledDoses } from '../scheduling/reconcileScheduledDoses'
import { resolveTimezone } from '../scheduling/timezone'

type DoseFormState = {
  medicationId: string
  doseMg: string
  datetimeLocal: string
}

type ScheduleFormState = {
  enabled: boolean
  medicationId: string
  doseMg: string
  frequency: ScheduleFrequency
  intervalDays: string
  startDatetimeLocal: string
}

const defaultDoseForm: DoseFormState = {
  medicationId: '',
  doseMg: '',
  datetimeLocal: '',
}

const defaultScheduleForm: ScheduleFormState = {
  enabled: true,
  medicationId: '',
  doseMg: '',
  frequency: 'weekly',
  intervalDays: '7',
  startDatetimeLocal: '',
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

const getFormatter = (
  locale: string,
  options: Intl.DateTimeFormatOptions,
) => {
  const key = `${locale}:${JSON.stringify(options)}`
  const cached = formatterCache.get(key)
  if (cached) {
    return cached
  }
  const formatter = new Intl.DateTimeFormat(locale, options)
  formatterCache.set(key, formatter)
  return formatter
}

const formatDateTime = (isoString: string, timezone: string) => {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return isoString
  }
  return getFormatter('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date)
}

const toLocalInputValue = (isoString: string, timezone: string) => {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const formatter = getFormatter('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(date)
  const valueByType = new Map(
    parts.map((part) => [part.type, part.value]),
  )
  const year = valueByType.get('year')
  const month = valueByType.get('month')
  const day = valueByType.get('day')
  const hour = valueByType.get('hour')
  const minute = valueByType.get('minute')
  if (!year || !month || !day || !hour || !minute) {
    return ''
  }
  return `${year}-${month}-${day}T${hour}:${minute}`
}

const getTimezoneOffsetMinutes = (timezone: string, date: Date) => {
  const formatter = getFormatter('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(date)
  const valueByType = new Map(
    parts.map((part) => [part.type, part.value]),
  )
  const year = Number(valueByType.get('year'))
  const month = Number(valueByType.get('month'))
  const day = Number(valueByType.get('day'))
  const hour = Number(valueByType.get('hour'))
  const minute = Number(valueByType.get('minute'))
  const second = Number(valueByType.get('second'))
  const utcTime = Date.UTC(year, month - 1, day, hour, minute, second)
  return (utcTime - date.getTime()) / 60000
}

const parseDateTimeInZone = (
  datetimeLocal: string,
  timezone: string,
) => {
  const [datePart, timePart] = datetimeLocal.split('T')
  if (!datePart || !timePart) {
    return null
  }
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  if (
    [year, month, day, hour, minute].some((value) =>
      Number.isNaN(value),
    )
  ) {
    return null
  }
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute)
  const initialOffset = getTimezoneOffsetMinutes(
    timezone,
    new Date(utcGuess),
  )
  let adjusted = utcGuess - initialOffset * 60000
  const adjustedOffset = getTimezoneOffsetMinutes(
    timezone,
    new Date(adjusted),
  )
  if (adjustedOffset !== initialOffset) {
    adjusted = utcGuess - adjustedOffset * 60000
  }
  return new Date(adjusted)
}

function DosesPage() {
  const [medications, setMedications] = useState<MedicationRecord[]>([])
  const [doses, setDoses] = useState<DoseRecord[]>([])
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([])
  const [settings, setSettings] = useState<SettingsRecord | null>(null)
  const [doseForm, setDoseForm] = useState<DoseFormState>(defaultDoseForm)
  const [scheduleForm, setScheduleForm] =
    useState<ScheduleFormState>(defaultScheduleForm)
  const [doseErrors, setDoseErrors] = useState<Record<string, string>>({})
  const [scheduleErrors, setScheduleErrors] = useState<
    Record<string, string>
  >({})
  const [editingDoseId, setEditingDoseId] = useState<string | null>(null)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(
    null,
  )

  const timezone = resolveTimezone(
    settings?.defaultTimezone ?? DEFAULT_TIMEZONE,
    DEFAULT_TIMEZONE,
  )

  const medicationById = useMemo(() => {
    return new Map(medications.map((medication) => [medication.id, medication]))
  }, [medications])

  const sortedDoses = useMemo(
    () =>
      [...doses].sort(
        (a, b) =>
          new Date(b.datetimeIso).getTime() -
          new Date(a.datetimeIso).getTime(),
      ),
    [doses],
  )

  const sortedSchedules = useMemo(
    () =>
      [...schedules].sort(
        (a, b) =>
          new Date(b.startDatetimeIso).getTime() -
          new Date(a.startDatetimeIso).getTime(),
      ),
    [schedules],
  )

  const loadData = async () => {
    await reconcileScheduledDoses(new Date())
    const [loadedMedications, loadedDoses, loadedSchedules, loadedSettings] =
      await Promise.all([
        listMedications(),
        listDoses(),
        listSchedules(),
        getSettings(),
      ])

    let resolvedMedications = loadedMedications
    if (resolvedMedications.length === 0) {
      const defaults = await Promise.all([
        addMedication({
          name: 'Tirzepatide',
          kaPerHour: 0.12,
          kePerHour: 0.0058,
          scale: 1,
          notes: 'Approximate PK defaults (t1/2 ≈ 5 days, tmax ≈ 24-36h).',
        }),
        addMedication({
          name: 'Retatrutide',
          kaPerHour: 0.1,
          kePerHour: 0.0048,
          scale: 1,
          notes: 'Approximate PK defaults (t1/2 ≈ 6 days, tmax ≈ 24-36h).',
        }),
      ])
      resolvedMedications = defaults
    }

    setMedications(resolvedMedications)
    setDoses(loadedDoses)
    setSchedules(loadedSchedules)
    setSettings(loadedSettings)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const resetDoseForm = () => {
    setDoseForm(defaultDoseForm)
    setDoseErrors({})
    setEditingDoseId(null)
  }

  const resetScheduleForm = () => {
    setScheduleForm(defaultScheduleForm)
    setScheduleErrors({})
    setEditingScheduleId(null)
  }

  const handleDoseSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const errors: Record<string, string> = {}
    const existingDose = editingDoseId
      ? doses.find((dose) => dose.id === editingDoseId)
      : undefined
    const resolvedTimezone = resolveTimezone(
      existingDose?.timezone ?? timezone,
      timezone,
    )
    if (!doseForm.medicationId) {
      errors.medicationId = 'Select a medication.'
    }
    const doseValue = Number(doseForm.doseMg)
    if (!doseForm.doseMg || Number.isNaN(doseValue) || doseValue <= 0) {
      errors.doseMg = 'Dose must be greater than 0.'
    }
    if (!doseForm.datetimeLocal) {
      errors.datetimeLocal = 'Choose a date and time.'
    }

    const parsedDate = parseDateTimeInZone(
      doseForm.datetimeLocal,
      resolvedTimezone,
    )
    if (
      doseForm.datetimeLocal &&
      (!parsedDate || Number.isNaN(parsedDate.getTime()))
    ) {
      errors.datetimeLocal = 'Enter a valid date and time.'
    }

    setDoseErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }
    if (!parsedDate) {
      return
    }

    const payload = {
      medicationId: doseForm.medicationId,
      doseMg: doseValue,
      datetimeIso: parsedDate.toISOString(),
      timezone: resolvedTimezone,
    }

    if (editingDoseId) {
      if (existingDose?.source === 'scheduled') {
        const shouldDetachSchedule =
          payload.datetimeIso !== existingDose.datetimeIso ||
          payload.medicationId !== existingDose.medicationId ||
          payload.doseMg !== existingDose.doseMg
        if (shouldDetachSchedule) {
          await updateDose(editingDoseId, {
            ...payload,
            source: 'manual',
            scheduleId: undefined,
            occurrenceKey: undefined,
            status: undefined,
          })
          resetDoseForm()
          await loadData()
          return
        }
        await updateDose(editingDoseId, {
          ...payload,
          source: 'scheduled',
          status: existingDose.status,
          scheduleId: existingDose.scheduleId,
          occurrenceKey: existingDose.occurrenceKey,
        })
      } else {
        await updateDose(editingDoseId, payload)
      }
    } else {
      await addDose(payload)
    }

    resetDoseForm()
    await loadData()
  }

  const handleScheduleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    const errors: Record<string, string> = {}
    const existingSchedule = editingScheduleId
      ? schedules.find((schedule) => schedule.id === editingScheduleId)
      : undefined
    const resolvedTimezone = resolveTimezone(
      existingSchedule?.timezone ?? timezone,
      timezone,
    )
    if (!scheduleForm.medicationId) {
      errors.medicationId = 'Select a medication.'
    }
    const doseValue = Number(scheduleForm.doseMg)
    if (!scheduleForm.doseMg || Number.isNaN(doseValue) || doseValue <= 0) {
      errors.doseMg = 'Dose must be greater than 0.'
    }
    if (!scheduleForm.startDatetimeLocal) {
      errors.startDatetimeLocal = 'Choose a start date and time.'
    }
    const parsedDate = parseDateTimeInZone(
      scheduleForm.startDatetimeLocal,
      resolvedTimezone,
    )
    if (
      scheduleForm.startDatetimeLocal &&
      (!parsedDate || Number.isNaN(parsedDate.getTime()))
    ) {
      errors.startDatetimeLocal = 'Enter a valid date and time.'
    }

    const resolvedInterval =
      scheduleForm.frequency === 'custom'
        ? Number(scheduleForm.intervalDays)
        : scheduleForm.frequency === 'daily'
          ? 1
          : 7
    if (
      scheduleForm.frequency === 'custom' &&
      (!scheduleForm.intervalDays ||
        Number.isNaN(resolvedInterval) ||
        resolvedInterval <= 0)
    ) {
      errors.intervalDays = 'Interval must be greater than 0.'
    }

    setScheduleErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }
    if (!parsedDate) {
      return
    }

    const payload = {
      medicationId: scheduleForm.medicationId,
      doseMg: doseValue,
      frequency: scheduleForm.frequency,
      interval: resolvedInterval,
      startDatetimeIso: parsedDate.toISOString(),
      timezone: resolvedTimezone,
      enabled: scheduleForm.enabled,
    }

    if (editingScheduleId) {
      await updateSchedule(editingScheduleId, payload)
    } else {
      await addSchedule(payload)
    }

    resetScheduleForm()
    await loadData()
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Doses</h1>
          <p className="text-sm text-slate-400">
            Log injections quickly and review the latest entries.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form
          onSubmit={handleDoseSubmit}
          className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 px-4 py-4"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              {editingDoseId ? 'Edit dose' : 'Add dose'}
            </h2>
            <p className="text-xs text-slate-400">
              Default timezone: {timezone}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              Medication
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={doseForm.medicationId}
              onChange={(event) =>
                setDoseForm((prev) => ({
                  ...prev,
                  medicationId: event.target.value,
                }))
              }
            >
              <option value="">Select a medication</option>
              {medications.map((medication) => (
                <option key={medication.id} value={medication.id}>
                  {medication.name}
                </option>
              ))}
            </select>
            {doseErrors.medicationId ? (
              <p className="text-xs text-rose-400">
                {doseErrors.medicationId}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              Dose strength (mg)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={doseForm.doseMg}
              onChange={(event) =>
                setDoseForm((prev) => ({
                  ...prev,
                  doseMg: event.target.value,
                }))
              }
            />
            {doseErrors.doseMg ? (
              <p className="text-xs text-rose-400">{doseErrors.doseMg}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              Dose date &amp; time
            </label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={doseForm.datetimeLocal}
              onChange={(event) =>
                setDoseForm((prev) => ({
                  ...prev,
                  datetimeLocal: event.target.value,
                }))
              }
            />
            {doseErrors.datetimeLocal ? (
              <p className="text-xs text-rose-400">
                {doseErrors.datetimeLocal}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              {editingDoseId ? 'Update dose' : 'Save dose'}
            </button>
            {editingDoseId ? (
              <button
                type="button"
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200"
                onClick={resetDoseForm}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        <form
          onSubmit={handleScheduleSubmit}
          className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 px-4 py-4"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              {editingScheduleId ? 'Edit schedule' : 'Schedule builder'}
            </h2>
            <p className="text-xs text-slate-400">
              Enable recurring doses for projections.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500"
              checked={scheduleForm.enabled}
              onChange={(event) =>
                setScheduleForm((prev) => ({
                  ...prev,
                  enabled: event.target.checked,
                }))
              }
            />
            Enable schedule
          </label>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              Medication
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={scheduleForm.medicationId}
              onChange={(event) =>
                setScheduleForm((prev) => ({
                  ...prev,
                  medicationId: event.target.value,
                }))
              }
            >
              <option value="">Select a medication</option>
              {medications.map((medication) => (
                <option key={medication.id} value={medication.id}>
                  {medication.name}
                </option>
              ))}
            </select>
            {scheduleErrors.medicationId ? (
              <p className="text-xs text-rose-400">
                {scheduleErrors.medicationId}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              Dose strength (mg)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={scheduleForm.doseMg}
              onChange={(event) =>
                setScheduleForm((prev) => ({
                  ...prev,
                  doseMg: event.target.value,
                }))
              }
            />
            {scheduleErrors.doseMg ? (
              <p className="text-xs text-rose-400">{scheduleErrors.doseMg}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              Frequency
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={scheduleForm.frequency}
              onChange={(event) => {
                const frequency = event.target
                  .value as ScheduleFrequency
                setScheduleForm((prev) => ({
                  ...prev,
                  frequency,
                  intervalDays:
                    frequency === 'daily'
                      ? '1'
                      : frequency === 'weekly'
                        ? '7'
                        : prev.intervalDays,
                }))
              }}
            >
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
              <option value="custom">Custom interval</option>
            </select>
          </div>
          {scheduleForm.frequency === 'custom' ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                Custom interval (days)
              </label>
              <input
                type="number"
                min="1"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={scheduleForm.intervalDays}
                onChange={(event) =>
                  setScheduleForm((prev) => ({
                    ...prev,
                    intervalDays: event.target.value,
                  }))
                }
              />
              {scheduleErrors.intervalDays ? (
                <p className="text-xs text-rose-400">
                  {scheduleErrors.intervalDays}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              Start date &amp; time
            </label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={scheduleForm.startDatetimeLocal}
              onChange={(event) =>
                setScheduleForm((prev) => ({
                  ...prev,
                  startDatetimeLocal: event.target.value,
                }))
              }
            />
            {scheduleErrors.startDatetimeLocal ? (
              <p className="text-xs text-rose-400">
                {scheduleErrors.startDatetimeLocal}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              {editingScheduleId ? 'Update schedule' : 'Save schedule'}
            </button>
            {editingScheduleId ? (
              <button
                type="button"
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200"
                onClick={resetScheduleForm}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-100">Dose history</h2>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Medication</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Dose</th>
                <th className="px-4 py-3 font-medium">Date &amp; time</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedDoses.length === 0 ? (
                <tr className="border-t border-slate-800">
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No doses yet. Add your first entry above.
                  </td>
                </tr>
              ) : (
                sortedDoses.map((row) => {
                  const medication = medicationById.get(row.medicationId)
                  const isScheduled = row.source === 'scheduled'
                  const statusLabel =
                    row.status === 'confirmed_taken'
                      ? 'Confirmed'
                      : row.status === 'skipped'
                        ? 'Skipped'
                        : row.status === 'assumed_taken'
                          ? 'Assumed'
                          : null
                  const statusStyles =
                    row.status === 'confirmed_taken'
                      ? 'border-emerald-400/40 text-emerald-200'
                      : row.status === 'skipped'
                        ? 'border-rose-400/40 text-rose-200'
                        : 'border-amber-400/40 text-amber-200'
                  return (
                    <tr key={row.id} className="border-t border-slate-800">
                      <td className="px-4 py-3">
                        {medication?.name ?? 'Unknown'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {isScheduled ? (
                            <span className="rounded-full border border-sky-400/40 px-2 py-0.5 text-sky-200">
                              Scheduled
                            </span>
                          ) : (
                            <span className="rounded-full border border-slate-600 px-2 py-0.5 text-slate-300">
                              Manual
                            </span>
                          )}
                          {isScheduled && statusLabel ? (
                            <span
                              className={`rounded-full border px-2 py-0.5 ${statusStyles}`}
                            >
                              {statusLabel}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">{row.doseMg} mg</td>
                      <td className="px-4 py-3">
                        {formatDateTime(
                          row.datetimeIso,
                          resolveTimezone(row.timezone ?? timezone, timezone),
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        <div className="flex flex-wrap gap-2">
                          {isScheduled ? (
                            <>
                              <button
                                type="button"
                                className="rounded-full border border-emerald-500/60 px-3 py-1 text-xs text-emerald-200"
                                onClick={async () => {
                                  await updateDose(row.id, {
                                    status: 'confirmed_taken',
                                  })
                                  await loadData()
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-rose-500/60 px-3 py-1 text-xs text-rose-200"
                                onClick={async () => {
                                  await updateDose(row.id, {
                                    status: 'skipped',
                                  })
                                  await loadData()
                                }}
                              >
                                Skip
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="rounded-full border border-slate-700 px-3 py-1 text-xs"
                            onClick={() => {
                              setEditingDoseId(row.id)
                              setDoseForm({
                                medicationId: row.medicationId,
                                doseMg: String(row.doseMg),
                                datetimeLocal: toLocalInputValue(
                                  row.datetimeIso,
                                  resolveTimezone(
                                    row.timezone ?? timezone,
                                    timezone,
                                  ),
                                ),
                              })
                              setDoseErrors({})
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-rose-500/60 px-3 py-1 text-xs text-rose-300"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  'Delete this dose entry?',
                                )
                              ) {
                                return
                              }
                              await deleteDose(row.id)
                              await loadData()
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-100">
          Schedules
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Medication</th>
                <th className="px-4 py-3 font-medium">Dose</th>
                <th className="px-4 py-3 font-medium">Frequency</th>
                <th className="px-4 py-3 font-medium">Start</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedSchedules.length === 0 ? (
                <tr className="border-t border-slate-800">
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No schedules yet. Create one above to project future doses.
                  </td>
                </tr>
              ) : (
                sortedSchedules.map((schedule) => {
                  const medication = medicationById.get(schedule.medicationId)
                  const frequencyLabel =
                    schedule.frequency === 'custom'
                      ? `Every ${schedule.interval} days`
                      : schedule.frequency === 'daily'
                        ? 'Daily'
                        : 'Weekly'
                  return (
                    <tr
                      key={schedule.id}
                      className="border-t border-slate-800"
                    >
                      <td className="px-4 py-3">
                        {medication?.name ?? 'Unknown'}
                      </td>
                      <td className="px-4 py-3">{schedule.doseMg} mg</td>
                      <td className="px-4 py-3">{frequencyLabel}</td>
                      <td className="px-4 py-3">
                        {formatDateTime(
                          schedule.startDatetimeIso,
                          resolveTimezone(
                            schedule.timezone ?? timezone,
                            timezone,
                          ),
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {schedule.enabled ? 'Enabled' : 'Paused'}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-full border border-slate-700 px-3 py-1 text-xs"
                            onClick={() => {
                              setEditingScheduleId(schedule.id)
                              setScheduleForm({
                                enabled: schedule.enabled,
                                medicationId: schedule.medicationId,
                                doseMg: String(schedule.doseMg),
                                frequency: schedule.frequency,
                                intervalDays: String(schedule.interval),
                                startDatetimeLocal: toLocalInputValue(
                                  schedule.startDatetimeIso,
                                  resolveTimezone(
                                    schedule.timezone ?? timezone,
                                    timezone,
                                  ),
                                ),
                              })
                              setScheduleErrors({})
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-rose-500/60 px-3 py-1 text-xs text-rose-300"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  'Delete this schedule?',
                                )
                              ) {
                                return
                              }
                              await deleteSchedule(schedule.id)
                              await loadData()
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default DosesPage
