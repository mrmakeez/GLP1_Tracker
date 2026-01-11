import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/doses', label: 'Doses' },
  { to: '/chart', label: 'Chart' },
  { to: '/settings', label: 'Settings' },
  { to: '/data', label: 'Data (Export/Import)' },
]

function TopNav() {
  return (
    <header className="border-b border-slate-800 bg-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            GLP-1 Level Tracker
          </p>
          <p className="text-lg font-semibold text-slate-100">
            Offline pharmacokinetics dashboard
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm font-medium text-slate-300">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'rounded-full border px-4 py-2 transition',
                  isActive
                    ? 'border-sky-400 bg-sky-500/10 text-sky-200'
                    : 'border-slate-700 hover:border-slate-500 hover:text-slate-100',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}

export default TopNav
