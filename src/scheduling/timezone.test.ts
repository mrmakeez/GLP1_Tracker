import { describe, expect, it, vi } from 'vitest'
import { addDaysInTimezone } from './timezone'

const getPartsInZone = (date: Date, timezone: string) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(date)
  const valueByType = new Map(parts.map((part) => [part.type, part.value]))
  return {
    year: valueByType.get('year'),
    month: valueByType.get('month'),
    day: valueByType.get('day'),
    hour: valueByType.get('hour'),
    minute: valueByType.get('minute'),
  }
}

describe('addDaysInTimezone', () => {
  it('keeps local time across DST boundaries', () => {
    vi.useFakeTimers()
    const timezone = 'Pacific/Auckland'
    const base = new Date('2024-09-27T21:00:00Z')
    vi.setSystemTime(base)

    try {
      const next = addDaysInTimezone(base, 1, timezone)

      expect(next).not.toBeNull()
      if (!next) {
        return
      }
      const baseParts = getPartsInZone(base, timezone)
      const nextParts = getPartsInZone(next, timezone)
      expect(baseParts.hour).toBe(nextParts.hour)
      expect(baseParts.minute).toBe(nextParts.minute)
      const diffHours = (next.getTime() - base.getTime()) / (60 * 60 * 1000)
      expect(diffHours).toBeCloseTo(23, 5)
    } finally {
      vi.useRealTimers()
    }
  })
})
