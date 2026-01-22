import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OfflineIndicator from './OfflineIndicator'

let mockNeedRefresh = true
let triggerNeedRefresh = false
const updateServiceWorker = vi.fn()

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: { onNeedRefresh?: () => void }) => {
    if (triggerNeedRefresh) {
      options?.onNeedRefresh?.()
      triggerNeedRefresh = false
    }
    return {
      offlineReady: false,
      needRefresh: mockNeedRefresh,
      updateServiceWorker,
    }
  },
}))

describe('OfflineIndicator', () => {
  beforeEach(() => {
    mockNeedRefresh = true
    triggerNeedRefresh = false
    updateServiceWorker.mockClear()
  })

  it('dismisses the update toast when requested', async () => {
    const user = userEvent.setup()
    render(<OfflineIndicator />)

    expect(
      screen.getByText('A new version is available.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Later' }))

    expect(
      screen.queryByText('A new version is available.'),
    ).not.toBeInTheDocument()
  })

  it('shows the update toast again when needRefresh flips back to true', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<OfflineIndicator />)

    await user.click(screen.getByRole('button', { name: 'Later' }))

    expect(
      screen.queryByText('A new version is available.'),
    ).not.toBeInTheDocument()

    mockNeedRefresh = false
    rerender(<OfflineIndicator />)

    expect(
      screen.queryByText('A new version is available.'),
    ).not.toBeInTheDocument()

    mockNeedRefresh = true
    triggerNeedRefresh = true
    rerender(<OfflineIndicator />)

    expect(
      screen.getByText('A new version is available.'),
    ).toBeInTheDocument()
  })
})
