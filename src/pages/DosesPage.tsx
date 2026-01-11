const doseRows = [
  {
    id: 'dose-1',
    medication: 'Tirzepatide',
    amount: '2.5 mg',
    datetime: '2025-01-14 09:00',
  },
  {
    id: 'dose-2',
    medication: 'Retatrutide',
    amount: '1.5 mg',
    datetime: '2025-01-07 09:00',
  },
]

function DosesPage() {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Doses</h1>
          <p className="text-sm text-slate-400">
            Log injections quickly and review the latest entries.
          </p>
        </div>
        <button
          type="button"
          className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950"
        >
          Add Dose
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Medication</th>
              <th className="px-4 py-3 font-medium">Dose</th>
              <th className="px-4 py-3 font-medium">Date &amp; time</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {doseRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-800">
                <td className="px-4 py-3">{row.medication}</td>
                <td className="px-4 py-3">{row.amount}</td>
                <td className="px-4 py-3">{row.datetime}</td>
                <td className="px-4 py-3 text-slate-400">
                  <button
                    type="button"
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default DosesPage
