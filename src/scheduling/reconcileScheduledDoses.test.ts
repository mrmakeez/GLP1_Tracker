import { beforeEach, describe, expect, it } from 'vitest'
import {
  addMedication,
  addSchedule,
  db,
  listDoses,
} from '../db'
import { reconcileScheduledDoses } from './reconcileScheduledDoses'

const clearDatabase = async () => {
  await db.transaction(
    'rw',
    db.medications,
    db.doses,
    db.schedules,
    db.settings,
    async () => {
      await Promise.all([
        db.medications.clear(),
        db.doses.clear(),
        db.schedules.clear(),
        db.settings.clear(),
      ])
    },
  )
}

describe('reconcileScheduledDoses', () => {
  beforeEach(async () => {
    await clearDatabase()
  })

  it('creates occurrences up to now', async () => {
    const medication = await addMedication({
      name: 'Test Med',
      kaPerHour: 0.1,
      kePerHour: 0.01,
      scale: 1,
      notes: '',
    })

    await addSchedule({
      medicationId: medication.id,
      doseMg: 2,
      frequency: 'weekly',
      interval: 7,
      startDatetimeIso: '2025-01-01T00:00:00.000Z',
      timezone: 'UTC',
      enabled: true,
    })

    const result = await reconcileScheduledDoses(
      new Date('2025-01-15T00:00:00.000Z'),
    )

    const doses = await listDoses()
    expect(result.createdCount).toBe(3)
    expect(doses).toHaveLength(3)
    expect(doses.every((dose) => dose.source === 'scheduled')).toBe(true)
    expect(
      doses.every((dose) => dose.status === 'assumed_taken'),
    ).toBe(true)
  })

  it('is idempotent', async () => {
    const medication = await addMedication({
      name: 'Test Med',
      kaPerHour: 0.1,
      kePerHour: 0.01,
      scale: 1,
      notes: '',
    })

    await addSchedule({
      medicationId: medication.id,
      doseMg: 1,
      frequency: 'weekly',
      interval: 7,
      startDatetimeIso: '2025-02-01T00:00:00.000Z',
      timezone: 'UTC',
      enabled: true,
    })

    const now = new Date('2025-02-15T00:00:00.000Z')
    await reconcileScheduledDoses(now)
    const result = await reconcileScheduledDoses(now)

    const doses = await listDoses()
    expect(result.createdCount).toBe(0)
    expect(doses).toHaveLength(3)
  })

  it('skips disabled schedules', async () => {
    const medication = await addMedication({
      name: 'Test Med',
      kaPerHour: 0.1,
      kePerHour: 0.01,
      scale: 1,
      notes: '',
    })

    await addSchedule({
      medicationId: medication.id,
      doseMg: 1,
      frequency: 'weekly',
      interval: 7,
      startDatetimeIso: '2025-03-01T00:00:00.000Z',
      timezone: 'UTC',
      enabled: false,
    })

    const result = await reconcileScheduledDoses(
      new Date('2025-03-15T00:00:00.000Z'),
    )

    const doses = await listDoses()
    expect(result.createdCount).toBe(0)
    expect(doses).toHaveLength(0)
  })
})
