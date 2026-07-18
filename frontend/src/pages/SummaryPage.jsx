import { useRef, useState } from 'react'
import { useAnalysis } from '../context/AnalysisContext.jsx'
import { calculateNOI } from '../utils/calculations.js'
import { formatCurrency, formatPercent } from '../utils/formatters.js'
import { extractFieldFromDocument } from '../services/api.js'
import StepIndicator from '../components/StepIndicator.jsx'
import Button from '../components/ui/Button.jsx'

// ─── Icons ────────────────────────────────────────────────────────────────────
function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  )
}
function UploadDocIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

// ─── Editable row ─────────────────────────────────────────────────────────────
function EditableRow({ label, rawValue, displayValue, onSave, onUpload, uploading, indent = false, suffix = '' }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')

  function startEdit() {
    setInput(rawValue != null ? String(rawValue) : '')
    setEditing(true)
  }
  function save() {
    const n = parseFloat(input.replace(/,/g, ''))
    if (!isNaN(n)) onSave(n)
    setEditing(false)
  }
  function cancel() { setEditing(false) }

  if (editing) {
    return (
      <tr className="border-b border-white/10 bg-white/5">
        <td className={`py-2 ${indent ? 'pl-8' : 'pl-4'} pr-2 text-sm text-white/70`}>{label}</td>
        <td className="py-2 pr-4">
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center border border-white/20 rounded overflow-hidden">
              <input
                type="number"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
                className="w-28 bg-white/10 px-2 py-1 text-white text-sm text-right focus:outline-none"
                autoFocus
              />
              {suffix && <span className="px-2 bg-white/5 text-white/50 text-xs border-l border-white/20">{suffix}</span>}
            </div>
            <button onClick={save} className="text-accent text-xs font-semibold hover:text-white">Save</button>
            <button onClick={cancel} className="text-white/30 text-xs hover:text-white/60">✕</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-white/10 group/row hover:bg-white/3 transition-colors">
      <td className={`py-3 ${indent ? 'pl-8' : 'pl-4'} pr-4 text-sm text-white/80`}>
        {label}
        {uploading && <span className="ml-2 text-xs text-accent animate-pulse">Extracting from document...</span>}
      </td>
      <td className="py-3 pr-4 text-right text-sm tabular-nums text-white/80">
        <span className="inline-flex items-center gap-2">
          <span>{displayValue}</span>
          <span className="opacity-0 group-hover/row:opacity-100 flex gap-1 transition-opacity">
            <button onClick={startEdit} title="Edit manually" className="text-white/30 hover:text-accent transition-colors">
              <PencilIcon />
            </button>
            {onUpload && (
              <button onClick={onUpload} title="Extract from document" className="text-white/30 hover:text-accent transition-colors">
                <UploadDocIcon />
              </button>
            )}
          </span>
        </span>
      </td>
    </tr>
  )
}

function StaticRow({ label, value, indent = false, bold = false, light = false }) {
  return (
    <tr className={`border-b border-white/10 ${bold ? 'font-bold' : ''} ${light ? 'bg-white/10 text-white' : 'text-white/80'}`}>
      <td className={`py-3 ${indent ? 'pl-8' : 'pl-4'} pr-4 text-sm`}>{label}</td>
      <td className="py-3 pr-4 text-right text-sm tabular-nums">{value}</td>
    </tr>
  )
}

function SectionHeader({ label }) {
  return (
    <tr className="bg-primary-light">
      <td colSpan={2} className="py-2 px-4 text-xs font-semibold text-accent uppercase tracking-widest">{label}</td>
    </tr>
  )
}

// ─── Analysis panel ───────────────────────────────────────────────────────────
function AnalysisPanel({ analysis }) {
  if (!analysis) return null
  const { purchasePrice, keyInfo = [], risks = [] } = analysis
  if (!purchasePrice && keyInfo.length === 0 && risks.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-4 mt-6 print:hidden">
      {/* Key Info */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide">Property Highlights</h3>
          {purchasePrice && (
            <span className="ml-auto text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
              {purchasePrice}
            </span>
          )}
        </div>
        {keyInfo.length > 0 ? (
          <ul className="space-y-1.5">
            {keyInfo.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-600">
                <span className="text-accent flex-shrink-0 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No highlights extracted.</p>
        )}
      </div>

      {/* Risks */}
      <div className="bg-surface border border-error/20 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-error uppercase tracking-wide mb-3">Underwriting Risks</h3>
        {risks.length > 0 ? (
          <ul className="space-y-1.5">
            {risks.map((risk, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-600">
                <span className="text-error flex-shrink-0">⚠</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No risks identified.</p>
        )}
      </div>
    </div>
  )
}

// ─── Field descriptions for AI extraction ─────────────────────────────────────
const FIELD_DESCRIPTIONS = {
  'additionalIncome.parking':        'annual parking income in CAD (multiply monthly by 12)',
  'additionalIncome.storage':        'annual storage income in CAD (multiply monthly by 12)',
  'additionalIncome.laundry':        'annual laundry income in CAD (multiply monthly by 12)',
  'additionalIncome.other':          'annual other miscellaneous income in CAD (multiply monthly by 12)',
  'propertyTaxes':                   'annual property tax amount in CAD',
  'insurance':                       'annual insurance premium in CAD',
  'utilities':                       'annual utilities expense in CAD',
  'repairsAndMaintenance':           'annual repairs and maintenance expense in CAD',
  'payrollAndAdmin':                 'annual payroll and administration expense in CAD',
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SummaryPage() {
  const { state, goToReview, goToExcel, reset, setOverride } = useAnalysis()
  const { extractedData, userOverrides, defaults } = state

  const fileInputRef = useRef(null)
  const [uploadingField, setUploadingField] = useState(null)

  if (!extractedData) return null

  const noi = calculateNOI(extractedData, userOverrides, defaults)
  const propInfo = extractedData.propertyInfo

  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

  // ── Upload helpers ──────────────────────────────────────────────────────────
  function triggerUpload(fieldKey) {
    setUploadingField(fieldKey)
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  async function handleFileSelected(e) {
    const file = e.target.files[0]
    if (!file || !uploadingField) return
    const desc = FIELD_DESCRIPTIONS[uploadingField]
    try {
      const result = await extractFieldFromDocument(file, desc)
      if (result.value != null) {
        setOverride(uploadingField, result.value)
      }
    } catch (err) {
      console.error('Field extraction failed:', err.message)
    } finally {
      setUploadingField(null)
    }
  }

  // ── Save helpers ────────────────────────────────────────────────────────────
  function saveOverride(key) { return (val) => setOverride(key, val) }

  return (
    <div>
      <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileSelected} />

      <StepIndicator currentStep="summary" />

      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-primary">NOI Summary</h2>
          <p className="text-gray-500 mt-1">Hover any line item to edit or extract from a document.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset}>Start Over</Button>
          <Button variant="secondary" onClick={goToReview}>Back to Review</Button>
          <Button variant="secondary" onClick={goToExcel}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Populate Excel Template
          </Button>
          <Button variant="accent" onClick={() => window.print()}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Export PDF
          </Button>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border shadow-md overflow-hidden print:shadow-none print:border-0">
        {/* Header */}
        <div className="bg-primary px-6 py-5">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-white text-lg font-bold">Pareto — CMHC Underwriting</h1>
              <p className="text-white/60 text-sm mt-0.5">{propInfo?.address || 'Property Address Not Specified'}</p>
            </div>
            <div className="text-right">
              <p className="text-white/60 text-xs">Prepared by Pareto</p>
              <p className="text-white/60 text-xs">{today}</p>
              {propInfo?.totalUnits && <p className="text-accent text-sm font-semibold mt-1">{propInfo.totalUnits} Units</p>}
            </div>
          </div>
        </div>

        {/* Financial Table */}
        <table className="w-full bg-primary">
          <tbody>
            {/* ── Income ── */}
            <SectionHeader label="Income" />

            {(extractedData.unitBreakdown ?? []).map((unit, i) => {
              const rent = userOverrides[`unit.${unit.type}.rent`] ?? unit.avgMonthlyRent ?? 0
              const annual = unit.count * rent * 12
              return (
                <EditableRow
                  key={i}
                  label={`${unit.type} — ${unit.count} units × $${rent.toLocaleString('en-CA')}/mo`}
                  rawValue={rent}
                  displayValue={formatCurrency(annual)}
                  suffix="/mo"
                  onSave={saveOverride(`unit.${unit.type}.rent`)}
                  indent
                />
              )
            })}

            <StaticRow label="Gross Potential Rent (GPR)" value={formatCurrency(noi.gpr)} bold />
            <StaticRow
              label={`Vacancy Loss (${formatPercent(noi.vacancyRate)})`}
              value={`(${formatCurrency(noi.vacancyLoss)})`}
              indent
            />

            {(['parking', 'storage', 'laundry'] ).map((key) => {
              const annualVal = noi[key]
              const fieldKey = `additionalIncome.${key}`
              const labels = { parking: 'Parking Income', storage: 'Storage Income', laundry: 'Laundry Income' }
              if (annualVal === 0 && userOverrides[fieldKey] == null) return null
              return (
                <EditableRow
                  key={key}
                  label={labels[key]}
                  rawValue={annualVal}
                  displayValue={annualVal > 0 ? formatCurrency(annualVal) : '—'}
                  onSave={saveOverride(fieldKey)}
                  onUpload={() => triggerUpload(fieldKey)}
                  uploading={uploadingField === fieldKey}
                  indent
                />
              )
            })}

            {(noi.otherIncome > 0 || userOverrides['additionalIncome.other'] != null) && (
              <EditableRow
                label="Other Income"
                rawValue={noi.otherIncome}
                displayValue={noi.otherIncome > 0 ? formatCurrency(noi.otherIncome) : '—'}
                onSave={saveOverride('additionalIncome.other')}
                onUpload={() => triggerUpload('additionalIncome.other')}
                uploading={uploadingField === 'additionalIncome.other'}
                indent
              />
            )}

            <StaticRow label="Effective Gross Income (EGI)" value={formatCurrency(noi.egi)} bold light />

            {/* ── Expenses ── */}
            <SectionHeader label="Operating Expenses" />

            {[
              { key: 'propertyTaxes',       label: 'Property Taxes' },
              { key: 'insurance',            label: 'Insurance' },
              { key: 'utilities',            label: 'Utilities' },
              { key: 'repairsAndMaintenance', label: 'Repairs & Maintenance' },
              { key: 'payrollAndAdmin',      label: 'Payroll & Administration' },
            ].map(({ key, label }) => (
              <EditableRow
                key={key}
                label={label}
                rawValue={noi[key]}
                displayValue={noi[key] > 0 ? formatCurrency(noi[key]) : '—'}
                onSave={saveOverride(key)}
                onUpload={() => triggerUpload(key)}
                uploading={uploadingField === key}
                indent
              />
            ))}

            <StaticRow
              label={`Management Fee (${formatPercent(defaults.managementFeeRate)} of EGI)`}
              value={formatCurrency(noi.managementFee)}
              indent
            />
            <StaticRow
              label={`Other Deductions (${formatPercent(defaults.otherDeductionsRate)} of EGI)`}
              value={formatCurrency(noi.otherDeductions)}
              indent
            />
            {noi.replacementReserve > 0 && (
              <StaticRow
                label={`Replacement Reserve (${propInfo?.totalAppliances ?? userOverrides.totalAppliances ?? 0} appliances × $${defaults.replacementReservePerAppliance})`}
                value={formatCurrency(noi.replacementReserve)}
                indent
              />
            )}

            <StaticRow label="Total Operating Expenses" value={formatCurrency(noi.totalOpEx)} bold light />

            {/* NOI */}
            <tr className="bg-accent">
              <td className="py-4 pl-4 pr-4 text-sm font-bold text-primary">Net Operating Income (NOI)</td>
              <td className="py-4 pr-4 text-right text-lg font-bold text-primary tabular-nums">{formatCurrency(noi.noi)}</td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="px-6 py-4 bg-background border-t border-border flex justify-between items-center">
          <p className="text-xs text-gray-400">For CMHC underwriting purposes only. Verify all values independently.</p>
          <p className="text-xs text-gray-400">Pareto Underwriting Tool</p>
        </div>
      </div>

      {/* Per-unit metrics */}
      <div className="grid grid-cols-4 gap-4 mt-6 print:hidden">
        {[
          { label: 'GPR / Unit / Yr',  value: formatCurrency(propInfo?.totalUnits ? noi.gpr / propInfo.totalUnits : null) },
          { label: 'EGI / Unit / Yr',  value: formatCurrency(propInfo?.totalUnits ? noi.egi / propInfo.totalUnits : null) },
          { label: 'Total OpEx',       value: formatCurrency(noi.totalOpEx) },
          { label: 'NOI',              value: formatCurrency(noi.noi) },
        ].map((m) => (
          <div key={m.label} className="bg-surface border border-border rounded-lg p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className="text-lg font-bold text-primary">{m.value}</p>
          </div>
        ))}
      </div>

      {/* AI Analysis */}
      <AnalysisPanel analysis={extractedData.analysis} />
    </div>
  )
}
