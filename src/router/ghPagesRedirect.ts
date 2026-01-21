const REDIRECT_STORAGE_KEY = 'gh-pages-redirect'

type RedirectDependencies = {
  storage?: Storage
  location?: Location
  history?: History
}

const normalizeBasePath = (basePath: string) => {
  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash
    : `${withLeadingSlash}/`
}

const hasSchemeLikePrefix = (redirectPath: string) =>
  /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(redirectPath.trim())

const hasTraversalPattern = (pathPart: string) => {
  return (
    /(^|\/)\.\.(\/|$)/.test(pathPart) ||
    /(^|\/)\.(\/|$)/.test(pathPart) ||
    /(^|\/)%2e%2e(\/|$)/i.test(pathPart) ||
    /(^|\/)%2e(\/|$)/i.test(pathPart)
  )
}

const hasDotSegments = (pathname: string) => {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // Treat malformed encoding as unsafe to avoid crashes or bypasses.
    return true
  }
  return decoded
    .split('/')
    .filter((segment) => segment.length > 0)
    .some((segment) => segment === '..' || segment === '.')
}

export const restoreGhPagesRedirect = (
  basePath: string,
  dependencies: RedirectDependencies = {},
) => {
  const storage = dependencies.storage ?? window.sessionStorage
  const location = dependencies.location ?? window.location
  const history = dependencies.history ?? window.history
  const redirectPath = storage.getItem(REDIRECT_STORAGE_KEY)

  if (!redirectPath) {
    return false
  }

  storage.removeItem(REDIRECT_STORAGE_KEY)

  const trimmedPath = redirectPath.trim()
  if (trimmedPath.startsWith('//')) {
    return false
  }
  // Only scan the pathname portion to avoid false positives in query/hash.
  const pathPart = trimmedPath.split(/[?#]/, 1)[0]
  if (hasSchemeLikePrefix(trimmedPath) || hasTraversalPattern(pathPart)) {
    return false
  }

  const normalizedBasePath = normalizeBasePath(basePath)
  // URL parsing canonicalizes relative paths to avoid base escape via traversal.
  let targetUrl: URL
  try {
    const baseUrl = new URL(normalizedBasePath, location.origin)
    targetUrl = new URL(trimmedPath, baseUrl)
  } catch {
    return false
  }

  if (targetUrl.origin !== location.origin) {
    return false
  }

  const baseNoSlash = normalizedBasePath.replace(/\/$/, '')
  if (
    !(
      targetUrl.pathname === baseNoSlash ||
      targetUrl.pathname.startsWith(normalizedBasePath)
    )
  ) {
    return false
  }

  if (hasDotSegments(targetUrl.pathname)) {
    return false
  }

  const currentPath = `${location.pathname}${location.search}${location.hash}`
  const targetPath = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`

  if (targetPath === currentPath) {
    return false
  }

  history.replaceState(null, '', targetPath)

  return true
}

export { REDIRECT_STORAGE_KEY }
