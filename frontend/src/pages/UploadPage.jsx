import Card from '../components/ui/Card.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import DocumentUpload from '../components/DocumentUpload.jsx'
import StepIndicator from '../components/StepIndicator.jsx'
import { useAnalysis } from '../context/AnalysisContext.jsx'

export default function UploadPage() {
  const { state, analyze } = useAnalysis()
  const isProcessing = state.step === 'processing'

  return (
    <div>
      <StepIndicator currentStep={state.step} />

      {isProcessing ? (
        <Card className="p-12">
          <div className="flex flex-col items-center gap-6 text-center">
            <Spinner size="lg" />
            <div>
              <h2 className="text-lg font-semibold text-primary">Analyzing Documents</h2>
              <p className="text-gray-500 text-sm mt-1">
                Claude is extracting financial data from your documents. This may take a moment...
              </p>
            </div>
            <div className="flex flex-col gap-1.5 text-sm text-gray-400">
              <p>Extracting unit breakdown and rent data</p>
              <p>Identifying operating expenses</p>
              <p>Locating additional income sources</p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-primary">Upload Property Documents</h2>
            <p className="text-gray-500 mt-1">
              Upload rent rolls, T6010s, operating statements, and other relevant documents.
              Claude will extract all financial data automatically.
            </p>
          </div>

          {state.error && (
            <div className="p-4 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
              <strong>Error:</strong> {state.error}
            </div>
          )}

          <Card className="p-6">
            <DocumentUpload onAnalyze={analyze} disabled={isProcessing} />
          </Card>

          <div className="grid grid-cols-3 gap-4 text-center text-sm text-gray-500">
            <div className="p-4 bg-surface rounded-lg border border-border">
              <div className="text-primary font-semibold text-base mb-1">PDF & Images</div>
              <div>Rent rolls, operating statements, tax documents</div>
            </div>
            <div className="p-4 bg-surface rounded-lg border border-border">
              <div className="text-primary font-semibold text-base mb-1">AI Extraction</div>
              <div>Claude reads and structures all financial data</div>
            </div>
            <div className="p-4 bg-surface rounded-lg border border-border">
              <div className="text-primary font-semibold text-base mb-1">Review & Correct</div>
              <div>Edit any values before generating the final NOI</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
