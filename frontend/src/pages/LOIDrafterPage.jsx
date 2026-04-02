import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import Layout from '../components/Layout.jsx'
import { extractLoiFields, generateLoi } from '../services/loiApi.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const AVAILABILITY_OPTIONS = [
  { value: 'on a work in place and cost to complete basis against monthly requests', label: 'Work in place / cost to complete (monthly draws)' },
  { value: 'by way of a single advance', label: 'Single advance' },
]

const MORTGAGE_PRIORITY_OPTIONS = [
  { value: 'First Mortgage', label: 'First Mortgage' },
  { value: 'Second Mortgage', label: 'Second Mortgage' },
  { value: 'Third Mortgage', label: 'Third Mortgage' },
]

const TOGGLEABLE_ROWS = [
  { key: 'goodFaithDeposit',      label: 'Good Faith Deposit' },
  { key: 'interestReserve',       label: 'Interest Reserve' },
  { key: 'extensions',            label: 'Extensions' },
  { key: 'permittedEncumbrances', label: 'Permitted Encumbrances' },
  { key: 'dscConditions',         label: 'DSC Conditions' },
  { key: 'availability',          label: 'Availability' },
  { key: 'partialDischarges',     label: 'Partial Discharges' },
]

// Sanity check rules
const SANITY_RULES = {
  lendersFee:        { max: 5,   message: "Lender's fee over 5% — double-check" },
  interestRateSpread:{ max: 10,  message: 'Spread over 10% — double-check' },
  interestRateFloor: { max: 15,  message: 'Floor rate over 15% — double-check' },
  term:              { max: 70,  message: 'Term over 70 months — double-check', isMonths: true },
  extensionFee:      { max: 3,   message: 'Extension fee over 3% — double-check' },
}

const FIELD_DEFS = [
  { key: 'subject',                     label: 'Subject Line',                        group: 'Header',             type: 'text',    textarea: false },
  { key: 'brokerName',                  label: 'Broker Name',                         group: 'Header',             type: 'text',    textarea: false },
  { key: 'recipient',                   label: 'Recipient (Dear...)',                  group: 'Header',             type: 'text',    textarea: false },
  { key: 'propertyDescription',         label: 'Property Description',                group: 'Property & Parties', type: 'text',    textarea: true  },
  { key: 'borrowerName',                label: 'Borrower Name',                       group: 'Property & Parties', type: 'text',    textarea: false },
  { key: 'guarantors',                  label: 'Guarantors',                          group: 'Property & Parties', type: 'text',    textarea: false },
  { key: 'loanAmount',                  label: 'Loan Amount',                         group: 'Loan Terms',         type: 'number',  textarea: false, hint: 'No $ — template provides it' },
  { key: 'interestReserve',             label: 'Interest Reserve Amount',             group: 'Loan Terms',         type: 'number',  textarea: false, rowKey: 'interestReserve' },
  { key: 'interestRateSpread',          label: 'Interest Rate Spread (%)',            group: 'Loan Terms',         type: 'percent', textarea: false },
  { key: 'interestRateFloor',           label: 'Interest Rate Floor (%)',             group: 'Loan Terms',         type: 'percent', textarea: false },
  { key: 'lendersFee',                  label: "Lender's Fee (%)",                    group: 'Loan Terms',         type: 'percent', textarea: false },
  { key: 'goodFaithDeposit',            label: 'Good Faith Deposit',                  group: 'Loan Terms',         type: 'number',  textarea: false, rowKey: 'goodFaithDeposit' },
  { key: 'term',                        label: 'Term (months)',                       group: 'Loan Terms',         type: 'text',    textarea: false },
  { key: 'interestReserveCap',          label: 'Interest Reserve Cap',                group: 'Repayment',          type: 'number',  textarea: false, rowKey: 'interestReserve' },
  { key: 'prepaymentMonths',            label: 'Prepayment Min. Months',              group: 'Repayment',          type: 'text',    textarea: false },
  { key: 'extensionFee',                label: 'Extension Fee (%)',                   group: 'Repayment',          type: 'percent', textarea: false, rowKey: 'extensions' },
  { key: 'permittedEncumbrancesLender', label: 'Permitted Encumbrances — Lender',     group: 'Security',           type: 'text',    textarea: false, rowKey: 'permittedEncumbrances' },
  { key: 'permittedEncumbrancesAmount', label: 'Permitted Encumbrances — Amount',     group: 'Security',           type: 'number',  textarea: false, rowKey: 'permittedEncumbrances' },
  { key: 'securityAmount',              label: 'Security Amount',                     group: 'Security',           type: 'number',  textarea: false, hint: 'Auto-filled at 1.25× loan amount' },
  { key: 'mortgagePriority',            label: 'Mortgage Priority',                   group: 'Security',           type: 'select',  textarea: false, options: MORTGAGE_PRIORITY_OPTIONS },
  { key: 'availability',                label: 'Availability',                        group: 'Other',              type: 'select',  textarea: false, rowKey: 'availability', options: AVAILABILITY_OPTIONS },
  { key: 'acceptanceDeadline',          label: 'Acceptance Deadline',                 group: 'Other',              type: 'date',    textarea: false },
  { key: 'originatorName',              label: 'Originator Name',                     group: 'KingSett Signatories', type: 'text',  textarea: false },
  { key: 'underwriterName',             label: 'Underwriter Name',                    group: 'KingSett Signatories', type: 'text',  textarea: false },
]

