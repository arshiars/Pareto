import { useState, useMemo } from 'react'

function fmtCurrency(val) {
  if (val == null) return '—'
  return '$' + Number(val).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtNum(val, decimals = 0) {
  if (val == null) return '—'
  return Number(val).toLocaleString('en-CA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function median(arr) {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function mean(arr) {
  if (arr.length === 0) return null
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

// ─── All available columns ────────────────────────────────────────────────────

const ALL_COLUMNS = [
  { key: 'address', label: 'Property', type: 'text', getValue: (units) => units[0]?.property_address || '—', sticky: true },
  { key: 'unitCount', label: 'Units', type: 'number', getValue: (units) => units.length },
  { key: 'avgRent', label: 'Avg Rent ($/mo)', type: 'currency', getValue: (units) => {
    const rated = units.filter((u) => u.lease_rate != null)
    return rated.length > 0 ? Math.round(rated.reduce((s, u) => s + Number(u.lease_rate), 0) / rated.length) : null
  }},
  { key: 'avgSqft', label: 'Avg Size (sqft)', type: 'number', getValue: (units) => {
    const sq = units.filter((u) => u.sqft != null)
    return sq.length > 0 ? Math.round(sq.reduce((s, u) => s + Number(u.sqft), 0) / sq.length) : null
  }},
  { key: 'psf', label: 'PSF ($/sqft/mo)', type: 'currency_decimal', getValue: (units) => {
    const valid = units.filter((u) => u.lease_rate != null && u.sqft != null && Number(u.sqft) > 0)
    if (valid.length === 0) return null
    const totalRent = valid.reduce((s, u) => s + Number(u.lease_rate), 0)
    const totalSqft = valid.reduce((s, u) => s + Number(u.sqft), 0)
    return totalRent / totalSqft
  }},
  { key: 'minRent', label: 'Min Rent ($/mo)', type: 'currency', getValue: (units) => {
    const rated = units.filter((u) => u.lease_rate != null).map((u) => Number(u.lease_rate))
    return rated.length > 0 ? Math.min(...rated) : null
  }},
  { key: 'maxRent', label: 'Max Rent ($/mo)', type: 'currency', getValue: (units) => {
    const rated = units.filter((u) => u.lease_rate != null).map((u) => Number(u.lease_rate))
    return rated.length > 0 ? Math.max(...rated) : null
  }},
  { key: 'medianRent', label: 'Median Rent ($/mo)', type: 'currency', getValue: (units) => {
    const rated = units.filter((u) => u.lease_rate != null).map((u) => Number(u.lease_rate))
    return median(rated)
  }},
  { key: 'beds', label: 'Bed Types', type: 'text', getValue: (units) => {
    const beds = [...new Set(units.map((u) => u.beds).filter((b) => b != null))].sort((a, b) => a - b)
    return beds.length > 0 ? beds.map((b) => b === 0 ? 'Studio' : `${b}BR`).join(', ') : '—'
  }},
  { key: 'avgBeds', label: 'Avg Beds', type: 'number_decimal', getValue: (units) => {
    const b = units.filter((u) => u.beds != null)
    return b.length > 0 ? b.reduce((s, u) => s + Number(u.beds), 0) / b.length : null
  }},
  { key: 'avgBaths', label: 'Avg Baths', type: 'number_decimal', getValue: (units) => {
    const b = units.filter((u) => u.baths != null)
    return b.length > 0 ? b.reduce((s, u) => s + Number(u.baths), 0) / b.length : null
  }},
  { key: 'occupancy', label: 'Occupancy %', type: 'percent', getValue: (units) => {
    if (units.length === 0) return null
    const active = units.filter((u) => !u.move_out || u.move_out >= new Date().toISOString().split('T')[0])
    return (active.length / units.length) * 100
  }},
  { key: 'yearBuilt', label: 'Year Built', type: 'number', getValue: (units) => units[0]?.year_built ?? null },
  { key: 'constructionType', label: 'Frame', type: 'text', getValue: (units) => {
    const ct = units[0]?.construction_type
    return ct ? ct.charAt(0).toUpperCase() + ct.slice(1) : '—'
  }},
  { key: 'minSqft', label: 'Min Size (sqft)', type: 'number', getValue: (units) => {
    const sq = units.filter((u) => u.sqft != null).map((u) => Number(u.sqft))
    return sq.length > 0 ? Math.min(...sq) : null
  }},
  { key: 'maxSqft', label: 'Max Size (sqft)', type: 'number', getValue: (units) => {
    const sq = units.filter((u) => u.sqft != null).map((u) => Number(u.sqft))
    return sq.length > 0 ? Math.max(...sq) : null
  }},
  { key: 'latestMoveIn', label: 'Latest Lease Start', type: 'date', getValue: (units) => {
    const dates = units.map((u) => u.move_in).filter(Boolean).sort()
    return dates.length > 0 ? dates[dates.length - 1] : null
  }},
  { key: 'latestLeaseExecuted', label: 'Latest Lease Executed', type: 'date', getValue: (units) => {
    const dates = units.map((u) => u.lease_executed).filter(Boolean).sort()
    return dates.length > 0 ? dates[dates.length - 1] : null
  }},
]

const DEFAULT_COLUMN_KEYS = ['address', 'unitCount', 'avgRent', 'avgSqft', 'psf', 'beds', 'yearBuilt', 'constructionType', 'occupancy']

function formatValue(val, type) {
  if (val == null) return '—'
  switch (type) {
    case 'currency': return fmtCurrency(val)
    case 'currency_decimal': return '$' + Number(val).toFixed(2)
    case 'number': return fmtNum(val)
    case 'number_decimal': return fmtNum(val, 1)
    case 'percent': return fmtNum(val, 1) + '%'
    case 'date': return val
    default: return String(val)
  }
}

// ─── Summary row calculation ──────────────────────────────────────────────────

function computeSummary(propertyDataRows, columns) {
  const numericTypes = ['currency', 'currency_decimal', 'number', 'number_decimal', 'percent']
  const result = {}

  for (const col of columns) {
    if (col.key === 'address' || !numericTypes.includes(col.type)) {
      result[col.key] = null
      continue
    }

    const vals = propertyDataRows.map((r) => r[col.key]).filter((v) => v != null)
    result[col.key] = {
      min: vals.length > 0 ? Math.min(...vals) : null,
      max: vals.length > 0 ? Math.max(...vals) : null,
      mean: mean(vals),
      median: median(vals),
    }
  }
  return result
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CompTable({ selectedAddresses, units, onBack, onSelectProperty }) {
  const [activeColumns, setActiveColumns] = useState(DEFAULT_COLUMN_KEYS)
  const [showAddColumn, setShowAddColumn] = useState(false)

  const columns = useMemo(
    () => activeColumns.map((key) => ALL_COLUMNS.find((c) => c.key === key)).filter(Boolean),
    [activeColumns],
  )

  const availableColumns = ALL_COLUMNS.filter((c) => !activeColumns.includes(c.key))

  // Build per-property data
  const byAddress = useMemo(() => {
    const map = new Map()
    for (const unit of units) {
      if (!unit.property_address) continue
      if (!selectedAddresses.has(unit.property_address)) continue
      if (!map.has(unit.property_address)) map.set(unit.property_address, [])
      map.get(unit.property_address).push(unit)
    }
    return map
  }, [units, selectedAddresses])

  const propertyData = useMemo(() => {
    const rows = []
    for (const [address, addressUnits] of byAddress.entries()) {
      const row = { _address: address }
      for (const col of ALL_COLUMNS) {
        row[col.key] = col.getValue(addressUnits)
      }
      rows.push(row)
    }
    return rows
  }, [byAddress])

  const summary = useMemo(() => computeSummary(propertyData, columns), [propertyData, columns])

  function addColumn(key) {
    setActiveColumns((prev) => [...prev, key])
    setShowAddColumn(false)
  }

  function removeColumn(key) {
    if (key === 'address') return
    setActiveColumns((prev) => prev.filter((k) => k !== key))
  }

  const summaryRows = [
    { key: 'min', label: 'Min' },
    { key: 'max', label: 'Max' },
    { key: 'median', label: 'Median' },
    { key: 'mean', label: 'Mean' },
  ]

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[#777] hover:text-primary transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Map
          </button>
          <div className="h-5 w-px bg-border" />
          <h2 className="text-sm font-bold text-[#222]">Comparable Analysis</h2>
          <span className="text-xs text-[#999]">{selectedAddresses.size} properties</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowAddColumn((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-border rounded-lg hover:bg-gray-50 transition-colors text-[#555]"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Column
          </button>

          {showAddColumn && availableColumns.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-border rounded-xl shadow-xl z-30 overflow-hidden"
              style={{ animation: 'filterIn .15s ease-out' }}
            >
              <style>{`@keyframes filterIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
              <div className="px-3 py-2 border-b border-border bg-gray-50/60">
                <span className="text-[11px] font-medium text-[#888] uppercase tracking-wide">Available Columns</span>
              </div>
              <div className="max-h-[260px] overflow-y-auto">
                {availableColumns.map((col) => (
                  <button
                    key={col.key}
                    onClick={() => addColumn(col.key)}
                    className="w-full text-left px-3 py-2 text-xs text-[#444] hover:bg-blue-50 hover:text-[#3B82F6] transition-colors flex items-center gap-2"
                  >
                    <svg className="w-3 h-3 text-[#bbb]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {col.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {/* Column headers */}
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-[#888] uppercase tracking-wider border-b border-border sticky left-0 bg-gray-50/80 z-10 w-8">
                    #
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-3 text-left text-[10px] font-semibold text-[#888] uppercase tracking-wider border-b border-border whitespace-nowrap ${
                        col.key === 'address' ? 'sticky left-8 bg-gray-50/80 z-10 min-w-[200px]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-1.5 group">
                        {col.label}
                        {col.key !== 'address' && (
                          <button
                            onClick={() => removeColumn(col.key)}
                            className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded flex items-center justify-center text-[#bbb] hover:text-red-400 transition-all"
                            title="Remove column"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* Property rows */}
                {propertyData.map((row, i) => (
                  <tr
                    key={row._address}
                    className="border-b border-border/50 hover:bg-blue-50/30 transition-colors group/row"
                  >
                    <td className="px-4 py-3 sticky left-0 bg-white z-10 group-hover/row:bg-blue-50/30">
                      <span className="text-xs text-[#aaa] font-medium">{i + 1}</span>
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-[13px] text-[#333] whitespace-nowrap ${
                          col.key === 'address' ? 'sticky left-8 bg-white group-hover/row:bg-blue-50/30 z-10' : ''
                        }`}
                      >
                        {col.key === 'address' ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onSelectProperty?.(row._address)}
                              className="font-medium text-[#3B82F6] hover:text-[#2563EB] hover:underline transition-colors text-left"
                            >
                              {row[col.key]}
                            </button>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row._address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[#bbb] hover:text-[#3B82F6] transition-colors"
                              title="Open in Google Maps"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </a>
                          </div>
                        ) : (
                          formatValue(row[col.key], col.type)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Separator */}
                <tr>
                  <td colSpan={columns.length + 1} className="h-0 border-t-2 border-[#3B82F6]/20" />
                </tr>

                {/* Summary rows */}
                {summaryRows.map((sr) => (
                  <tr key={sr.key} className="bg-gray-50/50">
                    <td className="px-4 py-2.5 sticky left-0 bg-gray-50/50 z-10" />
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-2.5 text-[12px] whitespace-nowrap ${
                          col.key === 'address'
                            ? 'sticky left-8 bg-gray-50/50 z-10 font-semibold text-[#555] uppercase text-[11px] tracking-wide'
                            : 'text-[#444] font-medium'
                        }`}
                      >
                        {col.key === 'address' ? (
                          sr.label
                        ) : summary[col.key] ? (
                          formatValue(summary[col.key][sr.key], col.type)
                        ) : (
                          '—'
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
