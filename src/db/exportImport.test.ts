import { describe, expect, it } from 'vitest'
import { DB_SCHEMA_VERSION, validateImportPayload } from './index'

const validPayload = {
  schemaVersion: DB_SCHEMA_VERSION,
  exportedAt: '2025-01-01T00:00:00.000Z',
  data: {
    medications: [],
    doses: [],
    schedules: [],
    settings: [],
  },
}

describe('validateImportPayload', () => {
  it('accepts a valid payload', () => {
    expect(validateImportPayload(validPayload)).toEqual(validPayload)
  })

  it('rejects an unsupported schema version', () => {
    expect(() =>
      validateImportPayload({ ...validPayload, schemaVersion: 99 }),
    ).toThrow('Unsupported schema version.')
  })

  it('rejects when tables are missing', () => {
    const invalid = {
      ...validPayload,
      data: {
        medications: [],
        doses: [],
        schedules: [],
      },
    }

    expect(() => validateImportPayload(invalid)).toThrow(
      'Missing settings table.',
    )
  })

  it('preserves schedule metadata for manual doses', () => {
    const payload = {
      ...validPayload,
      data: {
        ...validPayload.data,
        doses: [
          {
            id: 'dose-1',
            medicationId: 'med-1',
            doseMg: 2.5,
            datetimeIso: '2025-01-02T00:00:00.000Z',
            timezone: 'Pacific/Auckland',
            createdAt: '2025-01-02T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            source: 'manual',
            scheduleId: 'schedule-1',
            occurrenceKey: 'schedule-1_2025-01-02T00:00:00.000Z',
          },
        ],
      },
    }

    const result = validateImportPayload(payload)
    expect(result.data.doses[0]).toEqual({
      ...payload.data.doses[0],
      status: undefined,
    })
  })
})
