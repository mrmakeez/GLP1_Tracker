function DataPage() {
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
          <p className="text-sm font-semibold text-slate-200">Export</p>
          <p className="text-xs text-slate-500">
            Download a JSON snapshot of all tables.
          </p>
          <button
            type="button"
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
          <button
            type="button"
            className="mt-3 rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-200"
          >
            Select backup
          </button>
        </div>
      </div>
    </section>
  )
}

export default DataPage
