import { useState, useRef, useCallback } from 'react'
import { extractTripleCFile } from '../services/api.js'

export default function TripleCUploadPage({ onBack, onExtracted }) {
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState(null) // { current, total, fileName }
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const addFiles = useCallback((incoming) => {
    const pdfs = Array.from(incoming).filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
    if (!pdfs.length) return
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      return [...prev, ...pdfs.filter((f) => !existing.has(f.name))]
    })
    setError(null)
  }, [])

  const removeFile = (name) => setFiles((prev) => prev.filter((f) => f.name !== name))

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  // Extract files sequentially, routing each through review before moving to next
  const onExtract = async () => {
    if (!files.length) return
    setExtracting(true)
    setError(null)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProgress({ current: i + 1, total: files.length, fileName: file.name })
      try {
        const result = await extractTripleCFile(file)
        // Hand off to review — TripleCApp will call back into this flow
        // for remaining files via the queue passed in result
        const remaining = files.slice(i + 1)
        onExtracted({ ...result, remaining })
        return // pause here — TripleCApp resumes queue after review
      } catch (err) {
        setError(`Failed to extract "${file.name}": ${err.message}`)
        setExtracting(false)
        setProgress(null)
        return
      }
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-white border-b border-border">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="flex items-center gap-1.5 text-[#777777] hover:text-primary transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-primary text-lg font-bold tracking-tight">Triple-C</h1>
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">Add Projects</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <span className="text-[#555555] text-xs tracking-widest uppercase font-medium">KingSett Capital</span>
          </div>
          <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-14 w-auto" />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-16">
        <div className="w-full max-w-xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-primary tracking-tight">Upload QS Reports</h2>
            <p className="text-[#777777] mt-3 text-sm">
              Drop one or more PDF QS reports. Each will be extracted and reviewed one at a time before saving.
            </p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`
              flex flex-col items-center justify-center px-8 py-12
              border-2 border-dashed rounded-sm cursor-pointer transition-all duration-150
              ${dragging ? 'border-primary bg-primary/5' : 'border-border bg-white hover:border-primary hover:bg-surface'}
            `}
          >
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden"
              onChange={(e) => addFiles(e.target.files)} />
            <div className="w-12 h-12 rounded-sm bg-surface flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-primary font-semibold text-sm">{dragging ? 'Drop to add' : 'Drag & drop PDFs here'}</p>
            <p className="text-[#777777] text-xs mt-1">or click to browse — multiple files supported</p>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-4 bg-white border border-border rounded-sm divide-y divide-border">
              {files.map((f, i) => (
                <div key={f.name} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-[#aaaaaa] text-xs w-5 text-right flex-shrink-0">{i + 1}</span>
                  <svg className="w-4 h-4 text-[#777777] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="flex-1 text-primary text-sm truncate">{f.name}</span>
                  <span className="text-[#777777] text-xs flex-shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(f.name) }}
                    className="text-[#aaaaaa] hover:text-red-400 transition-colors flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="mt-4 text-red-500 text-sm text-center">{error}</p>}

          {/* Progress */}
          {extracting && progress && (
            <div className="mt-4 p-4 bg-white border border-border rounded-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-primary text-sm font-semibold">
                  Extracting {progress.current} of {progress.total}
                </span>
                <span className="text-[#777777] text-xs">{progress.fileName}</span>
              </div>
              <div className="h-1 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-[#777777] text-xs mt-2 text-center">Running text extraction + Claude analysis…</p>
            </div>
          )}

          <button
            onClick={onExtract}
            disabled={files.length === 0 || extracting}
            className="mt-6 w-full py-3 bg-primary text-white text-sm font-semibold rounded-sm
              hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all
              flex items-center justify-center gap-2"
          >
            {extracting ? (
              <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>Extracting…</>
            ) : (
              `Extract & Review${files.length > 1 ? ` (${files.length} files)` : ''}`
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
