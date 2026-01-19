import {
  db,
  generateId,
  getSettings,
  listSchedules,
  type DoseRecord,
} from '../db'

const DAY_IN_MS = 24 * 60 * 60 * 1000

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

      // We step in fixed milliseconds to stay consistent with stored ISO values;
      // this may drift around DST transitions for certain timezones.
      const intervalMs = intervalDays * DAY_IN_MS
      let occurrenceTime = start.getTime()
      const timezone = schedule.timezone || settings.defaultTimezone

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

        occurrenceTime += intervalMs
      }
    }

    if (dosesToCreate.length > 0) {
      await db.doses.bulkAdd(dosesToCreate)
      createdCount = dosesToCreate.length
    }
  })

  return { createdCount }
}
