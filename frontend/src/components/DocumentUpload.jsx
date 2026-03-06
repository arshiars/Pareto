import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import Button from './ui/Button.jsx'

const FILE_TYPE_LABELS = [
  'Rent Roll',
  'T6010',
  'Operating Statement',
  'Tax Assessment',
  'Insurance Summary',
  'Lease Agreement',
  'Other',
]

export default function DocumentUpload({ onAnalyze, disabled }) {
  const [files, setFiles] = useState([])
  const [fileLabels, setFileLabels] = useState({})

  const onDrop = useCallback((accepted) => {
    setFiles((prev) => {
      const newFiles = [...prev]
      accepted.forEach((f) => {
        if (!newFiles.find((x) => x.name === f.name && x.size === f.size)) {
          newFiles.push(f)
        }
      })
      return newFiles
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'] },
    disabled,
  })

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function setLabel(idx, label) {
    setFileLabels((prev) => ({ ...prev, [idx]: label }))
  }

  function handleAnalyze() {
    onAnalyze(files)
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-primary/3'
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
            <p className="text-gray-500 text-sm mt-1">PDF or image files, up to 10MB each</p>
          </div>
          <Button variant="secondary" size="sm" disabled={disabled}>
            Browse Files
          </Button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg">
              <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <select
                value={fileLabels[idx] || ''}
                onChange={(e) => setLabel(idx, e.target.value)}
                className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Label document...</option>
                {FILE_TYPE_LABELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button
                onClick={() => removeFile(idx)}
                className="text-gray-400 hover:text-error transition-colors ml-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="primary"
          size="lg"
          disabled={files.length === 0 || disabled}
          onClick={handleAnalyze}
        >
          Analyze Documents
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Button>
      </div>
    </div>
  )
}
