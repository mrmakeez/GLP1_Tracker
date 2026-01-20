import Dexie from 'dexie'
import {
  db,
  DEFAULT_TIMEZONE,
  generateId,
  getSettings,
  listSchedules,
  type DoseRecord,
} from '../db'
import {
  addDaysInTimezone,
  getLocalDayIndex,
  isValidTimeZone,
} from './timezone'

export type ReconcileResult = { createdCount: number }

export async function reconcileScheduledDoses(
  now: Date,
  options?: { since?: Date },
): Promise<ReconcileResult> {
  const nowTime = now.getTime()
  if (Number.isNaN(nowTime)) {
    return { createdCount: 0 }
  }
  const sinceTime = options?.since?.getTime()

  const [schedules, settings] = await Promise.all([
    listSchedules(),
    getSettings(),
  ])

  let createdCount = 0

  await db.transaction('rw', db.doses, async () => {
    const dosesToCreate: DoseRecord[] = []

    for (const schedule of schedules) {
      if (!schedule.enabled) {
        continue
      }

      const start = new Date(schedule.startDatetimeIso)
      if (Number.isNaN(start.getTime())) {
        continue
      }

      const intervalDays = schedule.interval
      if (!intervalDays || intervalDays <= 0) {
        continue
      }

      const fallbackTimezone = isValidTimeZone(settings.defaultTimezone)
        ? settings.defaultTimezone
        : DEFAULT_TIMEZONE
      const rawTimezone = schedule.timezone || fallbackTimezone
      const timezone = isValidTimeZone(rawTimezone)
        ? rawTimezone
        : fallbackTimezone
      let occurrenceTime = start.getTime()

      if (
        sinceTime != null &&
        !Number.isNaN(sinceTime) &&
        sinceTime > occurrenceTime
      ) {
        const startDay = getLocalDayIndex(start, timezone)
        const sinceDay = getLocalDayIndex(new Date(sinceTime), timezone)
        if (startDay == null || sinceDay == null) {
          continue
        }
        const diffDays = sinceDay - startDay
        const steps = Math.floor(diffDays / intervalDays)
        const stepDays = steps * intervalDays
        if (stepDays > 0) {
          const stepped = addDaysInTimezone(start, stepDays, timezone)
          if (!stepped) {
            continue
          }
          occurrenceTime = stepped.getTime()
        }
        while (occurrenceTime < sinceTime) {
          const nextOccurrence = addDaysInTimezone(
            new Date(occurrenceTime),
            intervalDays,
            timezone,
          )
          if (!nextOccurrence) {
            break
          }
          occurrenceTime = nextOccurrence.getTime()
        }
      }

      const occurrences: Array<{
        datetime: Date
        occurrenceKey: string
      }> = []

      while (occurrenceTime <= nowTime) {
        const occurrenceDatetime = new Date(occurrenceTime)
        const occurrenceKey = `${schedule.id}_${occurrenceDatetime.toISOString()}`
        occurrences.push({ datetime: occurrenceDatetime, occurrenceKey })
        const nextOccurrence = addDaysInTimezone(
          occurrenceDatetime,
          intervalDays,
          timezone,
        )
        if (!nextOccurrence) {
          break
        }
        occurrenceTime = nextOccurrence.getTime()
      }

      if (occurrences.length === 0) {
        continue
      }

      const existing = await db.doses
        .where('occurrenceKey')
        .anyOf(occurrences.map((occurrence) => occurrence.occurrenceKey))
        .toArray()
      const existingKeys = new Set(
        existing
          .map((record) => record.occurrenceKey)
          .filter(
            (occurrenceKey): occurrenceKey is string =>
              typeof occurrenceKey === 'string',
          ),
      )

      for (const occurrence of occurrences) {
        if (existingKeys.has(occurrence.occurrenceKey)) {
          continue
        }
        const timestamp = new Date().toISOString()
        dosesToCreate.push({
          id: generateId(),
          medicationId: schedule.medicationId,
          doseMg: schedule.doseMg,
          datetimeIso: occurrence.datetime.toISOString(),
          timezone,
          source: 'scheduled',
          scheduleId: schedule.id,
          occurrenceKey: occurrence.occurrenceKey,
          status: 'assumed_taken',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }
    }

    if (dosesToCreate.length > 0) {
      try {
        await db.doses.bulkAdd(dosesToCreate)
        createdCount = dosesToCreate.length
      } catch (error) {
        if (error instanceof Dexie.BulkError) {
          createdCount =
            dosesToCreate.length - error.failures.length
        } else {
          throw error
        }
      }
    }
  })

  return { createdCount }
}
