const settingsCards = [
  {
    title: 'Default timezone',
    description: 'Pacific/Auckland',
  },
  {
    title: 'Chart sampling',
    description: '60 minutes',
  },
  {
    title: 'Medication profiles',
    description: 'Configure ka, ke, scale, notes',
  },
]

function SettingsPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400">
          Customize PK parameters, timezone, and chart defaults.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {settingsCards.map((card) => (
          <div
            key={card.title}
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
          >
            <p className="text-sm font-semibold text-slate-200">{card.title}</p>
            <p className="text-xs text-slate-500">{card.description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
        <p className="text-sm font-semibold text-slate-200">
          Medication profiles
        </p>
        <p className="text-xs text-slate-500">
          Add tirzepatide or retatrutide profiles with editable PK constants.
        </p>
        <button
          type="button"
          className="mt-3 rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-200"
        >
          Add profile
        </button>
      </div>
    </section>
  )
}

export default SettingsPage
