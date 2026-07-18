import { useState } from 'react'
import { useAnalysis } from '../context/AnalysisContext.jsx'
import { calculateNOI } from '../utils/calculations.js'
import { formatCurrency } from '../utils/formatters.js'
import { populateExcel } from '../services/api.js'
import StepIndicator from '../components/StepIndicator.jsx'
import PptSuggestionsModal from '../components/PptSuggestionsModal.jsx'
import Card from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import Select from '../components/ui/Select.jsx'
import Input from '../components/ui/Input.jsx'

const KS_OPTIONS = {
  loanType:           ['All Other Loan Purposes', 'Construction Financing'],
  region:             ['ON', 'BC', 'QC', 'Atlantic', 'Prairies & Territories'],
  propertyType:       ['Residential', 'Mixed-Use'],
  housingType:        ['Standard Rental Housing', 'Student', 'SRO', 'Retirement'],
  program:            ['MLI Market', 'MLI Select'],
  egiTestMet:         ['Yes', 'No'],
  frameConstruction:  ['Wood Frame', 'Concrete Frame'],
  projectStatus:      ['New Construction', 'Existing Property'],
  premiumCalculation: ['11 units and less', '12 units and more'],
  selectBase:         ['KingSett CMHC', 'KingSett Bridge', 'CMHC Benchmarks', 'Borrower'],
  selectComparison:   ['KingSett CMHC', 'KingSett Bridge', 'CMHC Benchmarks', 'Borrower'],
  utilitiesType: [
    'Landlord pays all utilities',
    'Landlord pays common area',
    'Landlord pays heating & water',
    'Landlord pays heating & hydro',
    'Landlord pays water & hydro',
    'Landlord pays heating',
    'Landlord pays water',
    'Landlord pays hydro',
    'Landlord pays no utilities',
  ],
  numberOfAdvances: ['Two or less', 'More than two'],
  vintage: ['Pre 60s', '60s', '70s', '80s', '90s', '2000s', '2010s', '2020+'],
  term:             ['5 yr', '10 yr'],
  premiumUsed:      ['Pre-July 14, 2025', 'Effective July 14, 2025'],
}

const KS_FIELDS = [
  { key: 'loanType',           label: 'Loan Type' },
  { key: 'region',             label: 'Region' },
  { key: 'propertyType',       label: 'Property Type' },
  { key: 'housingType',        label: 'Housing Type' },
  { key: 'program',            label: 'Program' },
  { key: 'egiTestMet',         label: 'EGI Test Met' },
  { key: 'frameConstruction',  label: 'Frame' },
  { key: 'projectStatus',      label: 'Project Status' },
  { key: 'premiumCalculation', label: 'Premium Calculation' },
  { key: 'selectBase',         label: 'Select Base' },
  { key: 'selectComparison',   label: 'Select Comparison' },
  { key: 'utilitiesType',      label: 'Utilities' },
  { key: 'numberOfAdvances',   label: 'Number of Advances' },
  { key: 'vintage',            label: 'Estimated Vintage' },
  { key: 'term',               label: 'Term' },
  { key: 'premiumUsed',        label: 'Premium Used' },
]

// ── KS input guessing helpers ─────────────────────────────────────────────────
function guessRegion(v) {
  if (!v) return ''
  const s = String(v).toLowerCase()
  if (/ontario|\bon\b/.test(s))                                                         return 'ON'
  if (/british columbia|\bbc\b/.test(s))                                                return 'BC'
  if (/quebec|\bqc\b/.test(s))                                                          return 'QC'
  if (/atlantic|nova scotia|new brunswick|prince edward|newfoundland|labrador/.test(s)) return 'Atlantic'
  if (/alberta|saskatchewan|manitoba|prairies|territories|yukon|northwest|nunavut/.test(s)) return 'Prairies & Territories'
  const opts = KS_OPTIONS.region
  return opts.includes(v) ? v : ''
}

