import { useState, useEffect, useMemo } from 'react'
import { fetchTripleCProjects, deleteTripleCProject } from '../services/api.js'

function fmt(n) {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('en-CA', { maximumFractionDigits: 0 })
}

function fmtSqft(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-CA') + ' sf'
}

function perSqft(total, gfa) {
  if (!total || !gfa) return '—'
  return '$' + (total / gfa).toFixed(0) + '/sf'
}

function perUnit(total, units) {
  if (!total || !units) return '—'
  return '$' + Math.round(total / units).toLocaleString('en-CA') + '/unit'
}

const TYPE_LABELS = {
  condo: 'Condo',
  rental: 'Rental',
  'mixed-use': 'Mixed-Use',
  commercial: 'Commercial',
  industrial: 'Industrial',
  other: 'Other',
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return (
    <svg className="w-3 h-3 text-[#cccccc] ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  )
  return sortDir === 'asc' ? (
    <svg className="w-3 h-3 text-primary ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-3 h-3 text-primary ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

export default function TripleCDatabasePage({ onBack, onAddProject, onSelectProject, onViewAnalytics, onCompare }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortCol, setSortCol] = useState('report_date')
  const [sortDir, setSortDir] = useState('desc')
  const [deletingId, setDeletingId] = useState(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareIds, setCompareIds] = useState([])

  function toggleCompareId(id) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }

  useEffect(() => {
    fetchTripleCProjects()
      .then(setProjects)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function toggleSort(col) {
    if (sortCol === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  async function handleDelete(e, p) {
    e.stopPropagation()
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return
    setDeletingId(p.id)
    try {
      await deleteTripleCProject(p.id)
      setProjects((prev) => prev.filter((x) => x.id !== p.id))
    } catch (err) {
      alert(`Delete failed: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = useMemo(() => {
    let list = projects
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((p) =>
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.city ?? '').toLowerCase().includes(q) ||
        (p.address ?? '').toLowerCase().includes(q)
      )
    }
    if (typeFilter) {
      list = list.filter((p) => p.project_type === typeFilter)
    }
    list = [...list].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') av = av.toLowerCase(), bv = (bv ?? '').toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [projects, search, typeFilter, sortCol, sortDir])

  const Th = ({ col, children, className = '' }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`text-[#777777] font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary select-none ${className}`}
    >
      {children}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  )

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-[#777777] hover:text-primary transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-primary text-lg font-bold tracking-tight">Triple-C</h1>
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">Construction Cost Database</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <span className="text-[#555555] text-xs tracking-widest uppercase font-medium">KingSett Capital</span>
          </div>
          <div className="flex items-center gap-4">
            <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-14 w-auto" />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-8 py-10">
        {/* Page title + controls */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-primary tracking-tight">Projects</h2>
            <p className="text-[#777777] text-sm mt-1">
              {loading ? 'Loading…' : `${filtered.length} of ${projects.length} project${projects.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {compareMode ? (
              <>
                <span className="text-xs text-[#777777]">{compareIds.length} selected</span>
                <button
                  onClick={() => { setCompareMode(false); setCompareIds([]) }}
                  className="px-4 py-2.5 border border-border text-[#555555] text-sm font-semibold rounded-sm hover:border-primary hover:text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onCompare(compareIds)}
                  disabled={compareIds.length < 2}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Compare {compareIds.length > 0 ? `(${compareIds.length})` : ''}
                </button>
              </>
            ) : (
              <>
                {onCompare && projects.length >= 2 && (
                  <button
                    onClick={() => setCompareMode(true)}
                    className="flex items-center gap-2 px-4 py-2.5 border border-border text-[#555555] text-sm font-semibold rounded-sm hover:border-primary hover:text-primary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Compare
                  </button>
                )}
                {onViewAnalytics && (
                  <button
                    onClick={onViewAnalytics}
                    className="flex items-center gap-2 px-4 py-2.5 border border-border text-[#555555] text-sm font-semibold rounded-sm hover:border-primary hover:text-primary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Benchmarks
                  </button>
                )}
                <button
                  onClick={onAddProject}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-sm hover:bg-primary/90 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Project
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search + filter bar */}
        {!loading && projects.length > 0 && (
          <div className="flex items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#aaaaaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or city…"
                className="w-full pl-9 pr-4 py-2 bg-white border border-border rounded-sm text-primary text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-border rounded-sm text-sm text-[#555555] focus:outline-none focus:border-primary transition-colors"
            >
              <option value="">All types</option>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {(search || typeFilter) && (
              <button onClick={() => { setSearch(''); setTypeFilter('') }}
                className="text-xs text-[#777777] hover:text-primary transition-colors">
                Clear
              </button>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-white border border-red-200 rounded-sm text-red-600 text-sm">
            Failed to load projects: {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-white border border-border rounded-sm animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 bg-white border border-border rounded-sm">
            <div className="w-12 h-12 rounded-sm bg-surface flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-[#aaaaaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-primary font-semibold text-sm">No projects yet</p>
            <p className="text-[#777777] text-xs mt-1 mb-6">Upload a QS report to add your first project</p>
            <button
              onClick={onAddProject}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-sm hover:bg-primary/90 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add Project
            </button>
          </div>
        )}

        {/* No search results */}
        {!loading && projects.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 bg-white border border-border rounded-sm">
            <p className="text-primary font-semibold text-sm">No matching projects</p>
            <p className="text-[#777777] text-xs mt-1">Try adjusting your search or filter</p>
          </div>
        )}

        {/* Projects table */}
        {!loading && filtered.length > 0 && (
          <div className="bg-white border border-border rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  {compareMode && <th className="w-10 px-3 py-3" />}
                  <Th col="name" className="text-left px-5 py-3">Project</Th>
                  <Th col="project_type" className="text-left px-4 py-3">Type</Th>
                  <Th col="gfa_sqft" className="text-right px-4 py-3">GFA</Th>
                  <Th col="units" className="text-right px-4 py-3">Units</Th>
                  <Th col="construction_cost" className="text-right px-4 py-3">Hard Cost</Th>
                  <Th col="total_budget" className="text-right px-4 py-3">Total Budget</Th>
                  <th className="text-right px-4 py-3 text-[#777777] font-semibold text-xs uppercase tracking-wider">$/sf</th>
                  <th className="text-right px-4 py-3 text-[#777777] font-semibold text-xs uppercase tracking-wider">$/unit</th>
                  <Th col="report_date" className="text-right px-5 py-3">Report Date</Th>
                  {!compareMode && <th className="w-10" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const isCompareSelected = compareIds.includes(p.id)
                  return (
                    <tr key={p.id}
                      onClick={() => compareMode ? toggleCompareId(p.id) : onSelectProject(p.id)}
                      className={`transition-colors cursor-pointer group ${
                        compareMode && isCompareSelected ? 'bg-blue-50 hover:bg-blue-50/80' : 'hover:bg-surface'
                      }`}
                    >
                      {compareMode && (
                        <td className="px-3 py-4">
                          <div className={`w-4.5 h-4.5 rounded-sm border-2 flex items-center justify-center transition-colors ${
                            isCompareSelected ? 'bg-primary border-primary' : 'border-border'
                          } ${!isCompareSelected && compareIds.length >= 5 ? 'opacity-30' : ''}`}>
                            {isCompareSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-5 py-4">
                        <p className="text-primary font-semibold">{p.name}</p>
                        <p className="text-[#777777] text-xs mt-0.5">{[p.address, p.city, p.province].filter(Boolean).join(', ')}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-block px-2 py-0.5 bg-surface text-[#555555] text-xs font-medium rounded-sm">
                          {TYPE_LABELS[p.project_type] ?? p.project_type ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-[#555555]">{fmtSqft(p.gfa_sqft)}</td>
                      <td className="px-4 py-4 text-right text-[#555555]">{p.units ?? '—'}</td>
                      <td className="px-4 py-4 text-right text-[#555555] font-medium">{fmt(p.construction_cost)}</td>
                      <td className="px-4 py-4 text-right text-primary font-semibold">{fmt(p.total_budget)}</td>
                      <td className="px-4 py-4 text-right text-[#555555]">{perSqft(p.construction_cost, p.gfa_sqft)}</td>
                      <td className="px-4 py-4 text-right text-[#555555]">{perUnit(p.construction_cost, p.units)}</td>
                      <td className="px-5 py-4 text-right text-[#777777] text-xs">
                        {p.report_date ? new Date(p.report_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short' }) : '—'}
                      </td>
                      {!compareMode && (
                        <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleDelete(e, p)}
                            disabled={deletingId === p.id}
                            className="opacity-0 group-hover:opacity-100 text-[#cccccc] hover:text-red-400 disabled:opacity-40 transition-all"
                            title="Delete project"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
