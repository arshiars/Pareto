import { useRef, useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { slugify, matchesSlug } from '../utils/slug.js'
import * as XLSX from 'xlsx'
import { supabase } from '../services/supabase.js'
import { queryLoanDatabase } from '../services/api.js'
import LoanDetailPage from './LoanDetailPage.jsx'
import { formatCurrency, formatPercent } from '../utils/formatters.js'

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtMoney(v) {
  if (v === null || v === undefined) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function fmtPct(v) {
  if (v === null || v === undefined) return '—'
  return `${(v * 100).toFixed(2)}%`
}

function fmtDate(v) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-CA', { year: 'numeric', month: 'short' })
}

function fmtX(v) {
  if (v === null || v === undefined) return '—'
  return `${Number(v).toFixed(2)}x`
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function capRateClass(v) {
  if (v === null || v === undefined) return ''
  const pct = v * 100
  if (pct >= 5) return 'text-green-700 font-semibold'
  if (pct >= 4) return 'text-yellow-700 font-semibold'
  return 'text-red-600 font-semibold'
}

function ltvClass(v) {
  if (v === null || v === undefined) return ''
  const pct = v * 100
  if (pct < 60) return 'text-green-700 font-semibold'
  if (pct < 75) return 'text-yellow-700 font-semibold'
  return 'text-red-600 font-semibold'
}

// ─── Province badge colors ────────────────────────────────────────────────────

const PROVINCE_COLORS = {
  ON: 'bg-blue-100 text-blue-800',
  BC: 'bg-green-100 text-green-800',
  QC: 'bg-purple-100 text-purple-800',
  AB: 'bg-orange-100 text-orange-800',
  MB: 'bg-yellow-100 text-yellow-800',
  SK: 'bg-pink-100 text-pink-800',
  NS: 'bg-teal-100 text-teal-800',
  NB: 'bg-indigo-100 text-indigo-800',
}

function ProvinceBadge({ province }) {
  if (!province) return <span className="text-[#999999]">—</span>
  const cls = PROVINCE_COLORS[province] || 'bg-surface text-[#555555]'
  return <span className={`text-xs px-2 py-0.5 rounded-sm font-medium ${cls}`}>{province}</span>
}

// ─── Column tab definitions ───────────────────────────────────────────────────

const TABS = [
  { id: 'financing', label: 'Financing' },
  { id: 'income', label: 'Income & Operating Expenses' },
  { id: 'units', label: 'Unit Mix' },
  { id: 'commercial', label: 'Commercial' },
]

const TAB_COLUMNS = {
  financing: [
    { key: 'net_loan',   label: 'Net Loan',    render: (l) => fmtMoney(l.net_loan) },
    { key: 'gross_loan', label: 'Gross Loan',   render: (l) => fmtMoney(l.gross_loan) },
    { key: 'ltv_net',    label: 'LTV (Net)',    render: (l) => <span className={ltvClass(l.ltv_net)}>{fmtPct(l.ltv_net)}</span> },
    { key: 'ltv_gross',  label: 'LTV (Gross)',  render: (l) => fmtPct(l.ltv_gross) },
    { key: 'dsc_net',    label: 'DSC (Net)',    render: (l) => fmtX(l.dsc_net) },
    { key: 'cap_rate',   label: 'Cap Rate',     render: (l) => <span className={capRateClass(l.cap_rate)}>{fmtPct(l.cap_rate)}</span> },
  ],
  income: [
    { key: 'noi',                label: 'NOI',        render: (l) => fmtMoney(l.noi) },
    { key: 'egi',                label: 'EGI',        render: (l) => fmtMoney(l.egi) },
    { key: 'operating_expenses', label: 'OpEx',       render: (l) => fmtMoney(l.operating_expenses) },
    { key: 'opex_ratio',         label: 'OpEx Ratio', render: (l) => fmtPct(l.opex_ratio) },
    { key: 'property_tax',       label: 'Prop. Tax',  render: (l) => fmtMoney(l.property_tax) },
    { key: 'pt_per_unit',        label: 'PT / Unit',  render: (l) => fmtMoney(l.pt_per_unit) },
  ],
  units: [
    { key: 'bachelor_rent_market', label: 'Bach.',  render: (l) => fmtMoney(l.bachelor_rent_market) },
    { key: 'bed1_rent_market',     label: '1 BR',   render: (l) => fmtMoney(l.bed1_rent_market) },
    { key: 'bed2_rent_market',     label: '2 BR',   render: (l) => fmtMoney(l.bed2_rent_market) },
    { key: 'bed3_rent_market',     label: '3 BR',   render: (l) => fmtMoney(l.bed3_rent_market) },
    { key: 'bed4plus_rent_market', label: '4+ BR',  render: (l) => fmtMoney(l.bed4plus_rent_market) },
    { key: 'townhouse_rent_market',label: 'TH',     render: (l) => fmtMoney(l.townhouse_rent_market) },
  ],
  commercial: [
    { key: 'commercial_area',  label: 'Area (sf)',  render: (l) => l.commercial_area ? Number(l.commercial_area).toLocaleString() : '—' },
    { key: 'commercial_value', label: 'Value',      render: (l) => fmtMoney(l.commercial_value) },
    { key: 'commercial_egi',   label: 'EGI',        render: (l) => fmtMoney(l.commercial_egi) },
    { key: 'commercial_opex',  label: 'OpEx',       render: (l) => fmtMoney(l.commercial_opex) },
    { key: 'commercial_rate',  label: 'Rate / sf',  render: (l) => l.commercial_rate ? `$${Number(l.commercial_rate).toFixed(2)}` : '—' },
    { key: 'commercial_cap_rate', label: 'Cap Rate', render: (l) => fmtPct(l.commercial_cap_rate) },
  ],
}

// ─── Excel import helpers ─────────────────────────────────────────────────────

function parseNum(val) {
  if (val === null || val === undefined || val === '') return null
  // Resolve SheetJS shared formula objects
  const raw = (val && typeof val === 'object' && 'result' in val) ? val.result : val
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? null : n
}

function parseDate(val) {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

// Builds a column-name → index map from the header row for unique columns,
// falls back to 0-based positional index for duplicate-named columns (unit mix).
function rowToLoan(row, colMap) {
  // Look up by column name (unique columns)
  const n = (name) => parseNum(row[colMap[name]])
  const s = (name) => String(row[colMap[name]] ?? '').trim() || null
  // Look up by 0-based Excel column index (1-based col number minus 1)
  const pos = (col1based) => parseNum(row[col1based - 1])

  return {
    loan_number:               s('Loan #'),
    fn_loan_number:            s('FN L#'),
    loan_name:                 s('Loan Name'),
    address:                   s('Address'),
    city:                      s('City'),
    province:                  s('Province'),
    region:                    s('Region'),
    asset_type:                s('Asset Type'),
    year_built:                row[colMap['Year Built']] ? parseInt(row[colMap['Year Built']]) || null : null,
    funding_date:              parseDate(row[colMap['Funding Date']]),
    ltv_net:                   n('U/W LTV (Net)'),
    ltv_gross:                 n('U/W LTV (Gross)'),
    gross_loan:                n('Gross Loan'),
    units:                     row[colMap['# Units']] ? parseInt(row[colMap['# Units']]) || null : null,
    residential_ks_value:      n('Residential KS Value'),
    ks_value_per_unit:         n('KS Value/Unit'),
    net_loan:                  n('Net Loan'),
    commercial_net_loan:       n('Commercial Net Loan'),
    cap_rate:                  n('Cap Rate'),
    commercial_cap_rate:       n('Commercial Cap Rate'),
    dsc_net:                   n('DSC - Net (Max Rate)'),
    dsc_gross:                 n('DSC - Gross (Max Rate)'),
    noi:                       n('NOI'),
    noi_per_debt:              n('NOI / Debt'),
    egi:                       n('EGI'),
    operating_expenses:        n('Operating Exp.'),
    opex_ratio:                n('Opex Ratio'),
    opex_per_unit:             n('Operating Exp/unit'),
    property_tax:              n('Property Tax'),
    insurance:                 n('Insurance'),
    utilities:                 n('Utilities'),
    pt_per_unit:               n('PT / Unit'),
    insurance_per_unit:        n('I / Unit'),
    utilities_per_unit:        n('U / Unit'),
    // Unit mix — positional (cols 37–71) because sq ft / PSF headers repeat per bedroom type
    bachelor_rent_market:      pos(37),
    bachelor_rent_affordable:  pos(38),
    bachelor_sqft_market:      pos(39),
    bachelor_sqft_affordable:  pos(40),
    bachelor_psf_market:       pos(41),
    bachelor_psf_affordable:   pos(42),
    bed1_rent_market:          pos(43),
    bed1_rent_affordable:      pos(44),
    bed1_sqft_market:          pos(45),
    bed1_sqft_affordable:      pos(46),
    bed1_psf_market:           pos(47),
    bed1_psf_affordable:       pos(48),
    bed2_rent_market:          pos(49),
    bed2_rent_affordable:      pos(50),
    bed2_sqft_market:          pos(51),
    bed2_sqft_affordable:      pos(52),
    bed2_psf_market:           pos(53),
    bed2_psf_affordable:       pos(54),
    bed3_rent_market:          pos(55),
    bed3_rent_affordable:      pos(56),
    bed3_sqft_market:          pos(57),
    bed3_sqft_affordable:      pos(58),
    bed3_psf_market:           pos(59),
    bed3_psf_affordable:       pos(60),
    bed4plus_rent_market:      pos(61),
    bed4plus_rent_affordable:  pos(62),
    bed4plus_sqft_market:      pos(63),
    bed4plus_sqft_affordable:  pos(64),
    bed4plus_psf_market:       pos(65),
    bed4plus_psf_affordable:   pos(66),
    townhouse_rent_market:     pos(67),
    townhouse_rent_affordable: pos(68),
    townhouse_sqft:            pos(69),
    townhouse_psf_market:      pos(70),
    townhouse_psf_affordable:  pos(71),
    commercial_area:           n('Commercial Area'),
    commercial_value:          n('Commercial Value'),
    commercial_value_per_area: n('Value/Area'),
    commercial_egi:            n('Commercial EGI'),
    commercial_opex:           n('Commercial Operating Expense'),
    commercial_opex_ratio:     n('OpEx Ratio'),
    commercial_rent:           n('Commercial Rent'),
    commercial_rate:           n('Commercial Rate'),
    comments:                  s('Comments'),
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-border rounded-sm px-5 py-4">
      <p className="text-xs text-[#999999] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold text-primary">{value}</p>
    </div>
  )
}

function FilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-sm border transition-colors font-medium ${
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-white text-[#555555] border-border hover:border-primary hover:text-primary'
      }`}
    >
      {label}
    </button>
  )
}

const PER_PAGE = 20

// ─── Main component ───────────────────────────────────────────────────────────

export default function CMHCDatabasePage() {
  const navigate = useNavigate()
  const { slug } = useParams()
  const fileInputRef = useRef(null)
  const qaRef = useRef(null)
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState(null)
  const [selectedLoan, setSelectedLoan] = useState(null)

  // Resolve loan from URL slug (address-based) once loans are loaded
  useEffect(() => {
    if (slug && !selectedLoan && loans.length > 0) {
      const match = loans.find((l) =>
        matchesSlug([l.address, l.city].filter(Boolean).join(' '), slug)
      )
      if (match) setSelectedLoan(match)
    }
    if (!slug) setSelectedLoan(null)
  }, [slug, loans])

  // Filters
  const [search, setSearch] = useState('')
  const [selProvinces, setSelProvinces] = useState([])
  const [selAssetTypes, setSelAssetTypes] = useState([])
  const [capMin, setCapMin] = useState('')
  const [capMax, setCapMax] = useState('')
  const [ltvMax, setLtvMax] = useState('')

  // Table
  const [activeTab, setActiveTab] = useState('financing')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('funding_date')
  const [sortDir, setSortDir] = useState('desc')

  // Q&A
  const [qaHistory, setQaHistory] = useState([])
  const [qaInput, setQaInput] = useState('')
  const [qaLoading, setQaLoading] = useState(false)

  // ── Fetch on mount ──
  useEffect(() => {
    supabase.from('cmhc_loans').select('*').order('funding_date', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setLoans(data)
        setLoading(false)
      })
  }, [])

  // ── Derived filter options ──
  const allProvinces = useMemo(() =>
    [...new Set(loans.map(l => l.province).filter(Boolean))].sort(), [loans])
  const allAssetTypes = useMemo(() =>
    [...new Set(loans.map(l => l.asset_type).filter(Boolean))].sort(), [loans])

  // ── Filtered rows ──
  const filtered = useMemo(() => {
    return loans.filter(l => {
      if (search) {
        const s = search.toLowerCase()
        if (
          !l.loan_name?.toLowerCase().includes(s) &&
          !l.address?.toLowerCase().includes(s) &&
          !l.city?.toLowerCase().includes(s) &&
          !l.loan_number?.toLowerCase().includes(s)
        ) return false
      }
      if (selProvinces.length && !selProvinces.includes(l.province)) return false
      if (selAssetTypes.length && !selAssetTypes.includes(l.asset_type)) return false
      if (capMin !== '' && (l.cap_rate === null || l.cap_rate * 100 < parseFloat(capMin))) return false
      if (capMax !== '' && (l.cap_rate === null || l.cap_rate * 100 > parseFloat(capMax))) return false
      if (ltvMax !== '' && (l.ltv_net === null || l.ltv_net * 100 > parseFloat(ltvMax))) return false
      return true
    })
  }, [loans, search, selProvinces, selAssetTypes, capMin, capMax, ltvMax])

  // ── Sorted rows ──
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  // ── Paginated rows ──
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE))
  const pageRows = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // ── Stats ──
  const stats = useMemo(() => {
    const n = filtered.length
    if (n === 0) return null
    const withCap = filtered.filter(l => l.cap_rate)
    const withLtv = filtered.filter(l => l.ltv_net)
    const avgCap = withCap.length ? withCap.reduce((s, l) => s + l.cap_rate, 0) / withCap.length : null
    const avgLtv = withLtv.length ? withLtv.reduce((s, l) => s + l.ltv_net, 0) / withLtv.length : null
    const totalNet = filtered.reduce((s, l) => s + (l.net_loan || 0), 0)
    const avgNoi = filtered.filter(l => l.noi).length
      ? filtered.filter(l => l.noi).reduce((s, l) => s + l.noi, 0) / filtered.filter(l => l.noi).length
      : null
    return { n, avgCap, avgLtv, totalNet, avgNoi }
  }, [filtered])

  // ── Sort handler ──
  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(1)
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span className="ml-1 text-[#cccccc]">↕</span>
    return <span className="ml-1 text-primary">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // ── Toggle filter pills ──
  function toggleProvince(p) {
    setSelProvinces(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
    setPage(1)
  }
  function toggleAssetType(a) {
    setSelAssetTypes(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])
    setPage(1)
  }

  // ── Q&A ──
  async function handleQuery(e) {
    e.preventDefault()
    const q = qaInput.trim()
    if (!q || qaLoading) return
    setQaInput('')
    setQaLoading(true)
    const entry = { question: q, answer: null, sql: null, rowCount: null, error: null }
    setQaHistory(prev => [entry, ...prev])
    try {
      const { answer, sql, rowCount } = await queryLoanDatabase(q)
      setQaHistory(prev => prev.map((h, i) => i === 0 ? { ...h, answer, sql, rowCount } : h))
    } catch (err) {
      setQaHistory(prev => prev.map((h, i) => i === 0 ? { ...h, error: err.message } : h))
    } finally {
      setQaLoading(false)
    }
  }

  // ── Excel import ──
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setImportMsg(null)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })

      // Build column-name → 0-based index map from header row
      const headerRow = rows[0] || []
      const colMap = {}
      headerRow.forEach((h, i) => { if (h) colMap[String(h).trim()] = i })

      const parsed = rows.slice(1).filter(r => r[0]).map(r => rowToLoan(r, colMap)).filter(l => l.loan_number)
      if (!parsed.length) { setImportMsg({ type: 'error', text: 'No valid loan rows found.' }); return }
      const { error } = await supabase.from('cmhc_loans').upsert(parsed, { onConflict: 'loan_number' })
      if (error) throw error
      // Refresh
      const { data } = await supabase.from('cmhc_loans').select('*').order('funding_date', { ascending: false })
      if (data) setLoans(data)
      setImportMsg({ type: 'success', text: `Imported ${parsed.length} loans successfully.` })
    } catch (err) {
      setImportMsg({ type: 'error', text: err.message || 'Import failed.' })
    } finally {
      setImporting(false)
    }
  }

  const hasFilters = search || selProvinces.length || selAssetTypes.length || capMin || capMax || ltvMax

  // ── Route to detail page ──
  if (selectedLoan) {
    return <LoanDetailPage loan={selectedLoan} />
  }

  // ── Main render ──
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-[#777777] hover:text-primary transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-primary text-lg font-bold tracking-tight">Pareto</h1>
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">Real Estate Underwriting</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <span className="text-[#555555] text-xs tracking-widest uppercase font-medium">KingSett Capital</span>
          </div>
          <div className="flex items-center gap-3">
            {importMsg && (
              <span className={`text-xs font-medium ${importMsg.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
                {importMsg.text}
              </span>
            )}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-white rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {importing ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
              {importing ? 'Importing...' : 'Import from Excel'}
            </button>
            <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-12 w-auto" />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-8 py-6 flex flex-col gap-5">

        {/* Page title */}
        <div>
          <h2 className="text-2xl font-bold text-primary tracking-tight">CMHC Loan Database</h2>
          <p className="text-[#777777] text-sm mt-1">{loading ? 'Loading…' : `${loans.length} loans total`}</p>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-5 gap-3">
            <StatCard label="Loans (filtered)" value={stats.n} />
            <StatCard label="Avg Cap Rate" value={stats.avgCap !== null ? fmtPct(stats.avgCap) : '—'} />
            <StatCard label="Avg LTV (Net)" value={stats.avgLtv !== null ? fmtPct(stats.avgLtv) : '—'} />
            <StatCard label="Total Net Loan" value={fmtMoney(stats.totalNet)} />
            <StatCard label="Avg NOI" value={fmtMoney(stats.avgNoi)} />
          </div>
        )}

        <div className="flex gap-5 flex-1">
          {/* ── Filter sidebar ── */}
          <aside className="w-52 flex-shrink-0 space-y-5">
            {/* Search */}
            <div>
              <label className="block text-xs font-semibold text-[#777777] uppercase tracking-wider mb-2">Search</label>
              <input
                type="text"
                placeholder="Name, address, loan #…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="w-full text-sm border border-border rounded-sm px-3 py-2 focus:outline-none focus:border-primary placeholder-[#bbbbbb]"
              />
            </div>

            {/* Province */}
            <div>
              <label className="block text-xs font-semibold text-[#777777] uppercase tracking-wider mb-2">Province</label>
              <div className="flex flex-wrap gap-1.5">
                {allProvinces.map(p => (
                  <FilterPill key={p} label={p} active={selProvinces.includes(p)} onClick={() => toggleProvince(p)} />
                ))}
              </div>
            </div>

            {/* Asset Type */}
            <div>
              <label className="block text-xs font-semibold text-[#777777] uppercase tracking-wider mb-2">Asset Type</label>
              <div className="flex flex-col gap-1.5">
                {allAssetTypes.map(a => (
                  <FilterPill key={a} label={a} active={selAssetTypes.includes(a)} onClick={() => toggleAssetType(a)} />
                ))}
              </div>
            </div>

            {/* Cap Rate range */}
            <div>
              <label className="block text-xs font-semibold text-[#777777] uppercase tracking-wider mb-2">Cap Rate (%)</label>
              <div className="flex gap-2 items-center">
                <input type="number" placeholder="Min" value={capMin} onChange={e => { setCapMin(e.target.value); setPage(1) }}
                  className="w-full text-sm border border-border rounded-sm px-2 py-1.5 focus:outline-none focus:border-primary" />
                <span className="text-[#999999] text-xs">–</span>
                <input type="number" placeholder="Max" value={capMax} onChange={e => { setCapMax(e.target.value); setPage(1) }}
                  className="w-full text-sm border border-border rounded-sm px-2 py-1.5 focus:outline-none focus:border-primary" />
              </div>
            </div>

            {/* LTV max */}
            <div>
              <label className="block text-xs font-semibold text-[#777777] uppercase tracking-wider mb-2">Max LTV (%)</label>
              <input type="number" placeholder="e.g. 75" value={ltvMax} onChange={e => { setLtvMax(e.target.value); setPage(1) }}
                className="w-full text-sm border border-border rounded-sm px-3 py-1.5 focus:outline-none focus:border-primary" />
            </div>

            {/* Ask AI shortcut */}
            <button
              onClick={() => qaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-primary border border-primary/30 bg-primary/5 rounded-sm hover:bg-primary/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Natural Language Query
            </button>

            {/* Clear */}
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setSelProvinces([]); setSelAssetTypes([]); setCapMin(''); setCapMax(''); setLtvMax(''); setPage(1) }}
                className="text-xs text-accent hover:text-primary font-medium underline"
              >
                Clear all filters
              </button>
            )}
          </aside>

          {/* ── Table ── */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-[#777777] text-sm">Loading loans…</div>
            ) : sorted.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-[#777777] text-sm">No loans match your filters.</div>
            ) : (
              <>
                {/* Tab bar */}
                <div className="flex gap-1 mb-3 border-b border-border">
                  {TABS.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                        activeTab === t.id
                          ? 'border-primary text-primary'
                          : 'border-transparent text-[#777777] hover:text-primary'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="bg-white border border-border rounded-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-surface border-b border-border">
                      <tr>
                        {/* Pinned columns */}
                        <th className="text-left px-4 py-3 text-xs text-[#777777] uppercase tracking-wider font-semibold cursor-pointer hover:text-primary whitespace-nowrap" onClick={() => handleSort('loan_name')}>
                          Loan Name <SortIcon col="loan_name" />
                        </th>
                        <th className="text-left px-3 py-3 text-xs text-[#777777] uppercase tracking-wider font-semibold cursor-pointer hover:text-primary" onClick={() => handleSort('city')}>
                          City <SortIcon col="city" />
                        </th>
                        <th className="text-left px-3 py-3 text-xs text-[#777777] uppercase tracking-wider font-semibold">
                          Prov.
                        </th>
                        <th className="text-right px-3 py-3 text-xs text-[#777777] uppercase tracking-wider font-semibold cursor-pointer hover:text-primary" onClick={() => handleSort('units')}>
                          Units <SortIcon col="units" />
                        </th>
                        <th className="text-right px-3 py-3 text-xs text-[#777777] uppercase tracking-wider font-semibold cursor-pointer hover:text-primary whitespace-nowrap" onClick={() => handleSort('funding_date')}>
                          Funded <SortIcon col="funding_date" />
                        </th>
                        {/* Tab columns */}
                        {TAB_COLUMNS[activeTab].map(col => (
                          <th key={col.key} className="text-right px-3 py-3 text-xs text-[#777777] uppercase tracking-wider font-semibold cursor-pointer hover:text-primary whitespace-nowrap" onClick={() => handleSort(col.key)}>
                            {col.label} <SortIcon col={col.key} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pageRows.map(loan => (
                        <tr
                          key={loan.id}
                          onClick={() => { setSelectedLoan(loan); navigate(`/cmhc-database/${slugify([loan.address, loan.city].filter(Boolean).join(' '))}`) }}
                          className="hover:bg-surface cursor-pointer transition-colors group"
                        >
                          <td className="px-4 py-3 font-medium text-primary group-hover:text-accent transition-colors max-w-[180px] truncate">
                            {loan.loan_name || loan.loan_number || '—'}
                          </td>
                          <td className="px-3 py-3 text-[#555555] whitespace-nowrap">{loan.city || '—'}</td>
                          <td className="px-3 py-3"><ProvinceBadge province={loan.province} /></td>
                          <td className="px-3 py-3 text-right text-[#555555]">{loan.units ?? '—'}</td>
                          <td className="px-3 py-3 text-right text-[#555555] whitespace-nowrap">{fmtDate(loan.funding_date)}</td>
                          {TAB_COLUMNS[activeTab].map(col => (
                            <td key={col.key} className="px-3 py-3 text-right whitespace-nowrap">{col.render(loan)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-xs text-[#777777]">
                      Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, sorted.length)} of {sorted.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1.5 text-xs border border-border rounded-sm disabled:opacity-40 hover:border-primary hover:text-primary transition-colors"
                      >
                        Previous
                      </button>
                      <span className="text-xs text-[#777777]">Page {page} of {totalPages}</span>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-1.5 text-xs border border-border rounded-sm disabled:opacity-40 hover:border-primary hover:text-primary transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Q&A Panel ── */}
        {!loading && loans.length > 0 && (
          <div ref={qaRef} className="border-t border-border pt-6 mt-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-7 h-7 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-primary">Natural Language Query</h3>
                <p className="text-xs text-[#999999]">
                  Query the full loan database using plain English
                </p>
              </div>
            </div>

            <form onSubmit={handleQuery} className="flex gap-3">
              <input
                type="text"
                value={qaInput}
                onChange={e => setQaInput(e.target.value)}
                placeholder="e.g. What is the average cap rate for BC properties? Which deals have the highest property taxes per unit?"
                disabled={qaLoading}
                className="flex-1 text-sm border border-border rounded-sm px-4 py-2.5 focus:outline-none focus:border-primary placeholder-[#bbbbbb] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!qaInput.trim() || qaLoading}
                className="px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
              >
                {qaLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {qaLoading ? 'Thinking…' : 'Ask'}
              </button>
            </form>

            {qaHistory.length > 0 && (
              <div className="mt-4 space-y-4">
                {qaHistory.map((h, i) => (
                  <div key={i} className="bg-white border border-border rounded-sm overflow-hidden">
                    {/* Question header */}
                    <div className="px-5 py-3 bg-surface border-b border-border flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-primary">{h.question}</p>
                      {h.rowCount !== null && (
                        <span className="text-xs text-[#999999] flex-shrink-0 mt-0.5">{h.rowCount} row{h.rowCount !== 1 ? 's' : ''} queried</span>
                      )}
                    </div>

                    {/* Body */}
                    <div className="px-5 py-4">
                      {h.answer === null && h.error === null ? (
                        <div className="flex items-center gap-2 text-[#777777] text-sm">
                          <svg className="w-4 h-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Generating query…
                        </div>
                      ) : h.error ? (
                        <p className="text-sm text-red-600">{h.error}</p>
                      ) : (
                        <div className="space-y-4">
                          <div className="text-sm text-[#333333] leading-relaxed">
                            <MarkdownAnswer text={h.answer} />
                          </div>
                          {/* Collapsible SQL */}
                          {h.sql && (
                            <details className="group">
                              <summary className="text-xs text-[#999999] cursor-pointer hover:text-primary select-none flex items-center gap-1">
                                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                View generated SQL
                              </summary>
                              <pre className="mt-2 p-3 bg-surface rounded-sm text-xs font-mono text-[#555555] overflow-x-auto whitespace-pre-wrap border border-border">
                                {h.sql}
                              </pre>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function renderInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-primary font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-surface px-1 rounded text-xs font-mono">$1</code>')
}

function MarkdownAnswer({ text }) {
  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      elements.push(<div key={i} className="h-1.5" />)
      i++; continue
    }

    // H2
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-sm font-bold text-primary mt-4 mb-1 first:mt-0 tracking-tight"
          dangerouslySetInnerHTML={{ __html: renderInline(line.slice(3)) }} />
      )
      i++; continue
    }

    // H3
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-xs font-bold text-[#555555] uppercase tracking-wider mt-3 mb-1"
          dangerouslySetInnerHTML={{ __html: renderInline(line.slice(4)) }} />
      )
      i++; continue
    }

    // Table — collect consecutive | lines
    if (line.startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]); i++
      }
      const parseRow = (l) => l.split('|').slice(1, -1).map(c => c.trim())
      const isDivider = (l) => /^\|[\s\-:|]+\|$/.test(l)
      const nonDivider = tableLines.filter(l => !isDivider(l))
      if (nonDivider.length >= 2) {
        const headers = parseRow(nonDivider[0])
        const dataRows = nonDivider.slice(1).map(parseRow)
        elements.push(
          <div key={`t${i}`} className="overflow-x-auto my-2 rounded-sm border border-border">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-surface">
                  {headers.map((h, hi) => (
                    <th key={hi} className="text-left px-3 py-2 border-b border-border font-semibold text-[#777777] uppercase tracking-wider whitespace-nowrap">
                      <span dangerouslySetInnerHTML={{ __html: renderInline(h) }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 1 ? 'bg-surface/60' : 'bg-white'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 border-b border-border/50 text-[#333333] whitespace-nowrap">
                        <span dangerouslySetInnerHTML={{ __html: renderInline(cell) }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <div key={i} className="border-l-2 border-primary/30 pl-3 py-1 my-1 bg-primary/5 rounded-r-sm">
          <p className="text-xs text-[#555555] italic"
            dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} />
        </div>
      )
      i++; continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-border my-3" />)
      i++; continue
    }

    // Bullet
    if (/^[-*•]\s/.test(line)) {
      elements.push(
        <div key={i} className="flex gap-2">
          <span className="text-primary/60 mt-0.5 flex-shrink-0 font-bold text-xs">•</span>
          <span className="text-sm text-[#333333]" dangerouslySetInnerHTML={{ __html: renderInline(line.replace(/^[-*•]\s/, '')) }} />
        </div>
      )
      i++; continue
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s(.+)/)
    if (numMatch) {
      elements.push(
        <div key={i} className="flex gap-2">
          <span className="text-[#999999] flex-shrink-0 font-mono text-xs mt-0.5 w-5 text-right">{numMatch[1]}.</span>
          <span className="text-sm text-[#333333]" dangerouslySetInnerHTML={{ __html: renderInline(numMatch[2]) }} />
        </div>
      )
      i++; continue
    }

    // Paragraph
    elements.push(
      <p key={i} className="text-sm text-[#333333] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderInline(line) }} />
    )
    i++
  }

  return <div className="space-y-1.5">{elements}</div>
}
