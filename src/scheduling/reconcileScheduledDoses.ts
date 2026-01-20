import Dexie from 'dexie'
import {
  db,
  generateId,
  getSettings,
  listSchedules,
  type DoseRecord,
} from '../db'
import { addDaysInTimezone, getLocalDayIndex } from './timezone'

export type ReconcileResult = { createdCount: number }

const addDaysWithFallback = (
  date: Date,
  days: number,
  timezone: string,
  fallbackTimezone: string,
): { date: Date; timezone: string } | null => {
  const stepped = addDaysInTimezone(date, days, timezone)
  if (stepped) {
    return { date: stepped, timezone }
  }
  if (timezone === fallbackTimezone) {
    return null
  }
  const fallbackStepped = addDaysInTimezone(date, days, fallbackTimezone)
  if (!fallbackStepped) {
    return null
  }
  return { date: fallbackStepped, timezone: fallbackTimezone }
}

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

  await db.transaction('rw', db.doses, db.schedules, async () => {
    const dosesToCreate: DoseRecord[] = []
    const scheduleUpdates: Array<{ id: string; lastMaterializedAt: string }> =
      []

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

      const timezone = schedule.timezone || settings.defaultTimezone
      let effectiveTimezone = timezone
      let occurrenceTime = start.getTime()
      const storedLastMaterializedAt = schedule.lastMaterializedAt
        ? new Date(schedule.lastMaterializedAt).getTime()
        : Number.NaN
      const scheduleSinceTime =
        !Number.isNaN(storedLastMaterializedAt) &&
        storedLastMaterializedAt > occurrenceTime &&
        storedLastMaterializedAt <= nowTime &&
        (sinceTime == null || storedLastMaterializedAt > sinceTime)
          ? storedLastMaterializedAt
          : sinceTime

      if (
        scheduleSinceTime != null &&
        !Number.isNaN(scheduleSinceTime) &&
        scheduleSinceTime > occurrenceTime
      ) {
        let startDay = getLocalDayIndex(start, effectiveTimezone)
        let sinceDay = getLocalDayIndex(
          new Date(scheduleSinceTime),
          effectiveTimezone,
        )
        if (startDay == null || sinceDay == null) {
          effectiveTimezone = settings.defaultTimezone
          startDay = getLocalDayIndex(start, effectiveTimezone)
          sinceDay = getLocalDayIndex(
            new Date(scheduleSinceTime),
            effectiveTimezone,
          )
        }
        if (startDay == null || sinceDay == null) {
          continue
        }
        const diffDays = sinceDay - startDay
        const steps = Math.floor(diffDays / intervalDays)
        const stepDays = steps * intervalDays
        if (stepDays > 0) {
          const stepped = addDaysWithFallback(
            start,
            stepDays,
            effectiveTimezone,
            settings.defaultTimezone,
          )
          if (!stepped) {
            continue
          }
          occurrenceTime = stepped.date.getTime()
          effectiveTimezone = stepped.timezone
        }
        while (occurrenceTime < scheduleSinceTime) {
          const nextOccurrence = addDaysWithFallback(
            new Date(occurrenceTime),
            intervalDays,
            effectiveTimezone,
            settings.defaultTimezone,
          )
          if (!nextOccurrence) {
            break
          }
          occurrenceTime = nextOccurrence.date.getTime()
          effectiveTimezone = nextOccurrence.timezone
        }
      }

      let lastOccurrenceTime: number | null = null

      while (occurrenceTime <= nowTime) {
        const occurrenceDatetime = new Date(occurrenceTime)
        lastOccurrenceTime = occurrenceTime
        const occurrenceKey = `${schedule.id}_${occurrenceDatetime.toISOString()}`
        const existing = await db.doses
          .where('occurrenceKey')
          .equals(occurrenceKey)
          .first()

        if (!existing) {
          const timestamp = new Date().toISOString()
          dosesToCreate.push({
            id: generateId(),
            medicationId: schedule.medicationId,
            doseMg: schedule.doseMg,
            datetimeIso: occurrenceDatetime.toISOString(),
            timezone: effectiveTimezone,
            source: 'scheduled',
            scheduleId: schedule.id,
            occurrenceKey,
            status: 'assumed_taken',
            createdAt: timestamp,
            updatedAt: timestamp,
          })
        }

        const nextOccurrence = addDaysWithFallback(
          occurrenceDatetime,
          intervalDays,
          effectiveTimezone,
          settings.defaultTimezone,
        )
        if (!nextOccurrence) {
          break
        }
        occurrenceTime = nextOccurrence.date.getTime()
        effectiveTimezone = nextOccurrence.timezone
      }

      if (lastOccurrenceTime != null) {
        scheduleUpdates.push({
          id: schedule.id,
          lastMaterializedAt: new Date(lastOccurrenceTime).toISOString(),
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

    if (scheduleUpdates.length > 0) {
      await Promise.all(
        scheduleUpdates.map((update) =>
          db.schedules.update(update.id, {
            lastMaterializedAt: update.lastMaterializedAt,
            updatedAt: new Date().toISOString(),
          }),
        ),
      )
    }
  })

  return { createdCount }
}
