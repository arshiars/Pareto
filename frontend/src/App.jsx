import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
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
import LOIDrafterPage from './pages/LOIDrafterPage.jsx'
import TripleCApp from './pages/TripleCApp.jsx'
import { checkAuth } from './services/api.js'

function AppContent() {
  const { state } = useAnalysis()

  return (
    <Layout backTo="/">
      {(state.step === 'upload' || state.step === 'processing') && <UploadPage />}
      {state.step === 'review' && <ReviewPage />}
      {state.step === 'excel' && <ExcelPage />}
    </Layout>
  )
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)

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

  return (
    <Routes>
      <Route path="/" element={<SelectionPage />} />
      <Route path="/cmhc" element={<AnalysisProvider><AppContent /></AnalysisProvider>} />
      <Route path="/conventional" element={<ConventionalPage />} />
      <Route path="/conventional/ipp" element={<IPPPage />} />
      <Route path="/cmhc-database" element={<CMHCDatabasePage />} />
      <Route path="/cmhc-database/:slug" element={<CMHCDatabasePage />} />
      <Route path="/loi-drafter" element={<LOIDrafterPage />} />
      <Route path="/comparable-analysis" element={<ComparableAnalysisPage />} />
      <Route path="/comparable-analysis/rent-comparables/*" element={<RentComparablesPage />} />
      <Route path="/triple-c/*" element={<TripleCApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
