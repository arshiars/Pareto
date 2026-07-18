import { useEffect, useState } from 'react'
import Card from '../components/ui/Card.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import DocumentUpload from '../components/DocumentUpload.jsx'
import StepIndicator from '../components/StepIndicator.jsx'
import { useAnalysis } from '../context/AnalysisContext.jsx'

const STAGES = [
  { label: 'Analyzing uploaded documents',              ms: 2000  },
  { label: 'Parsing rent roll and tenant schedule',     ms: 6000  },
  { label: 'Extracting operating expense data',         ms: 8000  },
  { label: 'Identifying income and recoverable items',  ms: 7000  },
  { label: 'Running underwriting analysis',             ms: 10000 },
  { label: 'Finalizing extraction and generating summary', ms: null },
]

const INFO_CARDS = [
  {
    title: 'PDF & Images',
    body: 'Rent rolls, operating statements, tax documents',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    ),
  },
  {
    title: 'Automated Extraction',
    body: 'Financial data is parsed and structured automatically',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
    ),
  },
  {
    title: 'Review & Correct',
    body: 'Edit any values before generating the final NOI',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    ),
  },
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
              <p className="text-[#777777] text-sm mt-1">
                {isCompleting
                  ? 'All data extracted — loading your review…'
                  : 'Analyzing your documents and extracting financial data…'}
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-sm mx-auto text-left">
              {STAGES.map((stage, i) => {
                const done    = i < effectiveIndex
                const current = i === effectiveIndex
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 transition-opacity duration-500 ${current || done ? 'opacity-100' : 'opacity-40'}`}
                  >
                    <span className="w-5 flex-shrink-0 flex items-center justify-center">
                      {done
                        ? <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        : current
                        ? <Spinner size="sm" />
                        : <span className="w-1.5 h-1.5 rounded-full bg-border block mx-auto" />}
                    </span>
                    <span className={`text-sm ${done ? 'text-[#aaaaaa] line-through' : current ? 'text-primary font-medium' : 'text-[#aaaaaa]'}`}>
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
            <h2 className="text-2xl font-bold text-primary tracking-tight">Upload Property Documents</h2>
            <p className="text-[#777777] text-sm mt-1.5">
              Upload broker CIM, rent rolls, operating statements, and other relevant documents.
              Pareto will extract all financial data automatically.
            </p>
          </div>

          {state.error && (
            <div className="p-4 bg-error/10 border border-error/20 rounded-sm text-error text-sm">
              <strong>Error:</strong> {state.error}
            </div>
          )}

          <Card className="p-6">
            <DocumentUpload onAnalyze={analyze} disabled={isProcessing} />
          </Card>

          <div className="grid grid-cols-3 gap-4">
            {INFO_CARDS.map((card) => (
              <div key={card.title} className="flex items-start gap-3 p-4 bg-surface border border-border rounded-sm">
                <div className="w-7 h-7 rounded-sm bg-white border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {card.icon}
                  </svg>
                </div>
                <div>
                  <p className="text-primary font-semibold text-sm">{card.title}</p>
                  <p className="text-[#777777] text-xs mt-0.5 leading-relaxed">{card.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