function guessPropertyType(v) {
  if (!v) return ''
  const s = String(v).toLowerCase()
  if (/mixed/.test(s))       return 'Mixed-Use'
  if (/residential/.test(s)) return 'Residential'
  const opts = KS_OPTIONS.propertyType
  return opts.includes(v) ? v : ''
}

function guessHousingType(v) {
  if (!v) return ''
  const s = String(v).toLowerCase()
  if (/student/.test(s))                return 'Student'
  if (/sro|single.?room/.test(s))       return 'SRO'
  if (/retirement|senior/.test(s))      return 'Retirement'
  if (/standard/.test(s))               return 'Standard Rental Housing'
  const opts = KS_OPTIONS.housingType
  return opts.includes(v) ? v : ''
}

function guessFrame(v) {
  if (!v) return ''
  const s = String(v).toLowerCase()
  if (/wood/.test(s))     return 'Wood Frame'
  if (/concrete/.test(s)) return 'Concrete Frame'
  const opts = KS_OPTIONS.frameConstruction
  return opts.includes(v) ? v : ''
}

function guessVintage(v) {
  if (!v) return ''
  const year = parseInt(v)
  if (!isNaN(year)) {
    if (year < 1960) return 'Pre 60s'
    if (year < 1970) return '60s'
    if (year < 1980) return '70s'
    if (year < 1990) return '80s'
    if (year < 2000) return '90s'
    if (year < 2010) return '2000s'
    if (year < 2020) return '2010s'
    return '2020+'
  }
  const opts = KS_OPTIONS.vintage
  return opts.includes(v) ? v : ''
}

function guessPremiumCalc(totalUnits) {
  if (totalUnits == null) return ''
  return totalUnits <= 11 ? '11 units and less' : '12 units and more'
}

function guessProjectStatus(pi) {
  if (!pi) return ''
  // Construction loan / new build signals
  if (/new.?const|under.?const/i.test(String(pi.projectStatus ?? ''))) return 'New Construction'
  // If a vintage year exists the building already exists
  if (pi.vintage) return 'Existing Property'
  return ''
}

function guessCapRate(noi, analysis) {
  if (!noi || noi <= 0) return ''
  // Try to parse purchase price from analysis.purchasePrice string (e.g. "$4,250,000")
  const pp = analysis?.purchasePrice
  if (!pp) return ''
  const price = parseFloat(String(pp).replace(/[^0-9.]/g, ''))
  if (!price || price <= 0) return ''
  return ((noi / price) * 100).toFixed(2)
}

