export type MedicationRecord = {
  id: string
  name: string
  kaPerHour: number
  kePerHour: number
  scale: number
  notes: string
  createdAt: string
  updatedAt: string
}

export type DoseSource = 'manual' | 'scheduled'

export type ScheduledDoseStatus = 'assumed_taken' | 'confirmed_taken' | 'skipped'

export type DoseRecord = {
  id: string
  medicationId: string
  doseMg: number
  datetimeIso: string
  timezone: string
  createdAt: string
  updatedAt: string
  source?: DoseSource
  scheduleId?: string
  occurrenceKey?: string
  status?: ScheduledDoseStatus
}

export type ScheduleFrequency = 'daily' | 'weekly' | 'custom'

export type ScheduleRecord = {
  id: string
  medicationId: string
  startDatetimeIso: string
  timezone: string
  doseMg: number
  frequency: ScheduleFrequency
  interval: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type SettingsRecord = {
  id: 'singleton'
  defaultTimezone: string
  chartSampleMinutes: number
  defaultLookbackDays: number
  defaultFutureDays: number
  lastReconciledAt?: string
}

export type ExportPayload = {
  schemaVersion: number
  exportedAt: string
  data: {
    medications: MedicationRecord[]
    doses: DoseRecord[]
    schedules: ScheduleRecord[]
    settings: SettingsRecord[]
  }
}

export const DB_SCHEMA_VERSION = 5
export const DEFAULT_TIMEZONE = 'Pacific/Auckland'
