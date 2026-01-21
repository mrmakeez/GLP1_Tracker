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
      origin: 'https://example.com',
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
    expect(storage.getItem(REDIRECT_STORAGE_KEY)).toBeNull()
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/GLP1_Tracker/chart?range=30#focus',
    )
  })

  it('allows traversal-like sequences in querystrings', () => {
    const storage = createMemoryStorage()
    const history = { replaceState: vi.fn() } as unknown as History
    const location = {
      pathname: '/GLP1_Tracker/',
      search: '',
      hash: '',
      origin: 'https://example.com',
    } as Location

    storage.setItem(
      REDIRECT_STORAGE_KEY,
      '/GLP1_Tracker/chart?q=%2e%2e',
    )

    const restored = restoreGhPagesRedirect('/GLP1_Tracker/', {
      storage,
      history,
      location,
    })

    expect(restored).toBe(true)
    expect(storage.getItem(REDIRECT_STORAGE_KEY)).toBeNull()
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/GLP1_Tracker/chart?q=%2e%2e',
    )
  })

  it('allows encoded dots inside path segments', () => {
    const storage = createMemoryStorage()
    const history = { replaceState: vi.fn() } as unknown as History
    const location = {
      pathname: '/GLP1_Tracker/',
      search: '',
      hash: '',
      origin: 'https://example.com',
    } as Location

    storage.setItem(REDIRECT_STORAGE_KEY, '/GLP1_Tracker/foo%2ebar')

    const restored = restoreGhPagesRedirect('/GLP1_Tracker/', {
      storage,
      history,
      location,
    })

    expect(restored).toBe(true)
    expect(storage.getItem(REDIRECT_STORAGE_KEY)).toBeNull()
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/GLP1_Tracker/foo%2ebar',
    )
  })

  it('rejects traversal attempts and clears storage', () => {
    const storage = createMemoryStorage()
    const history = { replaceState: vi.fn() } as unknown as History
    const location = {
      pathname: '/GLP1_Tracker/',
      search: '',
      hash: '',
      origin: 'https://example.com',
    } as Location

    storage.setItem(REDIRECT_STORAGE_KEY, '/GLP1_Tracker/../settings')

    const restored = restoreGhPagesRedirect('/GLP1_Tracker/', {
      storage,
      history,
      location,
    })

    expect(restored).toBe(false)
    expect(storage.getItem(REDIRECT_STORAGE_KEY)).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('rejects encoded traversal attempts and clears storage', () => {
    const storage = createMemoryStorage()
    const history = { replaceState: vi.fn() } as unknown as History
    const location = {
      pathname: '/GLP1_Tracker/',
      search: '',
      hash: '',
      origin: 'https://example.com',
    } as Location

    storage.setItem(REDIRECT_STORAGE_KEY, '/GLP1_Tracker/%2e%2e/settings')

    const restored = restoreGhPagesRedirect('/GLP1_Tracker/', {
      storage,
      history,
      location,
    })

    expect(restored).toBe(false)
    expect(storage.getItem(REDIRECT_STORAGE_KEY)).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('rejects malformed percent encoding and clears storage', () => {
    const storage = createMemoryStorage()
    const history = { replaceState: vi.fn() } as unknown as History
    const location = {
      pathname: '/GLP1_Tracker/',
      search: '',
      hash: '',
      origin: 'https://example.com',
    } as Location

    storage.setItem(REDIRECT_STORAGE_KEY, '/GLP1_Tracker/%E0%A4%A')

    const restored = restoreGhPagesRedirect('/GLP1_Tracker/', {
      storage,
      history,
      location,
    })

    expect(restored).toBe(false)
    expect(storage.getItem(REDIRECT_STORAGE_KEY)).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('rejects scheme-like redirects and clears storage', () => {
    const unsafeValues = [
      'https://evil.com/x',
      '//evil.com/x',
      'data:text/html,evil',
      'javascript:alert(1)',
    ]

    unsafeValues.forEach((value) => {
      const storage = createMemoryStorage()
      const history = { replaceState: vi.fn() } as unknown as History
      const location = {
        pathname: '/GLP1_Tracker/',
        search: '',
        hash: '',
        origin: 'https://example.com',
      } as Location

      storage.setItem(REDIRECT_STORAGE_KEY, value)

      const restored = restoreGhPagesRedirect('/GLP1_Tracker/', {
        storage,
        history,
        location,
      })

      expect(restored).toBe(false)
      expect(storage.getItem(REDIRECT_STORAGE_KEY)).toBeNull()
      expect(history.replaceState).not.toHaveBeenCalled()
    })
  })

  it('rejects redirects outside the base path and clears storage', () => {
    const storage = createMemoryStorage()
    const history = { replaceState: vi.fn() } as unknown as History
    const location = {
      pathname: '/GLP1_Tracker/',
      search: '',
      hash: '',
      origin: 'https://example.com',
    } as Location

    storage.setItem(REDIRECT_STORAGE_KEY, '/settings')

    const restored = restoreGhPagesRedirect('/GLP1_Tracker/', {
      storage,
      history,
      location,
    })

    expect(restored).toBe(false)
    expect(storage.getItem(REDIRECT_STORAGE_KEY)).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('accepts the base path without a trailing slash', () => {
    const storage = createMemoryStorage()
    const history = { replaceState: vi.fn() } as unknown as History
    const location = {
      pathname: '/GLP1_Tracker/',
      search: '',
      hash: '',
      origin: 'https://example.com',
    } as Location

    storage.setItem(REDIRECT_STORAGE_KEY, '/GLP1_Tracker')

    const restored = restoreGhPagesRedirect('/GLP1_Tracker/', {
      storage,
      history,
      location,
    })

    expect(restored).toBe(true)
    expect(storage.getItem(REDIRECT_STORAGE_KEY)).toBeNull()
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/GLP1_Tracker',
    )
  })

  it('returns false when the redirect matches the current path', () => {
    const storage = createMemoryStorage()
    const history = { replaceState: vi.fn() } as unknown as History
    const location = {
      pathname: '/GLP1_Tracker/chart',
      search: '?range=30',
      hash: '#focus',
      origin: 'https://example.com',
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

    expect(restored).toBe(false)
    expect(storage.getItem(REDIRECT_STORAGE_KEY)).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })
})
