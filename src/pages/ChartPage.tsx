import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  LineChart,
  Line,
  ReferenceLine,
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
import { reconcileScheduledDoses } from '../scheduling/reconcileScheduledDoses'
import {
  totalAmountAtTime,
  type DoseEvent,
  type MedicationProfile,
} from '../pk/bateman'
import {
  addDaysInTimezone,
  getLocalDayIndex,
  resolveTimezone,
} from '../scheduling/timezone'

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
  { label: '4mo', value: '4mo', days: 120, months: 4 },
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

const formatDateTime = (date: Date, timezone: string) => {
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return getFormatter('en-NZ', {
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

const addDaysWithFallback = (
  date: Date,
  days: number,
  timezone: string,
  fallbackTimezone: string,
): Date | null => {
  const stepped = addDaysInTimezone(date, days, timezone)
  if (stepped) {
    return stepped
  }
  if (timezone === fallbackTimezone) {
    return null
  }
  return addDaysInTimezone(date, days, fallbackTimezone)
}

const buildFutureScheduleDoses = (
  schedule: ScheduleRecord,
  medication: MedicationProfile,
  now: Date,
  end: Date,
  defaultTimezone: string,
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

  const timezone = resolveTimezone(
    schedule.timezone || defaultTimezone,
    defaultTimezone,
  )
  const nowTime = now.getTime()
  const endTime = end.getTime()
  let nextDate = new Date(start.getTime())

  if (nextDate.getTime() < nowTime) {
    let startDay = getLocalDayIndex(nextDate, timezone)
    let nowDay = getLocalDayIndex(new Date(nowTime), timezone)
    if (startDay == null || nowDay == null) {
      startDay = getLocalDayIndex(nextDate, defaultTimezone)
      nowDay = getLocalDayIndex(new Date(nowTime), defaultTimezone)
    }
    if (startDay == null || nowDay == null) {
      return []
    }
    const diffDays = nowDay - startDay
    const steps = Math.floor(diffDays / intervalDays)
    const stepDays = steps * intervalDays
    if (stepDays > 0) {
      const stepped = addDaysWithFallback(
        nextDate,
        stepDays,
        timezone,
        defaultTimezone,
      )
      if (!stepped) {
        return []
      }
      nextDate = stepped
    }
  }

  while (nextDate.getTime() < nowTime) {
    const advanced = addDaysWithFallback(
      nextDate,
      intervalDays,
      timezone,
      defaultTimezone,
    )
    if (!advanced || advanced.getTime() <= nextDate.getTime()) {
      break
    }
    nextDate = advanced
  }

  const events: DoseEvent[] = []
  while (nextDate.getTime() <= endTime) {
    events.push({
      datetime: new Date(nextDate.getTime()),
      doseMg: schedule.doseMg,
      medication,
    })
    const nextOccurrence = addDaysWithFallback(
      nextDate,
      intervalDays,
      timezone,
      defaultTimezone,
    )
    if (!nextOccurrence || nextOccurrence.getTime() <= nextDate.getTime()) {
      break
    }
    nextDate = nextOccurrence
  }

  return events
}

const getNextScheduledOccurrenceTime = (
  schedules: ScheduleRecord[],
  sinceTime: number,
  defaultTimezone: string,
): number | null => {
  let nextTime: number | null = null
  for (const schedule of schedules) {
    if (!schedule.enabled) {
      continue
    }
    const startTime = new Date(schedule.startDatetimeIso).getTime()
    if (Number.isNaN(startTime)) {
      continue
    }
    const intervalDays = schedule.interval
    if (!intervalDays || intervalDays <= 0) {
      continue
    }
    const timezone = resolveTimezone(
      schedule.timezone || defaultTimezone,
      defaultTimezone,
    )
    let candidateDate = new Date(startTime)
    if (startTime < sinceTime) {
      let startDay = getLocalDayIndex(candidateDate, timezone)
      let sinceDay = getLocalDayIndex(new Date(sinceTime), timezone)
      if (startDay == null || sinceDay == null) {
        startDay = getLocalDayIndex(candidateDate, defaultTimezone)
        sinceDay = getLocalDayIndex(new Date(sinceTime), defaultTimezone)
      }
      if (startDay == null || sinceDay == null) {
        continue
      }
      const diffDays = sinceDay - startDay
      const steps = Math.floor(diffDays / intervalDays)
      const stepDays = steps * intervalDays
      if (stepDays > 0) {
        const stepped = addDaysWithFallback(
          candidateDate,
          stepDays,
          timezone,
          defaultTimezone,
        )
        if (!stepped) {
          continue
        }
        candidateDate = stepped
      }
    }
    while (candidateDate.getTime() <= sinceTime) {
      const next = addDaysWithFallback(
        candidateDate,
        intervalDays,
        timezone,
        defaultTimezone,
      )
      if (!next) {
        candidateDate = new Date(Number.NaN)
        break
      }
      candidateDate = next
    }
    const candidateTime = candidateDate.getTime()
    if (Number.isNaN(candidateTime)) {
      continue
    }
    if (nextTime === null || candidateTime < nextTime) {
      nextTime = candidateTime
    }
  }
  return nextTime
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
  const [nowTime, setNowTime] = useState<number>(() => Date.now())
  const lastReconciledAtRef = useRef<number>(0)
  const reconcileInFlightRef = useRef(false)
  const previousSchedulesRef = useRef<Map<string, ScheduleRecord>>(
    new Map(),
  )

  const timezone = resolveTimezone(
    settings?.defaultTimezone ?? DEFAULT_TIMEZONE,
    DEFAULT_TIMEZONE,
  )
  const sampleMinutes = settings?.chartSampleMinutes ?? 60

  const medicationById = useMemo(() => {
    return new Map(medications.map((medication) => [medication.id, medication]))
  }, [medications])

  const reconcileAndRefreshDoses = useCallback(
    async (
      targetTime: number,
      options?: { forceRefresh?: boolean; sinceTime?: number },
    ) => {
    if (reconcileInFlightRef.current) {
      return
    }
    if (targetTime <= lastReconciledAtRef.current) {
      return
    }
    reconcileInFlightRef.current = true
    try {
      const result = await reconcileScheduledDoses(new Date(targetTime), {
        since:
          options?.sinceTime != null
            ? new Date(options.sinceTime)
            : undefined,
      })
      lastReconciledAtRef.current = targetTime
      if (result.createdCount > 0 || options?.forceRefresh) {
        const refreshedDoses = await listDoses()
        setDoses(refreshedDoses)
      }
    } finally {
      reconcileInFlightRef.current = false
    }
  }, [])

  const loadData = async () => {
    const now = Date.now()
    await reconcileScheduledDoses(new Date(now))
    lastReconciledAtRef.current = now
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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTime(Date.now())
    }, 60 * 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (schedules.length === 0) {
      previousSchedulesRef.current = new Map()
      return
    }
    const previousSchedules = previousSchedulesRef.current
    const lastReconciledAt = lastReconciledAtRef.current
    let requiresFullScan = false

    for (const schedule of schedules) {
      if (!schedule.enabled) {
        continue
      }
      const startTime = new Date(schedule.startDatetimeIso).getTime()
      if (Number.isNaN(startTime)) {
        continue
      }
      const previous = previousSchedules.get(schedule.id)
      if (!previous) {
        if (startTime <= lastReconciledAt) {
          requiresFullScan = true
          break
        }
        continue
      }
      if (!previous.enabled && schedule.enabled) {
        if (startTime <= lastReconciledAt) {
          requiresFullScan = true
          break
        }
      }
      if (previous.startDatetimeIso !== schedule.startDatetimeIso) {
        if (startTime <= lastReconciledAt) {
          requiresFullScan = true
          break
        }
      }
      if (previous.interval !== schedule.interval) {
        if (startTime <= lastReconciledAt) {
          requiresFullScan = true
          break
        }
      }
      if (previous.timezone !== schedule.timezone) {
        if (startTime <= lastReconciledAt) {
          requiresFullScan = true
          break
        }
      }
    }

    const timeout = window.setTimeout(() => {
      void reconcileAndRefreshDoses(Date.now(), {
        forceRefresh: true,
        sinceTime: requiresFullScan ? undefined : lastReconciledAt,
      })
    }, 300)
    previousSchedulesRef.current = new Map(
      schedules.map((schedule) => [schedule.id, schedule]),
    )
    return () => window.clearTimeout(timeout)
  }, [schedules, reconcileAndRefreshDoses])

  useEffect(() => {
    const nextScheduledOccurrenceTime = getNextScheduledOccurrenceTime(
      schedules,
      lastReconciledAtRef.current,
      timezone,
    )
    if (
      nextScheduledOccurrenceTime !== null &&
      nowTime >= nextScheduledOccurrenceTime
    ) {
      void reconcileAndRefreshDoses(nowTime, {
        sinceTime: lastReconciledAtRef.current,
      })
    }
  }, [nowTime, schedules, timezone, reconcileAndRefreshDoses])

  const activeFutureOption = useMemo(() => {
    return (
      FUTURE_OPTIONS.find((option) => option.value === futureOption) ??
      FUTURE_OPTIONS[1]
    )
  }, [futureOption])

  const range = useMemo(() => {
    const now = new Date(nowTime)
    const start = addDays(now, -lookbackDays)
    const end = activeFutureOption.months
      ? addMonths(now, activeFutureOption.months)
      : addDays(now, activeFutureOption.days ?? 0)
    return { now, start, end }
  }, [lookbackDays, activeFutureOption, nowTime])

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
        timezone,
      )
      if (futureDoses.length === 0) {
        continue
      }
      const list = map.get(schedule.medicationId) ?? []
      list.push(...futureDoses)
      map.set(schedule.medicationId, list)
    }

    return map
  }, [doses, schedules, medicationById, range.now, range.end, timezone])

  const timePoints = useMemo(() => {
    const points = buildTimePoints(range.start, range.end, sampleMinutes)
    if (points.length === 0) {
      return points
    }
    const nowTime = range.now.getTime()
    if (points.some((point) => point.getTime() === nowTime)) {
      return points
    }
    const times = points.map((point) => point.getTime())
    times.push(nowTime)
    times.sort((a, b) => a - b)
    return times.map((time) => new Date(time))
  }, [range.start, range.end, range.now, sampleMinutes])

  const visibleMedications = useMemo(
    () =>
      medications.filter((medication) =>
        visibleMedicationIds.includes(medication.id),
      ),
    [medications, visibleMedicationIds],
  )

  const medicationAmounts = useMemo(() => {
    const map = new Map<string, number[]>()
    if (timePoints.length === 0) {
      return map
    }
    for (const medication of visibleMedications) {
      const dosesForMedication =
        doseEventsByMedication.get(medication.id) ?? []
      if (dosesForMedication.length === 0) {
        continue
      }
      map.set(
        medication.id,
        timePoints.map((t) => totalAmountAtTime(dosesForMedication, t)),
      )
    }
    return map
  }, [timePoints, visibleMedications, doseEventsByMedication])

  const totalAmounts = useMemo(() => {
    if (!showTotal || timePoints.length === 0) {
      return []
    }
    const allDoses = Array.from(doseEventsByMedication.values()).flat()
    if (allDoses.length === 0) {
      return []
    }
    return timePoints.map((t) => totalAmountAtTime(allDoses, t))
  }, [timePoints, doseEventsByMedication, showTotal])

  const chartData = useMemo(() => {
    if (timePoints.length === 0) {
      return []
    }

    const nowTime = range.now.getTime()
    return timePoints.map((t, index) => {
      const point: Record<string, number | null> = { time: t.getTime() }
      const isPast = t.getTime() <= nowTime
      for (const medication of visibleMedications) {
        const amounts = medicationAmounts.get(medication.id)
        const amount = amounts ? amounts[index] : 0
        point[`${medication.id}_past`] = isPast ? amount : null
        point[`${medication.id}_future`] = isPast ? null : amount
      }
      const totalAmount = showTotal ? totalAmounts[index] ?? 0 : 0
      point.total_past = showTotal ? (isPast ? totalAmount : null) : null
      point.total_future = showTotal ? (isPast ? null : totalAmount) : null
      return point
    })
  }, [
    timePoints,
    visibleMedications,
    medicationAmounts,
    range.now,
    showTotal,
    totalAmounts,
  ])

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
                    getFormatter('en-NZ', {
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
                    if (value == null || typeof value !== 'number') {
                      return null
                    }
                    return [value.toFixed(2), 'mg']
                  }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                  }}
                />
                <Legend />
                <ReferenceLine
                  x={range.now.getTime()}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Now',
                    position: 'insideTopRight',
                    fill: '#94a3b8',
                  }}
                />
                {showTotal ? (
                  <>
                    <Line
                      type="monotone"
                      dataKey="total_past"
                      name="Total"
                      stroke="#e2e8f0"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="total_future"
                      stroke="#e2e8f0"
                      strokeWidth={2.5}
                      strokeDasharray="6 6"
                      dot={false}
                      legendType="none"
                    />
                  </>
                ) : null}
                {visibleMedications.map((medication, index) => {
                  const color = COLORS[index % COLORS.length]
                  return (
                    <Fragment key={medication.id}>
                      <Line
                        type="monotone"
                        dataKey={`${medication.id}_past`}
                        name={medication.name}
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey={`${medication.id}_future`}
                        stroke={color}
                        strokeWidth={2}
                        strokeDasharray="6 6"
                        dot={false}
                        legendType="none"
                      />
                    </Fragment>
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  )
}

export default ChartPage