const GROUPS = [...new Set(FIELD_DEFS.map(f => f.group))]
const DRAFT_KEY = (addr) => `loi_draft_${(addr || 'default').replace(/\s+/g, '_').toLowerCase()}`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addBusinessDays(date, days) {
  let d = new Date(date)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d
}

function defaultDeadline() {
  return addBusinessDays(new Date(), 7).toISOString().split('T')[0]
}

function formatDeadlineForDoc(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatNumber(raw) {
  const digits = String(raw).replace(/[^0-9]/g, '')
  if (!digits) return ''
  return parseInt(digits, 10).toLocaleString('en-US')
}

function formatPercent(raw) {
  const num = parseFloat(String(raw).replace(/[^0-9.]/g, ''))
  if (isNaN(num)) return raw
  return num.toFixed(2)
}

function calcSecurityAmount(loanAmount) {
  const raw = String(loanAmount).replace(/[^0-9]/g, '')
  const num = parseInt(raw, 10)
  if (isNaN(num) || num === 0) return ''
  return Math.round(num * 1.25).toLocaleString('en-US')
}

function getSanityWarning(key, value) {
  const rule = SANITY_RULES[key]
  if (!rule || !value) return null
  const num = parseFloat(String(value).replace(/[^0-9.]/g, ''))
  if (isNaN(num)) return null
  const compareTo = rule.isMonths ? parseInt(value, 10) : num
  return compareTo > rule.max ? rule.message : null
}

function initialToggles() {
  return Object.fromEntries(TOGGLEABLE_ROWS.map(r => [r.key, true]))
}

function emptyFields() {
  return {
    subject: '', brokerName: '', recipient: '', propertyDescription: '',
    borrowerName: '', guarantors: '', loanAmount: '', interestReserve: '',
    interestRateSpread: '', interestRateFloor: '', lendersFee: '', goodFaithDeposit: '50,000',
    term: '', interestReserveCap: '', prepaymentMonths: '', extensionFee: '',
    permittedEncumbrancesLender: '', permittedEncumbrancesAmount: '', securityAmount: '',
    mortgagePriority: 'First Mortgage', availability: AVAILABILITY_OPTIONS[0].value,
    acceptanceDeadline: defaultDeadline(), originatorName: '', underwriterName: '',
  }
}

function saveDraft(address, state) {
  try { localStorage.setItem(DRAFT_KEY(address), JSON.stringify({ ...state, savedAt: Date.now() })) } catch {}
}

function loadDraft(address) {
  try { const raw = localStorage.getItem(DRAFT_KEY(address)); return raw ? JSON.parse(raw) : null } catch { return null }
}

function listDrafts() {
  const drafts = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('loi_draft_')) {
        const raw = localStorage.getItem(key)
        if (raw) {
          const d = JSON.parse(raw)
          drafts.push({ key, address: d.fields?.subject || key.replace('loi_draft_', ''), savedAt: d.savedAt })
        }
      }
    }
  } catch {}
  return drafts.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }) {
  const steps = ['Upload CIM', 'Review Fields', 'Generate LOI']
  return (
    <div className="flex items-center">
      {steps.map((label, i) => {
        const num = i + 1; const active = step === num; const done = step > num
        return (
          <div key={num} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${done ? 'bg-primary text-white' : active ? 'bg-accent text-white' : 'bg-surface text-[#777777] border border-border'}`}>
                {done ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> : num}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-primary' : 'text-[#777777]'}`}>{label}</span>
            </div>
            {i < steps.length - 1 && <div className="w-8 h-px bg-border mx-3" />}
          </div>
        )
      })}
    </div>
  )
}

// ─── Upload Step ──────────────────────────────────────────────────────────────

