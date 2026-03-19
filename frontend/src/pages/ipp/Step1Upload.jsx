import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useIPP } from '../../context/IPPContext.jsx'
import Card from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Spinner from '../../components/ui/Spinner.jsx'

const DOCUMENT_TYPES = [
  'Broker CIM',
  'Rent Roll',
  'Operating Statement',
  'Tax Bill',
  'Insurance Bill',
  'Utility Bill',
  'Other',
]

const STAGES = [
  { label: 'Reading uploaded documents',            ms: 2000  },
  { label: 'Parsing rent roll & tenant schedule',   ms: 6000  },
  { label: 'Extracting operating expenses',         ms: 7000  },
  { label: 'Locating income & recovery items',      ms: 6000  },
  { label: 'Extracting acquisition & cost data',    ms: 8000  },
  { label: 'Finalising extraction & building summary', ms: null },
]

function UploadZone({ onDrop, isDragActive, disabled, getInputProps, getRootProps }) {
  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-sm p-10 text-center cursor-pointer transition-all ${
        isDragActive
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-primary/[0.02]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div>
          <p className="text-primary font-medium">
            {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="text-[#999999] text-sm mt-1">PDF or image files · up to 10 MB each</p>
        </div>
        <Button variant="secondary" size="sm" disabled={disabled}>Browse Files</Button>
      </div>
    </div>
  )
}

export default function Step1Upload() {
  const { state, analyze } = useIPP()
  const isProcessing = state.step === 'processing'
  const isCompleting = state.step === 'completing'
  const showLoader   = isProcessing || isCompleting

  const [files, setFiles]           = useState([])
  const [fileLabels, setFileLabels] = useState({})
  const [stageIndex, setStageIndex] = useState(0)

  const onDrop = useCallback((accepted) => {
    setFiles((prev) => {
      const next = [...prev]
      accepted.forEach((f) => {
        if (!next.find((x) => x.name === f.name && x.size === f.size)) next.push(f)
      })
      return next
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'] },
    disabled: showLoader,
  })

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

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
    setFileLabels((prev) => {
      const next = { ...prev }
      delete next[idx]
      // re-index labels
      const reindexed = {}
      Object.entries(next).forEach(([k, v]) => {
        const ki = parseInt(k)
        reindexed[ki > idx ? ki - 1 : ki] = v
      })
      return reindexed
    })
  }

  function setLabel(idx, label) {
    setFileLabels((prev) => ({ ...prev, [idx]: label }))
  }

  function handleAnalyze() {
    const labels = files.map((_, i) => fileLabels[i] || '')
    analyze(files, labels)
  }

  if (showLoader) {
    return (
      <Card className="p-12">
        <div className="flex flex-col items-center gap-8 text-center">
          <div>
            <h2 className="text-lg font-semibold text-primary">
              {isCompleting ? 'Extraction Complete' : 'Analyzing Documents'}
            </h2>
            <p className="text-[#999999] text-sm mt-1">
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
                  className={`flex items-center gap-3 transition-opacity duration-500 ${current || done ? 'opacity-100' : 'opacity-40'}`}
                >
                  <span className="w-5 flex-shrink-0 flex items-center justify-center">
                    {done
                      ? <span className="text-success font-bold text-sm">✓</span>
                      : current
                      ? <Spinner size="sm" />
                      : <span className="text-[#cccccc] text-lg leading-none">·</span>}
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
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">Step 1</span>
        </div>
        <h2 className="text-2xl font-bold text-primary">Upload Property Documents</h2>
        <p className="text-[#777777] mt-1 text-sm">
          Upload the broker CIM, rent roll, operating statements, and bills. Claude will extract all financial data automatically.
        </p>
      </div>

      {state.error && (
        <div className="p-4 bg-error/10 border border-error/20 rounded-sm text-error text-sm">
          <strong>Error:</strong> {state.error}
        </div>
      )}

      <Card className="p-6 space-y-4">
        <UploadZone
          getRootProps={getRootProps}
          getInputProps={getInputProps}
          isDragActive={isDragActive}
          disabled={showLoader}
        />

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="flex items-center gap-3 p-3 bg-surface border border-border rounded-sm">
                <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary truncate">{file.name}</p>
                  <p className="text-xs text-[#aaaaaa]">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <select
                  value={fileLabels[idx] || ''}
                  onChange={(e) => setLabel(idx, e.target.value)}
                  className="text-xs border border-border rounded-sm px-2 py-1.5 bg-background text-[#555555] focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Label document…</option>
                  {DOCUMENT_TYPES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeFile(idx)}
                  className="text-[#bbbbbb] hover:text-error transition-colors ml-1 flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            variant="primary"
            size="lg"
            disabled={files.length === 0}
            onClick={handleAnalyze}
          >
            Extract Data
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-3 text-center text-sm text-[#777777]">
        {[
          { title: 'Broker CIM',          desc: 'Purchase price, property overview, acquisition costs' },
          { title: 'Rent Roll',           desc: 'Tenant schedule with areas, rates, and lease terms' },
          { title: 'Operating Statement', desc: 'Income, expenses, vacancy, and NOI history' },
          { title: 'Bills',               desc: 'Property tax, insurance, and utility actual amounts' },
        ].map(({ title, desc }) => (
          <div key={title} className="p-4 bg-surface rounded-sm border border-border">
            <div className="text-primary font-semibold text-xs uppercase tracking-wide mb-1">{title}</div>
            <div className="text-xs leading-relaxed">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
