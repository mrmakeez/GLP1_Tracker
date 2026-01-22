import { act, render, screen } from '@testing-library/react'
import ChartPage from './ChartPage'
import {
  ensureDefaultMedications,
  getSettings,
  listDoses,
  listSchedules,
} from '../db'
import { reconcileScheduledDoses } from '../scheduling/reconcileScheduledDoses'

vi.mock('../db', async () => {
  const actual = await vi.importActual<typeof import('../db')>('../db')
  return {
    ...actual,
    ensureDefaultMedications: vi.fn(),
    getSettings: vi.fn(),
    listDoses: vi.fn(),
    listSchedules: vi.fn(),
  }
})

vi.mock('../scheduling/reconcileScheduledDoses', () => ({
  reconcileScheduledDoses: vi.fn(),
}))

describe('ChartPage', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('logs reconcile failures without breaking rendering', async () => {
    vi.useFakeTimers()

    const reconcileError = new Error('Reconcile failed')
    const mockedReconcileScheduledDoses = vi.mocked(reconcileScheduledDoses)
    mockedReconcileScheduledDoses
      .mockResolvedValueOnce({ createdCount: 0 })
      .mockRejectedValueOnce(reconcileError)

    vi.mocked(ensureDefaultMedications).mockResolvedValue([])
    vi.mocked(listDoses).mockResolvedValue([])
    vi.mocked(listSchedules).mockResolvedValue([
      {
        id: 'schedule-1',
        medicationId: 'med-1',
        startDatetimeIso: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        timezone: 'Pacific/Auckland',
        doseMg: 1,
        frequency: 'weekly',
        interval: 7,
        enabled: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ])
    vi.mocked(getSettings).mockResolvedValue({
      id: 'singleton',
      defaultTimezone: 'Pacific/Auckland',
      chartSampleMinutes: 60,
      defaultLookbackDays: 30,
      defaultFutureDays: 7,
    })

    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const unhandledRejectionHandler = vi.fn()
    window.addEventListener('unhandledrejection', unhandledRejectionHandler)

    render(<ChartPage />)

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })

    expect(screen.getByText('Chart')).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to reconcile scheduled doses during chart refresh.',
      reconcileError,
    )
    expect(unhandledRejectionHandler).not.toHaveBeenCalled()

    window.removeEventListener(
      'unhandledrejection',
      unhandledRejectionHandler,
    )
  })
})
