import { useEffect, useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'
import {
  DEFAULT_TIMEZONE,
  addMedication,
  getSettings,
  listDoses,
  listMedications,
  listSchedules,
  type DoseRecord,
  type MedicationRecord,
  type ScheduleRecord,
  type SettingsRecord,
} from '../db'
import {
  totalAmountAtTime,
  type DoseEvent,
  type MedicationProfile,
} from '../pk/bateman'

const DAY_IN_MS = 24 * 60 * 60 * 1000

const LOOKBACK_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
]

const FUTURE_OPTIONS = [
  { label: '0d', value: '0d', days: 0 },
  { label: '7d', value: '7d', days: 7 },
  { label: '10d', value: '10d', days: 10 },
  { label: '30d', value: '30d', days: 30 },
  { label: '4mo', value: '4mo', months: 4 },
]

const COLORS = [
  '#38bdf8',
  '#f472b6',
  '#a78bfa',
  '#4ade80',
  '#fbbf24',
]

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY_IN_MS)

const addMonths = (date: Date, months: number) => {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

const formatDateTime = (date: Date, timezone: string) => {
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date)
}

const buildTimePoints = (
  start: Date,
  end: Date,
  sampleMinutes: number,
) => {
  if (sampleMinutes <= 0 || end.getTime() < start.getTime()) {
    return []
  }
  const points: Date[] = []
  const stepMs = sampleMinutes * 60 * 1000
  let current = start.getTime()
  const endTime = end.getTime()
  while (current <= endTime) {
    points.push(new Date(current))
    current += stepMs
  }
  return points
}

const toDoseEvent = (
  record: DoseRecord,
  medication: MedicationProfile,
): DoseEvent => ({
  datetime: new Date(record.datetimeIso),
  doseMg: record.doseMg,
  medication,
})

const buildFutureScheduleDoses = (
  schedule: ScheduleRecord,
  medication: MedicationProfile,
  now: Date,
  end: Date,
) => {
  if (!schedule.enabled) {
    return []
  }
  const start = new Date(schedule.startDatetimeIso)
  if (Number.isNaN(start.getTime())) {
    return []
  }
  const intervalDays = schedule.interval
  if (!intervalDays || intervalDays <= 0) {
    return []
  }

  const intervalMs = intervalDays * DAY_IN_MS
  const nowTime = now.getTime()
  const endTime = end.getTime()
  let nextTime = start.getTime()

  if (nextTime < nowTime) {
    const diff = nowTime - nextTime
    const steps = Math.floor(diff / intervalMs)
    nextTime += steps * intervalMs
    if (nextTime < nowTime) {
      nextTime += intervalMs
    }
  }

  const events: DoseEvent[] = []
  while (nextTime <= endTime) {
    events.push({
      datetime: new Date(nextTime),
      doseMg: schedule.doseMg,
      medication,
    })
    nextTime += intervalMs
  }

  return events
}

const resolveFutureOption = (settings: SettingsRecord | null) => {
  if (!settings) {
    return FUTURE_OPTIONS[1]
  }
  const match = FUTURE_OPTIONS.find(
    (option) => option.days === settings.defaultFutureDays,
  )
  return match ?? FUTURE_OPTIONS[1]
}

