import { useNavigate } from 'react-router-dom'
import { formatCurrency, formatPercent, formatNumber } from '../utils/formatters.js'

function fmt(v, type = 'text') {
  if (v === null || v === undefined || v === '') return '—'
  if (type === 'currency') return formatCurrency(v)
  if (type === 'pct') return formatPercent(v)
  if (type === 'number') return formatNumber(v)
  if (type === 'date') return new Date(v).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
  return String(v)
}

function Field({ label, value, type, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-xs text-[#999999] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-primary font-medium">{fmt(value, type)}</p>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-border rounded-sm p-6">
      <h3 className="text-xs font-semibold text-[#999999] uppercase tracking-widest mb-5">{title}</h3>
      <div className="grid grid-cols-4 gap-x-8 gap-y-5">
        {children}
      </div>
    </div>
  )
}

const UNIT_TYPES = [
  { label: 'Bachelor', rentM: 'bachelor_rent_market', rentA: 'bachelor_rent_affordable', sqftM: 'bachelor_sqft_market', sqftA: 'bachelor_sqft_affordable', psfM: 'bachelor_psf_market', psfA: 'bachelor_psf_affordable' },
  { label: '1 Bedroom', rentM: 'bed1_rent_market', rentA: 'bed1_rent_affordable', sqftM: 'bed1_sqft_market', sqftA: 'bed1_sqft_affordable', psfM: 'bed1_psf_market', psfA: 'bed1_psf_affordable' },
  { label: '2 Bedroom', rentM: 'bed2_rent_market', rentA: 'bed2_rent_affordable', sqftM: 'bed2_sqft_market', sqftA: 'bed2_sqft_affordable', psfM: 'bed2_psf_market', psfA: 'bed2_psf_affordable' },
  { label: '3 Bedroom', rentM: 'bed3_rent_market', rentA: 'bed3_rent_affordable', sqftM: 'bed3_sqft_market', sqftA: 'bed3_sqft_affordable', psfM: 'bed3_psf_market', psfA: 'bed3_psf_affordable' },
  { label: '4+ Bedroom', rentM: 'bed4plus_rent_market', rentA: 'bed4plus_rent_affordable', sqftM: 'bed4plus_sqft_market', sqftA: 'bed4plus_sqft_affordable', psfM: 'bed4plus_psf_market', psfA: 'bed4plus_psf_affordable' },
  { label: 'Townhouse', rentM: 'townhouse_rent_market', rentA: 'townhouse_rent_affordable', sqftM: 'townhouse_sqft', sqftA: null, psfM: 'townhouse_psf_market', psfA: 'townhouse_psf_affordable' },
]

function capRateBadge(v) {
  if (v === null || v === undefined) return null
  const pct = v * 100
  if (pct >= 5) return 'bg-green-100 text-green-800'
  if (pct >= 4) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

function ltvBadge(v) {
  if (v === null || v === undefined) return null
  const pct = v * 100
  if (pct < 60) return 'bg-green-100 text-green-800'
  if (pct < 75) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

export default function LoanDetailPage({ loan }) {
  const navigate = useNavigate()
  const onBack = () => navigate('/cmhc-database')
  const hasCommercial = loan.commercial_area || loan.commercial_value || loan.commercial_egi

  const activeUnitTypes = UNIT_TYPES.filter(u =>
    loan[u.rentM] !== null || loan[u.sqftM] !== null
  )

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-[#777777] hover:text-primary transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-primary text-lg font-bold tracking-tight">Fundus</h1>
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">Real Estate Underwriting</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <span className="text-[#555555] text-xs tracking-widest uppercase font-medium">KingSett Capital</span>
          </div>
          <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-14 w-auto" />
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-8 py-8 space-y-4">
        {/* Loan title + key badges */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs font-mono text-[#999999]">{loan.loan_number}</span>
              {loan.asset_type && (
                <span className="text-xs px-2 py-0.5 bg-surface border border-border rounded-sm text-[#555555] font-medium">
                  {loan.asset_type}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold text-primary tracking-tight">{loan.loan_name || '—'}</h2>
            <p className="text-[#777777] text-sm mt-1">{[loan.address, loan.city, loan.province].filter(Boolean).join(', ')}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 mt-1">
            {loan.cap_rate !== null && (
              <div className={`px-3 py-1.5 rounded-sm text-sm font-bold ${capRateBadge(loan.cap_rate)}`}>
                {formatPercent(loan.cap_rate)} Cap
              </div>
            )}
            {loan.ltv_net !== null && (
              <div className={`px-3 py-1.5 rounded-sm text-sm font-bold ${ltvBadge(loan.ltv_net)}`}>
                {formatPercent(loan.ltv_net)} LTV
              </div>
            )}
          </div>
        </div>

        {/* Property Info */}
        <Section title="Property Information">
          <Field label="Loan #" value={loan.loan_number} />
          <Field label="FN Loan #" value={loan.fn_loan_number} />
          <Field label="Region" value={loan.region} />
          <Field label="Year Built" value={loan.year_built} />
          <Field label="Address" value={loan.address} wide />
          <Field label="City" value={loan.city} />
          <Field label="Province" value={loan.province} />
          <Field label="Asset Type" value={loan.asset_type} />
          <Field label="# Units" value={loan.units} type="number" />
          <Field label="Funding Date" value={loan.funding_date} type="date" />
        </Section>

        {/* Financing */}
        <Section title="Financing">
          <Field label="Net Loan" value={loan.net_loan} type="currency" />
          <Field label="Gross Loan" value={loan.gross_loan} type="currency" />
          <Field label="Commercial Net Loan" value={loan.commercial_net_loan} type="currency" />
          <Field label="Residential KS Value" value={loan.residential_ks_value} type="currency" />
          <Field label="KS Value / Unit" value={loan.ks_value_per_unit} type="currency" />
          <Field label="LTV (Net)" value={loan.ltv_net} type="pct" />
          <Field label="LTV (Gross)" value={loan.ltv_gross} type="pct" />
          <Field label="DSC — Net (Max Rate)" value={loan.dsc_net} />
          <Field label="DSC — Gross (Max Rate)" value={loan.dsc_gross} />
          <Field label="Cap Rate" value={loan.cap_rate} type="pct" />
          <Field label="Commercial Cap Rate" value={loan.commercial_cap_rate} type="pct" />
        </Section>

        {/* Income & Expenses */}
        <Section title="Income & Operating Expenses">
          <Field label="NOI" value={loan.noi} type="currency" />
          <Field label="NOI / Debt" value={loan.noi_per_debt !== null ? `${(loan.noi_per_debt * 100).toFixed(2)}%` : null} />
          <Field label="EGI" value={loan.egi} type="currency" />
          <Field label="Operating Expenses" value={loan.operating_expenses} type="currency" />
          <Field label="OpEx Ratio" value={loan.opex_ratio} type="pct" />
          <Field label="OpEx / Unit" value={loan.opex_per_unit} type="currency" />
          <Field label="Property Tax" value={loan.property_tax} type="currency" />
          <Field label="PT / Unit" value={loan.pt_per_unit} type="currency" />
          <Field label="Insurance" value={loan.insurance} type="currency" />
          <Field label="Insurance / Unit" value={loan.insurance_per_unit} type="currency" />
          <Field label="Utilities" value={loan.utilities} type="currency" />
          <Field label="Utilities / Unit" value={loan.utilities_per_unit} type="currency" />
        </Section>

        {/* Unit Mix */}
        {activeUnitTypes.length > 0 && (
          <div className="bg-white border border-border rounded-sm p-6">
            <h3 className="text-xs font-semibold text-[#999999] uppercase tracking-widest mb-5">Unit Mix</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs text-[#999999] uppercase tracking-wider pb-3 font-medium">Type</th>
                  <th className="text-right text-xs text-[#999999] uppercase tracking-wider pb-3 font-medium">Market Rent</th>
                  <th className="text-right text-xs text-[#999999] uppercase tracking-wider pb-3 font-medium">Affordable Rent</th>
                  <th className="text-right text-xs text-[#999999] uppercase tracking-wider pb-3 font-medium">Sqft (Market)</th>
                  <th className="text-right text-xs text-[#999999] uppercase tracking-wider pb-3 font-medium">Sqft (Affordable)</th>
                  <th className="text-right text-xs text-[#999999] uppercase tracking-wider pb-3 font-medium">PSF (Market)</th>
                  <th className="text-right text-xs text-[#999999] uppercase tracking-wider pb-3 font-medium">PSF (Affordable)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeUnitTypes.map(u => (
                  <tr key={u.label} className="hover:bg-surface transition-colors">
                    <td className="py-3 font-medium text-primary">{u.label}</td>
                    <td className="py-3 text-right text-[#333333]">{fmt(loan[u.rentM], 'currency')}</td>
                    <td className="py-3 text-right text-[#333333]">{fmt(loan[u.rentA], 'currency')}</td>
                    <td className="py-3 text-right text-[#333333]">{fmt(loan[u.sqftM], 'number')}</td>
                    <td className="py-3 text-right text-[#333333]">{u.sqftA ? fmt(loan[u.sqftA], 'number') : '—'}</td>
                    <td className="py-3 text-right text-[#333333]">{fmt(loan[u.psfM], 'number')}</td>
                    <td className="py-3 text-right text-[#333333]">{fmt(loan[u.psfA], 'number')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Commercial */}
        {hasCommercial && (
          <Section title="Commercial">
            <Field label="Area (sf)" value={loan.commercial_area} type="number" />
            <Field label="Value" value={loan.commercial_value} type="currency" />
            <Field label="Value / Area" value={loan.commercial_value_per_area !== null ? `$${loan.commercial_value_per_area?.toFixed(2)}/sf` : null} />
            <Field label="EGI" value={loan.commercial_egi} type="currency" />
            <Field label="Operating Expense" value={loan.commercial_opex} type="currency" />
            <Field label="OpEx Ratio" value={loan.commercial_opex_ratio} type="pct" />
            <Field label="Rent" value={loan.commercial_rent} type="currency" />
            <Field label="Rate / sf" value={loan.commercial_rate !== null ? `$${loan.commercial_rate?.toFixed(2)}/sf` : null} />
          </Section>
        )}

        {/* Comments */}
        {loan.comments && (
          <div className="bg-white border border-border rounded-sm p-6">
            <h3 className="text-xs font-semibold text-[#999999] uppercase tracking-widest mb-3">Comments</h3>
            <p className="text-sm text-[#333333] leading-relaxed whitespace-pre-wrap">{loan.comments}</p>
          </div>
        )}
      </main>
    </div>
  )
}
