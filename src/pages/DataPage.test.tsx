import { act, fireEvent, render, screen } from '@testing-library/react'
import DataPage from './DataPage'
import { exportDatabase } from '../db'

vi.mock('../db', async () => {
  const actual = await vi.importActual<typeof import('../db')>('../db')
  return {
    ...actual,
    exportDatabase: vi.fn(),
  }
})

describe('DataPage', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sanitizes export filenames and revokes object URLs asynchronously', async () => {
    vi.useFakeTimers()

    const mockedExportDatabase = vi.mocked(exportDatabase)
    mockedExportDatabase.mockResolvedValue({
      schemaVersion: 5,
      exportedAt: '2024-03-10T12:34:56.789Z',
      data: {
        medications: [],
        doses: [],
        schedules: [],
        settings: [],
      },
    })

    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      writable: true,
    })

    const originalCreateElement = document.createElement.bind(document)
    let createdAnchor: HTMLAnchorElement | null = null
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = originalCreateElement(tagName)
      if (tagName === 'a') {
        createdAnchor = element as HTMLAnchorElement
        vi.spyOn(createdAnchor, 'click').mockImplementation(() => {})
      }
      return element
    })

    render(<DataPage />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export data' }))
      await Promise.resolve()
    })

    expect(mockedExportDatabase).toHaveBeenCalledTimes(1)

    expect(createdAnchor).not.toBeNull()
    const downloadName =
      (createdAnchor as HTMLAnchorElement | null)?.download ?? ''
    expect(downloadName).not.toContain(':')

    expect(revokeObjectURL).not.toHaveBeenCalled()
    act(() => {
      vi.runOnlyPendingTimers()
    })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