function ChartPage() {
  const [medications, setMedications] = useState<MedicationRecord[]>([])
  const [doses, setDoses] = useState<DoseRecord[]>([])
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([])
  const [settings, setSettings] = useState<SettingsRecord | null>(null)
  const [lookbackDays, setLookbackDays] = useState<number>(30)
  const [futureOption, setFutureOption] = useState<string>('7d')
  const [showTotal, setShowTotal] = useState(true)
  const [visibleMedicationIds, setVisibleMedicationIds] = useState<string[]>(
    [],
  )

  const timezone = settings?.defaultTimezone ?? DEFAULT_TIMEZONE
  const sampleMinutes = settings?.chartSampleMinutes ?? 60

  const medicationById = useMemo(() => {
    return new Map(medications.map((medication) => [medication.id, medication]))
  }, [medications])

  const loadData = async () => {
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
          kaPerHour: 1,
          kePerHour: 1,
          scale: 1,
          notes: 'Placeholder PK constants. Update in Settings.',
        }),
        addMedication({
          name: 'Retatrutide',
          kaPerHour: 1,
          kePerHour: 1,
          scale: 1,
          notes: 'Placeholder PK constants. Update in Settings.',
        }),
      ])
      resolvedMedications = defaults
    }

    setMedications(resolvedMedications)
    setDoses(loadedDoses)
    setSchedules(loadedSchedules)
    setSettings(loadedSettings)

    setLookbackDays(loadedSettings.defaultLookbackDays)
    const resolvedFuture = resolveFutureOption(loadedSettings)
    setFutureOption(resolvedFuture.value)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisibleMedicationIds((prev) => {
        const nextIds = medications.map((medication) => medication.id)
        if (prev.length === 0) {
          return nextIds
        }
        const prevSet = new Set(prev)
        const merged = nextIds.filter((id) => prevSet.has(id))
        const additions = nextIds.filter((id) => !prevSet.has(id))
        return [...merged, ...additions]
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [medications])

  const activeFutureOption = useMemo(() => {
    return (
      FUTURE_OPTIONS.find((option) => option.value === futureOption) ??
      FUTURE_OPTIONS[1]
    )
  }, [futureOption])

  const range = useMemo(() => {
    const now = new Date()
    const start = addDays(now, -lookbackDays)
    const end = activeFutureOption.months
      ? addMonths(now, activeFutureOption.months)
      : addDays(now, activeFutureOption.days ?? 0)
    return { now, start, end }
  }, [lookbackDays, activeFutureOption])

  const doseEventsByMedication = useMemo(() => {
    const map = new Map<string, DoseEvent[]>()
    for (const dose of doses) {
      const medication = medicationById.get(dose.medicationId)
      if (!medication) {
        continue
      }
      const list = map.get(dose.medicationId) ?? []
      list.push(
        toDoseEvent(dose, {
          kaPerHour: medication.kaPerHour,
          kePerHour: medication.kePerHour,
          scale: medication.scale,
        }),
      )
      map.set(dose.medicationId, list)
    }

    for (const schedule of schedules) {
      const medication = medicationById.get(schedule.medicationId)
      if (!medication) {
        continue
      }
      const futureDoses = buildFutureScheduleDoses(
        schedule,
        {
          kaPerHour: medication.kaPerHour,
          kePerHour: medication.kePerHour,
          scale: medication.scale,
        },
        range.now,
        range.end,
      )
      if (futureDoses.length === 0) {
        continue
      }
      const list = map.get(schedule.medicationId) ?? []
      list.push(...futureDoses)
      map.set(schedule.medicationId, list)
    }

    return map
  }, [doses, schedules, medicationById, range.now, range.end])

  const timePoints = useMemo(() => {
    return buildTimePoints(range.start, range.end, sampleMinutes)
  }, [range.start, range.end, sampleMinutes])

  const chartData = useMemo(() => {
    if (timePoints.length === 0) {
      return []
    }

    return timePoints.map((t) => {
      const point: Record<string, number> = { time: t.getTime() }
      let total = 0
      for (const medication of medications) {
        const dosesForMedication =
          doseEventsByMedication.get(medication.id) ?? []
        const amount = totalAmountAtTime(dosesForMedication, t)
        point[medication.id] = amount
        total += amount
      }
      point.total = total
      return point
    })
  }, [timePoints, medications, doseEventsByMedication])

  const visibleMedications = medications.filter((medication) =>
    visibleMedicationIds.includes(medication.id),
  )

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Chart</h1>
        <p className="text-sm text-slate-400">
          Estimated medication levels with historical and projected views.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
          <label className="text-xs uppercase tracking-wide text-slate-500">
            Lookback
          </label>
          <select
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={lookbackDays}
            onChange={(event) => setLookbackDays(Number(event.target.value))}
          >
            {LOOKBACK_OPTIONS.map((option) => (
              <option key={option.label} value={option.days}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
          <label className="text-xs uppercase tracking-wide text-slate-500">
            Future horizon
          </label>
          <select
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={futureOption}
            onChange={(event) => setFutureOption(event.target.value)}
          >
            {FUTURE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Sampling
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-100">
            {sampleMinutes} min
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-200">
              {formatDateTime(range.start, timezone)} —{' '}
              {formatDateTime(range.end, timezone)}
            </p>
            <p className="text-xs text-slate-500">
              {medications.length === 0
                ? 'Add a medication profile to begin.'
                : 'Toggle medication lines to focus the chart.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500"
                checked={showTotal}
                onChange={(event) => setShowTotal(event.target.checked)}
              />
              Total
            </label>
            {medications.map((medication) => (
              <label
                key={medication.id}
                className="flex items-center gap-2"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500"
                  checked={visibleMedicationIds.includes(medication.id)}
                  onChange={(event) => {
                    setVisibleMedicationIds((prev) => {
                      if (event.target.checked) {
                        return prev.includes(medication.id)
                          ? prev
                          : [...prev, medication.id]
                      }
                      return prev.filter((id) => id !== medication.id)
                    })
                  }}
                />
                {medication.name}
              </label>
            ))}
          </div>
        </div>
        <div className="h-80 w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              No chart data yet. Add doses or schedules to see levels.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(value: number) =>
                    new Intl.DateTimeFormat('en-NZ', {
                      month: 'short',
                      day: 'numeric',
                    }).format(new Date(value))
                  }
                  stroke="#94a3b8"
                />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  labelFormatter={(value) =>
                    formatDateTime(new Date(Number(value)), timezone)
                  }
                  formatter={(value?: number) => {
                    const amount = typeof value === 'number' ? value : 0
                    return [amount.toFixed(2), 'mg']
                  }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                  }}
                />
                <Legend />
                {showTotal ? (
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Total"
                    stroke="#e2e8f0"
                    strokeWidth={2.5}
                    dot={false}
                  />
                ) : null}
                {visibleMedications.map((medication, index) => (
                  <Line
                    key={medication.id}
                    type="monotone"
                    dataKey={medication.id}
                    name={medication.name}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  )
}

export default ChartPage
