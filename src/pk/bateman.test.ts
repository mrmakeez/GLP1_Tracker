import { describe, expect, it } from 'vitest'
import {
  amountFromDoseAtTime,
  generateTimeSeries,
  totalAmountAtTime,
  type DoseEvent,
  type MedicationProfile,
} from './bateman'

const createDose = (
  datetime: Date,
  doseMg: number,
  medication: MedicationProfile,
): DoseEvent => ({
  datetime,
  doseMg,
  medication,
})

describe('bateman pharmacokinetics', () => {
  it('returns 0 for times before the dose', () => {
    const medication = { kaPerHour: 1, kePerHour: 0.2, scale: 1 }
    const doseTime = new Date('2024-01-01T00:00:00Z')
    const dose = createDose(doseTime, 2, medication)
    const earlier = new Date('2023-12-31T23:00:00Z')

    expect(amountFromDoseAtTime(dose, earlier)).toBe(0)
  })

  it('decays after the peak for typical ka > ke', () => {
    const medication = { kaPerHour: 1, kePerHour: 0.1, scale: 1 }
    const doseTime = new Date('2024-01-01T00:00:00Z')
    const dose = createDose(doseTime, 1, medication)

    const peakHours =
      Math.log(medication.kaPerHour / medication.kePerHour) /
      (medication.kaPerHour - medication.kePerHour)

    const afterPeak = new Date(doseTime.getTime() + (peakHours + 1) * 3600000)
    const later = new Date(doseTime.getTime() + (peakHours + 10) * 3600000)

    const amountAfterPeak = amountFromDoseAtTime(dose, afterPeak)
    const amountLater = amountFromDoseAtTime(dose, later)

    expect(amountAfterPeak).toBeGreaterThan(0)
    expect(amountLater).toBeLessThan(amountAfterPeak)
  })

  it('uses the limiting form when ka is approximately ke', () => {
    const medication = { kaPerHour: 0.1, kePerHour: 0.1000000001, scale: 1 }
    const doseTime = new Date('2024-01-01T00:00:00Z')
    const dose = createDose(doseTime, 2, medication)
    const targetTime = new Date('2024-01-01T05:00:00Z')

    const dtHours = 5
    const expected =
      dose.doseMg *
      medication.scale *
      (medication.kaPerHour * dtHours) *
      Math.exp(-medication.kaPerHour * dtHours)

    const amount = amountFromDoseAtTime(dose, targetTime)

    expect(amount).toBeCloseTo(expected, 6)
    expect(Number.isFinite(amount)).toBe(true)
  })

  it('generates a time series from start to end', () => {
    const medication = { kaPerHour: 0.8, kePerHour: 0.2, scale: 1 }
    const doseTime = new Date('2024-01-01T00:00:00Z')
    const dose = createDose(doseTime, 1, medication)
    const start = new Date('2024-01-01T00:00:00Z')
    const end = new Date('2024-01-01T02:00:00Z')

    const series = generateTimeSeries([dose], start, end, 60)

    expect(series).toHaveLength(3)
    expect(series[0]?.t.toISOString()).toBe(start.toISOString())
    expect(series[2]?.t.toISOString()).toBe(end.toISOString())
    expect(series[1]?.amountMg).toBeCloseTo(
      totalAmountAtTime([dose], series[1]?.t ?? start),
      10,
    )
  })
})
