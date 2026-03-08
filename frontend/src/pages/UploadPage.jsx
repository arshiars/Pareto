import { useEffect, useState } from 'react'
import Card from '../components/ui/Card.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import DocumentUpload from '../components/DocumentUpload.jsx'
import StepIndicator from '../components/StepIndicator.jsx'
import { useAnalysis } from '../context/AnalysisContext.jsx'

const STAGES = [
  { label: 'Reading uploaded documents',          ms: 2000  },
  { label: 'Parsing rent roll & unit data',       ms: 6000  },
  { label: 'Extracting operating expenses',       ms: 8000  },
  { label: 'Locating additional income sources',  ms: 7000  },
  { label: 'Running underwriting analysis',       ms: 10000 },
  { label: 'Finalising NOI & generating summary', ms: null  },
]

export default function UploadPage() {
  const { state, analyze } = useAnalysis()
  const isProcessing = state.step === 'processing'
  const isCompleting = state.step === 'completing'
  const showLoader   = isProcessing || isCompleting
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    if (!isProcessing) { setStageIndex(0); return }
    const ids = []
    let delay = 0
    STAGES.slice(0, -1).forEach((stage, i) => {
      delay += stage.ms
      ids.push(setTimeout(() => setStageIndex(i + 1), delay))
    })
    return () => ids.forEach(clearTimeout)
  }, [isProcessing])

  // When the API resolves (completing), instantly mark all stages done
  const effectiveIndex = isCompleting ? STAGES.length : stageIndex

  return (
    <div>
      <StepIndicator currentStep={state.step} />

      {showLoader ? (
        <Card className="p-12">
          <div className="flex flex-col items-center gap-8 text-center">
            <div>
              <h2 className="text-lg font-semibold text-primary">
                {isCompleting ? 'Extraction Complete' : 'Analyzing Documents'}
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                {isCompleting
                  ? 'All data extracted — loading your review…'
                  : 'Claude is reading your documents and extracting financial data…'}
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-sm mx-auto text-left">
              {STAGES.map((stage, i) => {
                const done    = i < effectiveIndex
                const current = i === effectiveIndex
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 transition-opacity duration-500 ${current || done ? 'opacity-100' : 'opacity-45'}`}
                  >
                    <span className="w-5 flex-shrink-0 flex items-center justify-center">
                      {done
                        ? <span className="text-green-500 font-bold text-sm">✓</span>
                        : current
                        ? <Spinner size="sm" />
                        : <span className="text-gray-400 text-lg leading-none">·</span>}
                    </span>
                    <span className={`text-sm ${done ? 'text-gray-400 line-through' : current ? 'text-primary font-medium' : 'text-gray-400'}`}>
                      {stage.label}
                    </span>
                  </div>
                )
              })}
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
