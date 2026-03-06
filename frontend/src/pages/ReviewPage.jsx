import Card from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import StepIndicator from '../components/StepIndicator.jsx'
import ExtractionField from '../components/ExtractionField.jsx'
import { useAnalysis } from '../context/AnalysisContext.jsx'

export default function ReviewPage() {
  const { state, setOverride, setDefault, goToSummary, reset, research } = useAnalysis()
  const { extractedData, userOverrides, defaults } = state

  if (!extractedData) return null

  const { propertyInfo, unitBreakdown, additionalIncome, operatingExpenses, analysis } = extractedData

  async function handleResearch(fieldKey) {
    return research(fieldKey)
  }

  return (
    <div>
      <StepIndicator currentStep="review" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-primary">Review Extracted Data</h2>
          <p className="text-gray-500 mt-1">
            Verify the values below. Fill in any missing fields before generating the summary.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reset}>
            Start Over
          </Button>
          <Button variant="accent" onClick={goToSummary}>
            Generate Summary
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-2 space-y-6">
          {/* Property Info */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">Property Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Address</p>
                <p className="text-sm font-medium text-gray-800">{propertyInfo?.address || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Property Type</p>
                <p className="text-sm font-medium text-gray-800">{propertyInfo?.propertyType || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Total Units</p>
                <p className="text-sm font-medium text-gray-800">{propertyInfo?.totalUnits ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Total Appliances</p>
                <p className="text-sm font-medium text-gray-800">
                  {userOverrides.totalAppliances ?? propertyInfo?.totalAppliances ?? '—'}
                  {propertyInfo?.appliancesNote && (
                    <span className="text-xs text-gray-400 ml-1">({propertyInfo.appliancesNote})</span>
                  )}
                </p>
              </div>
            </div>
            {propertyInfo?.appliancesNote && (
              <div className="mt-3">
                <Input
                  label="Override Appliance Count"
                  type="number"
                  value={userOverrides.totalAppliances ?? ''}
                  onChange={(e) => setOverride('totalAppliances', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder={String(propertyInfo.totalAppliances ?? '')}
                  className="max-w-xs"
                />
              </div>
            )}
          </Card>

          {/* Unit Breakdown */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">Unit Breakdown & Rents</h3>
            {unitBreakdown && unitBreakdown.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-xs text-gray-400 font-medium">Type</th>
                      <th className="text-right py-2 text-xs text-gray-400 font-medium">Count</th>
                      <th className="text-right py-2 text-xs text-gray-400 font-medium">Avg Sqft</th>
                      <th className="text-right py-2 text-xs text-gray-400 font-medium">Avg Rent/Mo</th>
                      <th className="text-right py-2 text-xs text-gray-400 font-medium">Override Rent</th>
                      <th className="text-left py-2 text-xs text-gray-400 font-medium pl-3">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitBreakdown.map((unit, i) => (
                      <tr key={i} className="border-b border-border/40 last:border-0">
                        <td className="py-2.5 font-medium text-gray-800">{unit.type}</td>
                        <td className="py-2.5 text-right text-gray-700">{unit.count}</td>
                        <td className="py-2.5 text-right text-gray-700">{unit.avgSqft ?? '—'}</td>
                        <td className="py-2.5 text-right text-gray-700">
                          {unit.avgMonthlyRent != null ? `$${unit.avgMonthlyRent.toLocaleString('en-CA')}` : '—'}
                        </td>
                        <td className="py-2.5 text-right">
                          <input
                            type="number"
                            value={userOverrides[`unit.${unit.type}.rent`] ?? ''}
                            onChange={(e) =>
                              setOverride(`unit.${unit.type}.rent`, e.target.value ? Number(e.target.value) : undefined)
                            }
                            placeholder={unit.avgMonthlyRent?.toString() ?? 'Enter'}
                            className="w-24 text-right border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="py-2.5 text-xs text-gray-400 pl-3">{unit.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No unit data extracted.</p>
            )}
          </Card>

          {/* Additional Income */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">Additional Income</h3>
            <p className="text-xs text-gray-400 mb-4">Monthly amounts — will be annualized (×12) in NOI</p>
            <ExtractionField
              label="Parking Income"
              fieldKey="additionalIncome.parking"
              found={additionalIncome?.parking?.found}
              value={additionalIncome?.parking?.monthlyTotal}
              source={additionalIncome?.parking?.source}
              prefix="$"
              suffix="/mo"
              overrideValue={userOverrides['additionalIncome.parking'] != null ? userOverrides['additionalIncome.parking'] / 12 : null}
              onOverride={(key, val) => setOverride(key, val != null ? val * 12 : undefined)}
              onResearch={handleResearch}
            />
            <ExtractionField
              label="Storage Income"
              fieldKey="additionalIncome.storage"
              found={additionalIncome?.storage?.found}
              value={additionalIncome?.storage?.monthlyTotal}
              source={additionalIncome?.storage?.source}
              prefix="$"
              suffix="/mo"
              overrideValue={userOverrides['additionalIncome.storage'] != null ? userOverrides['additionalIncome.storage'] / 12 : null}
              onOverride={(key, val) => setOverride(key, val != null ? val * 12 : undefined)}
              onResearch={handleResearch}
            />
            <ExtractionField
              label="Laundry Income"
              fieldKey="additionalIncome.laundry"
              found={additionalIncome?.laundry?.found}
              value={additionalIncome?.laundry?.monthlyTotal}
              source={additionalIncome?.laundry?.source}
              prefix="$"
              suffix="/mo"
              overrideValue={userOverrides['additionalIncome.laundry'] != null ? userOverrides['additionalIncome.laundry'] / 12 : null}
              onOverride={(key, val) => setOverride(key, val != null ? val * 12 : undefined)}
              onResearch={handleResearch}
            />
            <ExtractionField
              label={`Other Income${additionalIncome?.other?.description ? ` (${additionalIncome.other.description})` : ''}`}
              fieldKey="additionalIncome.other"
              found={additionalIncome?.other?.found}
              value={additionalIncome?.other?.monthlyTotal}
              source={additionalIncome?.other?.source}
              prefix="$"
              suffix="/mo"
              overrideValue={userOverrides['additionalIncome.other'] != null ? userOverrides['additionalIncome.other'] / 12 : null}
              onOverride={(key, val) => setOverride(key, val != null ? val * 12 : undefined)}
              onResearch={handleResearch}
            />
          </Card>

          {/* Operating Expenses */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">Operating Expenses</h3>
            <p className="text-xs text-gray-400 mb-4">Annual amounts</p>
            <ExtractionField
              label="Property Taxes"
              fieldKey="propertyTaxes"
              found={operatingExpenses?.propertyTaxes?.found}
              value={operatingExpenses?.propertyTaxes?.annualAmount}
              source={operatingExpenses?.propertyTaxes?.source}
              prefix="$"
              suffix="/yr"
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
              prefix="$"
              suffix="/yr"
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
              prefix="$"
              suffix="/yr"
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
              prefix="$"
              suffix="/yr"
              overrideValue={userOverrides.repairsAndMaintenance}
              onOverride={setOverride}
              onResearch={handleResearch}
            />
            <ExtractionField
              label="Payroll & Administration"
              fieldKey="payrollAndAdmin"
              found={operatingExpenses?.payrollAndAdmin?.found}
              value={operatingExpenses?.payrollAndAdmin?.annualAmount}
              source={operatingExpenses?.payrollAndAdmin?.source}
              prefix="$"
              suffix="/yr"
              overrideValue={userOverrides.payrollAndAdmin}
              onOverride={setOverride}
              onResearch={handleResearch}
            />
          </Card>
        </div>

        {/* Right column — Defaults */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">Calculation Defaults</h3>
            <div className="space-y-4">
              <Input
                label="Vacancy Rate"
                suffix="%"
                type="number"
                value={(defaults.vacancyRate * 100).toFixed(2)}
                onChange={(e) => setDefault('vacancyRate', Number(e.target.value) / 100)}
                placeholder="5.00"
              />
              <Input
                label="Management Fee Rate"
                suffix="%"
                type="number"
                value={(defaults.managementFeeRate * 100).toFixed(2)}
                onChange={(e) => setDefault('managementFeeRate', Number(e.target.value) / 100)}
                placeholder="4.25"
              />
              <Input
                label="Other Deductions Rate"
                suffix="%"
                type="number"
                value={(defaults.otherDeductionsRate * 100).toFixed(2)}
                onChange={(e) => setDefault('otherDeductionsRate', Number(e.target.value) / 100)}
                placeholder="1.00"
              />
              <Input
                label="Replacement Reserve / Appliance"
                prefix="$"
                type="number"
                value={defaults.replacementReservePerAppliance}
                onChange={(e) => setDefault('replacementReservePerAppliance', Number(e.target.value))}
                placeholder="180"
              />
            </div>
          </Card>

          {analysis && (analysis.purchasePrice || analysis.keyInfo?.length > 0 || analysis.risks?.length > 0) && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">AI Analysis</h3>

              {analysis.purchasePrice && (
                <div className="mb-3 pb-3 border-b border-border">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Purchase Price</p>
                  <p className="text-sm font-bold text-primary">{analysis.purchasePrice}</p>
                </div>
              )}

              {analysis.keyInfo?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Key Information</p>
                  <ul className="space-y-1">
                    {analysis.keyInfo.map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-600">
                        <span className="text-accent font-bold flex-shrink-0">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.risks?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Risks</p>
                  <ul className="space-y-1">
                    {analysis.risks.map((risk, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-600">
                        <span className="text-error flex-shrink-0">⚠</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
