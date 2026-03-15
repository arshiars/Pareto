import { useState, useRef, useEffect, useCallback } from 'react'
import { useIPP } from '../../context/IPPContext.jsx'
import { extractTenantLease, extractRentRollDocument, extractExpenseField, generateDealSummary, exportIppExcel } from '../../services/ippApi.js'

// ─── Formatters ───────────────────────────────────────────────────────────────

const CAD = (v) => v == null ? null : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
const PCT = (v) => v == null ? null : `${(v * 100).toFixed(2)}%`
const NUM = (v) => v == null ? null : Number(v).toLocaleString('en-CA')

// ─── Live NOI calculation ─────────────────────────────────────────────────────

function calcNOI(data, overrides) {
  function v(extracted, key, fallback = 0) {
    if (overrides[key] !== undefined) return overrides[key] ?? fallback
    return extracted?.value ?? fallback
  }

  const tenants = data.tenants ?? []
  const totalBaseRent = tenants.reduce((sum, t, i) => {
    const ov = overrides[`tenants.${i}.annualRent`]
    const val = ov !== undefined ? ov : (t.annualRent?.value ?? 0)
    return sum + (val ?? 0)
  }, 0)

  const otherMiscRent   = v(data.income?.otherMiscRent?.annualTotal,      'income.otherMiscRent.annualTotal')
  const recoverablePT   = v(data.income?.recoverableRent?.propertyTax,    'income.recoverableRent.propertyTax')
  const recoverableUtil = v(data.income?.recoverableRent?.utilities,       'income.recoverableRent.utilities')
  const recoverableOth  = v(data.income?.recoverableRent?.allOther,        'income.recoverableRent.allOther')

  const grossRent = totalBaseRent + otherMiscRent + recoverablePT + recoverableUtil + recoverableOth

  const vacancyPct    = v(data.income?.vacancyAllowancePct, 'income.vacancyAllowancePct')
  const vacancyAmount = grossRent * vacancyPct
  const egi           = grossRent - vacancyAmount

  const propTaxes      = v(data.expenses?.propertyTaxes,            'expenses.propertyTaxes')
  const utilities      = v(data.expenses?.utilities,                 'expenses.utilities')
  const otherRecov     = v(data.expenses?.otherRecoverableExpenses,  'expenses.otherRecoverableExpenses')
  const mgmtFee        = v(data.expenses?.managementFee,             'expenses.managementFee')
  const structReserve  = v(data.expenses?.structuralReserve,         'expenses.structuralReserve')

  const totalOpEx = propTaxes + utilities + otherRecov + mgmtFee + structReserve
  const noi       = egi - totalOpEx

  const capRate      = v(data.capRate, 'capRate', null)
  const impliedValue = capRate > 0 ? noi / capRate : null

  const ti      = v(data.deductions?.tenantInducements, 'deductions.tenantInducements')
  const lcs     = v(data.deductions?.lcs,               'deductions.lcs')
  const noiLoss = v(data.deductions?.noiLoss,            'deductions.noiLoss')
  const capEx   = v(data.deductions?.requiredCapEx,      'deductions.requiredCapEx')

  const totalDeductions  = ti + lcs + noiLoss + capEx
  const valueConclusion  = impliedValue != null ? impliedValue - totalDeductions : null
  const purchasePrice    = v(data.acquisition?.purchasePrice, 'acquisition.purchasePrice', null)

  return {
    totalBaseRent, otherMiscRent, recoverablePT, recoverableUtil, recoverableOth,
    grossRent, vacancyPct, vacancyAmount, egi,
    propTaxes, utilities, otherRecov, mgmtFee, structReserve, totalOpEx, noi,
    capRate, impliedValue, ti, lcs, noiLoss, capEx, totalDeductions, valueConclusion, purchasePrice,
  }
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function Src({ source, overridden }) {
  if (!source) return <span className="text-[11px] text-[#dddddd]">not found</span>
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded-sm font-medium whitespace-nowrap ${
      overridden ? 'bg-accent/15 text-accent' : 'bg-surface text-[#aaaaaa]'
    }`}>
      {source}
    </span>
  )
}

// ─── Inline-editable waterfall row ───────────────────────────────────────────

function Row({ label, extracted, overrideKey, type = 'currency', indent = false, dimLabel = false, onUpload = null, uploading = false }) {
  const { state: { userOverrides }, setOverride } = useIPP()
  const overridden = userOverrides[overrideKey] !== undefined
  const value  = overridden ? userOverrides[overrideKey] : (extracted?.value ?? null)
  const source = overridden ? 'Manual entry' : (extracted?.source ?? null)

  const [editing, setEditing] = useState(false)
  const [input,   setInput]   = useState('')

  function startEdit() { setInput(value != null ? String(type === 'pct' ? (value * 100) : value) : ''); setEditing(true) }
  function cancel()    { setEditing(false) }
  function save() {
    const raw = input.replace(/[$,%\s]/g, '')
    const n   = parseFloat(raw)
    if (!isNaN(n)) setOverride(overrideKey, type === 'pct' ? n / 100 : n)
    setEditing(false)
  }

  const display = type === 'pct' ? PCT(value) : type === 'text' ? value : type === 'number' ? (value != null ? Number(value).toLocaleString('en-CA') : null) : CAD(value)

  return (
    <tr className="group/row border-b border-border last:border-0 hover:bg-[#fafafa] transition-colors">
      <td className={`py-2 pr-3 text-sm ${indent ? 'pl-10' : 'pl-5'} ${dimLabel ? 'text-[#888888]' : 'text-[#333333]'} w-[42%]`}>
        <span className="flex items-center gap-2">
          {label}
          {uploading && <span className="text-[10px] text-accent animate-pulse">Extracting…</span>}
        </span>
      </td>
      <td className="py-2 pr-4 text-right text-sm tabular-nums w-[30%]">
        {editing ? (
          <span className="inline-flex items-center gap-1.5 justify-end">
            <input
              autoFocus
              type="number"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
              className="w-32 border border-primary/50 rounded-sm px-2 py-0.5 text-right text-sm text-primary bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <button onClick={save}   className="text-[11px] font-semibold text-accent">Save</button>
            <button onClick={cancel} className="text-[11px] text-[#cccccc]">✕</button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 justify-end">
            <span className={value == null ? 'text-[#cccccc]' : overridden ? 'text-accent font-medium' : 'text-primary'}>
              {display ?? '—'}
            </span>
            <span className="opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center gap-2">
              <button
                onClick={startEdit}
                className="text-[10px] text-[#aaaaaa] hover:text-accent flex items-center gap-0.5"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
              {onUpload && (
                <button
                  onClick={onUpload}
                  disabled={uploading}
                  className="text-[10px] text-[#aaaaaa] hover:text-accent flex items-center gap-0.5 border-l border-border pl-2"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload doc
                </button>
              )}
            </span>
          </span>
        )}
      </td>
      <td className="py-2 pr-5 text-right w-[28%]">
        <Src source={source} overridden={overridden} />
      </td>
    </tr>
  )
}

// ─── Non-editable calculated row ─────────────────────────────────────────────

function CalcRow({ label, value, type = 'currency', highlight = false, topBorder = false }) {
  const display = type === 'pct' ? PCT(value) : CAD(value)
  return (
    <tr className={`border-b border-border last:border-0 ${topBorder ? 'border-t-2 border-t-border' : ''} ${highlight ? 'bg-primary/[0.04]' : ''}`}>
      <td className={`py-2.5 pl-5 pr-3 text-sm font-bold text-primary ${highlight ? 'text-primary' : ''}`}>{label}</td>
      <td className={`py-2.5 pr-4 text-right text-sm font-bold tabular-nums ${value == null ? 'text-[#cccccc]' : 'text-primary'}`}>
        {value != null ? display : '—'}
      </td>
      <td className="py-2.5 pr-5" />
    </tr>
  )
}

// ─── Section header row ───────────────────────────────────────────────────────

function SectionHead({ label }) {
  return (
    <tr className="bg-[#f8f8f8] border-b border-border">
      <td colSpan={3} className="py-1.5 pl-5 text-[10px] font-bold text-[#888888] uppercase tracking-[0.12em]">{label}</td>
    </tr>
  )
}

// ─── Collapsible panel ────────────────────────────────────────────────────────

function Collapsible({ title, defaultOpen = false, badge, children }) {
  const [open, setOpen]   = useState(defaultOpen)
  const bodyRef           = useRef(null)
  const [height, setHeight] = useState(defaultOpen ? 'auto' : '0px')

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (open) {
      const h = el.scrollHeight
      setHeight(`${h}px`)
      const t = setTimeout(() => setHeight('auto'), 280)
      return () => clearTimeout(t)
    } else {
      setHeight(`${bodyRef.current.scrollHeight}px`)
      requestAnimationFrame(() => requestAnimationFrame(() => setHeight('0px')))
    }
  }, [open])

  return (
    <div className="bg-white border border-border rounded-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 bg-primary/[0.03] hover:bg-primary/[0.06] transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">{title}</span>
          {badge && <span className="text-[11px] text-[#aaaaaa] font-medium">{badge}</span>}
        </div>
        <svg className={`w-4 h-4 text-[#aaaaaa] transition-transform duration-280 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div ref={bodyRef} style={{ height, overflow: 'hidden', transition: 'height 280ms ease' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Tenant row ───────────────────────────────────────────────────────────────

const TENANT_FIELDS = ['tenant', 'area', 'rate', 'annualRent', 'leaseStart', 'leaseEnd', 'renewalOption']
const TENANT_NUMERIC = new Set(['area', 'rate', 'annualRent', 'tiAmount', 'lcAmount'])

function TenantCell({ tenant, idx, field, onSave }) {
  const { state: { userOverrides } } = useIPP()
  const key      = `tenants.${idx}.${field}`
  const overridden = userOverrides[key] !== undefined
  const value    = overridden ? userOverrides[key] : (tenant[field]?.value ?? null)

  const [editing, setEditing] = useState(false)
  const [input,   setInput]   = useState('')

  function startEdit() { setInput(value != null ? String(value) : ''); setEditing(true) }
  function save() {
    if (input.trim() === '') { setEditing(false); return }
    const v = TENANT_NUMERIC.has(field) ? parseFloat(input) : input.trim()
    if (!isNaN(v) || !TENANT_NUMERIC.has(field)) onSave(idx, field, v)
    setEditing(false)
  }

  function display() {
    if (value == null) return <span className="text-[#cccccc]">—</span>
    if (field === 'area')       return <span>{Number(value).toLocaleString()} sf</span>
    if (field === 'rate')       return <span>${Number(value).toFixed(2)}</span>
    if (field === 'annualRent') return <span>{CAD(value)}</span>
    return <span>{value}</span>
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus type={TENANT_NUMERIC.has(field) ? 'number' : 'text'} value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="w-24 border border-primary/50 rounded-sm px-1.5 py-0.5 text-xs text-primary bg-white focus:outline-none"
        />
        <button onClick={save}              className="text-[10px] font-semibold text-accent">✓</button>
        <button onClick={() => setEditing(false)} className="text-[10px] text-[#cccccc]">✕</button>
      </div>
    )
  }

  return (
    <button onClick={startEdit} className="group/cell text-left w-full flex items-center gap-1">
      <span className={overridden ? 'text-accent font-medium' : ''}>{display()}</span>
      <span className="opacity-0 group-hover/cell:opacity-100 transition-opacity text-[9px] text-accent">✎</span>
    </button>
  )
}

function TenantRow({ tenant, idx, onSave, onUploadLease, uploadingIdx, isLast }) {
  const [expanded, setExpanded] = useState(false)
  const { state: { userOverrides } } = useIPP()

  const hasExtra = ['rentSteps', 'tiAmount', 'lcAmount', 'notes'].some(f => {
    const ov = userOverrides[`tenants.${idx}.${f}`]
    return (ov !== undefined && ov !== null) || (tenant[f]?.value != null)
  })

  function getExtra(field) {
    const ov = userOverrides[`tenants.${idx}.${field}`]
    return ov !== undefined ? ov : (tenant[field]?.value ?? null)
  }

  const source = TENANT_FIELDS.map(f => tenant[f]?.source).find(Boolean)
  const isUploading = uploadingIdx === idx

  return (
    <>
      <tr className={`group/trow hover:bg-[#fafafa] transition-colors ${!isLast || expanded ? 'border-b border-border' : ''}`}>
        {TENANT_FIELDS.map((field) => (
          <td key={field} className="py-2 px-3 text-sm">
            <TenantCell tenant={tenant} idx={idx} field={field} onSave={onSave} />
          </td>
        ))}

        {/* Annual Rent column already included in TENANT_FIELDS */}

        <td className="py-2 px-3 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-2">
            {hasExtra && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-[10px] text-[#aaaaaa] hover:text-primary transition-colors"
                title="Show TI / LC / Rent Steps"
              >
                {expanded ? '▲ less' : '▼ more'}
              </button>
            )}
            <button
              onClick={() => onUploadLease(idx)}
              disabled={isUploading}
              className={`opacity-0 group-hover/trow:opacity-100 transition-opacity flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-sm border transition-colors ${
                isUploading
                  ? 'border-accent/30 text-accent animate-pulse opacity-100'
                  : 'border-border text-[#aaaaaa] hover:border-accent hover:text-accent'
              }`}
            >
              {isUploading ? (
                <>
                  <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Extracting…
                </>
              ) : (
                <>
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Lease
                </>
              )}
            </button>
            {source && <span className="text-[10px] bg-surface text-[#aaaaaa] px-1.5 py-0.5 rounded-sm">{source}</span>}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className={`bg-surface/50 ${!isLast ? 'border-b border-border' : ''}`}>
          <td colSpan={8} className="px-5 py-3">
            <div className="flex items-start gap-8 text-xs text-[#555555] mb-2.5">
              <div>
                <span className="text-[10px] font-semibold text-[#aaaaaa] uppercase tracking-wide block mb-0.5">TI Amount</span>
                <span className="text-primary font-medium">{getExtra('tiAmount') != null ? CAD(getExtra('tiAmount')) : '—'}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-[#aaaaaa] uppercase tracking-wide block mb-0.5">LC Amount</span>
                <span className="text-primary font-medium">{getExtra('lcAmount') != null ? CAD(getExtra('lcAmount')) : '—'}</span>
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-semibold text-[#aaaaaa] uppercase tracking-wide block mb-0.5">Rent Steps / Escalations</span>
                <span className="text-primary">{getExtra('rentSteps') ?? '—'}</span>
              </div>
            </div>
            {getExtra('notes') && (
              <div className="border-t border-border/60 pt-2.5">
                <span className="text-[10px] font-semibold text-[#aaaaaa] uppercase tracking-wide block mb-1">
                  Lease Notes <span className="normal-case font-normal text-[#bbbbbb]">· extracted from lease</span>
                </span>
                <p className="text-xs text-[#444444] leading-relaxed whitespace-pre-line">{getExtra('notes')}</p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Rent Roll ────────────────────────────────────────────────────────────────

function RentRoll({ tenants, onSave }) {
  const COLLAPSE_THRESHOLD = 5
  const [open, setOpen]     = useState(tenants.length <= COLLAPSE_THRESHOLD)
  const [uploadingIdx,    setUploadingIdx]    = useState(null)  // per-row lease upload
  const [uploadingHeader, setUploadingHeader] = useState(false) // full rent roll upload
  const [uploadError,  setUploadError]  = useState(null)
  const fileInputRef       = useRef(null) // per-row lease upload
  const rrFileInputRef     = useRef(null) // header rent roll upload
  const pendingIdxRef = useRef(null)
  const bodyRef      = useRef(null)
  const [height, setHeight] = useState(open ? 'auto' : '0px')
  const { state: { userOverrides }, setOverride, setTenants } = useIPP()

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (open) {
      const h = el.scrollHeight
      setHeight(`${h}px`)
      const t = setTimeout(() => setHeight('auto'), 280)
      return () => clearTimeout(t)
    } else {
      setHeight(`${bodyRef.current.scrollHeight}px`)
      requestAnimationFrame(() => requestAnimationFrame(() => setHeight('0px')))
    }
  }, [open])

  function handleUploadLease(idx) {
    pendingIdxRef.current = idx
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  async function handleFileSelected(e) {
    const file = e.target.files[0]
    const idx  = pendingIdxRef.current
    if (!file || idx == null) return
    setUploadingIdx(idx)
    setUploadError(null)
    try {
      const extracted = await extractTenantLease(file)
      const fields = ['tenant', 'area', 'rate', 'annualRent', 'leaseStart', 'leaseEnd', 'renewalOption', 'rentSteps', 'tiAmount', 'lcAmount', 'notes']
      fields.forEach(field => {
        if (extracted[field]?.value != null) {
          setOverride(`tenants.${idx}.${field}`, extracted[field].value)
        }
      })
    } catch (err) {
      setUploadError(`Row ${idx + 1}: ${err.message}`)
    } finally {
      setUploadingIdx(null)
      pendingIdxRef.current = null
    }
  }

  async function handleRentRollFileSelected(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingHeader(true)
    setUploadError(null)
    try {
      const { tenants: extracted } = await extractRentRollDocument(file)
      setTenants(extracted)
      setOpen(true)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploadingHeader(false)
    }
  }

  // Total annual rent
  const totalAnnualRent = tenants.reduce((sum, t, i) => {
    const ov = userOverrides[`tenants.${i}.annualRent`]
    const v  = ov !== undefined ? ov : (t.annualRent?.value ?? null)
    return v != null ? sum + v : sum
  }, 0)

  const hasAllRents = tenants.every((t, i) => {
    const ov = userOverrides[`tenants.${i}.annualRent`]
    return (ov !== undefined ? ov : t.annualRent?.value) != null
  })

  const totalSf = tenants.reduce((sum, t, i) => {
    const ov = userOverrides[`tenants.${i}.area`]
    const v  = ov !== undefined ? ov : (t.area?.value ?? null)
    return v != null ? sum + v : sum
  }, 0)

  const HEADERS = ['Tenant', 'Area (sf)', 'Rate (psf/yr)', 'Annual Rent', 'Lease Start', 'Lease End', 'Renewal Option', '']

  return (
    <div className="bg-white border border-border rounded-sm overflow-hidden">
      <input ref={fileInputRef}   type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileSelected} />
      <input ref={rrFileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleRentRollFileSelected} />

      <div className="flex items-center justify-between px-5 py-3 bg-primary/[0.03] border-b border-border">
        {/* Left: toggle + summary */}
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-3 hover:opacity-75 transition-opacity text-left"
        >
          <span className="text-xs font-bold text-primary uppercase tracking-widest">Rent Roll</span>
          <span className="text-[11px] text-[#aaaaaa] font-medium">
            {tenants.length} tenant{tenants.length !== 1 ? 's' : ''}
            {totalSf > 0 && ` · ${NUM(totalSf)} sf`}
            {totalAnnualRent > 0 && ` · ${CAD(totalAnnualRent)}/yr`}
            {!hasAllRents && tenants.length > 0 && <span className="text-warning"> · some rents missing</span>}
          </span>
        </button>

        {/* Right: upload + collapse toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { rrFileInputRef.current.value = ''; rrFileInputRef.current.click() }}
            disabled={uploadingHeader}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-sm border transition-colors ${
              uploadingHeader
                ? 'border-accent/30 text-accent animate-pulse cursor-wait'
                : 'border-border text-[#777777] hover:border-primary hover:text-primary'
            }`}
          >
            {uploadingHeader ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Extracting…
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Rent Roll
              </>
            )}
          </button>
          <span className="text-[10px] text-[#cccccc]">|</span>
          <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 text-[11px] text-[#aaaaaa] hover:text-primary transition-colors">
            {open ? 'Collapse' : 'Expand'}
            <svg className={`w-3.5 h-3.5 transition-transform duration-280 ${open ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      <div ref={bodyRef} style={{ height, overflow: 'hidden', transition: 'height 280ms ease' }}>
        {uploadError && (
          <div className="mx-5 mt-3 px-3 py-2 bg-error/10 border border-error/20 rounded-sm text-xs text-error">
            {uploadError}
          </div>
        )}

        {tenants.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[#aaaaaa]">No tenants extracted from documents.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface">
                  {HEADERS.map((h) => (
                    <th key={h} className="py-2 px-3 text-left text-[10px] font-semibold text-[#888888] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant, idx) => (
                  <TenantRow
                    key={idx}
                    tenant={tenant}
                    idx={idx}
                    onSave={onSave}
                    onUploadLease={handleUploadLease}
                    uploadingIdx={uploadingIdx}
                    isLast={idx === tenants.length - 1}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-primary/[0.04]">
                  <td className="py-2.5 px-3 text-xs font-bold text-primary" colSpan={3}>Total</td>
                  <td className="py-2.5 px-3 text-sm font-bold text-primary tabular-nums">
                    {totalAnnualRent > 0 ? CAD(totalAnnualRent) : '—'}
                    {!hasAllRents && totalAnnualRent > 0 && <span className="ml-1 text-[10px] text-warning font-normal">partial</span>}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Secondary collapsible sections ──────────────────────────────────────────

function AcquisitionSection({ acquisition, save }) {
  const rows = [
    { label: 'Purchase Price',          field: 'purchasePrice' },
    { label: 'Land Cost',               field: 'landCost' },
    { label: 'Appraisal Surplus',       field: 'appraisalSurplus' },
    { label: 'Land Value',              field: 'landValue' },
    { label: 'DCs and Levies',          field: 'dcsAndLevies' },
    { label: 'Hard Costs',              field: 'hardCosts' },
    { label: 'Contingency',             field: 'contingency' },
    { label: 'Soft Costs',              field: 'softCosts' },
    { label: 'Dev. Management Fee',     field: 'devManagementFee' },
    { label: 'Financing Costs',         field: 'financingCosts' },
    { label: 'Total Budget',            field: 'totalBudget' },
    { label: 'Total KingSett Exposure', field: 'totalKingsettExposure' },
    { label: 'Sub Debt Amount',         field: 'subDebtAmount' },
  ]
  return (
    <table className="w-full">
      <tbody>
        {rows.map(({ label, field, type = 'currency' }, i, arr) => (
          <Row
            key={field}
            label={label}
            extracted={acquisition?.[field]}
            overrideKey={`acquisition.${field}`}
            type={type}
          />
        ))}
      </tbody>
    </table>
  )
}

function UsesSection({ usesOfFunds }) {
  const rows = [
    { label: 'Payout Existing Debt', field: 'payoutExistingDebt' },
    { label: 'Purchase Price',       field: 'purchasePrice' },
    { label: 'Closing Costs',        field: 'closingCosts' },
    { label: 'Equity Takeout',       field: 'equityTakeout' },
  ]
  return (
    <table className="w-full">
      <tbody>
        {rows.map(({ label, field }) => (
          <Row key={field} label={label} extracted={usesOfFunds?.[field]} overrideKey={`usesOfFunds.${field}`} />
        ))}
      </tbody>
    </table>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const EXPENSE_FIELD_DESCRIPTIONS = {
  'expenses.propertyTaxes':            'annual property tax amount in CAD',
  'expenses.utilities':                'annual utilities expense in CAD',
  'expenses.otherRecoverableExpenses': 'annual other recoverable expenses in CAD',
  'expenses.managementFee':            'annual property management fee in CAD',
  'expenses.structuralReserve':        'annual structural reserve or capital reserve amount in CAD',
}

function PropertyDetailsSection({ propertyInfo }) {
  const rows = [
    { label: 'Address',     field: 'propertyInfo.address',   type: 'text' },
    { label: 'Site Area (acres)', field: 'propertyInfo.siteArea', type: 'number' },
    { label: 'Year Built',  field: 'propertyInfo.yearBuilt',  type: 'number' },
    { label: 'Stories',     field: 'propertyInfo.stories',    type: 'number' },
    { label: 'Buildings',   field: 'propertyInfo.buildings',  type: 'number' },
    { label: 'Parking Stalls', field: 'propertyInfo.parking', type: 'number' },
  ]
  return (
    <table className="w-full">
      <tbody>
        {rows.map(({ label, field, type }) => (
          <Row key={field} label={label} extracted={propertyInfo?.[field.split('.')[1]]} overrideKey={field} type={type} />
        ))}
      </tbody>
    </table>
  )
}

function DealSummarySection({ extractedData }) {
  const [status,  setStatus]  = useState('idle') // idle | loading | done | error
  const [summary, setSummary] = useState(null)
  const [error,   setError]   = useState(null)

  async function generate() {
    setStatus('loading')
    setError(null)
    try {
      const result = await generateDealSummary(extractedData)
      setSummary(result)
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  return (
    <div className="bg-white border border-border rounded-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-primary/[0.03] border-b border-border">
        <div>
          <h3 className="text-xs font-bold text-primary uppercase tracking-widest">Deal Summary &amp; Key Risks</h3>
          {status === 'idle' && <p className="text-[11px] text-[#aaaaaa] mt-0.5">AI-generated analysis based on extracted data</p>}
        </div>
        {status !== 'done' && (
          <button
            onClick={generate}
            disabled={status === 'loading'}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-sm border transition-colors ${
              status === 'loading'
                ? 'border-accent/30 text-accent animate-pulse cursor-wait'
                : 'border-primary/30 text-primary hover:bg-primary hover:text-white'
            }`}
          >
            {status === 'loading' ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {status === 'error' ? 'Retry' : 'Generate Summary'}
              </>
            )}
          </button>
        )}
        {status === 'done' && (
          <button onClick={generate} className="text-[11px] text-[#aaaaaa] hover:text-primary transition-colors">
            Regenerate
          </button>
        )}
      </div>

      {status === 'idle' && (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-[#aaaaaa]">Click "Generate Summary" to produce an AI deal overview and risk analysis.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="px-5 py-4">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {status === 'done' && summary && (
        <div className="px-5 py-4 space-y-5">
          {/* Overview */}
          {summary.overview && (
            <div>
              <p className="text-[10px] font-semibold text-[#aaaaaa] uppercase tracking-wide mb-1.5">Overview</p>
              <p className="text-sm text-[#333333] leading-relaxed">{summary.overview}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-5">
            {/* Key Metrics */}
            {summary.keyMetrics?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#aaaaaa] uppercase tracking-wide mb-2">Key Metrics</p>
                <ul className="space-y-1.5">
                  {summary.keyMetrics.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#333333]">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-primary/40 flex-shrink-0" />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key Risks */}
            {summary.keyRisks?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#aaaaaa] uppercase tracking-wide mb-2">Key Risks</p>
                <ul className="space-y-1.5">
                  {summary.keyRisks.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#444444]">
                      <span className="mt-1 text-[#cc5555] flex-shrink-0">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                      </span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Step2Review({ onBack }) {
  const { state: { extractedData, userOverrides }, setOverride, reset } = useIPP()
  const [uploadingExpense, setUploadingExpense] = useState(null)
  const [exporting,        setExporting]        = useState(false)
  const [exportError,      setExportError]      = useState(null)
  const expenseFileInputRef = useRef(null)
  const pendingExpenseKey   = useRef(null)

  if (!extractedData) return null

  const { propertyInfo, income, expenses, capRate, deductions, acquisition, usesOfFunds, tenants = [] } = extractedData
  const c = calcNOI(extractedData, userOverrides)

  function save(key) { return (val) => setOverride(key, val) }
  function saveTenant(idx, field, val) { setOverride(`tenants.${idx}.${field}`, val) }

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const blob = await exportIppExcel(extractedData, userOverrides)
      const addr = userOverrides['propertyInfo.address'] ?? extractedData?.propertyInfo?.address?.value ?? 'Property'
      const filename = `IPP - ${addr}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err.message)
    } finally {
      setExporting(false)
    }
  }

  function triggerExpenseUpload(overrideKey) {
    pendingExpenseKey.current = overrideKey
    expenseFileInputRef.current.value = ''
    expenseFileInputRef.current.click()
  }

  async function handleExpenseFileSelected(e) {
    const file = e.target.files[0]
    const key  = pendingExpenseKey.current
    if (!file || !key) return
    setUploadingExpense(key)
    try {
      const result = await extractExpenseField(file, EXPENSE_FIELD_DESCRIPTIONS[key])
      if (result.value != null) setOverride(key, result.value)
    } catch (err) {
      console.error('Expense field extraction failed:', err.message)
    } finally {
      setUploadingExpense(null)
      pendingExpenseKey.current = null
    }
  }

  const address = userOverrides['propertyInfo.address'] ?? propertyInfo?.address?.value ?? null

  return (
    <div className="space-y-4">
      <input ref={expenseFileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleExpenseFileSelected} />

      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">Step 2</span>
          <h2 className="text-2xl font-bold text-primary mt-0.5">Review Extracted Data</h2>
          <p className="text-[#777777] mt-1 text-sm">
            {address || 'Address not extracted'} · hover any row to edit inline
          </p>
        </div>
        <button onClick={() => { reset(); onBack() }}
          className="mt-1 text-sm text-[#999999] hover:text-primary transition-colors flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Start Over
        </button>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-5 text-[11px] text-[#aaaaaa]">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-surface border border-border inline-block" />Extracted</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent/30 inline-block" />Manual override</span>
        <span className="flex items-center gap-1.5"><span className="text-[#dddddd] font-bold">—</span>Not found</span>
      </div>

      {/* ── Property Details ── */}
      <Collapsible title="Property Details">
        <PropertyDetailsSection propertyInfo={propertyInfo} />
      </Collapsible>

      {/* ── NOI Waterfall ── */}
      <div className="bg-white border border-border rounded-sm overflow-hidden">
        <div className="bg-primary px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white font-bold text-base">Income Producing Property — NOI Summary</p>
              <p className="text-white/50 text-xs mt-0.5">{address || 'Property address not specified'}</p>
            </div>
            <div className="text-right text-xs text-white/50">
              <p>Conventional Underwriting</p>
              <p className="mt-0.5">{new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
            </div>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="py-1.5 pl-5 text-left text-[10px] font-semibold text-[#aaaaaa] uppercase tracking-wide w-[42%]">Item</th>
              <th className="py-1.5 pr-4 text-right text-[10px] font-semibold text-[#aaaaaa] uppercase tracking-wide w-[30%]">Amount (Annual)</th>
              <th className="py-1.5 pr-5 text-right text-[10px] font-semibold text-[#aaaaaa] uppercase tracking-wide w-[28%]">Source</th>
            </tr>
          </thead>
          <tbody>
            {/* ── Income ── */}
            <SectionHead label="Income" />
            <CalcRow label="Total Base Rent" value={c.totalBaseRent || null} />
            <Row label="(+) Other Misc. Rent"              extracted={income?.otherMiscRent?.annualTotal}     overrideKey="income.otherMiscRent.annualTotal"    indent />
            <Row label="(+) Recoverable Rent — Prop. Tax"  extracted={income?.recoverableRent?.propertyTax}   overrideKey="income.recoverableRent.propertyTax"  indent />
            <Row label="(+) Recoverable Rent — Utilities"  extracted={income?.recoverableRent?.utilities}     overrideKey="income.recoverableRent.utilities"    indent />
            <Row label="(+) Recoverable Rent — All Other"  extracted={income?.recoverableRent?.allOther}      overrideKey="income.recoverableRent.allOther"     indent />
            <CalcRow label="Gross Rent" value={c.grossRent || null} highlight topBorder />
            <Row
              label={`Less: Vacancy Allowance${c.vacancyPct > 0 ? ` (${PCT(c.vacancyPct)})` : ''}`}
              extracted={income?.vacancyAllowancePct}
              overrideKey="income.vacancyAllowancePct"
              type="pct"
              indent
              dimLabel
            />
            <CalcRow label="Effective Gross Rent" value={c.egi || null} highlight topBorder />

            {/* ── Expenses ── */}
            <SectionHead label="Operating Expenses" />
            <Row label="(-) Property Taxes"             extracted={expenses?.propertyTaxes}            overrideKey="expenses.propertyTaxes"            indent onUpload={() => triggerExpenseUpload('expenses.propertyTaxes')}            uploading={uploadingExpense === 'expenses.propertyTaxes'} />
            <Row label="(-) Utilities"                  extracted={expenses?.utilities}                overrideKey="expenses.utilities"                indent onUpload={() => triggerExpenseUpload('expenses.utilities')}                uploading={uploadingExpense === 'expenses.utilities'} />
            <Row label="(-) Other Recoverable Expenses" extracted={expenses?.otherRecoverableExpenses} overrideKey="expenses.otherRecoverableExpenses"  indent onUpload={() => triggerExpenseUpload('expenses.otherRecoverableExpenses')} uploading={uploadingExpense === 'expenses.otherRecoverableExpenses'} />
            <Row label="(-) Management Fee"             extracted={expenses?.managementFee}            overrideKey="expenses.managementFee"            indent onUpload={() => triggerExpenseUpload('expenses.managementFee')}            uploading={uploadingExpense === 'expenses.managementFee'} />
            <Row label="(-) Structural Reserve"         extracted={expenses?.structuralReserve}        overrideKey="expenses.structuralReserve"         indent onUpload={() => triggerExpenseUpload('expenses.structuralReserve')}         uploading={uploadingExpense === 'expenses.structuralReserve'} />
            <CalcRow label="Total Operating Expenses" value={c.totalOpEx || null} topBorder />

            {/* ── NOI ── */}
            <tr className="bg-accent/10 border-t-2 border-accent/30">
              <td className="py-3 pl-5 text-sm font-bold text-primary">Net Operating Income</td>
              <td className="py-3 pr-4 text-right text-sm font-bold text-primary tabular-nums">
                {c.noi > 0 ? CAD(c.noi) : '—'}
              </td>
              <td className="py-3 pr-5" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Valuation Summary ── */}
      <div className="bg-white border border-border rounded-sm overflow-hidden">
        <div className="px-5 py-3 bg-primary/[0.04] border-b border-border">
          <h3 className="text-xs font-bold text-primary uppercase tracking-widest">Valuation Summary</h3>
        </div>
        <table className="w-full">
          <tbody>
            <CalcRow label={`Implied Value (NOI ÷ ${c.capRate > 0 ? PCT(c.capRate) : '? '})`} value={c.impliedValue} />
            <Row label="Cap Rate" extracted={capRate} overrideKey="capRate" type="pct" indent dimLabel />
            <SectionHead label="Less: Deductions" />
            <Row label="Less: Tenant Inducements" extracted={deductions?.tenantInducements} overrideKey="deductions.tenantInducements" indent />
            <Row label="Less: LC's"               extracted={deductions?.lcs}               overrideKey="deductions.lcs"               indent />
            <Row label="Less: NOI Loss"           extracted={deductions?.noiLoss}           overrideKey="deductions.noiLoss"           indent />
            <Row label="Less: Required Cap Ex"    extracted={deductions?.requiredCapEx}     overrideKey="deductions.requiredCapEx"     indent />

            {/* Value Conclusion */}
            <tr className="bg-accent/10 border-t-2 border-accent/30">
              <td className="py-3 pl-5 text-sm font-bold text-primary">Value Conclusion</td>
              <td className="py-3 pr-4 text-right text-sm font-bold text-primary tabular-nums">
                {c.valueConclusion != null ? CAD(c.valueConclusion) : '—'}
              </td>
              <td className="py-3 pr-5" />
            </tr>

            <SectionHead label="Reference" />
            <Row label="Purchase Price" extracted={acquisition?.purchasePrice} overrideKey="acquisition.purchasePrice" />
          </tbody>
        </table>
      </div>

      {/* ── Rent Roll ── */}
      <RentRoll tenants={tenants} onSave={saveTenant} />

      {/* ── Secondary: Acquisition + Uses ── */}
      <div className="grid grid-cols-2 gap-4">
        <Collapsible title="Acquisition &amp; Cost Stack">
          <AcquisitionSection acquisition={acquisition} save={save} />
        </Collapsible>
        <Collapsible title="Uses of Funds">
          <UsesSection usesOfFunds={usesOfFunds} />
        </Collapsible>
      </div>

      {/* ── Deal Summary & Key Risks ── */}
      <DealSummarySection extractedData={extractedData} />

      {/* ── Export to Excel ── */}
      <div className="bg-white border border-border rounded-sm px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Export to Excel</p>
          <p className="text-[11px] text-[#aaaaaa] mt-0.5">Populates the IPP underwriting template with all inputs above</p>
          {exportError && <p className="text-[11px] text-error mt-1">{exportError}</p>}
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className={`flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-semibold transition-colors ${
            exporting
              ? 'bg-primary/40 text-white cursor-wait'
              : 'bg-primary text-white hover:bg-primary/85'
          }`}
        >
          {exporting ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Exporting…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Excel
            </>
          )}
        </button>
      </div>

    </div>
  )
}
