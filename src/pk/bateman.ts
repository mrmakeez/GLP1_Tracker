export type MedicationProfile = {
  kaPerHour: number
  kePerHour: number
  scale: number
}

export type DoseEvent = {
  datetime: Date
  doseMg: number
  medication: MedicationProfile
}

const HOURS_IN_MS = 60 * 60 * 1000
const KA_KE_EPSILON = 1e-8

const toHours = (ms: number) => ms / HOURS_IN_MS

const clampNonNegative = (value: number) =>
  value < 0 || Number.isNaN(value) ? 0 : value

const amountFromDoseWithDeltaHours = (
  dose: DoseEvent,
  dtHours: number,
): number => {
  if (dtHours < 0) {
    return 0
  }

  const { kaPerHour, kePerHour, scale } = dose.medication
  const doseMg = dose.doseMg
  const kaMinusKe = kaPerHour - kePerHour

  if (Math.abs(kaMinusKe) < KA_KE_EPSILON) {
    const amount =
      doseMg * scale * (kaPerHour * dtHours) * Math.exp(-kaPerHour * dtHours)
    return clampNonNegative(amount)
  }

  const amount =
    doseMg *
    scale *
    (kaPerHour / kaMinusKe) *
    (Math.exp(-kePerHour * dtHours) - Math.exp(-kaPerHour * dtHours))

  return clampNonNegative(amount)
}

export const amountFromDoseAtTime = (dose: DoseEvent, t: Date): number => {
  const dtHours = toHours(t.getTime() - dose.datetime.getTime())
  return amountFromDoseWithDeltaHours(dose, dtHours)
}

export const amountFromDoseAtDeltaHours = (
  dose: DoseEvent,
  dtHours: number,
): number => {
  return amountFromDoseWithDeltaHours(dose, dtHours)
}

export const totalAmountAtTime = (doses: DoseEvent[], t: Date): number => {
  return doses.reduce(
    (sum, dose) => sum + amountFromDoseAtTime(dose, t),
    0,
  )
}

export const generateTimeSeries = (
  doses: DoseEvent[],
  start: Date,
  end: Date,
  sampleMinutes: number,
): Array<{ t: Date; amountMg: number }> => {
  if (sampleMinutes <= 0 || end.getTime() < start.getTime()) {
    return []
  }

  const results: Array<{ t: Date; amountMg: number }> = []
  const stepMs = sampleMinutes * 60 * 1000
  let currentTime = start.getTime()
  const endTime = end.getTime()

  while (currentTime <= endTime) {
    const t = new Date(currentTime)
    results.push({ t, amountMg: totalAmountAtTime(doses, t) })
    currentTime += stepMs
  }

  return results
}
