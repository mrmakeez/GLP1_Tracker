import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

function OfflineIndicator() {
  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW({
    onRegistered(r?: ServiceWorkerRegistration) {
      if (r) {
        r.update()
      }
    },
  })
  const [showOfflineToast, setShowOfflineToast] = useState(false)

  useEffect(() => {
    if (offlineReady) {
      setShowOfflineToast(true)
      const timer = window.setTimeout(() => {
        setShowOfflineToast(false)
      }, 4000)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [offlineReady])

  if (!showOfflineToast && !needRefresh) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-xs flex-col gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-4 py-3 text-sm text-emerald-100 shadow-lg shadow-emerald-500/10">
      <p className="font-semibold">
        {needRefresh
          ? 'A new version is available.'
          : 'Offline ready: data stays on this device.'}
      </p>
      {needRefresh ? (
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="w-fit rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-950"
        >
          Refresh now
        </button>
      ) : null}
    </div>
  )
}

export default OfflineIndicator
