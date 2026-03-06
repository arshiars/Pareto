/**
 * Calculate NOI from extracted data, user overrides, and defaults.
 * Override priority: userOverrides[key] > extractedData value
 */
export function calculateNOI(extractedData, userOverrides, defaults) {
  const get = (extracted, key) =>
    userOverrides[key] != null ? userOverrides[key] : extracted

  // --- GPR ---
  const units = extractedData?.unitBreakdown ?? []
  const gpr = units.reduce((sum, u) => {
    const rent = userOverrides[`unit.${u.type}.rent`] ?? u.avgMonthlyRent ?? 0
    const count = u.count ?? 0
    return sum + count * rent * 12
  }, 0)

  // --- Additional Income (annual) ---
  const addl = extractedData?.additionalIncome ?? {}
  const parking = get(addl.parking?.monthlyTotal ? addl.parking.monthlyTotal * 12 : 0, 'additionalIncome.parking')
  const storage = get(addl.storage?.monthlyTotal ? addl.storage.monthlyTotal * 12 : 0, 'additionalIncome.storage')
  const laundry = get(addl.laundry?.monthlyTotal ? addl.laundry.monthlyTotal * 12 : 0, 'additionalIncome.laundry')
  const otherIncome = get(addl.other?.monthlyTotal ? addl.other.monthlyTotal * 12 : 0, 'additionalIncome.other')

  const additionalIncome = parking + storage + laundry + otherIncome

  // --- Vacancy (applied on total revenue including additional income) ---
  const vacancyRate = defaults.vacancyRate ?? 0.05
  const grossRevenue = gpr + additionalIncome
  const vacancyLoss = grossRevenue * vacancyRate

  // --- EGI ---
  const egi = grossRevenue - vacancyLoss

  // --- Expenses ---
  const opex = extractedData?.operatingExpenses ?? {}
  const propertyTaxes = get(opex.propertyTaxes?.annualAmount ?? 0, 'propertyTaxes')
  const insurance = get(opex.insurance?.annualAmount ?? 0, 'insurance')
  const utilities = get(opex.utilities?.annualAmount ?? 0, 'utilities')
  const repairsAndMaintenance = get(opex.repairsAndMaintenance?.annualAmount ?? 0, 'repairsAndMaintenance')
  const payrollAndAdmin = get(opex.payrollAndAdmin?.annualAmount ?? 0, 'payrollAndAdmin')

  const managementFee = egi * (defaults.managementFeeRate ?? 0.0425)
  const otherDeductions = egi * (defaults.otherDeductionsRate ?? 0.01)

  const totalAppliances = userOverrides.totalAppliances ?? extractedData?.propertyInfo?.totalAppliances ?? 0
  const replacementReserve = totalAppliances * (defaults.replacementReservePerAppliance ?? 180)

  const totalOpEx =
    propertyTaxes +
    insurance +
    utilities +
    repairsAndMaintenance +
    payrollAndAdmin +
    managementFee +
    otherDeductions +
    replacementReserve

  const noi = egi - totalOpEx

  return {
    gpr,
    vacancyLoss,
    vacancyRate,
    additionalIncome,
    parking,
    storage,
    laundry,
    otherIncome,
    egi,
    propertyTaxes,
    insurance,
    utilities,
    repairsAndMaintenance,
    payrollAndAdmin,
    managementFee,
    otherDeductions,
    replacementReserve,
    totalOpEx,
    noi,
  }
}
