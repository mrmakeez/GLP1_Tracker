import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold text-slate-100">Page not found</h1>
      <p className="text-sm text-slate-400">
        The page you are looking for does not exist.
      </p>
      <Link
        to="/doses"
        className="inline-flex rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950"
      >
        Back to doses
      </Link>
    </section>
  )
}

export default NotFoundPage
