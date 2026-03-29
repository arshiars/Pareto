import { useState, useEffect } from 'react'
import { AnalysisProvider, useAnalysis } from './context/AnalysisContext.jsx'
import Layout from './components/Layout.jsx'
import Gateway from './components/Gateway.jsx'
import SelectionPage from './pages/SelectionPage.jsx'
import UploadPage from './pages/UploadPage.jsx'
import ReviewPage from './pages/ReviewPage.jsx'
import ExcelPage from './pages/ExcelPage.jsx'
import ConventionalPage from './pages/ConventionalPage.jsx'
import IPPPage from './pages/IPPPage.jsx'
import CMHCDatabasePage from './pages/CMHCDatabasePage.jsx'
import ComparableAnalysisPage from './pages/ComparableAnalysisPage.jsx'
import RentComparablesPage from './pages/RentComparablesPage.jsx'
import TripleCApp from './pages/TripleCApp.jsx'
import { checkAuth } from './services/api.js'

function AppContent() {
  const { state } = useAnalysis()

  return (
    <Layout>
      {(state.step === 'upload' || state.step === 'processing') && <UploadPage />}
      {state.step === 'review' && <ReviewPage />}
      {state.step === 'excel' && <ExcelPage />}
    </Layout>
  )
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [mode, setMode] = useState(null) // null | 'cmhc' | 'conventional'

  useEffect(() => {
    checkAuth()
      .then((ok) => {
        setAuthenticated(ok)
      })
      .catch(() => {
        setAuthenticated(false)
      })
      .finally(() => {
        setChecking(false)
      })
  }, [])

  if (checking) return null

  if (!authenticated) {
    return <Gateway onAuthenticated={() => setAuthenticated(true)} />
  }

  if (mode === null) {
    return <SelectionPage onSelect={setMode} />
  }

  if (mode === 'conventional') {
    return <ConventionalPage onSelect={(sub) => setMode(`conventional/${sub}`)} onBack={() => setMode(null)} />
  }

  if (mode === 'conventional/ipp') {
    return <IPPPage onBack={() => setMode('conventional')} />
  }

  if (mode === 'cmhc-database') {
    return <CMHCDatabasePage onBack={() => setMode(null)} />
  }

  if (mode === 'loi-drafter') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-primary mb-2">LOI Drafter</h2>
          <p className="text-[#777777] text-sm mb-6">Coming soon</p>
          <button onClick={() => setMode(null)} className="text-accent text-sm font-semibold hover:underline">← Back</button>
        </div>
      </div>
    )
  }

  if (mode === 'comparable-analysis') {
    return <ComparableAnalysisPage onBack={() => setMode(null)} onSelect={(sub) => setMode(`comparable-analysis/${sub}`)} />
  }

  if (mode === 'comparable-analysis/rent-comparables') {
    return <RentComparablesPage onBack={() => setMode('comparable-analysis')} />
  }

  if (mode === 'triple-c') {
    return <TripleCApp onBack={() => setMode(null)} />
  }

  return (
    <AnalysisProvider>
      <AppContent />
    </AnalysisProvider>
  )
}