function SpreadsheetIcon() {
  return (
    <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function PresentationIcon() {
  return (
    <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  )
}

export default function ExcelPage() {
  const { state, goToReview, setDefault } = useAnalysis()
  const { extractedData, userOverrides, defaults } = state

  const [showPptModal, setShowPptModal] = useState(false)
  const [pptCache, setPptCache]     = useState(null)
  const [status, setStatus]         = useState('idle') // idle | loading | done | error
  const [errorMsg, setErrorMsg]     = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [report, setReport]         = useState(null)

  const [ksInputs, setKsInputs] = useState(() => {
    const pi  = extractedData?.propertyInfo ?? {}
    const noi = calculateNOI(extractedData, {}, {
      vacancyRate: 0.03, managementFeeRate: 0.0425, otherDeductionsRate: 0.01,
      replacementReservePerAppliance: 180,
    })
    return {
      purchasePrice: (() => {
        const pp = extractedData?.analysis?.purchasePrice
        if (!pp) return ''
        const n = parseFloat(String(pp).replace(/[^0-9.]/g, ''))
        return n > 0 ? String(n) : ''
      })(),
      loanType:           '',
      region:             guessRegion(pi.region),
      propertyType:       guessPropertyType(pi.propertyType),
      housingType:        guessHousingType(pi.housingType),
      program:            '',
      egiTestMet:         '',
      frameConstruction:  guessFrame(pi.frameConstruction),
      projectStatus:      guessProjectStatus(pi),
      premiumCalculation: guessPremiumCalc(pi.totalUnits),
      selectBase:         '',
      selectComparison:   '',
      utilitiesType:      '',
      numberOfAdvances:   '',
      vintage:            guessVintage(pi.vintage),
      capRate:            guessCapRate(noi.noi, extractedData?.analysis),
      // F213-F220 numeric fields
      ltv:                '',
      heatPumps:          '',
      elevators:          '',
      affordabilityPts:   '',
      energyEfficiencyPts:'',
      accessibilityPts:   '',
      totalDevCost:       '',
      premiumUsed:        '',
      // Financing parameters (cells TBD)
      term:               '5 yr',
      amortization:       '35',
      lenderFee:          '0',
      cmhcMaxRate:        '4.5',
    }
  })

  function setKsField(key, value) {
    setKsInputs((prev) => ({ ...prev, [key]: value }))
  }

  if (!extractedData) return null

  const noi = calculateNOI(extractedData, userOverrides, defaults)

  const REQUIRED_DROPDOWN_KEYS = KS_FIELDS.map((f) => f.key)
  const missingRequired = [
    ...REQUIRED_DROPDOWN_KEYS.filter((k) => !ksInputs[k]),
    ...(!ksInputs.purchasePrice ? ['purchasePrice'] : []),
  ]
  const canPopulate = missingRequired.length === 0

  // Full data payload sent to backend for Excel population
  const noiData = {
    propertyInfo: extractedData.propertyInfo,
    // Individual unit rows for the Rent Roll tab — apply any rent overrides
    unitDetails: (extractedData.unitDetails ?? []).map((u) => ({
      ...u,
      monthlyRent: userOverrides[`unit.${u.unitType}.rent`] ?? u.monthlyRent,
    })),
    unitBreakdown: (extractedData.unitBreakdown ?? []).map((u) => ({
      ...u,
      effectiveMonthlyRent: userOverrides[`unit.${u.type}.rent`] ?? u.avgMonthlyRent,
    })),
    // Raw extracted operating expenses (preferred over calculated values for cell accuracy)
    operatingExpenses: extractedData.operatingExpenses,
    // Raw extracted additional income (includes parking/storage count+rate details)
    additionalIncome: extractedData.additionalIncome,
    income: {
      gpr:          noi.gpr,
      vacancyRate:  defaults.vacancyRate,
      vacancyLoss:  noi.vacancyLoss,
      parking:      noi.parking,
      storage:      noi.storage,
      laundry:      noi.laundry,
      other:        noi.otherIncome,
      egi:          noi.egi,
    },
    expenses: {
      propertyTaxes:          noi.propertyTaxes,
      insurance:              noi.insurance,
      utilities:              noi.utilities,
      repairsAndMaintenance:  noi.repairsAndMaintenance,
      payrollAndAdmin:        noi.payrollAndAdmin,
      managementFee:          noi.managementFee,
      managementFeeRate:      defaults.managementFeeRate,
      otherDeductions:        noi.otherDeductions,
      otherDeductionsRate:    defaults.otherDeductionsRate,
      replacementReserve:     noi.replacementReserve,
      totalOpEx:              noi.totalOpEx,
    },
    noi: noi.noi,
    ksInputs,
  }

  async function handlePopulate() {
    setStatus('loading')
    setErrorMsg(null)
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)

    try {
      const { buffer, report: r } = await populateExcel(noiData)
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      setDownloadUrl(URL.createObjectURL(blob))
      setReport(r)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  function handleDownload() {
    if (!downloadUrl) return
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = 'CMHC_Populated.xlsx'
    a.click()
  }

  return (
    <div>
      <StepIndicator currentStep="excel" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-primary">Populate Excel Template</h2>
          </div>
          <p className="text-gray-500 mt-1">
            Review your inputs, then generate a populated CMHC Economics template ready to submit.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={goToReview}>
            Back to Review
          </Button>
        </div>
      </div>

      <div className="space-y-4">
          {/* How it works */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">How It Works</h3>
            <ol className="space-y-2 text-sm text-gray-600">
              <li className="flex gap-3"><span className="text-accent font-bold flex-shrink-0">1.</span> Fill in the Financing Parameters and Database Inputs below.</li>
              <li className="flex gap-3"><span className="text-accent font-bold flex-shrink-0">2.</span> Click <strong>Populate Template</strong> to generate your Economics spreadsheet.</li>
              <li className="flex gap-3"><span className="text-accent font-bold flex-shrink-0">3.</span> Click <strong>Generate Suggestions</strong> to get AI-written content for your PowerPoint slides.</li>
            </ol>
          </Card>

          {/* Financing Parameters */}
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wide">Financing Parameters</h3>
              <p className="text-xs text-gray-400 mt-0.5">Mortgage terms used in the Economics sheet.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Amortization"
                suffix="yrs"
                type="number"
                value={ksInputs.amortization}
                onChange={(e) => setKsField('amortization', e.target.value)}
                placeholder="35"
              />
              <Input
                label="Lender Fee"
                suffix="%"
                type="number"
                value={ksInputs.lenderFee}
                onChange={(e) => setKsField('lenderFee', e.target.value)}
                placeholder="0"
              />
              <Input
                label="CMHC Max Rate"
                suffix="%"
                type="number"
                value={ksInputs.cmhcMaxRate}
                onChange={(e) => setKsField('cmhcMaxRate', e.target.value)}
                placeholder="4.5"
              />
            </div>
          </Card>

          {/* KS Database Inputs */}
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wide">Database Inputs</h3>
              <p className="text-xs text-gray-400 mt-0.5">Select values for fields that require manual input in the Economics sheet (F200–F220).</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Purchase Price *"
                prefix="$"
                type="number"
                placeholder="e.g. 5000000"
                value={ksInputs.purchasePrice}
                onChange={(e) => setKsField('purchasePrice', e.target.value)}
              />
              {KS_FIELDS.map(({ key, label }) => (
                <Select
                  key={key}
                  label={`${label} *`}
                  value={ksInputs[key]}
                  options={KS_OPTIONS[key]}
                  onChange={(e) => setKsField(key, e.target.value)}
                  error={!ksInputs[key]}
                />
              ))}
              <Input
                label="Cap Rate"
                suffix="%"
                type="number"
                placeholder="e.g. 5.50"
                value={ksInputs.capRate}
                onChange={(e) => setKsField('capRate', e.target.value)}
              />
              <Input
                label="LTV Limit"
                suffix="%"
                type="number"
                placeholder="e.g. 85"
                value={ksInputs.ltv}
                onChange={(e) => setKsField('ltv', e.target.value)}
              />
              <Input
                label="Heat Pumps & AC Units"
                type="number"
                placeholder="count"
                value={ksInputs.heatPumps}
                onChange={(e) => setKsField('heatPumps', e.target.value)}
              />
              <Input
                label="Elevators (Wood Frame)"
                type="number"
                placeholder="count"
                value={ksInputs.elevators}
                onChange={(e) => setKsField('elevators', e.target.value)}
              />
              <Input
                label="Affordability Points"
                type="number"
                placeholder="0"
                value={ksInputs.affordabilityPts}
                onChange={(e) => setKsField('affordabilityPts', e.target.value)}
              />
              <Input
                label="Energy Efficiency Points"
                type="number"
                placeholder="0"
                value={ksInputs.energyEfficiencyPts}
                onChange={(e) => setKsField('energyEfficiencyPts', e.target.value)}
              />
              <Input
                label="Accessibility Points"
                type="number"
                placeholder="0"
                value={ksInputs.accessibilityPts}
                onChange={(e) => setKsField('accessibilityPts', e.target.value)}
              />
              <Input
                label="Total Development Cost"
                prefix="$"
                type="number"
                placeholder="e.g. 5000000"
                value={ksInputs.totalDevCost}
                onChange={(e) => setKsField('totalDevCost', e.target.value)}
              />
            </div>
          </Card>

          {/* Economics Template */}
          <Card className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <SpreadsheetIcon />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary">Economics Template</h3>
                <p className="text-xs text-gray-400 mt-0.5">Built-in CMHC Economics template — ready to populate.</p>
              </div>
            </div>

            {/* Loading */}
            {status === 'loading' && (
              <div className="flex flex-col items-center gap-4 py-6">
                <Spinner size="lg" />
                <div className="text-center">
                  <p className="font-semibold text-primary">Populating template…</p>
                  <p className="text-sm text-gray-500 mt-1">Writing your NOI data to the Economics sheet.</p>
                </div>
              </div>
            )}

            {/* Success */}
            {status === 'done' && (
              <div className="space-y-3">
                <div className="p-4 bg-success/10 border border-success/20 rounded-xl flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-success">Template populated successfully</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {report
                        ? `${report.rentRollRows ?? 0} unit rows + ${report.economicsCells ?? 0} cells written`
                        : 'Cells written — formula cells untouched'}
                    </p>
                  </div>
                  <Button variant="primary" onClick={handleDownload}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </Button>
                </div>
                {report?.unmappedFields?.length > 0 && (
                  <div className="p-4 bg-warning/10 border border-warning/20 rounded-xl">
                    <p className="font-semibold text-warning text-sm">Fields not found in template — fill manually:</p>
                    <ul className="mt-2 space-y-0.5">
                      {report.unmappedFields.map((f) => (
                        <li key={f} className="text-sm text-gray-600 flex gap-2">
                          <span className="text-warning">•</span>{f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {status === 'error' && (
              <div className="p-4 bg-error/10 border border-error/20 rounded-xl">
                <p className="font-semibold text-error">Population failed</p>
                <p className="text-sm text-gray-600 mt-0.5">{errorMsg}</p>
              </div>
            )}

            {/* Action */}
            {status !== 'loading' && (
              <div className="flex justify-end items-center gap-3">
                {!canPopulate && (
                  <p className="text-xs text-amber-600">
                    {missingRequired.length} required field{missingRequired.length > 1 ? 's' : ''} missing — fill all dropdowns and Purchase Price to continue.
                  </p>
                )}
                {canPopulate && status === 'done' && (
                  <p className="text-xs text-gray-400">Changed a value above? Re-populate to update the file.</p>
                )}
                <Button variant="primary" size="lg" onClick={handlePopulate} disabled={!canPopulate} className="!bg-[#217346] !border-[#217346] !text-white hover:!opacity-90 !ring-2 !ring-amber-400 min-w-[220px]">
                  {status === 'done' ? 'Re-populate' : 'Populate Template'}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Button>
              </div>
            )}
          </Card>

          {/* PowerPoint Suggestions */}
          <Card className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <PresentationIcon />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary">PowerPoint Suggestions</h3>
                <p className="text-xs text-gray-400 mt-0.5">AI-generated content for your PowerPoint slides.</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="primary" size="lg" onClick={() => setShowPptModal(true)} className="!bg-[#D24726] !border-[#D24726] !text-white hover:!opacity-90 !ring-2 !ring-amber-400 min-w-[220px]">
                Generate Suggestions
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Button>
            </div>
          </Card>
        </div>

        {showPptModal && (
          <PptSuggestionsModal
            extractedData={extractedData}
            cachedData={pptCache}
            onDataLoaded={setPptCache}
            onClose={() => setShowPptModal(false)}
          />
        )}
      </div>
  )
}
