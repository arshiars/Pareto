import { useState } from 'react'
import { saveTripleCProject, updateTripleCProject } from '../services/api.js'

function num(v) { return v == null || v === '' ? 0 : Number(v) }
function fmtDollar(n) { return '$' + num(n).toLocaleString('en-CA', { maximumFractionDigits: 0 }) }
function perSqft(amount, gfa) {
  if (!amount || !gfa) return '—'
  return '$' + (num(amount) / num(gfa)).toFixed(0) + '/sf'
}
function perUnit(amount, units) {
  if (!amount || !units) return '—'
  return '$' + Math.round(num(amount) / num(units)).toLocaleString('en-CA') + '/unit'
}

function MetaField({ label, value, onChange, type = 'text' }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[#777777] text-xs font-semibold uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 bg-white border border-border rounded-sm text-primary text-sm focus:outline-none focus:border-primary transition-colors"
      />
    </div>
  )
}

function DivisionSection({ division, gfa, units, onChange, onAddLine, onRemoveLine }) {
  const [open, setOpen] = useState(true)
  const total = (division.line_items ?? []).reduce((s, li) => s + num(li.budget_amount), 0)
  const qsTotal = num(division.budget_amount)
  const delta = qsTotal > 0 ? total - qsTotal : 0
  const hasReconciliationIssue = qsTotal > 0 && Math.abs(delta) > 1000

  return (
    <div className={`border rounded-sm overflow-hidden ${hasReconciliationIssue ? 'border-amber-300' : 'border-border'}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-5 py-3 hover:bg-border/40 transition-colors text-left ${hasReconciliationIssue ? 'bg-amber-50' : 'bg-surface'}`}
      >
        <div className="flex items-center gap-3">
          <svg className={`w-3.5 h-3.5 text-[#777777] transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-primary font-semibold text-sm">
            Division {division.division_number} — {division.division_name}
          </span>
          {hasReconciliationIssue && (
            <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-sm">
              QS: {fmtDollar(qsTotal)} · Items: {fmtDollar(total)} · Δ {delta > 0 ? '+' : ''}{fmtDollar(delta)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-[#777777] text-xs">{perSqft(total, gfa)} &nbsp;·&nbsp; {perUnit(total, units)}</span>
          <span className="text-primary font-bold tabular-nums">{fmtDollar(total)}</span>
        </div>
      </button>

      {open && (
        <div className="divide-y divide-border">
          {(division.line_items ?? []).map((li, idx) => (
            <div key={idx} className="flex items-center gap-3 px-5 py-2.5 bg-white group">
              <span className="text-[#777777] text-xs w-5 flex-shrink-0">{idx + 1}.</span>
              <input
                value={li.description}
                onChange={(e) => onChange(division.division_number, idx, 'description', e.target.value)}
                className="flex-1 text-sm text-primary bg-transparent border-0 border-b border-transparent focus:border-primary focus:outline-none py-0.5 transition-colors min-w-0"
                placeholder="Line item description"
              />
              <input
                type="number"
                value={li.budget_amount ?? ''}
                onChange={(e) => onChange(division.division_number, idx, 'budget_amount', e.target.value)}
                className="w-36 text-right text-sm text-primary bg-transparent border-0 border-b border-transparent focus:border-primary focus:outline-none py-0.5 tabular-nums"
                placeholder="0"
              />
              <button
                onClick={() => onRemoveLine(division.division_number, idx)}
                className="opacity-0 group-hover:opacity-100 text-[#cccccc] hover:text-red-400 transition-all flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <div className="px-5 py-2">
            <button
              onClick={() => onAddLine(division.division_number)}
              className="text-accent text-xs font-semibold hover:underline flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add line item
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TripleCReviewPage({ data, projectId, queuePosition, onSaved, onDiscard }) {
  const { extracted, fileName } = data
  const isEditMode = Boolean(projectId)

  const [project, setProject] = useState(extracted.project)
  const [budget, setBudget] = useState(extracted.top_level_budget)
  const [fees, setFees] = useState(extracted.fees ?? { construction_mgmt_fee: null, construction_contingency: null, development_mgmt_fee: null })
  const [divisions, setDivisions] = useState(extracted.divisions ?? [])
  const [milestones, setMilestones] = useState(extracted.milestones ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const gfa = num(project.gfa_sqft)
  const units = num(project.units)
  const hardCostTotal = divisions.reduce((s, d) =>
    s + (d.line_items ?? []).reduce((s2, li) => s2 + num(li.budget_amount), 0), 0)

  function updateLine(divNum, idx, field, value) {
    setDivisions((prev) => prev.map((d) =>
      d.division_number !== divNum ? d : {
        ...d,
        line_items: d.line_items.map((li, i) => i !== idx ? li : { ...li, [field]: value }),
      }
    ))
  }

  function addLine(divNum) {
    setDivisions((prev) => prev.map((d) =>
      d.division_number !== divNum ? d : {
        ...d,
        line_items: [...(d.line_items ?? []), { description: '', budget_amount: 0 }],
      }
    ))
  }

  function removeLine(divNum, idx) {
    setDivisions((prev) => prev.map((d) =>
      d.division_number !== divNum ? d : {
        ...d,
        line_items: d.line_items.filter((_, i) => i !== idx),
      }
    ))
  }

  function updateMilestone(idx, field, value) {
    setMilestones((prev) => prev.map((m, i) => i !== idx ? m : { ...m, [field]: value }))
  }

  function addMilestone() {
    setMilestones((prev) => [...prev, { milestone_name: '', previous_date: null, current_date: null, status: 'Pending' }])
  }

  function removeMilestone(idx) {
    setMilestones((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const payload = { project, top_level_budget: budget, fees, divisions, milestones, fileName }
      if (isEditMode) {
        await updateTripleCProject(projectId, payload)
      } else {
        await saveTripleCProject(payload)
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-primary text-lg font-bold tracking-tight">Triple-C</h1>
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">{isEditMode ? 'Edit Project' : 'Review Extraction'}</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <span className="text-[#555555] text-xs truncate max-w-xs" title={fileName}>{fileName}</span>
            {queuePosition && (
              <span className="text-xs text-white bg-primary/80 px-2 py-0.5 rounded-sm font-medium">
                {queuePosition.current} of {queuePosition.total}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onDiscard}
              className="px-4 py-2 border border-border text-[#555555] text-sm font-semibold rounded-sm hover:border-primary hover:text-primary transition-colors">
              Discard
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
              {saving ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>Saving…</>
              ) : isEditMode ? 'Update Project' : 'Approve & Save'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-8 py-10 space-y-8">
        {error && (
          <div className={`p-4 bg-white border rounded-sm text-sm ${error.includes('already exists') ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-red-200 text-red-600'}`}>
            {error.includes('already exists') ? '⚠ Duplicate detected: ' : ''}{error}
          </div>
        )}

        {/* ── Project metadata ────────────────────────────────────────────── */}
        <section className="bg-white border border-border rounded-sm p-6">
          <h3 className="text-primary font-bold text-sm uppercase tracking-wider mb-5">Project Details</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="col-span-2 md:col-span-1">
              <MetaField label="Project Name" value={project.name} onChange={(v) => setProject((p) => ({ ...p, name: v }))} />
            </div>
            <MetaField label="Address" value={project.address} onChange={(v) => setProject((p) => ({ ...p, address: v }))} />
            <MetaField label="City" value={project.city} onChange={(v) => setProject((p) => ({ ...p, city: v }))} />
            <MetaField label="Province" value={project.province} onChange={(v) => setProject((p) => ({ ...p, province: v }))} />
            <div className="flex flex-col gap-1">
              <label className="text-[#777777] text-xs font-semibold uppercase tracking-wider">Type</label>
              <select value={project.project_type ?? ''}
                onChange={(e) => setProject((p) => ({ ...p, project_type: e.target.value }))}
                className="px-3 py-2 bg-white border border-border rounded-sm text-primary text-sm focus:outline-none focus:border-primary">
                {['condo', 'rental', 'mixed-use', 'commercial', 'industrial', 'other'].map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <MetaField label="GFA (sqft)" value={project.gfa_sqft} type="number" onChange={(v) => setProject((p) => ({ ...p, gfa_sqft: v }))} />
            <MetaField label="Units" value={project.units} type="number" onChange={(v) => setProject((p) => ({ ...p, units: v }))} />
            <MetaField label="Storeys" value={project.storeys} type="number" onChange={(v) => setProject((p) => ({ ...p, storeys: v }))} />
            <MetaField label="Report #" value={project.report_number} type="number" onChange={(v) => setProject((p) => ({ ...p, report_number: v }))} />
            <MetaField label="Report Date" value={project.report_date} type="date" onChange={(v) => setProject((p) => ({ ...p, report_date: v }))} />
            <MetaField label="QS Firm" value={project.qs_firm} onChange={(v) => setProject((p) => ({ ...p, qs_firm: v }))} />
          </div>
        </section>

        {/* ── Live summary bar ────────────────────────────────────────────── */}
        <section className="grid grid-cols-4 gap-4">
          {[
            { label: 'Hard Cost', value: fmtDollar(hardCostTotal) },
            { label: 'Total Budget', value: fmtDollar(budget.total_budget) },
            { label: '$/sf (Hard)', value: perSqft(hardCostTotal, gfa) },
            { label: '$/unit (Hard)', value: perUnit(hardCostTotal, units) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-border rounded-sm px-5 py-4">
              <p className="text-[#777777] text-xs font-semibold uppercase tracking-wider mb-1">{label}</p>
              <p className="text-primary text-xl font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </section>

        {/* ── Division line items ─────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="text-primary font-bold text-sm uppercase tracking-wider">Construction Cost Breakdown</h3>
          {divisions.map((div) => (
            <DivisionSection key={div.division_number} division={div} gfa={gfa} units={units}
              onChange={updateLine} onAddLine={addLine} onRemoveLine={removeLine} />
          ))}
        </section>

        {/* ── Fees ───────────────────────────────────────────────────────── */}
        <section className="bg-white border border-border rounded-sm p-6">
          <h3 className="text-primary font-bold text-sm uppercase tracking-wider mb-5">Fees & Contingency</h3>
          <div className="space-y-3">
            {[
              { key: 'construction_mgmt_fee', label: 'Construction Management Fee' },
              { key: 'construction_contingency', label: 'Construction Contingency' },
              { key: 'development_mgmt_fee', label: 'Development Management Fee' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-[#555555] text-sm">{label}</span>
                <input
                  type="number"
                  value={fees[key] ?? ''}
                  onChange={(e) => setFees((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-44 text-right text-sm font-semibold text-primary bg-transparent border-0 border-b border-transparent focus:border-primary focus:outline-none py-0.5 tabular-nums"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </section>

        {/* ── Timeline / Milestones ───────────────────────────────────────── */}
        <section className="bg-white border border-border rounded-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-primary font-bold text-sm uppercase tracking-wider">Project Timeline</h3>
            <button onClick={addMilestone}
              className="text-accent text-xs font-semibold hover:underline flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add milestone
            </button>
          </div>
          {milestones.length === 0 ? (
            <p className="px-6 py-4 text-[#777777] text-sm">No milestones extracted.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface border-b border-border">
                  <th className="text-left px-5 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Milestone</th>
                  <th className="text-left px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Previous Date</th>
                  <th className="text-left px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Current Date</th>
                  <th className="text-left px-4 py-2.5 text-[#777777] text-xs font-semibold uppercase tracking-wider">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {milestones.map((m, idx) => (
                  <tr key={idx} className="group">
                    <td className="px-5 py-2">
                      <input value={m.milestone_name ?? ''} onChange={(e) => updateMilestone(idx, 'milestone_name', e.target.value)}
                        className="w-full text-primary bg-transparent border-0 border-b border-transparent focus:border-primary focus:outline-none py-0.5 text-sm"
                        placeholder="Milestone name" />
                    </td>
                    <td className="px-4 py-2">
                      <input type="date" value={m.previous_date ?? ''} onChange={(e) => updateMilestone(idx, 'previous_date', e.target.value)}
                        className="text-[#555555] bg-transparent border-0 border-b border-transparent focus:border-primary focus:outline-none py-0.5 text-sm" />
                    </td>
                    <td className="px-4 py-2">
                      <input type="date" value={m.current_date ?? ''} onChange={(e) => updateMilestone(idx, 'current_date', e.target.value)}
                        className="text-[#555555] bg-transparent border-0 border-b border-transparent focus:border-primary focus:outline-none py-0.5 text-sm" />
                    </td>
                    <td className="px-4 py-2">
                      <select value={m.status ?? ''} onChange={(e) => updateMilestone(idx, 'status', e.target.value)}
                        className="text-sm bg-transparent border-0 focus:outline-none text-[#555555]">
                        {['Achieved', 'On Schedule', 'Pending', 'Delayed'].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeMilestone(idx)}
                        className="opacity-0 group-hover:opacity-100 text-[#cccccc] hover:text-red-400 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── Top-level budget ────────────────────────────────────────────── */}
        <section className="bg-white border border-border rounded-sm p-6">
          <h3 className="text-primary font-bold text-sm uppercase tracking-wider mb-5">Top-Level Budget</h3>
          <div className="space-y-2">
            {[
              { key: 'land_cost', label: 'Land' },
              { key: 'construction_cost', label: 'Construction (Incl. Contingency)' },
              { key: 'municipal_charges', label: 'Municipal Charges' },
              { key: 'soft_costs', label: 'Soft Costs' },
              { key: 'financing_cost', label: 'Financing' },
              { key: 'development_contingency', label: 'Development Contingency' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-[#555555] text-sm">{label}</span>
                <input type="number" value={budget[key] ?? ''}
                  onChange={(e) => setBudget((b) => ({ ...b, [key]: e.target.value }))}
                  className="w-44 text-right text-sm font-semibold text-primary bg-transparent border-0 border-b border-transparent focus:border-primary focus:outline-none py-0.5 tabular-nums"
                  placeholder="0" />
              </div>
            ))}
            <div className="flex items-center justify-between py-3 mt-1">
              <span className="text-primary font-bold text-sm">Total Budget</span>
              <input type="number" value={budget.total_budget ?? ''}
                onChange={(e) => setBudget((b) => ({ ...b, total_budget: e.target.value }))}
                className="w-44 text-right text-base font-bold text-primary bg-transparent border-0 border-b-2 border-primary focus:outline-none py-0.5 tabular-nums"
                placeholder="0" />
            </div>
          </div>
        </section>

        {/* Bottom actions */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <button onClick={onDiscard}
            className="px-5 py-2.5 border border-border text-[#555555] text-sm font-semibold rounded-sm hover:border-primary hover:text-primary transition-colors">
            Discard
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {saving ? 'Saving…' : isEditMode ? 'Update Project' : 'Approve & Save'}
          </button>
        </div>
      </main>
    </div>
  )
}
