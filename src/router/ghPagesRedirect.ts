const REDIRECT_STORAGE_KEY = 'gh-pages-redirect'

type RedirectDependencies = {
  storage?: Storage
  location?: Location
  history?: History
}

export const restoreGhPagesRedirect = (
  basePath: string,
  dependencies: RedirectDependencies = {},
) => {
  const storage = dependencies.storage ?? window.sessionStorage
  const location = dependencies.location ?? window.location
  const history = dependencies.history ?? window.history
  const redirectPath = storage.getItem(REDIRECT_STORAGE_KEY)

  if (!redirectPath || !redirectPath.startsWith(basePath)) {
    return false
  }

  storage.removeItem(REDIRECT_STORAGE_KEY)
  const currentPath = `${location.pathname}${location.search}${location.hash}`

  if (redirectPath !== currentPath) {
    history.replaceState(null, '', redirectPath)
  }

  return true
}

export { REDIRECT_STORAGE_KEY }
