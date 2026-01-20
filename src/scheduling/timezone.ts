type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

export const isValidTimeZone = (timezone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

const getDatePartsInZone = (
  date: Date,
  timezone: string,
): DateParts | null => {
  if (!isValidTimeZone(timezone)) {
    return null
  }
  let parts: Intl.DateTimeFormatPart[]
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    parts = formatter.formatToParts(date)
  } catch {
    return null
  }
  const valueByType = new Map(
    parts.map((part) => [part.type, part.value]),
  )
  const year = Number(valueByType.get('year'))
  const month = Number(valueByType.get('month'))
  const day = Number(valueByType.get('day'))
  const hour = Number(valueByType.get('hour'))
  const minute = Number(valueByType.get('minute'))
  const second = Number(valueByType.get('second'))
  if ([year, month, day, hour, minute, second].some(Number.isNaN)) {
    return null
  }
  return { year, month, day, hour, minute, second }
}

const getTimezoneOffsetMinutes = (timezone: string, date: Date) => {
  const parts = getDatePartsInZone(date, timezone)
  if (!parts) {
    return 0
  }
  const utcTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return (utcTime - date.getTime()) / 60000
}

export const getLocalDayIndex = (
  date: Date,
  timezone: string,
): number | null => {
  const parts = getDatePartsInZone(date, timezone)
  if (!parts) {
    return null
  }
  return Math.floor(
    Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_IN_MS,
  )
}

export const addDaysInTimezone = (
  date: Date,
  days: number,
  timezone: string,
): Date | null => {
  const parts = getDatePartsInZone(date, timezone)
  if (!parts) {
    return null
  }
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day + days,
    parts.hour,
    parts.minute,
    parts.second,
  )
  const initialOffset = getTimezoneOffsetMinutes(
    timezone,
    new Date(utcGuess),
  )
  let adjusted = utcGuess - initialOffset * 60000
  const adjustedOffset = getTimezoneOffsetMinutes(
    timezone,
    new Date(adjusted),
  )
  if (adjustedOffset !== initialOffset) {
    adjusted = utcGuess - adjustedOffset * 60000
  }
  return new Date(adjusted)
}
