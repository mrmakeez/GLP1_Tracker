import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  exportDatabase,
  importDatabaseReplaceAll,
  validateImportPayload,
} from '../db'

type ToastState = {
  message: string
  tone: 'success' | 'error'
}

const buildExportFilename = (exportedAt: string) => {
  const safeTimestamp = exportedAt
    .replace(/[:.]/g, '-')
    .replace('T', '_')
  return `glp1-tracker-backup-${safeTimestamp}.json`
}

function DataPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [replaceAll, setReplaceAll] = useState(true)

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const handleExport = async () => {
    try {
      const payload = await exportDatabase()
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = buildExportFilename(payload.exportedAt)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setToast({ message: 'Export ready for download.', tone: 'success' })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Export failed.'
      setToast({ message, tone: 'error' })
    }
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    if (!replaceAll) {
      setToast({
        message: 'Enable "Replace all data" to import a backup.',
        tone: 'error',
      })
      return
    }

    try {
      const contents = await file.text()
      const parsed = JSON.parse(contents)
      const validated = validateImportPayload(parsed)
      await importDatabaseReplaceAll(validated)
      setToast({ message: 'Import completed successfully.', tone: 'success' })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Import failed.'
      setToast({ message, tone: 'error' })
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">
          Data Export &amp; Import
        </h1>
        <p className="text-sm text-slate-400">
          Keep local backups of your IndexedDB data.
        </p>
      </div>

      {toast ? (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            toast.tone === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
          <p className="text-sm font-semibold text-slate-200">Export</p>
          <p className="text-xs text-slate-500">
            Download a JSON snapshot of all tables.
          </p>
          <button
            type="button"
            onClick={handleExport}
            className="mt-3 rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950"
          >
            Export data
          </button>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
          <p className="text-sm font-semibold text-slate-200">Import</p>
          <p className="text-xs text-slate-500">
            Replace local data with a backup file.
          </p>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                checked={replaceAll}
                onChange={(event) => setReplaceAll(event.target.checked)}
              />
              Replace all data
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleImport}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-200"
            >
              Select backup
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default DataPage