function UploadStep({ onExtracted, onSkip, drafts, onLoadDraft }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [file, setFile] = useState(null)

  const onDrop = useCallback((accepted) => { if (accepted[0]) setFile(accepted[0]); setError('') }, [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1 })

  async function handleExtract() {
    if (!file) return
    setLoading(true); setError('')
    try { const { extracted } = await extractLoiFields(file); onExtracted(extracted) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-xl mx-auto">
      {drafts.length > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-sm p-4">
          <p className="text-xs font-semibold text-blue-800 mb-2">Resume a saved draft</p>
          <div className="flex flex-col gap-1.5">
            {drafts.slice(0, 3).map(d => (
              <button key={d.key} onClick={() => onLoadDraft(d.key)} className="text-left px-3 py-2 bg-white border border-blue-200 rounded-sm hover:border-blue-400 transition-colors">
                <p className="text-xs font-medium text-primary truncate">{d.address}</p>
                <p className="text-[10px] text-[#777777]">{new Date(d.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-sm p-12 text-center cursor-pointer transition-colors ${isDragActive ? 'border-accent bg-accent/5' : file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className={`w-12 h-12 rounded-sm flex items-center justify-center ${file ? 'bg-primary/10' : 'bg-surface'}`}>
            <svg className={`w-6 h-6 ${file ? 'text-primary' : 'text-[#777777]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          {file ? (<><p className="text-primary font-semibold text-sm">{file.name}</p><p className="text-[#777777] text-xs">{(file.size/1024/1024).toFixed(1)} MB — click to change</p></>) : (<><p className="text-primary font-semibold text-sm">Drop your CIM PDF here</p><p className="text-[#777777] text-xs">or click to browse</p></>)}
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      <div className="mt-6 flex flex-col gap-3">
        <button onClick={handleExtract} disabled={!file || loading} className="w-full py-2.5 bg-primary text-white text-sm font-semibold rounded-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
          {loading ? (<><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Extracting from CIM...</>) : 'Extract & Pre-fill Fields'}
        </button>
        <button onClick={onSkip} className="w-full py-2.5 border border-border text-[#555555] text-sm font-medium rounded-sm hover:border-primary hover:text-primary transition-colors">Skip — fill manually</button>
      </div>
    </div>
  )
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!enabled)} className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-primary' : 'bg-[#cccccc]'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

// ─── Field Input ──────────────────────────────────────────────────────────────

function FieldInput({ def, value, onChange }) {
  const isEmpty = !value || value.trim() === ''
  const emptyClass = 'border-red-400 bg-red-50 placeholder:text-red-300 focus:border-red-500'
  const normalClass = 'border-border focus:border-primary'
  const base = 'w-full px-3 py-2 text-sm border rounded-sm bg-white focus:outline-none transition-colors'
  const warning = getSanityWarning(def.key, value)

  function handleBlur(e) {
    if (def.type === 'number') { const f = formatNumber(e.target.value); if (f !== e.target.value) onChange(def.key, f) }
    else if (def.type === 'percent') { const f = formatPercent(e.target.value); if (f !== e.target.value) onChange(def.key, f) }
  }

  let input
  if (def.type === 'select') {
    input = (
      <select value={value} onChange={e => onChange(def.key, e.target.value)} className={`${base} ${isEmpty ? emptyClass : normalClass}`}>
        <option value="">— Select —</option>
        {def.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  } else if (def.type === 'date') {
    input = <input type="date" value={value} onChange={e => onChange(def.key, e.target.value)} className={`${base} ${isEmpty ? emptyClass : normalClass}`} />
  } else if (def.textarea) {
    input = <textarea value={value} onChange={e => onChange(def.key, e.target.value)} placeholder={def.hint || `Enter ${def.label.toLowerCase()}`} rows={3} className={`${base} ${isEmpty ? emptyClass : normalClass} resize-none`} />
  } else {
    input = <input type="text" value={value} onChange={e => onChange(def.key, e.target.value)} onBlur={handleBlur} placeholder={def.type === 'number' ? 'e.g. 12,500,000' : def.type === 'percent' ? 'e.g. 1.50' : def.hint || ''} className={`${base} ${isEmpty ? emptyClass : normalClass}`} />
  }

  return (
    <div>
      {input}
      {warning && <p className="mt-1 text-xs text-amber-600 flex items-center gap-1"><svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>{warning}</p>}
    </div>
  )
}

// ─── Dynamic Entity List ──────────────────────────────────────────────────────

function EntityList({ label, entities, onChange }) {
  function update(i, val) { onChange(entities.map((e, idx) => idx === i ? val : e)) }

  return (
    <div>
      <div className="mb-2">
        <span className="text-xs font-semibold text-[#555555] uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex flex-col gap-2">
        {entities.map((entity, i) => (
          <div key={i}>
            <input
              type="text"
              value={entity}
              onChange={e => update(i, e.target.value)}
              placeholder={`${label.replace(' Entities', '')} ${i + 1} legal name`}
              className={`w-full px-3 py-2 text-sm border rounded-sm bg-white focus:outline-none transition-colors ${!entity.trim() ? 'border-red-400 bg-red-50' : 'border-border focus:border-primary'}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Section Toggles ──────────────────────────────────────────────────────────

function SectionToggles({ rowToggles, onToggle }) {
  return (
    <div className="bg-surface border border-border rounded-sm p-5 mb-8">
      <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-widest mb-4">Document Sections</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {TOGGLEABLE_ROWS.map(row => (
          <div key={row.key} className="flex items-center justify-between gap-3 bg-white border border-border rounded-sm px-3 py-2">
            <span className={`text-xs font-medium ${rowToggles[row.key] ? 'text-primary' : 'text-[#aaaaaa] line-through'}`}>{row.label}</span>
            <Toggle enabled={rowToggles[row.key]} onChange={val => onToggle(row.key, val)} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Review Step ──────────────────────────────────────────────────────────────

function ReviewStep({ fields, onFieldChange, rowToggles, onToggle, borrowerEntities, onBorrowerChange, guarantorEntities, onGuarantorChange, onGenerate, generating, error, onSaveDraft }) {
  const visibleFields = FIELD_DEFS.filter(f => !f.rowKey || rowToggles[f.rowKey])
  const missingCount = visibleFields.filter(f => !fields[f.key]?.trim()).length

  return (
    <div>
      {missingCount > 0 && (
        <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-sm flex items-center gap-3">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          <p className="text-amber-800 text-xs font-medium">{missingCount} field{missingCount !== 1 ? 's' : ''} still need{missingCount === 1 ? 's' : ''} input — highlighted in red below.</p>
        </div>
      )}

      <div className="space-y-8">
        {GROUPS.map(group => {
          const groupFields = FIELD_DEFS.filter(f => f.group === group && (!f.rowKey || rowToggles[f.rowKey]))
          if (groupFields.length === 0) return null
          return (
            <div key={group}>
              <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-widest mb-4 pb-2 border-b border-border">{group}</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {groupFields.map(def => (
                  <div key={def.key} className={def.textarea ? 'col-span-2' : ''}>
                    <label className="block text-xs font-medium text-[#444444] mb-1">
                      {def.label}
                      {!fields[def.key]?.trim() && <span className="ml-1.5 text-red-500 font-semibold">*</span>}
                    </label>
                    <FieldInput def={def} value={fields[def.key] || ''} onChange={onFieldChange} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Acknowledgement entities */}
        <div>
          <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-widest mb-4 pb-2 border-b border-border">Acknowledgement</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-6">
            <EntityList label="Borrower Entities" entities={borrowerEntities} onChange={onBorrowerChange} />
            <EntityList label="Guarantor Entities" entities={guarantorEntities} onChange={onGuarantorChange} />
          </div>
        </div>

      </div>

      {error && <p className="mt-4 text-xs text-red-600">{error}</p>}

      <div className="mt-8 pt-6 border-t border-border flex gap-3">
        <button onClick={onSaveDraft} className="px-5 py-3 border border-border text-[#555555] text-sm font-medium rounded-sm hover:border-primary hover:text-primary transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
          Save Draft
        </button>
        <button onClick={onGenerate} disabled={generating} className="flex-1 py-3 bg-primary text-white text-sm font-semibold rounded-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
          {generating ? (<><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Generating LOI...</>) : 'Generate LOI Document'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LOIDrafterPage() {
  const [step, setStep] = useState(1)
  const [fields, setFields] = useState(emptyFields())
  const [rowToggles, setRowToggles] = useState(initialToggles())
  const [borrowerEntities, setBorrowerEntities] = useState(['', ''])
  const [guarantorEntities, setGuarantorEntities] = useState([''])
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [draftSaved, setDraftSaved] = useState(false)
  const drafts = listDrafts()

  useEffect(() => {
    if (fields.loanAmount) {
      const sec = calcSecurityAmount(fields.loanAmount)
      if (sec) setFields(prev => ({ ...prev, securityAmount: sec }))
    }
  }, [fields.loanAmount])

  function handleFieldChange(key, value) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  function handleExtracted(extracted) {
    const updated = emptyFields()
    if (extracted.subject)             updated.subject = extracted.subject
    if (extracted.brokerName)          updated.brokerName = extracted.brokerName
    if (extracted.recipient)           updated.recipient = extracted.recipient
    if (extracted.propertyDescription) updated.propertyDescription = extracted.propertyDescription
    if (extracted.borrowerName)        updated.borrowerName = extracted.borrowerName
    if (extracted.guarantorName)       updated.guarantors = extracted.guarantorName
    if (extracted.term)                updated.term = String(extracted.term)
    if (extracted.interestReserveAmount) updated.interestReserve = formatNumber(extracted.interestReserveAmount)
    if (extracted.askingPrice) {
      const loan = Math.round(Number(extracted.askingPrice) * 0.70)
      if (!isNaN(loan) && loan > 0) {
        updated.loanAmount = loan.toLocaleString('en-US')
        updated.securityAmount = Math.round(loan * 1.25).toLocaleString('en-US')
      }
    }
    setFields(updated)
    setStep(2)
  }

  function handleSaveDraft() {
    saveDraft(fields.subject || 'draft', { fields, rowToggles, borrowerEntities, guarantorEntities })
    setDraftSaved(true)
    setTimeout(() => setDraftSaved(false), 2000)
  }

  function handleLoadDraft(key) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.fields) setFields(d.fields)
      if (d.rowToggles) setRowToggles(d.rowToggles)
      if (d.borrowerEntities) setBorrowerEntities(d.borrowerEntities)
      if (d.guarantorEntities) setGuarantorEntities(d.guarantorEntities)
      setStep(2)
    } catch {}
  }

  async function handleGenerate() {
    setGenerating(true); setGenerateError('')
    try {
      const disabledRows = Object.entries(rowToggles).filter(([, v]) => !v).map(([k]) => k)
      const docFields = {
        ...fields,
        acceptanceDeadline: formatDeadlineForDoc(fields.acceptanceDeadline),
        borrowerEntities,
        guarantorEntities,
      }

      const blob = await generateLoi(docFields, disabledRows)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(fields.subject || 'LOI').replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_').substring(0, 60)}.docx`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStep(3)
    } catch (err) {
      setGenerateError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  function handleReset() {
    setFields(emptyFields()); setRowToggles(initialToggles())
    setBorrowerEntities(['', '']); setGuarantorEntities([''])
    setStep(1)
  }

  return (
    <Layout subtitle="LOI Drafter" backTo="/">
      <div className="flex items-center justify-between mb-8">
        <StepIndicator step={step} />
        {draftSaved && <span className="text-xs text-green-600 font-medium">Draft saved</span>}
      </div>

      {step === 1 && (
        <div>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-primary tracking-tight">Upload CIM</h2>
            <p className="text-[#777777] text-sm mt-1">Upload a broker CIM to auto-extract deal information, or skip to fill manually.</p>
          </div>
          <UploadStep onExtracted={handleExtracted} onSkip={() => setStep(2)} drafts={drafts} onLoadDraft={handleLoadDraft} />
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-primary tracking-tight">Review Fields</h2>
              <p className="text-[#777777] text-sm mt-1">Toggle sections, fill fields, then generate.</p>
            </div>
            <button onClick={() => setStep(1)} className="text-xs text-accent font-semibold hover:underline mt-1">Re-upload CIM</button>
          </div>
          <ReviewStep
            fields={fields} onFieldChange={handleFieldChange}
            rowToggles={rowToggles} onToggle={(k, v) => setRowToggles(p => ({ ...p, [k]: v }))}
            borrowerEntities={borrowerEntities} onBorrowerChange={setBorrowerEntities}
            guarantorEntities={guarantorEntities} onGuarantorChange={setGuarantorEntities}
            onGenerate={handleGenerate} generating={generating} error={generateError}
            onSaveDraft={handleSaveDraft}
          />
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-5">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
          </div>
          <h2 className="text-2xl font-bold text-primary mb-2">LOI Generated</h2>
          <p className="text-[#777777] text-sm mb-8">Your Letter of Intent has been downloaded.</p>
          <div className="flex gap-3">
            <button onClick={() => { setStep(2); setGenerateError('') }} className="px-5 py-2.5 border border-border text-[#555555] text-sm font-medium rounded-sm hover:border-primary hover:text-primary transition-colors">Edit Fields</button>
            <button onClick={handleGenerate} disabled={generating} className="px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-sm hover:bg-primary/90 disabled:opacity-40 transition-colors">{generating ? 'Downloading...' : 'Download Again'}</button>
            <button onClick={handleReset} className="px-5 py-2.5 border border-border text-[#555555] text-sm font-medium rounded-sm hover:border-primary hover:text-primary transition-colors">New LOI</button>
          </div>
        </div>
      )}
    </Layout>
  )
}
