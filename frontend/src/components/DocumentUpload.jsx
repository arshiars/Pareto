import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import Button from './ui/Button.jsx'

const FILE_TYPE_LABELS = [
  'Broker CIM',
  'Rent Roll',
  'Operating Statements',
  'Tax Assessment',
  'Insurance Summary',
  'Lease Agreement',
  'Other',
]

function FileIcon() {
  return (
    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function getExt(filename) {
  return filename.split('.').pop().toUpperCase()
}

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
    setFileLabels((prev) => {
      const next = {}
      Object.entries(prev).forEach(([k, v]) => {
        const n = parseInt(k)
        if (n < idx) next[n] = v
        else if (n > idx) next[n - 1] = v
      })
      return next
    })
  }

  function setLabel(idx, label) {
    setFileLabels((prev) => ({ ...prev, [idx]: label }))
  }

  function handleAnalyze() {
    const labels = files.map((_, i) => fileLabels[i] || '')
    onAnalyze(files, labels)
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-sm cursor-pointer transition-all duration-150 ${
          isDragActive
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-primary/40 hover:bg-surface'
        } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4 px-8 py-14">
          {/* Icon */}
          <div className={`w-14 h-14 rounded-sm flex items-center justify-center transition-colors ${isDragActive ? 'bg-accent/15' : 'bg-surface'}`}>
            <svg className={`w-7 h-7 transition-colors ${isDragActive ? 'text-accent' : 'text-primary'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          {/* Text */}
          <div className="text-center">
            {isDragActive ? (
              <p className="text-accent font-semibold text-sm">Release to add files</p>
            ) : (
              <>
                <p className="text-primary font-semibold text-sm">
                  Drag & drop files here
                </p>
                <p className="text-[#777777] text-xs mt-1">
                  or <span className="text-accent font-semibold">browse from your computer</span>
                </p>
              </>
            )}
          </div>

          {/* Accepted types */}
          <div className="flex items-center gap-2">
            {['PDF', 'JPG', 'PNG'].map((ext) => (
              <span key={ext} className="px-2 py-0.5 bg-white border border-border rounded-[2px] text-[10px] font-semibold text-[#555555] tracking-wide">
                {ext}
              </span>
            ))}
            <span className="text-[#aaaaaa] text-[10px]">· Max 10 MB each</span>
          </div>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="border border-border rounded-sm divide-y divide-border overflow-hidden">
          {files.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-surface transition-colors">
              {/* File type badge + icon */}
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <div className="w-8 h-8 rounded-sm bg-primary/8 border border-primary/15 flex items-center justify-center">
                  <FileIcon />
                </div>
                <span className="text-[9px] font-bold text-[#777777] tracking-widest uppercase w-7">
                  {getExt(file.name)}
                </span>
              </div>

              {/* Name + size */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary truncate">{file.name}</p>
                <p className="text-[11px] text-[#aaaaaa] mt-0.5">{(file.size / 1024).toFixed(0)} KB</p>
              </div>

              {/* Label selector */}
              <select
                value={fileLabels[idx] || ''}
                onChange={(e) => setLabel(idx, e.target.value)}
                className="text-xs border border-border rounded-[2px] px-2 py-1.5 bg-white text-[#555555] focus:outline-none focus:border-primary transition-colors cursor-pointer"
              >
                <option value="">Label…</option>
                {FILE_TYPE_LABELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>

              {/* Remove */}
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(idx) }}
                className="text-[#cccccc] hover:text-error transition-colors flex-shrink-0 ml-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Analyze button */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[#aaaaaa] text-xs">
          {files.length === 0 ? 'No files selected' : `${files.length} file${files.length > 1 ? 's' : ''} ready`}
        </p>
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
