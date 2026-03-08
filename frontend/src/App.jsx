import { useState, useEffect } from 'react'
import { AnalysisProvider, useAnalysis } from './context/AnalysisContext.jsx'
import Layout from './components/Layout.jsx'
import Gateway from './components/Gateway.jsx'
import UploadPage from './pages/UploadPage.jsx'
import ReviewPage from './pages/ReviewPage.jsx'
import ExcelPage from './pages/ExcelPage.jsx'
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

  useEffect(() => {
    checkAuth().then((ok) => {
      setAuthenticated(ok)
      setChecking(false)
    })
  }, [])

  if (checking) return null

  if (!authenticated) {
    return <Gateway onAuthenticated={() => setAuthenticated(true)} />
  }

  return (
    <AnalysisProvider>
      <AppContent />
    </AnalysisProvider>
  )
}
