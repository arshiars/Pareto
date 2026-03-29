import { useState, useEffect } from 'react'
import { fetchTripleCProject, deleteTripleCProject } from '../services/api.js'

function fmt(n) {
  if (n == null || n === 0) return '—'
  return '$' + Number(n).toLocaleString('en-CA', { maximumFractionDigits: 0 })
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}
function perSqft(cost, gfa) {
  if (!cost || !gfa) return '—'
  return '$' + (cost / gfa).toFixed(0) + '/sf'
}
function perUnit(cost, units) {
  if (!cost || !units) return '—'
  return '$' + Math.round(cost / units).toLocaleString('en-CA') + '/unit'
}
function pct(part, total) {
  if (!part || !total) return '—'
  return (part / total * 100).toFixed(1) + '%'
}

const STATUS_COLORS = {
  'Achieved':    'bg-green-50 text-green-700',
  'On Schedule': 'bg-blue-50 text-blue-700',
  'Pending':     'bg-yellow-50 text-yellow-700',
  'Delayed':     'bg-red-50 text-red-700',
}

const TYPE_LABELS = {
  condo: 'Condo', rental: 'Rental', 'mixed-use': 'Mixed-Use',
  commercial: 'Commercial', industrial: 'Industrial', other: 'Other',
}

function DivisionRow({ division, hardCostTotal, gfa, units }) {
  const [open, setOpen] = useState(false)
  const lineItems = division.qs_line_items ?? []
  const amount = Number(division.budget_amount ?? 0)

  return (
    <>
      <tr
        onClick={() => lineItems.length > 0 && setOpen((o) => !o)}
        className={`border-b border-border transition-colors ${lineItems.length > 0 ? 'cursor-pointer hover:bg-surface' : ''}`}
      >
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            {lineItems.length > 0 && (
              <svg className={`w-3 h-3 text-[#aaaaaa] transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            )}
            <span className="text-[#777777] text-xs font-mono w-5">{division.division_number <= 16 ? String(division.division_number).padStart(2, '0') : ''}</span>
            <span className="text-primary text-sm font-medium">{division.division_name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-primary font-semibold tabular-nums text-sm">{fmt(amount)}</td>
        <td className="px-4 py-3 text-right text-[#777777] text-sm tabular-nums">{perSqft(amount, gfa)}</td>
        <td className="px-4 py-3 text-right text-[#777777] text-sm tabular-nums">{perUnit(amount, units)}</td>
        <td className="px-5 py-3 text-right text-[#777777] text-sm tabular-nums">{pct(amount, hardCostTotal)}</td>
      </tr>
      {open && lineItems.map((li, idx) => (
        <tr key={idx} className="bg-surface border-b border-border/60">
          <td className="pl-16 pr-5 py-2 text-[#555555] text-sm">{li.description}</td>
          <td className="px-4 py-2 text-right text-[#555555] text-sm tabular-nums">{fmt(li.budget_amount)}</td>
          <td className="px-4 py-2 text-right text-[#777777] text-xs tabular-nums">{perSqft(li.budget_amount, gfa)}</td>
          <td className="px-4 py-2 text-right text-[#777777] text-xs tabular-nums">{perUnit(li.budget_amount, units)}</td>
          <td className="px-5 py-2 text-right text-[#777777] text-xs tabular-nums">{pct(li.budget_amount, hardCostTotal)}</td>
        </tr>
      ))}
    </>
  )
}

export default function TripleCProjectPage({ projectId, onBack, onEdit }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchTripleCProject(projectId)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [projectId])

  async function handleDelete() {
    if (!window.confirm(`Delete "${data?.project?.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteTripleCProject(projectId)
      onBack()
    } catch (err) {
      alert(`Delete failed: ${err.message}`)
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    )
  }

  const { project: p, divisions, milestones } = data
  const hardDivisions = divisions.filter((d) => d.division_number <= 16)
  const feeDivisions = divisions.filter((d) => d.division_number > 16)
  const hardCostTotal = hardDivisions.reduce((s, d) => s + Number(d.budget_amount ?? 0), 0)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-[#777777] hover:text-primary transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-primary text-lg font-bold tracking-tight">{p.name}</h1>
              <p className="text-[#777777] text-xs mt-0.5">
                {[p.address, p.city, p.province].filter(Boolean).join(', ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit && onEdit(projectId)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-[#555555] text-xs font-semibold rounded-sm hover:border-primary hover:text-primary transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-500 text-xs font-semibold rounded-sm hover:border-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-14 w-auto ml-2" />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-8 py-10 space-y-8">

        {/* ── Key metrics ──────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Budget',    value: fmt(p.total_budget) },
            { label: 'Hard Cost',       value: fmt(hardCostTotal) },
            { label: '$/sf (Hard)',     value: perSqft(hardCostTotal, p.gfa_sqft) },
            { label: '$/unit (Hard)',   value: perUnit(hardCostTotal, p.units) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-border rounded-sm px-5 py-4">
              <p className="text-[#777777] text-xs font-semibold uppercase tracking-wider mb-1">{label}</p>
              <p className="text-primary text-xl font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </section>

        {/* ── Project info ─────────────────────────────────────────────────── */}
        <section className="bg-white border border-border rounded-sm p-6">
          <h3 className="text-primary font-bold text-sm uppercase tracking-wider mb-5">Project Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4">
            {[
              { label: 'Type',          value: TYPE_LABELS[p.project_type] ?? p.project_type },
              { label: 'GFA',           value: p.gfa_sqft ? Number(p.gfa_sqft).toLocaleString('en-CA') + ' sf' : '—' },
              { label: 'Units',         value: p.units ?? '—' },
              { label: 'Storeys',       value: p.storeys ?? '—' },
              { label: 'QS Firm',       value: p.qs_firm ?? '—' },
              { label: 'Report #',      value: p.report_number ?? '—' },
              { label: 'Report Date',   value: fmtDate(p.report_date) },
              { label: 'Land Cost',     value: fmt(p.land_cost) },
              { label: 'Soft Costs',    value: fmt(p.soft_costs) },
              { label: 'Municipal',     value: fmt(p.municipal_charges) },
              { label: 'Financing',     value: fmt(p.financing_cost) },
              { label: 'Dev. Contingency', value: fmt(p.development_contingency) },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[#777777] text-xs font-semibold uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-primary text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Construction cost breakdown ──────────────────────────────────── */}
        <section className="bg-white border border-border rounded-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-surface">
            <h3 className="text-primary font-bold text-sm uppercase tracking-wider">Construction Cost Breakdown</h3>
            <p className="text-[#777777] text-xs mt-0.5">Click a division to expand line items</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Division</th>
                <th className="text-right px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Budget</th>
                <th className="text-right px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">$/sf</th>
                <th className="text-right px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">$/unit</th>
                <th className="text-right px-5 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">% Hard</th>
              </tr>
            </thead>
            <tbody>
              {hardDivisions.map((div) => (
                <DivisionRow key={div.id} division={div} hardCostTotal={hardCostTotal}
                  gfa={p.gfa_sqft} units={p.units} />
              ))}
              {/* Totals row */}
              <tr className="border-t-2 border-border bg-surface">
                <td className="px-5 py-3 text-primary font-bold text-sm">Total Hard Cost</td>
                <td className="px-4 py-3 text-right text-primary font-bold tabular-nums">{fmt(hardCostTotal)}</td>
                <td className="px-4 py-3 text-right text-primary font-semibold tabular-nums">{perSqft(hardCostTotal, p.gfa_sqft)}</td>
                <td className="px-4 py-3 text-right text-primary font-semibold tabular-nums">{perUnit(hardCostTotal, p.units)}</td>
                <td className="px-5 py-3 text-right text-primary font-bold">100%</td>
              </tr>
            </tbody>
          </table>

          {/* Fees below the division table */}
          {(p.construction_mgmt_fee > 0 || p.construction_contingency > 0 || p.development_mgmt_fee > 0 || feeDivisions.length > 0) && (
            <table className="w-full text-sm border-t-2 border-border">
              <tbody>
                {p.construction_mgmt_fee > 0 && (
                  <tr className="border-b border-border">
                    <td className="px-5 py-3 text-[#555555] text-sm pl-12">Construction Management Fee</td>
                    <td className="px-4 py-3 text-right text-[#555555] font-semibold tabular-nums">{fmt(p.construction_mgmt_fee)}</td>
                    <td className="px-4 py-3 text-right text-[#777777] text-sm tabular-nums">{perSqft(p.construction_mgmt_fee, p.gfa_sqft)}</td>
                    <td className="px-4 py-3 text-right text-[#777777] text-sm tabular-nums">{perUnit(p.construction_mgmt_fee, p.units)}</td>
                    <td className="px-5 py-3 text-right text-[#777777] text-sm tabular-nums">{pct(p.construction_mgmt_fee, hardCostTotal)}</td>
                  </tr>
                )}
                {p.construction_contingency > 0 && (
                  <tr className="border-b border-border">
                    <td className="px-5 py-3 text-[#555555] text-sm pl-12">Construction Contingency</td>
                    <td className="px-4 py-3 text-right text-[#555555] font-semibold tabular-nums">{fmt(p.construction_contingency)}</td>
                    <td className="px-4 py-3 text-right text-[#777777] text-sm tabular-nums">{perSqft(p.construction_contingency, p.gfa_sqft)}</td>
                    <td className="px-4 py-3 text-right text-[#777777] text-sm tabular-nums">{perUnit(p.construction_contingency, p.units)}</td>
                    <td className="px-5 py-3 text-right text-[#777777] text-sm tabular-nums">{pct(p.construction_contingency, hardCostTotal)}</td>
                  </tr>
                )}
                {p.development_mgmt_fee > 0 && (
                  <tr className="border-b border-border">
                    <td className="px-5 py-3 text-[#555555] text-sm pl-12">Development Management Fee</td>
                    <td className="px-4 py-3 text-right text-[#555555] font-semibold tabular-nums">{fmt(p.development_mgmt_fee)}</td>
                    <td className="px-4 py-3 text-right text-[#777777] text-sm tabular-nums">{perSqft(p.development_mgmt_fee, p.gfa_sqft)}</td>
                    <td className="px-4 py-3 text-right text-[#777777] text-sm tabular-nums">{perUnit(p.development_mgmt_fee, p.units)}</td>
                    <td className="px-5 py-3 text-right text-[#777777] text-sm tabular-nums">{pct(p.development_mgmt_fee, hardCostTotal)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        {/* ── Timeline ─────────────────────────────────────────────────────── */}
        {milestones.length > 0 && (
          <section className="bg-white border border-border rounded-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-surface">
              <h3 className="text-primary font-bold text-sm uppercase tracking-wider">Project Timeline</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Milestone</th>
                  <th className="text-left px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Previous</th>
                  <th className="text-left px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Current</th>
                  <th className="text-left px-5 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {milestones.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3 text-primary text-sm font-medium">{m.milestone_name}</td>
                    <td className="px-4 py-3 text-[#777777] text-sm">{fmtDate(m.previous_date)}</td>
                    <td className="px-4 py-3 text-[#555555] text-sm font-medium">{fmtDate(m.current_date)}</td>
                    <td className="px-5 py-3">
                      {m.status ? (
                        <span className={`inline-block px-2 py-0.5 rounded-sm text-xs font-medium ${STATUS_COLORS[m.status] ?? 'bg-surface text-[#555555]'}`}>
                          {m.status}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  )
}
