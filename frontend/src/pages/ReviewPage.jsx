import { useRef, useState } from 'react'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import StepIndicator from '../components/StepIndicator.jsx'
import ExtractionField from '../components/ExtractionField.jsx'
import { useAnalysis } from '../context/AnalysisContext.jsx'
import { calculateNOI } from '../utils/calculations.js'
import { formatCurrency, formatPercent } from '../utils/formatters.js'
import { extractFieldFromDocument } from '../services/api.js'

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

// ─── NOI table components ─────────────────────────────────────────────────────
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

// ─── Collapsible section ──────────────────────────────────────────────────────
function CollapsibleSection({ title, defaultOpen = false, missingCount = 0, children }) {
  const hasMissing = missingCount > 0
  const [open, setOpen] = useState(defaultOpen || hasMissing)

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-primary/3 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">{title}</span>
          {hasMissing && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-xs text-amber-600 font-medium">{missingCount} missing</span>
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReviewPage() {
  const { state, setOverride, setDefault, goToExcel, reset, research } = useAnalysis()
  const { extractedData, userOverrides, defaults } = state

  const fileInputRef = useRef(null)
  const [uploadingField, setUploadingField] = useState(null)

  if (!extractedData) return null

  const { propertyInfo, unitBreakdown, additionalIncome, operatingExpenses, analysis } = extractedData

  const noi = calculateNOI(extractedData, userOverrides, defaults)
  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

  // Missing counts for right-panel sections
  const unitMissingCount = (!propertyInfo?.totalUnits || !unitBreakdown?.length) ? 1 : 0
  const expenseMissingCount = ['propertyTaxes', 'insurance', 'utilities', 'repairsAndMaintenance', 'payrollAndAdmin']
    .filter((k) => !operatingExpenses?.[k]?.found && userOverrides[k] == null).length

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
      if (result.value != null) setOverride(uploadingField, result.value)
    } catch (err) {
      console.error('Field extraction failed:', err.message)
    } finally {
      setUploadingField(null)
    }
  }

  function saveOverride(key) { return (val) => setOverride(key, val) }

  async function handleResearch(fieldKey) {
    return research(fieldKey)
  }

  return (
    <div>
      <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileSelected} />

      <StepIndicator currentStep="review" />

      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-primary">Review & Summary</h2>
          <p className="text-gray-500 mt-1">Live NOI calculations. Expand sections on the right to edit any field.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset}>Start Over</Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Export PDF
          </Button>
          <Button variant="accent" onClick={goToExcel}>
            Populate Excel Template
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Button>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* ── LEFT: NOI Table ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="bg-surface rounded-xl border border-border shadow-md overflow-hidden print:shadow-none print:border-0">
            {/* Header */}
            <div className="bg-primary px-6 py-5">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-white text-lg font-bold">CMHC Underwriting — CMHC Deal Processor</h1>
                  <p className="text-white/60 text-sm mt-0.5">{propertyInfo?.address || 'Property Address Not Specified'}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/60 text-xs">Prepared by Windsor</p>
                  <p className="text-white/60 text-xs">{today}</p>
                  {propertyInfo?.totalUnits && <p className="text-accent text-sm font-semibold mt-1">{propertyInfo.totalUnits} Units</p>}
                </div>
              </div>
            </div>

            {/* Financial Table */}
            <table className="w-full bg-primary">
              <tbody>
                <SectionHeader label="Income" />

                {(unitBreakdown ?? []).map((unit, i) => {
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

                {(['parking', 'storage', 'laundry']).map((key) => {
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

                <SectionHeader label="Operating Expenses" />

                {[
                  { key: 'propertyTaxes',        label: 'Property Taxes' },
                  { key: 'insurance',             label: 'Insurance' },
                  { key: 'utilities',             label: 'Utilities' },
                  { key: 'repairsAndMaintenance', label: 'Repairs & Maintenance' },
                  { key: 'payrollAndAdmin',       label: 'Payroll & Administration' },
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
                    label={`Replacement Reserve (${propertyInfo?.totalAppliances ?? userOverrides.totalAppliances ?? 0} appliances × $${defaults.replacementReservePerAppliance})`}
                    value={formatCurrency(noi.replacementReserve)}
                    indent
                  />
                )}

                <StaticRow label="Total Operating Expenses" value={formatCurrency(noi.totalOpEx)} bold light />

                <tr className="bg-accent">
                  <td className="py-4 pl-4 pr-4 text-sm font-bold text-primary">Net Operating Income (NOI)</td>
                  <td className="py-4 pr-4 text-right text-lg font-bold text-primary tabular-nums">{formatCurrency(noi.noi)}</td>
                </tr>
              </tbody>
            </table>

            {/* Footer */}
            <div className="px-6 py-4 bg-background border-t border-border flex justify-between items-center">
              <p className="text-xs text-gray-400">For CMHC underwriting purposes only. Verify all values independently.</p>
              <p className="text-xs text-gray-400">Windsor Underwriting Tool</p>
            </div>
          </div>

          {/* Per-unit metrics */}
          <div className="grid grid-cols-4 gap-4 mt-6 print:hidden">
            {[
              { label: 'GPR / Unit / Yr', value: formatCurrency(propertyInfo?.totalUnits ? noi.gpr / propertyInfo.totalUnits : null) },
              { label: 'EGI / Unit / Yr', value: formatCurrency(propertyInfo?.totalUnits ? noi.egi / propertyInfo.totalUnits : null) },
              { label: 'Total OpEx',      value: formatCurrency(noi.totalOpEx) },
              { label: 'NOI',             value: formatCurrency(noi.noi) },
            ].map((m) => (
              <div key={m.label} className="bg-surface border border-border rounded-lg p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                <p className="text-lg font-bold text-primary">{m.value}</p>
              </div>
            ))}
          </div>

          {/* AI Analysis */}
          <AnalysisPanel analysis={analysis} />
        </div>

        {/* ── RIGHT: Edit Panel ────────────────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 space-y-2 print:hidden">

          {/* Unit Rents */}
          <CollapsibleSection title="Unit Rents" missingCount={unitMissingCount} defaultOpen={unitMissingCount > 0}>
            <div className="p-3">
              {unitBreakdown && unitBreakdown.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 text-xs text-gray-400 font-medium">Type</th>
                      <th className="text-right py-1.5 text-xs text-gray-400 font-medium">Count</th>
                      <th className="text-right py-1.5 text-xs text-gray-400 font-medium">Override Rent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitBreakdown.map((unit, i) => (
                      <tr key={i} className="border-b border-border/40 last:border-0">
                        <td className="py-2 font-medium text-gray-800 text-xs">{unit.type}</td>
                        <td className="py-2 text-right text-gray-600 text-xs">{unit.count}</td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            value={userOverrides[`unit.${unit.type}.rent`] ?? ''}
                            onChange={(e) =>
                              setOverride(`unit.${unit.type}.rent`, e.target.value ? Number(e.target.value) : undefined)
                            }
                            placeholder={unit.avgMonthlyRent?.toString() ?? 'Enter'}
                            className="w-20 text-right border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-gray-400 py-2">No unit data extracted.</p>
              )}
            </div>
          </CollapsibleSection>

          {/* Additional Income */}
          <CollapsibleSection title="Additional Income">
            <div className="px-3 py-1">
              <p className="text-xs text-gray-400 pt-2 pb-1">Monthly amounts — annualized (×12) in NOI</p>
              <ExtractionField
                label="Parking"
                fieldKey="additionalIncome.parking"
                found={additionalIncome?.parking?.found}
                value={additionalIncome?.parking?.monthlyTotal}
                source={additionalIncome?.parking?.source}
                prefix="$" suffix="/mo"
                overrideValue={userOverrides['additionalIncome.parking'] != null ? userOverrides['additionalIncome.parking'] / 12 : null}
                onOverride={(key, val) => setOverride(key, val != null ? val * 12 : undefined)}
                onResearch={handleResearch}
              />
              <ExtractionField
                label="Storage"
                fieldKey="additionalIncome.storage"
                found={additionalIncome?.storage?.found}
                value={additionalIncome?.storage?.monthlyTotal}
                source={additionalIncome?.storage?.source}
                prefix="$" suffix="/mo"
                overrideValue={userOverrides['additionalIncome.storage'] != null ? userOverrides['additionalIncome.storage'] / 12 : null}
                onOverride={(key, val) => setOverride(key, val != null ? val * 12 : undefined)}
                onResearch={handleResearch}
              />
              <ExtractionField
                label="Laundry"
                fieldKey="additionalIncome.laundry"
                found={additionalIncome?.laundry?.found}
                value={additionalIncome?.laundry?.monthlyTotal}
                source={additionalIncome?.laundry?.source}
                prefix="$" suffix="/mo"
                overrideValue={userOverrides['additionalIncome.laundry'] != null ? userOverrides['additionalIncome.laundry'] / 12 : null}
                onOverride={(key, val) => setOverride(key, val != null ? val * 12 : undefined)}
                onResearch={handleResearch}
              />
              <ExtractionField
                label={`Other${additionalIncome?.other?.description ? ` (${additionalIncome.other.description})` : ''}`}
                fieldKey="additionalIncome.other"
                found={additionalIncome?.other?.found}
                value={additionalIncome?.other?.monthlyTotal}
                source={additionalIncome?.other?.source}
                prefix="$" suffix="/mo"
                overrideValue={userOverrides['additionalIncome.other'] != null ? userOverrides['additionalIncome.other'] / 12 : null}
                onOverride={(key, val) => setOverride(key, val != null ? val * 12 : undefined)}
                onResearch={handleResearch}
              />
            </div>
          </CollapsibleSection>

          {/* Operating Expenses */}
          <CollapsibleSection title="Operating Expenses" missingCount={expenseMissingCount} defaultOpen={expenseMissingCount > 0}>
            <div className="px-3 py-1">
              <p className="text-xs text-gray-400 pt-2 pb-1">Annual amounts</p>
              <ExtractionField
                label="Property Taxes"
                fieldKey="propertyTaxes"
                found={operatingExpenses?.propertyTaxes?.found}
                value={operatingExpenses?.propertyTaxes?.annualAmount}
                source={operatingExpenses?.propertyTaxes?.source}
                prefix="$" suffix="/yr"
                overrideValue={userOverrides.propertyTaxes}
                onOverride={setOverride}
                onResearch={handleResearch}
              />
              <ExtractionField
                label="Insurance"
                fieldKey="insurance"
                found={operatingExpenses?.insurance?.found}
                value={operatingExpenses?.insurance?.annualAmount}
                source={operatingExpenses?.insurance?.source}
                prefix="$" suffix="/yr"
                overrideValue={userOverrides.insurance}
                onOverride={setOverride}
                onResearch={handleResearch}
              />
              <ExtractionField
                label="Utilities"
                fieldKey="utilities"
                found={operatingExpenses?.utilities?.found}
                value={operatingExpenses?.utilities?.annualAmount}
                source={operatingExpenses?.utilities?.source}
                prefix="$" suffix="/yr"
                overrideValue={userOverrides.utilities}
                onOverride={setOverride}
                onResearch={handleResearch}
              />
              <ExtractionField
                label="Repairs & Maintenance"
                fieldKey="repairsAndMaintenance"
                found={operatingExpenses?.repairsAndMaintenance?.found}
                value={operatingExpenses?.repairsAndMaintenance?.annualAmount}
                source={operatingExpenses?.repairsAndMaintenance?.source}
                prefix="$" suffix="/yr"
                overrideValue={userOverrides.repairsAndMaintenance}
                onOverride={setOverride}
                onResearch={handleResearch}
              />
              <ExtractionField
                label="Payroll & Admin"
                fieldKey="payrollAndAdmin"
                found={operatingExpenses?.payrollAndAdmin?.found}
                value={operatingExpenses?.payrollAndAdmin?.annualAmount}
                source={operatingExpenses?.payrollAndAdmin?.source}
                prefix="$" suffix="/yr"
                overrideValue={userOverrides.payrollAndAdmin}
                onOverride={setOverride}
                onResearch={handleResearch}
              />
            </div>
          </CollapsibleSection>

          {/* Calculation Defaults */}
          <CollapsibleSection title="Calculation Defaults">
            <div className="p-3">
              <p className="text-xs text-gray-400 mb-3">Vacancy rate affects the NOI calculation live on this page.</p>
              <Input
                label="Vacancy Rate"
                suffix="%"
                type="number"
                value={(defaults.vacancyRate * 100).toFixed(2)}
                onChange={(e) => setDefault('vacancyRate', Number(e.target.value) / 100)}
                placeholder="3.00"
              />
            </div>
          </CollapsibleSection>

          {/* Property Info */}
          <CollapsibleSection title="Property Info">
            <div className="p-3 space-y-2 text-sm">
              <div>
                <p className="text-xs text-gray-400">Address</p>
                <p className="font-medium text-gray-800 text-xs mt-0.5">{propertyInfo?.address || '—'}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-400">Property Type</p>
                  <p className="text-xs font-medium text-gray-800 mt-0.5">{propertyInfo?.propertyType || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total Units</p>
                  <p className="text-xs font-medium text-gray-800 mt-0.5">{propertyInfo?.totalUnits ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total Appliances</p>
                  <p className="text-xs font-medium text-gray-800 mt-0.5">
                    {userOverrides.totalAppliances ?? propertyInfo?.totalAppliances ?? '—'}
                  </p>
                </div>
              </div>
              {propertyInfo?.appliancesNote && (
                <Input
                  label="Override Appliance Count"
                  type="number"
                  value={userOverrides.totalAppliances ?? ''}
                  onChange={(e) => setOverride('totalAppliances', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder={String(propertyInfo.totalAppliances ?? '')}
                />
              )}
            </div>
          </CollapsibleSection>

          {/* AI Analysis */}
          {analysis && (analysis.purchasePrice || analysis.keyInfo?.length > 0 || analysis.risks?.length > 0) && (
            <CollapsibleSection title="AI Analysis">
              <div className="p-3 space-y-2">
                {analysis.purchasePrice && (
                  <div className="pb-2 border-b border-border">
                    <p className="text-xs text-gray-400">Purchase Price</p>
                    <p className="text-sm font-bold text-primary mt-0.5">{analysis.purchasePrice}</p>
                  </div>
                )}
                {analysis.keyInfo?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Key Information</p>
                    <ul className="space-y-1">
                      {analysis.keyInfo.map((item, i) => (
                        <li key={i} className="flex gap-1.5 text-xs text-gray-600">
                          <span className="text-accent font-bold flex-shrink-0">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.risks?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Risks</p>
                    <ul className="space-y-1">
                      {analysis.risks.map((risk, i) => (
                        <li key={i} className="flex gap-1.5 text-xs text-gray-600">
                          <span className="text-error flex-shrink-0">⚠</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}
        </div>
      </div>
    </div>
  )
}
