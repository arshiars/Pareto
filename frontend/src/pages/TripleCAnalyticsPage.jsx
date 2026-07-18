import { useState, useEffect, useCallback } from 'react'
import { fetchTripleCAnalytics } from '../services/api.js'

const TYPE_LABELS = {
  condo: 'Condo',
  rental: 'Rental',
  'mixed-use': 'Mixed-Use',
  commercial: 'Commercial',
  industrial: 'Industrial',
  other: 'Other',
}

const GFA_RANGES = [
  { label: 'All sizes', value: '' },
  { label: '< 100,000 sf', value: '0-100000' },
  { label: '100k – 300k sf', value: '100000-300000' },
  { label: '300k – 500k sf', value: '300000-500000' },
  { label: '> 500,000 sf', value: '500000-' },
]

function fmtPsf(n) {
  if (n == null) return '—'
  return '$' + Number(n).toFixed(0) + '/sf'
}
function fmtPpu(n) {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString('en-CA') + '/unit'
}

export default function TripleCAnalyticsPage({ onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('psf')

  const [typeFilter, setTypeFilter] = useState('')
  const [provinceFilter, setProvinceFilter] = useState('')
  const [gfaRange, setGfaRange] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [availableTypes, setAvailableTypes] = useState([])
  const [availableProvinces, setAvailableProvinces] = useState([])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters = {}
      if (typeFilter) filters.type = typeFilter
      if (provinceFilter) filters.province = provinceFilter
      if (dateFrom) filters.dateFrom = dateFrom
      if (dateTo) filters.dateTo = dateTo
      if (gfaRange) {
        const [min, max] = gfaRange.split('-')
        if (min) filters.gfaMin = min
        if (max) filters.gfaMax = max
      }
      const result = await fetchTripleCAnalytics(filters)
      setData(result)
      if (result.distinctTypes) setAvailableTypes(result.distinctTypes)
      if (result.distinctProvinces) setAvailableProvinces(result.distinctProvinces)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [typeFilter, provinceFilter, gfaRange, dateFrom, dateTo])

  useEffect(() => { loadData() }, [loadData])

  const hasFilters = typeFilter || provinceFilter || gfaRange || dateFrom || dateTo
  function clearFilters() {
    setTypeFilter('')
    setProvinceFilter('')
    setGfaRange('')
    setDateFrom('')
    setDateTo('')
  }

  const maxAvg = data
    ? Math.max(...data.stats.map((s) => view === 'psf' ? (s.avg_psf ?? 0) : (s.avg_ppu ?? 0)), 1)
    : 1

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
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">Division Benchmarks</p>
            </div>
            {data && (
              <>
                <div className="h-6 w-px bg-border" />
                <span className="text-[#555555] text-xs">
                  {data.projectCount} of {data.totalCount} project{data.totalCount !== 1 ? 's' : ''}
                  {hasFilters ? ' (filtered)' : ''}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
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
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-8 py-10">
        {/* Filter bar */}
        <div className="bg-white border border-border rounded-sm px-5 py-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[#777777] text-xs font-semibold uppercase tracking-wider flex-shrink-0">Filters</span>
            <div className="h-5 w-px bg-border flex-shrink-0" />

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-border rounded-sm text-sm text-[#555555] focus:outline-none focus:border-primary transition-colors"
            >
              <option value="">All types</option>
              {availableTypes.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
            </select>

            <select
              value={provinceFilter}
              onChange={(e) => setProvinceFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-border rounded-sm text-sm text-[#555555] focus:outline-none focus:border-primary transition-colors"
            >
              <option value="">All provinces</option>
              {availableProvinces.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <select
              value={gfaRange}
              onChange={(e) => setGfaRange(e.target.value)}
              className="px-3 py-1.5 bg-white border border-border rounded-sm text-sm text-[#555555] focus:outline-none focus:border-primary transition-colors"
            >
              {GFA_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-1.5 bg-white border border-border rounded-sm text-sm text-[#555555] focus:outline-none focus:border-primary transition-colors"
                title="Report date from"
              />
              <span className="text-[#aaaaaa] text-xs">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1.5 bg-white border border-border rounded-sm text-sm text-[#555555] focus:outline-none focus:border-primary transition-colors"
                title="Report date to"
              />
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-[#777777] hover:text-primary transition-colors ml-auto flex-shrink-0"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-14 bg-white border border-border rounded-sm animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="p-4 bg-white border border-red-200 rounded-sm text-red-600 text-sm">
            Failed to load analytics: {error}
          </div>
        )}

        {data && data.stats.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-24 bg-white border border-border rounded-sm">
            <p className="text-primary font-semibold text-sm">
              {hasFilters ? 'No projects match these filters' : 'Not enough data yet'}
            </p>
            <p className="text-[#777777] text-xs mt-1">
              {hasFilters ? 'Try broadening your filter criteria' : 'Add projects with GFA data to see benchmarks'}
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-4 text-accent text-xs font-semibold hover:underline">
                Clear filters
              </button>
            )}
          </div>
        )}

        {data && data.stats.length > 0 && !loading && (
          <div className="bg-white border border-border rounded-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-surface flex items-center justify-between">
              <h3 className="text-primary font-bold text-sm uppercase tracking-wider">
                {view === 'psf' ? '$/sf by Division' : '$/unit by Division'}
              </h3>
              <p className="text-[#777777] text-xs">
                Across {data.projectCount} project{data.projectCount !== 1 ? 's' : ''}
                {hasFilters ? ' matching filters' : ''}
              </p>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider w-8">#</th>
                  <th className="text-left px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Division</th>
                  <th className="text-right px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Avg</th>
                  <th className="text-right px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Median</th>
                  <th className="text-right px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Min</th>
                  <th className="text-right px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Max</th>
                  <th className="text-right px-5 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider w-16">Projects</th>
                  <th className="px-5 py-2.5 w-48" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.stats.map((s) => {
                  const avg = view === 'psf' ? s.avg_psf : s.avg_ppu
                  const med = view === 'psf' ? s.median_psf : s.median_ppu
                  const min = view === 'psf' ? s.min_psf : s.min_ppu
                  const max = view === 'psf' ? s.max_psf : s.max_ppu
                  const barWidth = avg && maxAvg ? Math.round((avg / maxAvg) * 100) : 0
                  const fmt = view === 'psf' ? fmtPsf : fmtPpu

                  return (
                    <tr key={s.division_number} className="hover:bg-surface transition-colors">
                      <td className="px-5 py-3 text-[#aaaaaa] text-xs font-mono">
                        {String(s.division_number).padStart(2, '0')}
                      </td>
                      <td className="px-4 py-3 text-primary font-medium text-sm">{s.division_name}</td>
                      <td className="px-4 py-3 text-right text-primary font-bold tabular-nums">{fmt(avg)}</td>
                      <td className="px-4 py-3 text-right text-[#555555] text-sm tabular-nums">{fmt(med)}</td>
                      <td className="px-4 py-3 text-right text-[#777777] text-sm tabular-nums">{fmt(min)}</td>
                      <td className="px-4 py-3 text-right text-[#777777] text-sm tabular-nums">{fmt(max)}</td>
                      <td className="px-5 py-3 text-right text-[#777777] text-sm">{s.count}</td>
                      <td className="px-5 py-3">
                        {barWidth > 0 && (
                          <div className="h-2 bg-border rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/40 rounded-full transition-all"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        )}
                      </td>
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
