import { describe, expect, it, vi } from 'vitest'
import {
  REDIRECT_STORAGE_KEY,
  restoreGhPagesRedirect,
} from './ghPagesRedirect'

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>()

  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

describe('restoreGhPagesRedirect', () => {
  it('restores a stored redirect path under the base path', () => {
    const storage = createMemoryStorage()
    const history = { replaceState: vi.fn() } as unknown as History
    const location = {
      pathname: '/GLP1_Tracker/',
      search: '',
      hash: '',
    } as Location

    storage.setItem(
      REDIRECT_STORAGE_KEY,
      '/GLP1_Tracker/chart?range=30#focus',
    )

    const restored = restoreGhPagesRedirect('/GLP1_Tracker/', {
      storage,
      history,
      location,
    })

    expect(restored).toBe(true)
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/GLP1_Tracker/chart?range=30#focus',
    )
  })

  it('ignores redirects outside the base path', () => {
    const storage = createMemoryStorage()
    const history = { replaceState: vi.fn() } as unknown as History
    const location = {
      pathname: '/GLP1_Tracker/',
      search: '',
      hash: '',
    } as Location

    storage.setItem(REDIRECT_STORAGE_KEY, '/other/app')

    const restored = restoreGhPagesRedirect('/GLP1_Tracker/', {
      storage,
      history,
      location,
    })

    expect(restored).toBe(false)
    expect(history.replaceState).not.toHaveBeenCalled()
  })
})
