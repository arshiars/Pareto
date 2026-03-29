import { useState, useMemo, useRef, lazy, Suspense } from 'react'
const CompsMap = lazy(() => import('./CompsMap.jsx'))

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

function bedLabel(beds) {
  if (beds === 0) return 'Studio'
  if (beds === 1) return '1 Bedroom'
  return `${beds} Bedroom`
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

const DEFAULT_COLUMN_KEYS = ['address', 'unitCount', 'avgRent', 'avgSqft', 'psf', 'yearBuilt', 'constructionType', 'occupancy']

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

// ─── Edit helpers ─────────────────────────────────────────────────────────────

const NUMERIC_TYPES = ['currency', 'currency_decimal', 'number', 'number_decimal', 'percent']

function rawEditValue(val, type) {
  if (val == null) return ''
  if (NUMERIC_TYPES.includes(type)) return String(Number(val))
  return String(val)
}

function parseEditValue(str, type) {
  const s = str.trim()
  if (s === '') return null
  if (NUMERIC_TYPES.includes(type)) {
    const n = parseFloat(s.replace(/[$,%\s]/g, '').replace(/,/g, ''))
    return isNaN(n) ? null : n
  }
  return s
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

// ─── Per-bed-type table ───────────────────────────────────────────────────────

const SUMMARY_ROWS = [
  { key: 'min', label: 'Min' },
  { key: 'max', label: 'Max' },
  { key: 'median', label: 'Median' },
  { key: 'mean', label: 'Mean' },
]

function BedTable({ beds, byAddress, columns, onSelectProperty, onRemoveColumn, onRemoveRow, onReorderColumns, onReorderRows, rowOrder, overrides, onOverride, hoveredAddress, onHoverAddress }) {
  const [editingCell, setEditingCell] = useState(null) // { address, colKey }
  const [editValue, setEditValue] = useState('')
  const [dragOverCol, setDragOverCol] = useState(null)
  const [dragOverRow, setDragOverRow] = useState(null)
  const dragColRef = useRef(null)
  const dragRowRef = useRef(null)
  const inputRef = useRef(null)

  const propertyData = useMemo(() => {
    const rows = []
    for (const [address, allUnits] of byAddress.entries()) {
      const bedsUnits = allUnits.filter((u) => u.beds != null && Number(u.beds) === beds)
      if (bedsUnits.length === 0) continue
      const row = { _address: address }
      for (const col of ALL_COLUMNS) {
        const overrideKey = `${address}___${col.key}`
        if (overrides[overrideKey] !== undefined) {
          row[col.key] = overrides[overrideKey]
        } else if (col.key === 'yearBuilt' || col.key === 'constructionType') {
          row[col.key] = col.getValue(allUnits)
        } else {
          row[col.key] = col.getValue(bedsUnits)
        }
      }
      rows.push(row)
    }
    return rows
  }, [byAddress, beds, overrides])

  const sortedPropertyData = useMemo(() => {
    if (!rowOrder || rowOrder.length === 0) return propertyData
    return [...propertyData].sort((a, b) => {
      const ai = rowOrder.indexOf(a._address)
      const bi = rowOrder.indexOf(b._address)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }, [propertyData, rowOrder])

  const summary = useMemo(() => computeSummary(sortedPropertyData, columns), [sortedPropertyData, columns])

  function startEdit(address, col, currentVal) {
    setEditingCell({ address, colKey: col.key })
    setEditValue(rawEditValue(currentVal, col.type))
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitEdit(col) {
    if (!editingCell) return
    const parsed = parseEditValue(editValue, col.type)
    onOverride?.(`${editingCell.address}___${col.key}`, parsed)
    setEditingCell(null)
  }

  function handleKeyDown(e, col) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(col) }
    if (e.key === 'Escape') setEditingCell(null)
  }

  if (propertyData.length === 0) return null

  return (
    <div className="mb-6">
      <div className="bg-white border border-border rounded-t-none rounded-b-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80">
                {/* Row-remove column */}
                <th className="px-2 py-3 border-b border-border sticky left-0 bg-gray-50/80 z-10 w-6" />
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-[#888] uppercase tracking-wider border-b border-border sticky left-6 bg-gray-50/80 z-10 w-8">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    draggable={col.key !== 'address'}
                    onDragStart={(e) => {
                      if (col.key === 'address') return
                      dragColRef.current = col.key
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => {
                      if (col.key === 'address' || !dragColRef.current || dragColRef.current === col.key) return
                      e.preventDefault()
                      setDragOverCol(col.key)
                    }}
                    onDragLeave={() => setDragOverCol(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragColRef.current && dragColRef.current !== col.key && col.key !== 'address') {
                        onReorderColumns?.(dragColRef.current, col.key)
                      }
                      dragColRef.current = null
                      setDragOverCol(null)
                    }}
                    onDragEnd={() => { dragColRef.current = null; setDragOverCol(null) }}
                    className={`px-4 py-3 text-left text-[10px] font-semibold text-[#888] uppercase tracking-wider border-b border-border whitespace-nowrap transition-colors ${
                      col.key === 'address' ? 'sticky left-14 bg-gray-50/80 z-10 min-w-[200px]' : 'cursor-grab'
                    } ${dragOverCol === col.key ? 'border-l-2 border-[#3B82F6] bg-blue-50/60' : ''}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.key !== 'address' && (
                        <svg className="w-3 h-3 text-[#ccc] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
                        </svg>
                      )}
                      {col.label}
                      {col.key !== 'address' && (
                        <button
                          onClick={() => onRemoveColumn?.(col.key)}
                          className="w-4 h-4 rounded flex items-center justify-center text-[#ccc] hover:text-red-400 transition-colors flex-shrink-0"
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
              {sortedPropertyData.map((row, i) => (
                <tr
                  key={row._address}
                  draggable
                  onDragStart={(e) => {
                    dragRowRef.current = row._address
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => {
                    if (!dragRowRef.current || dragRowRef.current === row._address) return
                    e.preventDefault()
                    setDragOverRow(row._address)
                  }}
                  onDragLeave={() => setDragOverRow(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    const from = dragRowRef.current
                    if (from && from !== row._address) {
                      const order = sortedPropertyData.map(r => r._address)
                      const fi = order.indexOf(from)
                      const ti = order.indexOf(row._address)
                      order.splice(fi, 1)
                      order.splice(ti, 0, from)
                      onReorderRows?.(beds, order)
                    }
                    dragRowRef.current = null
                    setDragOverRow(null)
                  }}
                  onDragEnd={() => { dragRowRef.current = null; setDragOverRow(null) }}
                  className={`border-b border-border/50 transition-colors group/row ${
                    dragOverRow === row._address ? 'border-t-2 border-t-[#3B82F6]' : ''
                  } ${hoveredAddress === row._address ? 'bg-blue-50/60' : 'hover:bg-blue-50/30'}`}
                  onMouseEnter={() => onHoverAddress?.(row._address)}
                  onMouseLeave={() => onHoverAddress?.(null)}
                >
                  {/* Drag handle + remove button */}
                  <td className="px-2 py-3 sticky left-0 bg-white z-10 group-hover/row:bg-blue-50/30">
                    <div className="flex items-center gap-1">
                      <span
                        className="opacity-0 group-hover/row:opacity-100 cursor-grab active:cursor-grabbing text-[#ccc] transition-opacity"
                        title="Drag to reorder"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                          <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                        </svg>
                      </span>
                      <button
                        onClick={() => onRemoveRow?.(row._address)}
                        className="opacity-0 group-hover/row:opacity-100 w-4 h-4 rounded flex items-center justify-center text-[#ccc] hover:text-red-400 transition-all"
                        title="Remove row"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 sticky left-6 bg-white z-10 group-hover/row:bg-blue-50/30">
                    <span className="text-xs text-[#aaa] font-medium">{i + 1}</span>
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-[13px] text-[#333] whitespace-nowrap ${
                        col.key === 'address' ? 'sticky left-14 bg-white group-hover/row:bg-blue-50/30 z-10' : ''
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
                      ) : (() => {
                        const isEditing = editingCell?.address === row._address && editingCell?.colKey === col.key
                        const isOverridden = overrides[`${row._address}___${col.key}`] !== undefined
                        if (isEditing) {
                          return (
                            <input
                              ref={inputRef}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(col)}
                              onKeyDown={(e) => handleKeyDown(e, col)}
                              className="w-full px-1 py-0.5 text-[13px] border border-[#3B82F6] rounded outline-none bg-blue-50 text-primary font-medium min-w-[80px]"
                              autoFocus
                            />
                          )
                        }
                        return (
                          <span
                            onClick={() => startEdit(row._address, col, row[col.key])}
                            className={`cursor-text rounded px-1 py-0.5 -mx-1 hover:bg-blue-50 transition-colors block ${isOverridden ? 'text-[#2563EB] font-medium' : ''}`}
                            title="Click to edit"
                          >
                            {formatValue(row[col.key], col.type)}
                          </span>
                        )
                      })()}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Separator */}
              <tr>
                <td colSpan={columns.length + 2} className="h-0 border-t-2 border-[#3B82F6]/20" />
              </tr>

              {/* Summary rows */}
              {SUMMARY_ROWS.map((sr) => (
                <tr key={sr.key} className="bg-gray-50/50">
                  <td className="px-2 py-2.5 sticky left-0 bg-gray-50/50 z-10" />
                  <td className="px-4 py-2.5 sticky left-6 bg-gray-50/50 z-10" />
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 text-[12px] whitespace-nowrap ${
                        col.key === 'address'
                          ? 'sticky left-14 bg-gray-50/50 z-10 font-semibold text-[#555] uppercase text-[11px] tracking-wide'
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
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CompTable({ selectedAddresses, units, onSelectProperty, pinStarCoords }) {
  const [activeColumns, setActiveColumns] = useState(DEFAULT_COLUMN_KEYS)
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [hiddenAddresses, setHiddenAddresses] = useState(new Set())
  const [activeBeds, setActiveBeds] = useState(null)
  const [overrides, setOverrides] = useState({})
  const [rowOrders, setRowOrders] = useState({})
  const [showMap, setShowMap] = useState(true)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [hoveredAddress, setHoveredAddress] = useState(null)

  const columns = useMemo(
    () => activeColumns.map((key) => ALL_COLUMNS.find((c) => c.key === key)).filter(Boolean),
    [activeColumns],
  )

  const availableColumns = ALL_COLUMNS.filter((c) => !activeColumns.includes(c.key))

  // All selected units grouped by property address (excluding hidden rows)
  const byAddress = useMemo(() => {
    const map = new Map()
    for (const unit of units) {
      if (!unit.property_address) continue
      if (!selectedAddresses.has(unit.property_address)) continue
      if (hiddenAddresses.has(unit.property_address)) continue
      if (!map.has(unit.property_address)) map.set(unit.property_address, [])
      map.get(unit.property_address).push(unit)
    }
    return map
  }, [units, selectedAddresses, hiddenAddresses])

  // Sorted unique bed types across all selected units
  const bedTypes = useMemo(() => {
    const seen = new Set()
    for (const unitList of byAddress.values()) {
      for (const u of unitList) {
        if (u.beds != null) seen.add(Number(u.beds))
      }
    }
    return [...seen].sort((a, b) => a - b)
  }, [byAddress])

  // Keep activeBeds valid when bedTypes changes
  const currentBeds = bedTypes.includes(activeBeds) ? activeBeds : (bedTypes[0] ?? null)

  // Addresses visible in the active tab, ordered to match the table row order
  const visibleAddresses = useMemo(() => {
    if (currentBeds === null) return []
    const addrs = [...byAddress.entries()]
      .filter(([, units]) => units.some((u) => u.beds != null && Number(u.beds) === currentBeds))
      .map(([address]) => address)
    const order = rowOrders[currentBeds]
    if (!order || order.length === 0) return addrs
    return [...addrs].sort((a, b) => {
      const ai = order.indexOf(a)
      const bi = order.indexOf(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }, [byAddress, currentBeds, rowOrders])

  function addColumn(key) {
    setActiveColumns((prev) => [...prev, key])
    setShowAddColumn(false)
  }

  function removeColumn(key) {
    if (key === 'address') return
    setActiveColumns((prev) => prev.filter((k) => k !== key))
  }

  function reorderColumns(fromKey, toKey) {
    setActiveColumns((prev) => {
      const arr = [...prev]
      const fi = arr.indexOf(fromKey)
      const ti = arr.indexOf(toKey)
      if (fi === -1 || ti === -1) return prev
      arr.splice(fi, 1)
      arr.splice(ti, 0, fromKey)
      return arr
    })
  }

  function removeRow(address) {
    setHiddenAddresses((prev) => new Set([...prev, address]))
  }

  function handleOverride(key, value) {
    setOverrides((prev) => ({ ...prev, [key]: value }))
  }

  function handleRowReorder(beds, newOrder) {
    setRowOrders((prev) => ({ ...prev, [beds]: newOrder }))
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-[#222]">Comparable Analysis</h2>
          <span className="text-xs text-[#999]">{selectedAddresses.size} properties</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMap((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition-colors ${
              showMap
                ? 'bg-primary text-white border-primary'
                : 'bg-white border-border text-[#555] hover:bg-gray-50'
            }`}
            title="Toggle map"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Map
          </button>

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
      </div>

      {/* Tabs + table + map */}
      <div className="flex-1 overflow-auto px-6 pb-5 flex flex-col">

        {/* Unit type tabs */}
        {bedTypes.length > 0 && (
          <div className="flex items-center gap-1 pt-4 pb-0 flex-shrink-0">
            {bedTypes.map((beds) => (
              <button
                key={beds}
                onClick={() => setActiveBeds(beds)}
                className={`px-4 py-2 text-xs font-semibold rounded-t-lg border border-b-0 transition-colors ${
                  beds === currentBeds
                    ? 'bg-white border-border text-primary'
                    : 'bg-transparent border-transparent text-[#888] hover:text-primary hover:bg-white/60'
                }`}
              >
                {bedLabel(beds)}
              </button>
            ))}
          </div>
        )}

        {/* Active table */}
        {currentBeds !== null ? (
          <BedTable
            key={currentBeds}
            beds={currentBeds}
            byAddress={byAddress}
            columns={columns}
            onSelectProperty={onSelectProperty}
            onRemoveColumn={removeColumn}
            onRemoveRow={removeRow}
            onReorderColumns={reorderColumns}
            onReorderRows={handleRowReorder}
            rowOrder={rowOrders[currentBeds]}
            overrides={overrides}
            onOverride={handleOverride}
            hoveredAddress={hoveredAddress}
            onHoverAddress={setHoveredAddress}
          />
        ) : (
          <div className="flex items-center justify-center h-40 text-sm text-[#999]">
            No unit data found for selected properties.
          </div>
        )}

        {/* Map panel — below table */}
        {showMap && (
          <div className="mt-4 flex-shrink-0 relative" style={{ height: 400 }}>
            <Suspense fallback={<div className="h-full rounded-xl bg-gray-100 animate-pulse border border-border" />}>
              <CompsMap
                addresses={visibleAddresses}
                hoveredAddress={hoveredAddress}
                onHoverAddress={setHoveredAddress}
                pinStarCoords={pinStarCoords}
              />
            </Suspense>
            <button
              onClick={() => setMapExpanded(true)}
              className="absolute top-3 left-3 z-10 bg-white border border-border rounded-lg p-1.5 shadow hover:bg-gray-50 transition-colors"
              title="Expand map"
            >
              <svg className="w-4 h-4 text-[#555]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            </button>
          </div>
        )}

        {/* Expanded map overlay */}
        {mapExpanded && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setMapExpanded(false)}>
            <div className="relative w-full max-w-5xl h-[80vh] rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <Suspense fallback={<div className="h-full bg-gray-100 animate-pulse" />}>
                <CompsMap
                  addresses={visibleAddresses}
                  hoveredAddress={hoveredAddress}
                  onHoverAddress={setHoveredAddress}
                  pinStarCoords={pinStarCoords}
                />
              </Suspense>
              <button
                onClick={() => setMapExpanded(false)}
                className="absolute top-3 left-3 z-10 bg-white border border-border rounded-lg p-1.5 shadow hover:bg-gray-50 transition-colors"
                title="Collapse map"
              >
                <svg className="w-4 h-4 text-[#555]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v4m0-4h4m7-1h4m0 0v4m0-4l-5 5M9 15l-5 5m0 0v-4m0 4h4m7 1h4m0 0v-4m0 4l-5-5" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
