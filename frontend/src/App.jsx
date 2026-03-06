import { AnalysisProvider, useAnalysis } from './context/AnalysisContext.jsx'
import Layout from './components/Layout.jsx'
import UploadPage from './pages/UploadPage.jsx'
import ReviewPage from './pages/ReviewPage.jsx'
import SummaryPage from './pages/SummaryPage.jsx'
import ExcelPage from './pages/ExcelPage.jsx'

function AppContent() {
  const { state } = useAnalysis()

  return (
    <Layout>
      {(state.step === 'upload' || state.step === 'processing') && <UploadPage />}
      {state.step === 'review' && <ReviewPage />}
      {state.step === 'summary' && <SummaryPage />}
      {state.step === 'excel' && <ExcelPage />}
    </Layout>
  )
}

export default function App() {
  return (
    <AnalysisProvider>
      <AppContent />
    </AnalysisProvider>
  )
}
