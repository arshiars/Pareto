import { useState, useEffect, useMemo } from 'react'
import { fetchTripleCProjects, fetchTripleCComparison } from '../services/api.js'

const TYPE_LABELS = {
  condo: 'Condo', rental: 'Rental', 'mixed-use': 'Mixed-Use',
  commercial: 'Commercial', industrial: 'Industrial', other: 'Other',
}

const COLORS = [
  { bg: 'bg-blue-500', bgLight: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300' },
  { bg: 'bg-emerald-500', bgLight: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300' },
  { bg: 'bg-amber-500', bgLight: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' },
  { bg: 'bg-purple-500', bgLight: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-300' },
  { bg: 'bg-rose-500', bgLight: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-300' },
]

function fmt(n) {
  if (n == null || n === 0) return '—'
  return '$' + Number(n).toLocaleString('en-CA', { maximumFractionDigits: 0 })
}
function fmtPsf(n) {
  if (n == null) return '—'
  return '$' + Number(n).toFixed(0) + '/sf'
}
function fmtPpu(n) {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString('en-CA') + '/unit'
}

export default function TripleCComparePage({ onBack, initialIds = [] }) {
  const [allProjects, setAllProjects] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedIds, setSelectedIds] = useState(initialIds)
  const [compData, setCompData] = useState(null)
  const [loadingComp, setLoadingComp] = useState(false)
  const [error, setError] = useState(null)
  const [view, setView] = useState('psf')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchTripleCProjects()
      .then(setAllProjects)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingList(false))
  }, [])

  useEffect(() => {
    if (selectedIds.length < 2) { setCompData(null); return }
    setLoadingComp(true)
    setError(null)
    fetchTripleCComparison(selectedIds)
      .then(setCompData)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingComp(false))
  }, [selectedIds])

  function toggleProject(id) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }

  function removeProject(id) {
    setSelectedIds((prev) => prev.filter((x) => x !== id))
  }

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return allProjects
    const q = search.trim().toLowerCase()
    return allProjects.filter((p) =>
      (p.name ?? '').toLowerCase().includes(q) ||
      (p.city ?? '').toLowerCase().includes(q) ||
      (p.address ?? '').toLowerCase().includes(q)
    )
  }, [allProjects, search])

  const colorMap = useMemo(() => {
    const map = {}
    selectedIds.forEach((id, i) => { map[id] = COLORS[i % COLORS.length] })
    return map
  }, [selectedIds])

  const maxDivAmount = useMemo(() => {
    if (!compData) return 1
    let max = 0
    for (const row of compData.comparison) {
      for (const p of row.projects) {
        const val = view === 'psf' ? p.psf : p.ppu
        if (val && val > max) max = val
      }
    }
    return max || 1
  }, [compData, view])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-white border-b border-border">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
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
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">Project Comparison</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selectedIds.length >= 2 && (
              <div className="flex rounded-sm border border-border overflow-hidden text-xs font-semibold">
                <button
                  onClick={() => setView('psf')}
                  className={`px-3 py-1.5 transition-colors ${view === 'psf' ? 'bg-primary text-white' : 'bg-white text-[#555555] hover:bg-surface'}`}
                >
                  $/sf
                </button>
                <button
                  onClick={() => setView('ppu')}
                  className={`px-3 py-1.5 transition-colors ${view === 'ppu' ? 'bg-primary text-white' : 'bg-white text-[#555555] hover:bg-surface'}`}
                >
                  $/unit
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-8 py-10">
        <div className="flex gap-6">
          {/* Left panel: project picker */}
          <div className="w-72 flex-shrink-0">
            <div className="bg-white border border-border rounded-sm overflow-hidden sticky top-8">
              <div className="px-4 py-3 border-b border-border bg-surface">
                <h3 className="text-primary font-bold text-xs uppercase tracking-wider">
                  Select Projects
                  <span className="text-[#777777] font-normal ml-1">({selectedIds.length}/5)</span>
                </h3>
              </div>
              <div className="px-3 py-2 border-b border-border">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#aaaaaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search projects…"
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-border rounded-sm text-primary text-xs focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
                {loadingList && (
                  <div className="px-4 py-8 text-center">
                    <svg className="w-5 h-5 animate-spin text-primary mx-auto" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  </div>
                )}
                {filteredProjects.map((p) => {
                  const isSelected = selectedIds.includes(p.id)
                  const color = colorMap[p.id]
                  const disabled = !isSelected && selectedIds.length >= 5
                  return (
                    <button
                      key={p.id}
                      onClick={() => !disabled && toggleProject(p.id)}
                      disabled={disabled}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${
                        isSelected
                          ? `${color?.bgLight ?? 'bg-blue-50'} ${color?.border ?? 'border-blue-300'} border-l-[3px]`
                          : disabled
                            ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-surface border-l-[3px] border-transparent'
                      }`}
                    >
                      <p className={`text-sm font-medium ${isSelected ? (color?.text ?? 'text-blue-700') : 'text-primary'}`}>
                        {p.name}
                      </p>
                      <p className="text-[#777777] text-xs mt-0.5">
                        {[p.city, p.province].filter(Boolean).join(', ')}
                        {p.project_type ? ` · ${TYPE_LABELS[p.project_type] ?? p.project_type}` : ''}
                      </p>
                    </button>
                  )
                })}
                {!loadingList && filteredProjects.length === 0 && (
                  <p className="px-4 py-6 text-[#777777] text-xs text-center">No projects found</p>
                )}
              </div>
            </div>
          </div>

          {/* Right panel: comparison */}
          <div className="flex-1 min-w-0">
            {selectedIds.length < 2 && (
              <div className="flex flex-col items-center justify-center py-24 bg-white border border-border rounded-sm">
                <div className="w-12 h-12 rounded-sm bg-surface flex items-center justify-center mb-5">
                  <svg className="w-6 h-6 text-[#aaaaaa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-primary font-semibold text-sm">Select at least 2 projects</p>
                <p className="text-[#777777] text-xs mt-1">Choose projects from the panel on the left to compare</p>
              </div>
            )}

            {error && (
              <div className="mb-6 p-4 bg-white border border-red-200 rounded-sm text-red-600 text-sm">
                {error}
              </div>
            )}

            {loadingComp && (
              <div className="flex items-center justify-center py-24">
                <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            )}

            {compData && !loadingComp && (
              <div className="space-y-6">
                {/* Project summary cards */}
                <div className={`grid gap-4 ${compData.projects.length <= 3 ? `grid-cols-${compData.projects.length}` : 'grid-cols-3'}`}
                  style={{ gridTemplateColumns: `repeat(${Math.min(compData.projects.length, 5)}, minmax(0, 1fr))` }}>
                  {compData.projects.map((p) => {
                    const color = colorMap[p.id] ?? COLORS[0]
                    const hardCost = Number(p.construction_cost ?? 0)
                    return (
                      <div key={p.id} className={`bg-white border rounded-sm overflow-hidden ${color.border}`}>
                        <div className={`${color.bg} h-1.5`} />
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="min-w-0">
                              <p className={`text-sm font-bold ${color.text} truncate`}>{p.name}</p>
                              <p className="text-[#777777] text-xs mt-0.5 truncate">
                                {[p.city, p.province].filter(Boolean).join(', ')}
                              </p>
                            </div>
                            <button onClick={() => removeProject(p.id)} className="text-[#cccccc] hover:text-red-400 transition-colors flex-shrink-0 ml-2">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[#aaaaaa] uppercase tracking-wider">Type</span>
                              <p className="text-primary font-medium">{TYPE_LABELS[p.project_type] ?? '—'}</p>
                            </div>
                            <div>
                              <span className="text-[#aaaaaa] uppercase tracking-wider">GFA</span>
                              <p className="text-primary font-medium">{p.gfa_sqft ? Number(p.gfa_sqft).toLocaleString('en-CA') + ' sf' : '—'}</p>
                            </div>
                            <div>
                              <span className="text-[#aaaaaa] uppercase tracking-wider">Units</span>
                              <p className="text-primary font-medium">{p.units ?? '—'}</p>
                            </div>
                            <div>
                              <span className="text-[#aaaaaa] uppercase tracking-wider">Date</span>
                              <p className="text-primary font-medium">{p.report_date ? new Date(p.report_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short' }) : '—'}</p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-[#aaaaaa] uppercase tracking-wider">Hard Cost</span>
                              <p className="text-primary font-bold">{fmt(hardCost)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Division comparison table */}
                <div className="bg-white border border-border rounded-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-border bg-surface">
                    <h3 className="text-primary font-bold text-sm uppercase tracking-wider">Division-by-Division Comparison</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-5 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider w-8">#</th>
                          <th className="text-left px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Division</th>
                          {compData.projects.map((p) => {
                            const color = colorMap[p.id] ?? COLORS[0]
                            return (
                              <th key={p.id} className={`text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider ${color.text}`}>
                                {p.name.length > 15 ? p.name.substring(0, 15) + '…' : p.name}
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {compData.comparison.map((row) => {
                          const values = row.projects.map((p) => view === 'psf' ? p.psf : p.ppu).filter(Boolean)
                          const maxVal = values.length ? Math.max(...values) : 0
                          const minVal = values.length ? Math.min(...values) : 0

                          return (
                            <tr key={row.division_number} className="hover:bg-surface transition-colors group">
                              <td className="px-5 py-3 text-[#aaaaaa] text-xs font-mono">
                                {String(row.division_number).padStart(2, '0')}
                              </td>
                              <td className="px-4 py-3 text-primary font-medium text-sm">{row.division_name}</td>
                              {row.projects.map((p, idx) => {
                                const val = view === 'psf' ? p.psf : p.ppu
                                const fmtVal = view === 'psf' ? fmtPsf(val) : fmtPpu(val)
                                const color = colorMap[compData.projects[idx]?.id] ?? COLORS[0]
                                const isMax = val != null && val === maxVal && values.length > 1
                                const isMin = val != null && val === minVal && values.length > 1 && minVal !== maxVal
                                const barPct = val && maxDivAmount ? Math.round((val / maxDivAmount) * 100) : 0

                                return (
                                  <td key={idx} className="px-4 py-3 text-right">
                                    <div className="flex flex-col items-end gap-1">
                                      <span className={`tabular-nums text-sm font-semibold ${
                                        isMax ? 'text-red-600' : isMin ? 'text-green-600' : 'text-primary'
                                      }`}>
                                        {fmtVal}
                                      </span>
                                      {barPct > 0 && (
                                        <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full ${color.bg} opacity-40 transition-all`} style={{ width: `${barPct}%` }} />
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-surface">
                          <td className="px-5 py-3" />
                          <td className="px-4 py-3 text-primary font-bold text-sm">Total Hard Cost</td>
                          {compData.projects.map((p, idx) => {
                            const color = colorMap[p.id] ?? COLORS[0]
                            const total = compData.comparison.reduce((s, row) => {
                              const val = view === 'psf' ? row.projects[idx]?.psf : row.projects[idx]?.ppu
                              return s + (val ?? 0)
                            }, 0)
                            return (
                              <td key={p.id} className={`px-4 py-3 text-right font-bold tabular-nums ${color.text}`}>
                                {view === 'psf' ? fmtPsf(total) : fmtPpu(total)}
                              </td>
                            )
                          })}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Fees comparison */}
                {compData.projects.some((p) => p.construction_mgmt_fee > 0 || p.construction_contingency > 0 || p.development_mgmt_fee > 0) && (
                  <div className="bg-white border border-border rounded-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-border bg-surface">
                      <h3 className="text-primary font-bold text-sm uppercase tracking-wider">Fees & Contingency</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-5 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider" colSpan={2}>Fee</th>
                          {compData.projects.map((p) => {
                            const color = colorMap[p.id] ?? COLORS[0]
                            return (
                              <th key={p.id} className={`text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider ${color.text}`}>
                                {p.name.length > 15 ? p.name.substring(0, 15) + '…' : p.name}
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[
                          { key: 'construction_mgmt_fee', label: 'Construction Mgmt Fee' },
                          { key: 'construction_contingency', label: 'Construction Contingency' },
                          { key: 'development_mgmt_fee', label: 'Development Mgmt Fee' },
                        ].map(({ key, label }) => (
                          <tr key={key} className="hover:bg-surface transition-colors">
                            <td className="px-5 py-3 text-[#555555] text-sm" colSpan={2}>{label}</td>
                            {compData.projects.map((p) => (
                              <td key={p.id} className="px-4 py-3 text-right text-primary tabular-nums font-medium">{fmt(p[key])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
