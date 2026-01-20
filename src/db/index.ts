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

const isString = (value: unknown): value is string =>
  typeof value === 'string'

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isPositiveNumber = (value: unknown): value is number =>
  isNumber(value) && value > 0

const isNonNegativeNumber = (value: unknown): value is number =>
  isNumber(value) && value >= 0

const isBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean'

const isDoseSource = (value: unknown): value is DoseSource =>
  value === 'manual' || value === 'scheduled'

const isScheduledStatus = (
  value: unknown,
): value is ScheduledDoseStatus =>
  value === 'assumed_taken' ||
  value === 'confirmed_taken' ||
  value === 'skipped'

const isScheduleFrequency = (
  value: unknown,
): value is ScheduleFrequency =>
  value === 'daily' || value === 'weekly' || value === 'custom'

const isValidIsoDate = (value: unknown): value is string =>
  isString(value) && !Number.isNaN(Date.parse(value))

const validateMedication = (value: unknown): value is MedicationRecord =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isPositiveNumber(value.kaPerHour) &&
  isPositiveNumber(value.kePerHour) &&
  isPositiveNumber(value.scale) &&
  isString(value.notes) &&
  isValidIsoDate(value.createdAt) &&
  isValidIsoDate(value.updatedAt)

const validateDose = (value: unknown): value is DoseRecord =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.medicationId) &&
  isPositiveNumber(value.doseMg) &&
  isValidIsoDate(value.datetimeIso) &&
  isString(value.timezone) &&
  isValidIsoDate(value.createdAt) &&
  isValidIsoDate(value.updatedAt) &&
  (value.source == null || isDoseSource(value.source)) &&
  (value.scheduleId == null || isString(value.scheduleId)) &&
  (value.occurrenceKey == null || isString(value.occurrenceKey)) &&
  (value.status == null || isScheduledStatus(value.status)) &&
  (value.source !== 'scheduled' ||
    (isString(value.scheduleId) && isString(value.occurrenceKey)))

const validateSchedule = (
  value: unknown,
): value is ScheduleRecord =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.medicationId) &&
  isValidIsoDate(value.startDatetimeIso) &&
  isString(value.timezone) &&
  isPositiveNumber(value.doseMg) &&
  isScheduleFrequency(value.frequency) &&
  isPositiveNumber(value.interval) &&
  isBoolean(value.enabled) &&
  isValidIsoDate(value.createdAt) &&
  isValidIsoDate(value.updatedAt)

const validateSettings = (
  value: unknown,
): value is SettingsRecord =>
  isRecord(value) &&
  value.id === 'singleton' &&
  isString(value.defaultTimezone) &&
  isPositiveNumber(value.chartSampleMinutes) &&
  isNonNegativeNumber(value.defaultLookbackDays) &&
  isNonNegativeNumber(value.defaultFutureDays)

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

  if (!payload.data.medications.every(validateMedication)) {
    throw new Error('Invalid medication records.')
  }

  if (!payload.data.doses.every(validateDose)) {
    throw new Error('Invalid dose records.')
  }

  if (!payload.data.schedules.every(validateSchedule)) {
    throw new Error('Invalid schedule records.')
  }

  if (!payload.data.settings.every(validateSettings)) {
    throw new Error('Invalid settings records.')
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
