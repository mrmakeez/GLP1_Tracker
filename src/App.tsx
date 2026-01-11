import { Navigate, Route, Routes } from 'react-router-dom'
import TopNav from './components/TopNav'
import OfflineIndicator from './components/OfflineIndicator'
import ChartPage from './pages/ChartPage'
import DataPage from './pages/DataPage'
import DosesPage from './pages/DosesPage'
import SettingsPage from './pages/SettingsPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <TopNav />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-10 pt-6">
        <OfflineIndicator />
        <Routes>
          <Route path="/" element={<Navigate to="/doses" replace />} />
          <Route path="/doses" element={<DosesPage />} />
          <Route path="/chart" element={<ChartPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
