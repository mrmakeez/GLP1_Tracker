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
})
