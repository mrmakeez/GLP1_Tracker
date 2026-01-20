import Dexie from 'dexie'
import {
  db,
  DEFAULT_TIMEZONE,
  generateId,
  getSettings,
  listSchedules,
  upsertSettings,
  type DoseRecord,
} from '../db'
import {
  addDaysInTimezone,
  getLocalDayIndex,
  resolveTimezone,
} from './timezone'

export type ReconcileResult = { createdCount: number }

export async function reconcileScheduledDoses(
  now: Date,
  options?: { since?: Date | null },
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
  const occurrenceBatchSize = 250
  const bulkAddThreshold = 500

  const lastReconciledAt = settings.lastReconciledAt
  const lastReconciledTime =
    typeof lastReconciledAt === 'string'
      ? new Date(lastReconciledAt).getTime()
      : undefined
  let sinceTime =
    options?.since === null
      ? undefined
      : options?.since?.getTime() ??
        (lastReconciledTime != null && !Number.isNaN(lastReconciledTime)
          ? lastReconciledTime
          : undefined)
  if (sinceTime != null && sinceTime > nowTime) {
    sinceTime = undefined
  }

  await db.transaction('rw', db.doses, async () => {
    const dosesToCreate: DoseRecord[] = []
    const flushDoses = async () => {
      if (dosesToCreate.length === 0) {
        return
      }
      try {
        await db.doses.bulkAdd(dosesToCreate)
        createdCount += dosesToCreate.length
      } catch (error) {
        if (error instanceof Dexie.BulkError) {
          createdCount +=
            dosesToCreate.length - error.failures.length
        } else {
          throw error
        }
      } finally {
        dosesToCreate.length = 0
      }
    }

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

      const fallbackTimezone = resolveTimezone(
        settings.defaultTimezone,
        DEFAULT_TIMEZONE,
      )
      const timezone = resolveTimezone(
        schedule.timezone || fallbackTimezone,
        fallbackTimezone,
      )
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
          if (
            !nextOccurrence ||
            nextOccurrence.getTime() <= occurrenceTime
          ) {
            break
          }
          occurrenceTime = nextOccurrence.getTime()
        }
      }

      if (occurrenceTime > nowTime) {
        continue
      }

      const occurrenceLowerBound = `${schedule.id}_${new Date(
        occurrenceTime,
      ).toISOString()}`
      const occurrenceUpperBound = `${schedule.id}_${new Date(
        nowTime,
      ).toISOString()}`
      const existingKeys = new Set(
        (
          await db.doses
            .where('occurrenceKey')
            .between(occurrenceLowerBound, occurrenceUpperBound)
            .toArray()
        )
          .map((record) => record.occurrenceKey)
          .filter(
            (occurrenceKey): occurrenceKey is string =>
              typeof occurrenceKey === 'string',
          ),
      )

      let occurrences: Array<{
        datetime: Date
        occurrenceKey: string
      }> = []
      while (occurrenceTime <= nowTime) {
        const occurrenceDatetime = new Date(occurrenceTime)
        const occurrenceKey = `${schedule.id}_${occurrenceDatetime.toISOString()}`
        occurrences.push({ datetime: occurrenceDatetime, occurrenceKey })
        if (occurrences.length >= occurrenceBatchSize) {
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
          if (dosesToCreate.length >= bulkAddThreshold) {
            await flushDoses()
          }
          occurrences = []
        }
        const nextOccurrence = addDaysInTimezone(
          occurrenceDatetime,
          intervalDays,
          timezone,
        )
        if (
          !nextOccurrence ||
          nextOccurrence.getTime() <= occurrenceTime
        ) {
          break
        }
        occurrenceTime = nextOccurrence.getTime()
      }

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
      if (dosesToCreate.length >= bulkAddThreshold) {
        await flushDoses()
      }
    }

    await flushDoses()
  })

  await upsertSettings({ lastReconciledAt: now.toISOString() })

  return { createdCount }
}
