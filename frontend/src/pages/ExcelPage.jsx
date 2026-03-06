import { useRef, useState } from 'react'
import { useAnalysis } from '../context/AnalysisContext.jsx'
import { calculateNOI } from '../utils/calculations.js'
import { formatCurrency, formatPercent } from '../utils/formatters.js'
import { populateExcel } from '../services/api.js'
import StepIndicator from '../components/StepIndicator.jsx'
import Card from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import Spinner from '../components/ui/Spinner.jsx'

function SpreadsheetIcon() {
  return (
    <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

export default function ExcelPage() {
  const { state, goToSummary } = useAnalysis()
  const { extractedData, userOverrides, defaults } = state

  const [file, setFile]             = useState(null)
  const [status, setStatus]         = useState('idle') // idle | loading | done | error
  const [errorMsg, setErrorMsg]     = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [downloadName, setDownloadName] = useState('CMHC_Populated.xlsx')
  const [report, setReport]         = useState(null)
  const fileInputRef = useRef(null)

  if (!extractedData) return null

  const noi = calculateNOI(extractedData, userOverrides, defaults)

  // Full NOI data payload sent to backend
  const noiData = {
    propertyInfo: extractedData.propertyInfo,
    unitBreakdown: (extractedData.unitBreakdown ?? []).map((u) => ({
      ...u,
      effectiveMonthlyRent: userOverrides[`unit.${u.type}.rent`] ?? u.avgMonthlyRent,
    })),
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
  }

  function handleFileChange(e) {
    const f = e.target.files[0] || null
    setFile(f)
    setStatus('idle')
    setErrorMsg(null)
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setDownloadUrl(null)
  }

  async function handlePopulate() {
    if (!file) return
    setStatus('loading')
    setErrorMsg(null)

    try {
      const { buffer, report: r } = await populateExcel(file, noiData)
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const name = `CMHC_Populated_${file.name}`
      setDownloadUrl(url)
      setDownloadName(name)
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
    a.download = downloadName
    a.click()
  }

  const propInfo = extractedData.propertyInfo
  const units = extractedData.unitBreakdown ?? []

  return (
    <div>
      <StepIndicator currentStep="excel" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-primary">Populate Excel Template</h2>
            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">Optional</span>
          </div>
          <p className="text-gray-500 mt-1">
            Upload your CMHC Excel template. Claude will read every cell, identify all input fields,
            and populate them — without touching any formula cells.
          </p>
        </div>
        <Button variant="secondary" onClick={goToSummary}>
          ← Back to Summary
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: upload + status */}
        <div className="col-span-2 space-y-4">
          <Card className="p-6 space-y-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide">Upload Template</h3>

            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${file ? 'border-primary/50 bg-primary/3' : 'border-border hover:border-primary/40 hover:bg-primary/2'}`}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <SpreadsheetIcon />
                </div>
                {file ? (
                  <div>
                    <p className="font-semibold text-primary">{file.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024).toFixed(0)} KB — click to change</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-primary">Click to upload your CMHC Excel template</p>
                    <p className="text-gray-400 text-sm mt-1">.xlsx or .xls — formulas will be preserved</p>
                  </div>
                )}
              </div>
            </div>

            {/* Loading */}
            {status === 'loading' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Spinner size="lg" />
                <div className="text-center">
                  <p className="font-semibold text-primary">Analyzing spreadsheet structure…</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Claude is reading every input cell and mapping your NOI data.
                    This may take up to 30 seconds.
                  </p>
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
                      {report ? `${report.applied} cells filled${report.lowConfidenceSkipped > 0 ? `, ${report.lowConfidenceSkipped} low-confidence skipped` : ''}` : 'All identifiable input cells filled — formula cells untouched'}
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
              <div className="flex justify-end">
                <Button variant="primary" size="lg" disabled={!file} onClick={handlePopulate}>
                  {status === 'done' ? 'Re-populate' : 'Populate Template'}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Button>
              </div>
            )}
          </Card>

          {/* How it works */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">How It Works</h3>
            <ol className="space-y-2 text-sm text-gray-600">
              <li className="flex gap-3"><span className="text-accent font-bold flex-shrink-0">1.</span> Claude reads every cell in your template — values, labels, and formulas.</li>
              <li className="flex gap-3"><span className="text-accent font-bold flex-shrink-0">2.</span> It identifies all input cells (blank cells adjacent to labels like "Property Address", "Vacancy Rate", etc.).</li>
              <li className="flex gap-3"><span className="text-accent font-bold flex-shrink-0">3.</span> It maps your extracted NOI data to the correct cells by matching CMHC field names and labels.</li>
              <li className="flex gap-3"><span className="text-accent font-bold flex-shrink-0">4.</span> Formula cells are <strong>never touched</strong> — they will auto-calculate from the populated inputs.</li>
            </ol>
          </Card>
        </div>

        {/* Right: data summary */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">Data to Populate</h3>
            <div className="space-y-3 text-sm">
              {propInfo?.address && (
                <div>
                  <p className="text-xs text-gray-400">Address</p>
                  <p className="font-medium text-gray-800 text-xs mt-0.5">{propInfo.address}</p>
                </div>
              )}

              {units.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Unit Mix</p>
                  {units.map((u, i) => {
                    const rent = userOverrides[`unit.${u.type}.rent`] ?? u.avgMonthlyRent ?? 0
                    return (
                      <p key={i} className="text-xs text-gray-600">
                        {u.type}: {u.count} × ${rent.toLocaleString('en-CA')}/mo
                      </p>
                    )
                  })}
                </div>
              )}

              <div className="border-t border-border pt-3 space-y-1.5">
                {[
                  { label: 'GPR',                                                    value: formatCurrency(noi.gpr) },
                  { label: `Vacancy (${formatPercent(defaults.vacancyRate)})`,        value: `(${formatCurrency(noi.vacancyLoss)})` },
                  noi.parking    > 0 && { label: 'Parking Income',  value: formatCurrency(noi.parking) },
                  noi.storage    > 0 && { label: 'Storage Income',  value: formatCurrency(noi.storage) },
                  noi.laundry    > 0 && { label: 'Laundry Income',  value: formatCurrency(noi.laundry) },
                  noi.otherIncome > 0 && { label: 'Other Income',   value: formatCurrency(noi.otherIncome) },
                  { label: 'EGI',                                                    value: formatCurrency(noi.egi) },
                ].filter(Boolean).map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium tabular-nums">{value}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-3 space-y-1.5">
                {[
                  { label: 'Property Taxes', value: noi.propertyTaxes },
                  { label: 'Insurance',       value: noi.insurance },
                  { label: 'Utilities',        value: noi.utilities },
                  { label: 'R&M',              value: noi.repairsAndMaintenance },
                  { label: 'Payroll & Admin',  value: noi.payrollAndAdmin },
                  { label: 'Mgmt Fee',         value: noi.managementFee },
                  { label: 'Replacement Res.', value: noi.replacementReserve },
                ].filter(({ value }) => value > 0).map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium tabular-nums">{formatCurrency(value)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-primary pt-3 flex justify-between font-bold">
                <span className="text-primary">NOI</span>
                <span className="text-primary tabular-nums">{formatCurrency(noi.noi)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
