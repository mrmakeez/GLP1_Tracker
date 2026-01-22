import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

function OfflineIndicator() {
  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW()
  const [showOfflineToast, setShowOfflineToast] = useState(false)
  const [showUpdateToast, setShowUpdateToast] = useState(false)

  useEffect(() => {
    if (offlineReady) {
      const showTimer = window.setTimeout(() => {
        setShowOfflineToast(true)
      }, 0)
      const hideTimer = window.setTimeout(() => {
        setShowOfflineToast(false)
      }, 4000)
      return () => {
        window.clearTimeout(showTimer)
        window.clearTimeout(hideTimer)
      }
    }
    return undefined
  }, [offlineReady])

  useEffect(() => {
    if (needRefresh) {
      const showTimer = window.setTimeout(() => {
        setShowUpdateToast(true)
      }, 0)
      const hideTimer = window.setTimeout(() => {
        setShowUpdateToast(false)
      }, 6000)
      return () => {
        window.clearTimeout(showTimer)
        window.clearTimeout(hideTimer)
      }
    }
    setShowUpdateToast(false)
    return undefined
  }, [needRefresh])

  if (!showOfflineToast && !showUpdateToast) {
    return null
  }

  const showUpdate = showUpdateToast && needRefresh

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-xs flex-col gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-4 py-3 text-sm text-emerald-100 shadow-lg shadow-emerald-500/10">
      <p className="font-semibold">
        {showUpdate
          ? 'A new version is available.'
          : 'Offline ready: data stays on this device.'}
      </p>
      {showUpdate ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
            className="w-fit rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-950"
          >
            Refresh now
          </button>
          <button
            type="button"
            onClick={() => setShowUpdateToast(false)}
            className="w-fit rounded-full border border-emerald-400/50 px-3 py-1 text-xs font-semibold text-emerald-50"
          >
            Later
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default OfflineIndicator
