import Dexie, { type Table } from 'dexie'
import type {
  DoseRecord,
  DoseSource,
  ExportPayload,
  MedicationRecord,
  ScheduleFrequency,
  ScheduleRecord,
  ScheduledDoseStatus,
  SettingsRecord,
} from './types'
import { DB_SCHEMA_VERSION, DEFAULT_TIMEZONE } from './types'

class Glp1Database extends Dexie {
  medications!: Table<MedicationRecord, string>
  doses!: Table<DoseRecord, string>
  schedules!: Table<ScheduleRecord, string>
  settings!: Table<SettingsRecord, string>

  constructor() {
    super('glp1-tracker')

    this.version(2).stores({
      medications: 'id, name, createdAt, updatedAt',
      doses: 'id, medicationId, datetimeIso, occurrenceKey, createdAt, updatedAt',
      schedules: 'id, medicationId, startDatetimeIso, createdAt, updatedAt',
      settings: 'id',
    })

    this.version(DB_SCHEMA_VERSION).stores({
      medications: 'id, name, createdAt, updatedAt',
      doses:
        'id, medicationId, datetimeIso, &occurrenceKey, createdAt, updatedAt',
      schedules: 'id, medicationId, startDatetimeIso, createdAt, updatedAt',
      settings: 'id',
    })
  }
}

export const db = new Glp1Database()

const nowIso = () => new Date().toISOString()

export const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const listMedications = () => db.medications.toArray()

export const getMedication = (id: string) => db.medications.get(id)

export const addMedication = async (
  input: Omit<MedicationRecord, 'id' | 'createdAt' | 'updatedAt'>,
) => {
  const timestamp = nowIso()
  const record: MedicationRecord = {
    ...input,
    id: generateId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await db.medications.add(record)
  return record
}

export const updateMedication = async (
  id: string,
  updates: Partial<Omit<MedicationRecord, 'id' | 'createdAt'>>,
) => {
  const updatedAt = nowIso()
  await db.medications.update(id, { ...updates, updatedAt })
}

export const deleteMedication = (id: string) => db.medications.delete(id)

export const listDoses = () => db.doses.toArray()

export const addDose = async (
  input: Omit<DoseRecord, 'id' | 'createdAt' | 'updatedAt'>,
) => {
  const timestamp = nowIso()
  const source: DoseSource = input.source ?? 'manual'
  const status: ScheduledDoseStatus | undefined =
    source === 'scheduled' ? input.status : undefined
  const record: DoseRecord = {
    ...input,
    source,
    status,
    id: generateId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await db.doses.add(record)
  return record
}

export const updateDose = async (
  id: string,
  updates: Partial<Omit<DoseRecord, 'id' | 'createdAt'>>,
) => {
  const updatedAt = nowIso()
  await db.doses.update(id, { ...updates, updatedAt })
}

export const deleteDose = (id: string) => db.doses.delete(id)

export const getDoseByOccurrenceKey = (occurrenceKey: string) =>
  db.doses.where('occurrenceKey').equals(occurrenceKey).first()

export const listSchedules = () => db.schedules.toArray()

export const addSchedule = async (
  input: Omit<ScheduleRecord, 'id' | 'createdAt' | 'updatedAt'>,
) => {
  const timestamp = nowIso()
  const record: ScheduleRecord = {
    ...input,
    id: generateId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await db.schedules.add(record)
  return record
}

export const updateSchedule = async (
  id: string,
  updates: Partial<Omit<ScheduleRecord, 'id' | 'createdAt'>>,
) => {
  const updatedAt = nowIso()
  await db.schedules.update(id, { ...updates, updatedAt })
}

export const deleteSchedule = (id: string) => db.schedules.delete(id)

export const getSettings = async () => {
  const record = await db.settings.get('singleton')
  if (record) {
    return record
  }
  return {
    id: 'singleton',
    defaultTimezone: DEFAULT_TIMEZONE,
    chartSampleMinutes: 60,
    defaultLookbackDays: 30,
    defaultFutureDays: 7,
  } satisfies SettingsRecord
}

export const upsertSettings = async (
  updates: Partial<Omit<SettingsRecord, 'id'>>,
) => {
  const existing = await getSettings()
  const record: SettingsRecord = {
    ...existing,
    ...updates,
    id: 'singleton',
  }
  await db.settings.put(record)
  return record
}

export const exportDatabase = async (): Promise<ExportPayload> => {
  const [medications, doses, schedules, settings] = await Promise.all([
    db.medications.toArray(),
    db.doses.toArray(),
    db.schedules.toArray(),
    db.settings.toArray(),
  ])

  return {
    schemaVersion: DB_SCHEMA_VERSION,
    exportedAt: nowIso(),
    data: {
      medications,
      doses,
      schedules,
      settings,
    },
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const validateImportPayload = (payload: unknown): ExportPayload => {
  if (!isRecord(payload)) {
    throw new Error('Invalid import payload.')
  }

  if (payload.schemaVersion !== DB_SCHEMA_VERSION) {
    throw new Error('Unsupported schema version.')
  }

  if (typeof payload.exportedAt !== 'string') {
    throw new Error('Missing export timestamp.')
  }

  if (!isRecord(payload.data)) {
    throw new Error('Missing data section.')
  }

  const tables = ['medications', 'doses', 'schedules', 'settings'] as const

  for (const table of tables) {
    if (!Array.isArray(payload.data[table])) {
      throw new Error(`Missing ${table} table.`)
    }
  }

  return payload as ExportPayload
}

export const importDatabaseReplaceAll = async (
  payload: ExportPayload,
): Promise<void> => {
  const validated = validateImportPayload(payload)
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
      await Promise.all([
        db.medications.bulkAdd(validated.data.medications),
        db.doses.bulkAdd(validated.data.doses),
        db.schedules.bulkAdd(validated.data.schedules),
        db.settings.bulkAdd(validated.data.settings),
      ])
    },
  )
}

export {
  DB_SCHEMA_VERSION,
  DEFAULT_TIMEZONE,
  type DoseSource,
  type DoseRecord,
  type ExportPayload,
  type MedicationRecord,
  type ScheduleFrequency,
  type ScheduleRecord,
  type ScheduledDoseStatus,
  type SettingsRecord,
}
