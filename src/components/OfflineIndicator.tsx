import { useRegisterSW } from 'virtual:pwa-register/react'

function OfflineIndicator() {
  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        r.update()
      }
    },
  })

  if (!offlineReady && !needRefresh) {
    return null
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
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
