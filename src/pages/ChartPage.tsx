import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

const chartData = [
  { time: 'Day 1', level: 0.0 },
  { time: 'Day 2', level: 1.2 },
  { time: 'Day 3', level: 2.3 },
  { time: 'Day 4', level: 1.6 },
  { time: 'Day 5', level: 2.8 },
  { time: 'Day 6', level: 2.0 },
  { time: 'Day 7', level: 3.1 },
]

function ChartPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Chart</h1>
        <p className="text-sm text-slate-400">
          Estimated medication levels with historical and projected views.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Lookback', value: '30 days' },
          { label: 'Future horizon', value: '10 days' },
          { label: 'Sampling', value: '60 min' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {item.label}
            </p>
            <p className="text-lg font-semibold text-slate-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-slate-200">
            Tirzepatide (placeholder)
          </p>
          <p className="text-xs text-slate-500">
            Replace with real Bateman model output.
          </p>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                }}
              />
              <Line
                type="monotone"
                dataKey="level"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  )
}

export default ChartPage
