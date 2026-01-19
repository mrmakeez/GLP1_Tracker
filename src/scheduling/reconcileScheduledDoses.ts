import Dexie from 'dexie'
import {
  db,
  generateId,
  getSettings,
  listSchedules,
  type DoseRecord,
} from '../db'

type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const getDatePartsInZone = (
  date: Date,
  timezone: string,
): DateParts | null => {
  const formatter = new Intl.DateTimeFormat('en-US', {
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
  if ([year, month, day, hour, minute, second].some(Number.isNaN)) {
    return null
  }
  return { year, month, day, hour, minute, second }
}

const getTimezoneOffsetMinutes = (timezone: string, date: Date) => {
  const parts = getDatePartsInZone(date, timezone)
  if (!parts) {
    return 0
  }
  const utcTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return (utcTime - date.getTime()) / 60000
}

const addDaysInTimezone = (
  date: Date,
  days: number,
  timezone: string,
): Date | null => {
  const parts = getDatePartsInZone(date, timezone)
  if (!parts) {
    return null
  }
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day + days,
    parts.hour,
    parts.minute,
    parts.second,
  )
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

export type ReconcileResult = { createdCount: number }

export async function reconcileScheduledDoses(
  now: Date,
): Promise<ReconcileResult> {
  const nowTime = now.getTime()
  if (Number.isNaN(nowTime)) {
    return { createdCount: 0 }
  }

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

      const timezone = schedule.timezone || settings.defaultTimezone
      let occurrenceTime = start.getTime()

      while (occurrenceTime <= nowTime) {
        const occurrenceDatetime = new Date(occurrenceTime)
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
            timezone,
            source: 'scheduled',
            scheduleId: schedule.id,
            occurrenceKey,
            status: 'assumed_taken',
            createdAt: timestamp,
            updatedAt: timestamp,
          })
        }

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
