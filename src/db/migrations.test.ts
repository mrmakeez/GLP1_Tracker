import Dexie from 'dexie'
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createDatabase } from './index'
import type { DoseRecord } from './types'

const buildDose = (overrides: Partial<DoseRecord>): DoseRecord => ({
  id: overrides.id ?? `dose-${Math.random().toString(16).slice(2)}`,
  medicationId: overrides.medicationId ?? 'medication-1',
  doseMg: overrides.doseMg ?? 2,
  datetimeIso: overrides.datetimeIso ?? '2025-01-01T00:00:00.000Z',
  timezone: overrides.timezone ?? 'Pacific/Auckland',
  createdAt: overrides.createdAt ?? '2025-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2025-01-01T00:00:00.000Z',
  source: overrides.source ?? 'scheduled',
  scheduleId: overrides.scheduleId ?? 'schedule-1',
  occurrenceKey:
    overrides.occurrenceKey ?? 'schedule-1_2025-01-01T00:00:00.000Z',
  status: overrides.status ?? 'assumed_taken',
})

const seedLegacyDb = async (name: string, doses: DoseRecord[]) => {
  const legacyDb = new Dexie(name)
  legacyDb.version(2).stores({
    medications: 'id, name, createdAt, updatedAt',
    doses: 'id, medicationId, datetimeIso, occurrenceKey, createdAt, updatedAt',
    schedules: 'id, medicationId, startDatetimeIso, createdAt, updatedAt',
    settings: 'id',
  })
  await legacyDb.open()
  await legacyDb.table<DoseRecord, string>('doses').bulkAdd(doses)
  await legacyDb.close()
}

const createDbName = (suffix: string) =>
  `glp1-migration-${suffix}-${Math.random().toString(16).slice(2)}`

describe('Dexie migration dedupe', () => {
  it('keeps confirmed scheduled doses over assumed duplicates', async () => {
    const dbName = createDbName('confirmed')
    const occurrenceKey = 'schedule-1_2025-02-01T00:00:00.000Z'
    await seedLegacyDb(dbName, [
      buildDose({
        id: 'assumed',
        occurrenceKey,
        status: 'assumed_taken',
        createdAt: '2025-02-01T00:00:00.000Z',
      }),
      buildDose({
        id: 'confirmed',
        occurrenceKey,
        status: 'confirmed_taken',
        createdAt: '2025-01-31T00:00:00.000Z',
      }),
    ])

    const db = createDatabase(dbName)
    await expect(db.open()).resolves.toBeDefined()

    const remaining = await db.doses
      .where('occurrenceKey')
      .equals(occurrenceKey)
      .toArray()

    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.id).toBe('confirmed')

    await db.delete()
  })

  it('keeps the newest createdAt when statuses tie', async () => {
    const dbName = createDbName('newest')
    const occurrenceKey = 'schedule-2_2025-03-01T00:00:00.000Z'
    await seedLegacyDb(dbName, [
      buildDose({
        id: 'older',
        occurrenceKey,
        status: 'assumed_taken',
        createdAt: '2025-03-01T00:00:00.000Z',
      }),
      buildDose({
        id: 'newer',
        occurrenceKey,
        status: 'assumed_taken',
        createdAt: '2025-03-02T00:00:00.000Z',
      }),
    ])

    const db = createDatabase(dbName)
    await expect(db.open()).resolves.toBeDefined()

    const remaining = await db.doses
      .where('occurrenceKey')
      .equals(occurrenceKey)
      .toArray()

    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.id).toBe('newer')

    await db.delete()
  })
})
