import { useCallback, useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { useDropzone } from 'react-dropzone'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
const ComparablesMap = lazy(() => import('../components/ComparablesMap.jsx'))
const CompTable = lazy(() => import('../components/CompTable.jsx'))
const PropertyMap = lazy(() => import('../components/PropertyMap.jsx'))
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
import {
  bulkExtractAndSave,
  extractRentComparables,
  saveRentComparables,
  fetchRentComparables,
  deleteRentComparablesBatch,
  updateRentComparable,
  renameBatchAddress,
} from '../services/api.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(val) {
  if (val == null) return '—'
  return '$' + Number(val).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDate(val) {
  if (!val) return null
  return val // already YYYY-MM-DD
}

function LeaseEndCell({ move_out }) {
  if (!move_out) return <span className="text-green-600 font-medium text-xs">Active</span>
  const today = new Date().toISOString().split('T')[0]
  if (move_out < today) return <span className="text-red-400 text-xs">{move_out}</span>
  return <span className="text-xs text-[#555555]">{move_out}</span>
}

function groupByBatch(units) {
  const map = new Map()
  for (const unit of units) {
    if (!map.has(unit.batch_id)) {
      map.set(unit.batch_id, {
        batch_id: unit.batch_id,
        source_file: unit.source_file,
        uploaded_at: unit.uploaded_at,
        units: [],
      })
    }
    map.get(unit.batch_id).units.push(unit)
  }
  return Array.from(map.values())
}

// ─── Shared header ───────────────────────────────────────────────────────────

function PageHeader({ onBack }) {
  return (
    <header className="bg-white border-b border-border flex-shrink-0">
      <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[#777777] hover:text-primary transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="h-6 w-px bg-border" />
          <div>
            <h1 className="text-primary text-lg font-bold tracking-tight">Fundus</h1>
            <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">Deal Processor</p>
          </div>
          <div className="h-6 w-px bg-border" />
          <span className="text-[#555555] text-xs tracking-widest uppercase font-medium">KingSett Capital</span>
        </div>
        <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-14 w-auto" />
      </div>
    </header>
  )
}

// ─── Table column headings (shared between review + history) ─────────────────

const TABLE_COLS = ['Address', 'Unit', 'Type', 'Beds', 'Baths', 'Sqft', 'Rent/mo', 'Move In', 'Move Out']

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RentComparablesPage({ onBack }) {
  const [view, setView] = useState('map') // 'map' | 'upload' | 'review' | 'history' | 'property' | 'comptable'

  // Upload state
  const [files, setFiles] = useState([])
  const [extracting, setExtracting] = useState(false)

  // Bulk import state
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null)
  // bulkProgress: { current, total, currentFile, results: [{ file, saved, success, error }] }

  // Review state
  const [reviewUnits, setReviewUnits] = useState([])
  const [batchId, setBatchId] = useState(null)
  const [saving, setSaving] = useState(false)

  // History state
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [deletingBatch, setDeletingBatch] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingValues, setEditingValues] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [historyView, setHistoryView] = useState('list') // 'list' | 'map'
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [expandedBatches, setExpandedBatches] = useState(new Set())
  const [renamingBatchId, setRenamingBatchId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  const [uploadingBatchId, setUploadingBatchId] = useState(null)
  const batchUploadRef = useRef(null)
  const uploadTargetBatch = useRef(null)
  const [addressSearch, setAddressSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchCoords, setSearchCoords] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [pinStarCoords, setPinStarCoords] = useState(null)
  const [subjectLabel, setSubjectLabel] = useState(null)
  const [highlightAddress, setHighlightAddress] = useState(null)
  const [selectedAddresses, setSelectedAddresses] = useState(() => {
    try {
      const saved = localStorage.getItem('fundus_selected_addresses')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })
  const [bedsFilter, setBedsFilter] = useState('')
  const [sqftMin, setSqftMin] = useState('')
  const [sqftMax, setSqftMax] = useState('')
  const [moveInFrom, setMoveInFrom] = useState('')
  const [moveInTo, setMoveInTo] = useState('')
  const [leaseRateMin, setLeaseRateMin] = useState('')
  const [leaseRateMax, setLeaseRateMax] = useState('')
  const [bathsFilter, setBathsFilter] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)

  const [error, setError] = useState(null)

  // ── Upload handlers ──────────────────────────────────────────────────────

  const onDrop = useCallback((accepted) => {
    setFiles((prev) => {
      const next = [...prev]
      accepted.forEach((f) => {
        if (!next.find((x) => x.name === f.name && x.size === f.size)) next.push(f)
      })
      return next
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    noClick: true,
  })

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleExtract() {
    setExtracting(true)
    setError(null)
    try {
      const result = await extractRentComparables(files)
      setBatchId(result.batchId)
      setReviewUnits(result.units)
      setView('review')
    } catch (err) {
      setError(err.message)
    } finally {
      setExtracting(false)
    }
  }

  async function handleBulkImport() {
    setBulkRunning(true)
    setError(null)

    // Pre-flight: skip files already in the database (match by source_file name)
    let existingFileNames = new Set()
    try {
      const existing = await fetchRentComparables()
      existingFileNames = new Set(existing.map((u) => u.source_file).filter(Boolean))
    } catch { /* proceed without check if fetch fails */ }

    const skipped = files.filter((f) => existingFileNames.has(f.name))
    const toProcess = files.filter((f) => !existingFileNames.has(f.name))
    const total = files.length

    setBulkProgress({
      current: skipped.length,
      total,
      currentFile: toProcess.length > 0 ? toProcess[0].name : '',
      results: skipped.map((f) => ({ file: f.name, success: true, saved: 0, skipped: true })),
    })

    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i]
      setBulkProgress((prev) => ({ ...prev, current: skipped.length + i + 1, currentFile: file.name }))
      try {
        const result = await bulkExtractAndSave(file)
        setBulkProgress((prev) => ({
          ...prev,
          results: [...prev.results, { file: file.name, saved: result.saved, success: true }],
        }))
      } catch (err) {
        setBulkProgress((prev) => ({
          ...prev,
          results: [...prev.results, { file: file.name, error: err.message, success: false }],
        }))
      }
    }

    setBulkRunning(false)
  }

  function handleBulkDone() {
    setFiles([])
    setBulkProgress(null)
    setView('map')
  }

  // ── Review handlers ──────────────────────────────────────────────────────

  function updateUnit(idx, field, value) {
    setReviewUnits((prev) => prev.map((u, i) => (i === idx ? { ...u, [field]: value } : u)))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await saveRentComparables(batchId, reviewUnits)
      setFiles([])
      setReviewUnits([])
      setBatchId(null)
      await loadHistory()
      setView('map')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleDiscard() {
    setReviewUnits([])
    setBatchId(null)
    setView('upload')
  }

  // ── History handlers ─────────────────────────────────────────────────────

  async function loadHistory() {
    setLoadingHistory(true)
    try {
      const data = await fetchRentComparables()
      setHistory(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingHistory(false)
    }
  }

  async function handleAddressSearch(e) {
    e?.preventDefault()
    const query = searchInput.trim()
    if (!query) return

    // First: check if the address matches an existing listing
    const matchedAddress = history.find(
      (u) => u.property_address && u.property_address.toLowerCase().includes(query.toLowerCase())
    )?.property_address

    if (matchedAddress) {
      // Found in listings — highlight it on the map, clear any search pin
      setSearchCoords(null)
      setHighlightAddress(matchedAddress)
      return
    }

    // Not found in listings — geocode and place a search pin with radius
    if (!MAPBOX_TOKEN) return
    setSearchLoading(true)
    setHighlightAddress(null)
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
      )
      const data = await res.json()
      const center = data.features?.[0]?.center
      if (center) setSearchCoords({ lng: center[0], lat: center[1] })
    } catch {}
    setSearchLoading(false)
  }

  function clearSearch() {
    setSearchInput('')
    setSearchCoords(null)
    setHighlightAddress(null)
  }

  function pinCurrentAsSubject() {
    if (!searchCoords) return
    setPinStarCoords(searchCoords)
    setSubjectLabel(searchInput.trim() || null)
    setSearchCoords(null)
  }

  function clearSubject() {
    setPinStarCoords(null)
    setSubjectLabel(null)
  }

  function handleEditStart(unit) {
    setEditingId(unit.id)
    setEditingValues({
      property_address: unit.property_address ?? '',
      unit_number: unit.unit_number ?? '',
      unit_type: unit.unit_type ?? '',
      beds: unit.beds ?? '',
      baths: unit.baths ?? '',
      sqft: unit.sqft ?? '',
      lease_rate: unit.lease_rate ?? '',
      move_in: unit.move_in ?? '',
      move_out: unit.move_out ?? '',
      flagged: unit.flagged ?? false,
    })
  }

  function handleEditCancel() {
    setEditingId(null)
    setEditingValues({})
  }

  async function handleEditSave() {
    setSavingEdit(true)
    setError(null)
    try {
      const fields = {
        property_address: editingValues.property_address || null,
        unit_number: editingValues.unit_number || null,
        unit_type: editingValues.unit_type || null,
        beds: editingValues.beds === '' ? null : Number(editingValues.beds),
        baths: editingValues.baths === '' ? null : Number(editingValues.baths),
        sqft: editingValues.sqft === '' ? null : Number(editingValues.sqft),
        lease_rate: editingValues.lease_rate === '' ? null : Number(editingValues.lease_rate),
        move_in: editingValues.move_in || null,
        move_out: editingValues.move_out || null,
        flagged: editingValues.flagged,
      }
      const updated = await updateRentComparable(editingId, fields)
      setHistory((prev) => prev.map((u) => (u.id === editingId ? updated : u)))
      setEditingId(null)
      setEditingValues({})
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  function handleRenameStart(batchId, currentAddress) {
    setRenamingBatchId(batchId)
    setRenameValue(currentAddress || '')
  }

  async function handleRenameSave(batchId) {
    if (!renameValue.trim()) return
    setSavingRename(true)
    setError(null)
    try {
      await renameBatchAddress(batchId, renameValue.trim())
      setHistory((prev) =>
        prev.map((u) => u.batch_id === batchId ? { ...u, property_address: renameValue.trim() } : u)
      )
      setRenamingBatchId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingRename(false)
    }
  }

  function handleBatchUploadClick(batch, firstAddress) {
    uploadTargetBatch.current = { batchId: batch.batch_id, address: firstAddress }
    batchUploadRef.current?.click()
  }

  async function handleBatchFileSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const { batchId } = uploadTargetBatch.current ?? {}
    setUploadingBatchId(batchId)
    setError(null)
    try {
      await bulkExtractAndSave(file)
      await loadHistory()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingBatchId(null)
      uploadTargetBatch.current = null
    }
  }

  async function handleDeleteBatch(id) {
    setDeletingBatch(id)
    try {
      await deleteRentComparablesBatch(id)
      setHistory((prev) => prev.filter((u) => u.batch_id !== id))
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingBatch(null)
    }
  }

  useEffect(() => {
    if (view === 'history' || view === 'map') loadHistory()
  }, [view])

  useEffect(() => {
    localStorage.setItem('fundus_selected_addresses', JSON.stringify([...selectedAddresses]))
  }, [selectedAddresses])

  // ── Derived data ─────────────────────────────────────────────────────────

  const filteredHistory = history.filter((u) => {
    if (addressSearch && !u.property_address?.toLowerCase().includes(addressSearch.toLowerCase())) return false
    if (bedsFilter === '3+' && (u.beds == null || Number(u.beds) < 3)) return false
    if (bedsFilter && bedsFilter !== '3+' && String(Math.floor(u.beds)) !== bedsFilter) return false
    if (sqftMin !== '' && (u.sqft == null || Number(u.sqft) < Number(sqftMin))) return false
    if (sqftMax !== '' && (u.sqft == null || Number(u.sqft) > Number(sqftMax))) return false
    if (moveInFrom && (u.move_in == null || u.move_in < moveInFrom)) return false
    if (moveInTo && (u.move_in == null || u.move_in > moveInTo)) return false
    if (leaseRateMin !== '' && (u.lease_rate == null || Number(u.lease_rate) < Number(leaseRateMin))) return false
    if (leaseRateMax !== '' && (u.lease_rate == null || Number(u.lease_rate) > Number(leaseRateMax))) return false
    if (bathsFilter !== '' && String(Math.floor(u.baths)) !== bathsFilter) return false
    if (flaggedOnly && !u.flagged) return false
    return true
  })

  const batches = groupByBatch(filteredHistory)
  const totalUnits = filteredHistory.length
  const occupiedUnits = filteredHistory.filter((u) => u.lease_rate != null).length
  const ratedUnits = filteredHistory.filter((u) => u.lease_rate != null)
  const avgRent = ratedUnits.length > 0
    ? ratedUnits.reduce((sum, u) => sum + Number(u.lease_rate), 0) / ratedUnits.length
    : null
  const totalUploads = new Set(history.map((u) => u.batch_id)).size
  const flaggedCount = reviewUnits.filter((u) => u.flagged).length

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={`bg-background flex flex-col ${view === 'map' || view === 'comptable' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <PageHeader onBack={view === 'comptable' ? () => setView('map') : onBack} />

      {/* Hidden file input for per-batch upload */}
      <input
        ref={batchUploadRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleBatchFileSelected}
      />

      {/* Error banner */}
      {error && (
        <div className="px-8 pt-4 flex-shrink-0">
          <div className="max-w-6xl mx-auto p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm flex items-start justify-between gap-4">
            <span><strong>Error:</strong> {error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0 text-xs underline">Dismiss</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MAP VIEW
      ══════════════════════════════════════════════════════ */}
      {view === 'map' && (
        <div className="contents page-in">
          <div className="px-6 py-3 flex items-center gap-3 border-b border-border bg-white flex-shrink-0">
            <form onSubmit={handleAddressSearch} className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#aaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search address — matches listings or pins location on map..."
                className="w-full pl-10 pr-10 py-2.5 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:border-primary"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchInput && (
                  <button type="button" onClick={clearSearch} className="w-6 h-6 flex items-center justify-center text-[#aaa] hover:text-[#555]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </form>

            {/* Set as Subject Property button */}
            <button
              type="button"
              onClick={pinCurrentAsSubject}
              disabled={!searchCoords}
              title={searchCoords ? 'Set as Subject Property' : 'Search an address first, then set it as the Subject Property'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors flex-shrink-0 ${
                searchCoords
                  ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 cursor-pointer'
                  : 'bg-surface border-border text-[#bbb] cursor-not-allowed'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Set as Subject
            </button>
            {/* Subject property chip — shown when star is pinned */}
            {pinStarCoords && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex-shrink-0">
                <svg className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                {subjectLabel && (
                  <span className="text-xs text-amber-800 font-medium max-w-[160px] truncate" title={subjectLabel}>{subjectLabel}</span>
                )}
                <button onClick={clearSubject} className="text-amber-400 hover:text-amber-700 transition-colors flex-shrink-0" title="Clear subject property">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <Button variant="primary" size="sm" onClick={() => setView('upload')}>
              + Add Property
            </Button>
          </div>
          <div className="flex-1 min-h-0 px-6 pb-4 pt-4">
            {loadingHistory ? (
              <div className="h-full rounded-xl bg-gray-100 animate-pulse" />
            ) : (
              <Suspense fallback={<div className="h-full rounded-xl bg-gray-100 animate-pulse" />}>
                <ComparablesMap
                  units={history}
                  searchCoords={searchCoords}
                  pinStarCoords={pinStarCoords}
                  onPinStarChange={(coords) => { setPinStarCoords(coords); setSubjectLabel(null) }}
                  highlightAddress={highlightAddress}
                  selectedAddresses={selectedAddresses}
                  onToggleSelect={(address) => {
                    setSelectedAddresses((prev) => {
                      const next = new Set(prev)
                      if (next.has(address)) next.delete(address)
                      else next.add(address)
                      return next
                    })
                  }}
                  onClearSelected={() => setSelectedAddresses(new Set())}
                  onOpenCompTable={() => setView('comptable')}
                  onSelectProperty={(address) => { setSelectedProperty(address); setView('property') }}
                />
              </Suspense>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          COMP TABLE VIEW
      ══════════════════════════════════════════════════════ */}
      {view === 'comptable' && (
        <div className="flex-1 min-h-0 page-in">
          <Suspense fallback={
            <div className="p-6 space-y-3">
              <div className="h-8 bg-gray-100 rounded-lg animate-pulse w-1/3" />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          }>
            <CompTable
              selectedAddresses={selectedAddresses}
              units={history}
              onBack={() => setView('map')}
              onSelectProperty={(address) => { setSelectedProperty(address); setView('property') }}
              pinStarCoords={pinStarCoords}
            />
          </Suspense>
        </div>
      )}

      {view !== 'map' && view !== 'comptable' && (
      <main className="flex-1 px-8 py-10 page-in">

        {/* ══════════════════════════════════════════════════════
            UPLOAD VIEW
        ══════════════════════════════════════════════════════ */}
        {view === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <div className="mb-8 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-primary tracking-tight">Upload Rent Rolls</h2>
                <p className="text-[#777777] mt-2 text-sm">Upload rent roll PDFs to extract and store rental data.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setView('map')}>
                View Database
              </Button>
            </div>

            {/* ── Bulk import in progress ── */}
            {bulkRunning && bulkProgress && (
              <Card className="p-8 space-y-6">
                <div className="text-center">
                  <p className="text-primary font-semibold text-lg">Bulk Import Running</p>
                  <p className="text-[#777777] text-sm mt-1">
                    Processing file {bulkProgress.current} of {bulkProgress.total}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>

                {/* Current file */}
                <div className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <p className="text-sm text-primary truncate">{bulkProgress.currentFile}</p>
                </div>

                {/* Completed files */}
                {bulkProgress.results.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {bulkProgress.results.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {r.skipped
                          ? <span className="text-[#aaaaaa] font-bold flex-shrink-0">–</span>
                          : r.success
                            ? <span className="text-green-500 font-bold flex-shrink-0">✓</span>
                            : <span className="text-error font-bold flex-shrink-0">✗</span>}
                        <span className="text-[#555555] truncate flex-1">{r.file}</span>
                        {r.skipped
                          ? <span className="text-[#aaaaaa] flex-shrink-0">already imported</span>
                          : r.success
                            ? <span className="text-[#777777] flex-shrink-0">{r.saved} units</span>
                            : <span className="text-error flex-shrink-0 truncate max-w-[160px]">{r.error}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* ── Bulk import done — summary ── */}
            {!bulkRunning && bulkProgress && (
              <Card className="p-8 space-y-6">
                <div className="text-center">
                  <p className="text-primary font-semibold text-lg">Import Complete</p>
                  {(() => {
                    const skipped = bulkProgress.results.filter((r) => r.skipped)
                    const succeeded = bulkProgress.results.filter((r) => r.success && !r.skipped)
                    const failed = bulkProgress.results.filter((r) => !r.success)
                    const totalSaved = succeeded.reduce((sum, r) => sum + r.saved, 0)
                    return (
                      <p className="text-[#777777] text-sm mt-1">
                        {succeeded.length} imported — {totalSaved} units saved
                        {skipped.length > 0 && <span className="text-[#aaaaaa]"> · {skipped.length} skipped (already imported)</span>}
                        {failed.length > 0 && <span className="text-error"> · {failed.length} failed</span>}
                      </p>
                    )
                  })()}
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {bulkProgress.results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {r.skipped
                        ? <span className="text-[#aaaaaa] font-bold flex-shrink-0">–</span>
                        : r.success
                          ? <span className="text-green-500 font-bold flex-shrink-0">✓</span>
                          : <span className="text-error font-bold flex-shrink-0">✗</span>}
                      <span className="text-[#555555] truncate flex-1">{r.file}</span>
                      {r.skipped
                        ? <span className="text-[#aaaaaa] flex-shrink-0">already imported</span>
                        : r.success
                          ? <span className="text-[#777777] flex-shrink-0">{r.saved} units</span>
                        : <span className="text-error flex-shrink-0 truncate max-w-[160px]">{r.error}</span>}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button variant="primary" onClick={handleBulkDone}>
                    View Database
                  </Button>
                </div>
              </Card>
            )}

            {/* ── File picker + actions ── */}
            {!bulkRunning && !bulkProgress && (
              <>
                {extracting ? (
                  <Card className="p-20 flex flex-col items-center gap-6">
                    <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <div className="text-center">
                      <p className="text-primary font-semibold">Extracting rent roll data...</p>
                      <p className="text-[#777777] text-sm mt-1">Claude is reading your documents. This may take a minute.</p>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-6 space-y-4">
                    <div
                      {...getRootProps()}
                      className={`border-2 border-dashed rounded-xl p-10 text-center transition-all ${
                        isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <input {...getInputProps()} />
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-primary font-medium">
                            {isDragActive ? 'Drop rent rolls here' : 'Drag & drop rent rolls here'}
                          </p>
                          <p className="text-[#777777] text-sm mt-1">PDF files only</p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={open}>Select Files</Button>
                      </div>
                    </div>

                    {files.length > 0 && (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {files.map((file, idx) => (
                          <div key={`${file.name}-${idx}`} className="flex items-center gap-3 p-3 bg-background border border-border rounded-lg">
                            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-primary truncate">{file.name}</p>
                              <p className="text-xs text-[#777777]">{(file.size / 1024).toFixed(0)} KB</p>
                            </div>
                            <button onClick={() => removeFile(idx)} className="text-[#777777] hover:text-error transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 flex items-center justify-between gap-4 border-t border-border">
                      <p className="text-xs text-[#777777]">
                        {files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''} selected` : 'No files selected'}
                      </p>
                      <div className="flex gap-3">
                        <Button
                          variant="secondary"
                          size="md"
                          disabled={files.length === 0 || files.length > 20}
                          onClick={handleExtract}
                          title={files.length > 20 ? 'Review mode supports up to 20 files' : ''}
                        >
                          Extract & Review
                        </Button>
                        <Button variant="primary" size="md" disabled={files.length === 0} onClick={handleBulkImport}>
                          Bulk Import
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            REVIEW VIEW
        ══════════════════════════════════════════════════════ */}
        {view === 'review' && (
          <div className="max-w-7xl mx-auto">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-primary tracking-tight">Review Extracted Data</h2>
                <p className="text-[#777777] mt-1 text-sm">
                  {reviewUnits.length} units extracted — edit any values, then save.
                  {flaggedCount > 0 && (
                    <span className="ml-2 text-amber-600 font-medium">
                      ⚠ {flaggedCount} unit{flaggedCount > 1 ? 's' : ''} need review
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={handleDiscard} disabled={saving}>Discard</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save to Database'}
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface border-b border-border">
                      {TABLE_COLS.map((col) => (
                        <th key={col} className="text-left px-3 py-3 text-xs font-semibold text-[#777777] uppercase tracking-wider whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-xs font-semibold text-[#777777] uppercase tracking-wider text-center">⚠</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewUnits.map((unit, idx) => (
                      <tr
                        key={idx}
                        className={`border-b border-border last:border-0 ${unit.flagged ? 'bg-amber-50' : 'bg-white'}`}
                      >
                        <td className="px-2 py-2">
                          <input
                            className="w-52 text-xs px-2 py-1.5 border border-border rounded bg-background focus:outline-none focus:border-primary"
                            value={unit.property_address ?? ''}
                            onChange={(e) => updateUnit(idx, 'property_address', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="w-16 text-xs px-2 py-1.5 border border-border rounded bg-background focus:outline-none focus:border-primary"
                            value={unit.unit_number ?? ''}
                            onChange={(e) => updateUnit(idx, 'unit_number', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="w-28 text-xs px-2 py-1.5 border border-border rounded bg-background focus:outline-none focus:border-primary"
                            value={unit.unit_type ?? ''}
                            onChange={(e) => updateUnit(idx, 'unit_type', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className="w-14 text-xs px-2 py-1.5 border border-border rounded bg-background focus:outline-none focus:border-primary"
                            value={unit.beds ?? ''}
                            onChange={(e) => updateUnit(idx, 'beds', e.target.value === '' ? null : Number(e.target.value))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className="w-14 text-xs px-2 py-1.5 border border-border rounded bg-background focus:outline-none focus:border-primary"
                            value={unit.baths ?? ''}
                            onChange={(e) => updateUnit(idx, 'baths', e.target.value === '' ? null : Number(e.target.value))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className="w-16 text-xs px-2 py-1.5 border border-border rounded bg-background focus:outline-none focus:border-primary"
                            value={unit.sqft ?? ''}
                            onChange={(e) => updateUnit(idx, 'sqft', e.target.value === '' ? null : Number(e.target.value))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className="w-20 text-xs px-2 py-1.5 border border-border rounded bg-background focus:outline-none focus:border-primary"
                            value={unit.lease_rate ?? ''}
                            onChange={(e) => updateUnit(idx, 'lease_rate', e.target.value === '' ? null : Number(e.target.value))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            className="w-32 text-xs px-2 py-1.5 border border-border rounded bg-background focus:outline-none focus:border-primary"
                            value={unit.move_in ?? ''}
                            onChange={(e) => updateUnit(idx, 'move_in', e.target.value || null)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            className="w-32 text-xs px-2 py-1.5 border border-border rounded bg-background focus:outline-none focus:border-primary"
                            value={unit.move_out ?? ''}
                            onChange={(e) => updateUnit(idx, 'move_out', e.target.value || null)}
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => updateUnit(idx, 'flagged', !unit.flagged)}
                            title={unit.flagged ? 'Flagged — click to clear' : 'Click to flag'}
                            className={`text-base leading-none transition-colors ${unit.flagged ? 'text-amber-500' : 'text-gray-200 hover:text-amber-300'}`}
                          >
                            ⚠
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {flaggedCount > 0 && (
              <p className="mt-3 text-xs text-amber-600">
                Amber rows had low-confidence extraction — verify these values before saving.
              </p>
            )}

            <div className="mt-4 flex justify-end gap-3">
              <Button variant="secondary" onClick={handleDiscard} disabled={saving}>Discard</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save to Database'}
              </Button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            HISTORY VIEW
        ══════════════════════════════════════════════════════ */}
        {view === 'history' && (
          <div className="max-w-7xl mx-auto">
            {/* Page title */}
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-primary tracking-tight">Rent Comparables Database</h2>
                <p className="text-[#777777] mt-1 text-sm">All uploaded rent roll data across properties.</p>
              </div>
              <div className="flex items-center gap-3">
                {/* List / Map toggle */}
                <div className="flex rounded border border-border overflow-hidden text-xs">
                  {[['list', 'List'], ['map', 'Map']].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setHistoryView(val)}
                      className={`px-3 py-1.5 transition-colors ${historyView === val ? 'bg-primary text-white' : 'bg-white text-[#555555] hover:bg-surface'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Button variant="primary" size="sm" onClick={() => setView('upload')}>
                  + Upload New
                </Button>
              </div>
            </div>

            {/* Stats bar */}
            {history.length > 0 && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Total Units', value: totalUnits },
                  { label: 'Avg Rent / mo', value: avgRent != null ? fmtCurrency(avgRent) : '—' },
                  { label: 'Occupied', value: totalUnits > 0 ? `${Math.round((occupiedUnits / totalUnits) * 100)}%` : '—' },
                  { label: 'Uploads', value: totalUploads },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border border-border rounded-sm px-5 py-4">
                    <p className="text-xs text-[#777777] uppercase tracking-wider font-medium">{label}</p>
                    <p className="text-2xl font-bold text-primary mt-1">{value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Filter bar */}
            {(() => {
              const activeFilters = [addressSearch, bedsFilter, sqftMin, sqftMax, moveInFrom, moveInTo, leaseRateMin, leaseRateMax, bathsFilter].some(Boolean) || flaggedOnly
              return (
                <div className="mb-6 space-y-2">
                  <div className="flex flex-wrap gap-2 items-end">
                    {/* Address search */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Address</label>
                      <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#777777]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          className="w-56 pl-9 pr-4 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary"
                          placeholder="Search address..."
                          value={addressSearch}
                          onChange={(e) => setAddressSearch(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Beds */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Beds</label>
                      <select
                        className="text-sm border border-border rounded-sm px-3 py-2 bg-white focus:outline-none focus:border-primary text-[#555555]"
                        value={bedsFilter}
                        onChange={(e) => setBedsFilter(e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="0">Studio</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="3+">3+</option>
                      </select>
                    </div>

                    {/* Baths */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Baths</label>
                      <select
                        className="text-sm border border-border rounded-sm px-3 py-2 bg-white focus:outline-none focus:border-primary text-[#555555]"
                        value={bathsFilter}
                        onChange={(e) => setBathsFilter(e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                      </select>
                    </div>

                    {/* Unit size range */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Unit Size (sqft)</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          className="w-24 px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary"
                          placeholder="Min"
                          value={sqftMin}
                          onChange={(e) => setSqftMin(e.target.value)}
                        />
                        <span className="text-[#aaaaaa] text-sm">–</span>
                        <input
                          type="number"
                          className="w-24 px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary"
                          placeholder="Max"
                          value={sqftMax}
                          onChange={(e) => setSqftMax(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Lease rate range */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Lease Rate ($/mo)</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          className="w-24 px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary"
                          placeholder="Min"
                          value={leaseRateMin}
                          onChange={(e) => setLeaseRateMin(e.target.value)}
                        />
                        <span className="text-[#aaaaaa] text-sm">–</span>
                        <input
                          type="number"
                          className="w-24 px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary"
                          placeholder="Max"
                          value={leaseRateMax}
                          onChange={(e) => setLeaseRateMax(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Move-in date range */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Move-In Date</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          className="px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary text-[#555555]"
                          value={moveInFrom}
                          onChange={(e) => setMoveInFrom(e.target.value)}
                        />
                        <span className="text-[#aaaaaa] text-sm">–</span>
                        <input
                          type="date"
                          className="px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary text-[#555555]"
                          value={moveInTo}
                          onChange={(e) => setMoveInTo(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Flagged only */}
                    <div className="flex flex-col gap-1 self-end mb-0.5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <div
                          onClick={() => setFlaggedOnly((v) => !v)}
                          className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 relative ${flaggedOnly ? 'bg-amber-400' : 'bg-border'}`}
                        >
                          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${flaggedOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                        <span className="text-sm text-[#555555]">Flagged only</span>
                      </label>
                    </div>

                    {/* Clear all */}
                    {activeFilters && (
                      <button
                        className="py-2 px-3 text-xs text-[#777777] hover:text-primary underline transition-colors self-end mb-0.5"
                        onClick={() => { setAddressSearch(''); setBedsFilter(''); setBathsFilter(''); setSqftMin(''); setSqftMax(''); setMoveInFrom(''); setMoveInTo(''); setLeaseRateMin(''); setLeaseRateMax(''); setFlaggedOnly(false) }}
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  {activeFilters && (
                    <p className="text-xs text-[#777777]">
                      Showing {filteredHistory.length} of {history.length} unit{history.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Map view */}
            {historyView === 'map' && !loadingHistory && (
              <Suspense fallback={<div className="flex items-center justify-center h-64 gap-3"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-[#777777] text-sm">Loading map...</span></div>}>
                <ComparablesMap
                  units={filteredHistory}
                  onSelectProperty={(address) => { setSelectedProperty(address); setView('property') }}
                />
              </Suspense>
            )}

            {/* Content */}
            {historyView === 'list' && (loadingHistory ? (
              <div className="flex items-center justify-center py-24 gap-3">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-[#777777] text-sm">Loading database...</span>
              </div>
            ) : batches.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-[#777777] text-sm">
                  {history.length === 0 ? 'No rent rolls uploaded yet.' : 'No results match your filters.'}
                </p>
                {history.length === 0 && (
                  <Button variant="primary" size="sm" className="mt-4" onClick={() => setView('upload')}>
                    Upload Your First Rent Roll
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {batches.map((batch) => {
                  const isExpanded = expandedBatches.has(batch.batch_id)
                  const addresses = [...new Set(batch.units.map((u) => u.property_address).filter(Boolean))]
                  const addressLabel = addresses.length === 0
                    ? batch.source_file
                    : addresses.length === 1
                      ? addresses[0]
                      : `${addresses[0]} +${addresses.length - 1} more`

                  return (
                  <Card key={batch.batch_id} className="overflow-hidden">
                    {/* Batch header */}
                    <div
                      className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border cursor-pointer select-none hover:bg-border/30 transition-colors"
                      onClick={() => {
                        if (renamingBatchId === batch.batch_id) return
                        setExpandedBatches((prev) => {
                          const next = new Set(prev)
                          next.has(batch.batch_id) ? next.delete(batch.batch_id) : next.add(batch.batch_id)
                          return next
                        })
                      }}
                    >
                      <div className="flex items-center gap-2 text-xs text-[#777777] min-w-0">
                        <svg
                          className={`w-3.5 h-3.5 flex-shrink-0 text-[#777777] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>

                        {/* Address — inline rename or label */}
                        {renamingBatchId === batch.batch_id ? (
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              className="text-sm font-medium px-2 py-0.5 border border-primary rounded bg-white focus:outline-none w-64"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSave(batch.batch_id)
                                if (e.key === 'Escape') setRenamingBatchId(null)
                              }}
                            />
                            <button
                              onClick={() => handleRenameSave(batch.batch_id)}
                              disabled={savingRename}
                              className="text-xs px-2 py-0.5 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                            >
                              {savingRename ? '…' : 'Save'}
                            </button>
                            <button
                              onClick={() => setRenamingBatchId(null)}
                              className="text-xs text-[#777777] hover:text-primary"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium text-primary text-sm truncate">{addressLabel}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRenameStart(batch.batch_id, addresses[0] || '') }}
                              className="text-[#aaaaaa] hover:text-primary transition-colors flex-shrink-0"
                              title="Rename property"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </div>
                        )}

                        <span className="flex-shrink-0">·</span>
                        <span className="flex-shrink-0">{batch.units.length} unit{batch.units.length !== 1 ? 's' : ''}</span>
                        <span className="flex-shrink-0">·</span>
                        <span className="flex-shrink-0 text-[#999]" title={batch.source_file}>
                          {batch.uploaded_at
                            ? new Date(batch.uploaded_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
                            : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                        {/* Upload updated rent roll */}
                        <button
                          onClick={() => handleBatchUploadClick(batch, addresses[0])}
                          disabled={uploadingBatchId === batch.batch_id}
                          className="flex items-center gap-1 text-xs text-[#777777] hover:text-primary transition-colors disabled:opacity-40"
                          title="Upload updated rent roll"
                        >
                          {uploadingBatchId === batch.batch_id
                            ? <div className="w-3.5 h-3.5 border border-primary border-t-transparent rounded-full animate-spin" />
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>}
                          {uploadingBatchId === batch.batch_id ? 'Uploading...' : 'Upload'}
                        </button>

                        {/* Delete batch */}
                        <button
                          onClick={() => handleDeleteBatch(batch.batch_id)}
                          disabled={deletingBatch === batch.batch_id}
                          className="flex items-center gap-1.5 text-xs text-[#777777] hover:text-error transition-colors disabled:opacity-40"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          {deletingBatch === batch.batch_id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {/* Units table — collapsible */}
                    {isExpanded && <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            {TABLE_COLS.map((col) => (
                              <th key={col} className="text-left px-4 py-2.5 text-xs font-semibold text-[#777777] uppercase tracking-wider whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                            <th className="px-3 py-2.5 text-xs font-semibold text-[#777777] uppercase tracking-wider" />
                          </tr>
                        </thead>
                        <tbody>
                          {batch.units.map((unit) => {
                            const isEditing = editingId === unit.id
                            const ev = editingValues
                            return (
                              <tr
                                key={unit.id}
                                className={`border-b border-border last:border-0 ${isEditing ? 'bg-blue-50' : unit.flagged ? 'bg-amber-50' : ''}`}
                              >
                                <td className="px-2 py-2">
                                  {isEditing
                                    ? <input className="w-48 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.property_address} onChange={(e) => setEditingValues((v) => ({ ...v, property_address: e.target.value }))} />
                                    : <span className="px-2 text-xs text-[#555555] block max-w-[220px] truncate" title={unit.property_address}>{unit.property_address ?? '—'}</span>}
                                </td>
                                <td className="px-2 py-2">
                                  {isEditing
                                    ? <input className="w-14 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.unit_number} onChange={(e) => setEditingValues((v) => ({ ...v, unit_number: e.target.value }))} />
                                    : <span className="px-2 text-xs font-medium text-primary whitespace-nowrap">{unit.unit_number ?? '—'}</span>}
                                </td>
                                <td className="px-2 py-2">
                                  {isEditing
                                    ? <input className="w-24 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.unit_type} onChange={(e) => setEditingValues((v) => ({ ...v, unit_type: e.target.value }))} />
                                    : <span className="px-2 text-xs text-[#555555] whitespace-nowrap">{unit.unit_type ?? '—'}</span>}
                                </td>
                                <td className="px-2 py-2">
                                  {isEditing
                                    ? <input type="number" className="w-12 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.beds} onChange={(e) => setEditingValues((v) => ({ ...v, beds: e.target.value }))} />
                                    : <span className="px-2 text-xs text-[#555555]">{unit.beds ?? '—'}</span>}
                                </td>
                                <td className="px-2 py-2">
                                  {isEditing
                                    ? <input type="number" className="w-12 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.baths} onChange={(e) => setEditingValues((v) => ({ ...v, baths: e.target.value }))} />
                                    : <span className="px-2 text-xs text-[#555555]">{unit.baths ?? '—'}</span>}
                                </td>
                                <td className="px-2 py-2">
                                  {isEditing
                                    ? <input type="number" className="w-16 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.sqft} onChange={(e) => setEditingValues((v) => ({ ...v, sqft: e.target.value }))} />
                                    : <span className="px-2 text-xs text-[#555555]">{unit.sqft ?? '—'}</span>}
                                </td>
                                <td className="px-2 py-2">
                                  {isEditing
                                    ? <input type="number" className="w-20 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.lease_rate} onChange={(e) => setEditingValues((v) => ({ ...v, lease_rate: e.target.value }))} />
                                    : <span className="px-2 text-xs font-semibold text-primary whitespace-nowrap">{fmtCurrency(unit.lease_rate)}</span>}
                                </td>
                                <td className="px-2 py-2">
                                  {isEditing
                                    ? <input type="date" className="w-32 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.move_in} onChange={(e) => setEditingValues((v) => ({ ...v, move_in: e.target.value }))} />
                                    : <span className="px-2 text-xs text-[#555555] whitespace-nowrap">{fmtDate(unit.move_in) ?? '—'}</span>}
                                </td>
                                <td className="px-2 py-2">
                                  {isEditing
                                    ? <input type="date" className="w-32 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.move_out} onChange={(e) => setEditingValues((v) => ({ ...v, move_out: e.target.value }))} />
                                    : <span className="px-2 whitespace-nowrap"><LeaseEndCell move_out={unit.move_out} /></span>}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {isEditing ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={handleEditSave}
                                        disabled={savingEdit}
                                        className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                      >
                                        {savingEdit ? '…' : 'Save'}
                                      </button>
                                      <button
                                        onClick={handleEditCancel}
                                        disabled={savingEdit}
                                        className="text-xs px-2.5 py-1 rounded border border-border text-[#555555] hover:bg-surface transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => handleEditStart(unit)}
                                      className="text-xs text-[#777777] hover:text-primary transition-colors px-1"
                                      title="Edit row"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>}
                  </Card>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            PROPERTY DETAIL VIEW
        ══════════════════════════════════════════════════════ */}
        {view === 'property' && selectedProperty && (() => {
          const propertyUnits = history.filter((u) => u.property_address === selectedProperty)
          const occupied = propertyUnits.filter((u) => u.lease_rate != null)
          const avgRent = occupied.length > 0
            ? occupied.reduce((s, u) => s + Number(u.lease_rate), 0) / occupied.length
            : null
          const bedGroups = [...new Set(propertyUnits.map((u) => u.beds).filter((b) => b != null))].sort((a, b) => a - b)

          return (
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="mb-6 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setView('map'); setSelectedProperty(null) }}
                    className="flex items-center gap-1.5 text-[#777777] hover:text-primary transition-colors text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Map
                  </button>
                  <div className="h-4 w-px bg-border" />
                  <div>
                    <h2 className="text-2xl font-bold text-primary tracking-tight">{selectedProperty}</h2>
                    <p className="text-[#777777] mt-0.5 text-sm">{propertyUnits.length} unit{propertyUnits.length !== 1 ? 's' : ''} across all uploads</p>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Total Units', value: propertyUnits.length },
                  { label: 'Occupied', value: occupied.length },
                  { label: 'Vacancy Rate', value: propertyUnits.length > 0 ? `${Math.round(((propertyUnits.length - occupied.length) / propertyUnits.length) * 100)}%` : '—' },
                  { label: 'Avg Rent / mo', value: avgRent != null ? fmtCurrency(avgRent) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border border-border rounded-sm px-5 py-4">
                    <p className="text-xs text-[#777777] uppercase tracking-wider font-medium">{label}</p>
                    <p className="text-2xl font-bold text-primary mt-1">{value}</p>
                  </div>
                ))}
              </div>

              {/* Bed breakdown */}
              {bedGroups.length > 0 && (
                <div className="flex gap-3 mb-6 flex-wrap">
                  {bedGroups.map((beds) => {
                    const groupUnits = propertyUnits.filter((u) => Number(u.beds) === Number(beds))
                    const groupOccupied = groupUnits.filter((u) => u.lease_rate != null)
                    const groupAvg = groupOccupied.length > 0
                      ? groupOccupied.reduce((s, u) => s + Number(u.lease_rate), 0) / groupOccupied.length
                      : null
                    return (
                      <div key={beds} className="bg-white border border-border rounded-sm px-4 py-3 flex items-center gap-4">
                        <p className="text-sm font-semibold text-primary">{beds === 0 ? 'Studio' : `${beds} Bed`}</p>
                        <div className="h-4 w-px bg-border" />
                        <p className="text-xs text-[#777777]">{groupUnits.length} units</p>
                        {groupAvg != null && (
                          <>
                            <div className="h-4 w-px bg-border" />
                            <p className="text-xs text-[#777777]">avg {fmtCurrency(groupAvg)}/mo</p>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Map + Street View */}
              <div className="mb-6">
                <Suspense fallback={<div className="h-[260px] rounded-xl bg-surface border border-border flex items-center justify-center text-xs text-[#999]">Loading map…</div>}>
                  <PropertyMap address={selectedProperty} />
                </Suspense>
              </div>

              {/* Units table */}
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        {['Unit', 'Type', 'Beds', 'Baths', 'Sqft', 'Rent/mo', 'Move In', 'Move Out', 'Source File', ''].map((col) => (
                          <th key={col} className="text-left px-4 py-2.5 text-xs font-semibold text-[#777777] uppercase tracking-wider whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {propertyUnits.map((unit) => {
                        const isEditing = editingId === unit.id
                        const ev = editingValues
                        return (
                          <tr key={unit.id} className={`border-b border-border last:border-0 ${isEditing ? 'bg-blue-50' : unit.flagged ? 'bg-amber-50' : ''}`}>
                            <td className="px-2 py-2">{isEditing ? <input className="w-14 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.unit_number} onChange={(e) => setEditingValues((v) => ({ ...v, unit_number: e.target.value }))} /> : <span className="px-2 text-xs font-medium text-primary">{unit.unit_number ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input className="w-24 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.unit_type} onChange={(e) => setEditingValues((v) => ({ ...v, unit_type: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555]">{unit.unit_type ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input type="number" className="w-12 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.beds} onChange={(e) => setEditingValues((v) => ({ ...v, beds: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555]">{unit.beds ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input type="number" className="w-12 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.baths} onChange={(e) => setEditingValues((v) => ({ ...v, baths: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555]">{unit.baths ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input type="number" className="w-16 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.sqft} onChange={(e) => setEditingValues((v) => ({ ...v, sqft: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555]">{unit.sqft ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input type="number" className="w-20 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.lease_rate} onChange={(e) => setEditingValues((v) => ({ ...v, lease_rate: e.target.value }))} /> : <span className="px-2 text-xs font-semibold text-primary whitespace-nowrap">{fmtCurrency(unit.lease_rate)}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input type="date" className="w-32 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.move_in} onChange={(e) => setEditingValues((v) => ({ ...v, move_in: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555] whitespace-nowrap">{unit.move_in ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input type="date" className="w-32 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.move_out} onChange={(e) => setEditingValues((v) => ({ ...v, move_out: e.target.value }))} /> : <span className="px-2 whitespace-nowrap"><LeaseEndCell move_out={unit.move_out} /></span>}</td>
                            <td className="px-4 py-2 text-xs text-[#999] whitespace-nowrap max-w-[160px] truncate" title={unit.source_file}>{unit.source_file ?? '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <button onClick={handleEditSave} disabled={savingEdit} className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">{savingEdit ? '…' : 'Save'}</button>
                                  <button onClick={handleEditCancel} disabled={savingEdit} className="text-xs px-2.5 py-1 rounded border border-border text-[#555555] hover:bg-surface">Cancel</button>
                                </div>
                              ) : (
                                <button onClick={() => handleEditStart(unit)} className="text-xs text-[#777777] hover:text-primary transition-colors px-1" title="Edit row">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )
        })()}
      </main>
      )}
    </div>
  )
}
