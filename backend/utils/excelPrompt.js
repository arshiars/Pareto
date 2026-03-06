function fmt(n) {
  return n != null && n !== 0 ? `$${Number(n).toLocaleString('en-CA')}` : null
}
function fmtPct(n) {
  return n != null ? `${(n * 100).toFixed(2)}% (decimal: ${n})` : null
}

function formatNoiData(data) {
  const lines = []

  if (data.propertyInfo) {
    const p = data.propertyInfo
    lines.push('PROPERTY INFORMATION:')
    if (p.address)        lines.push(`  Address:            ${p.address}`)
    if (p.propertyType)   lines.push(`  Property Type:      ${p.propertyType}`)
    if (p.totalUnits)     lines.push(`  Total Units:        ${p.totalUnits}`)
    if (p.totalAppliances) lines.push(`  Total Appliances:   ${p.totalAppliances}`)
  }

  if (data.unitBreakdown?.length) {
    lines.push('\nUNIT MIX:')
    for (const u of data.unitBreakdown) {
      const rent = u.effectiveMonthlyRent ?? u.avgMonthlyRent ?? 0
      const annual = (u.count ?? 0) * rent * 12
      lines.push(`  ${u.type}: ${u.count} units × $${rent}/month = $${annual.toLocaleString('en-CA')}/year`)
      if (u.avgSqft) lines.push(`    Avg sqft: ${u.avgSqft}`)
    }
  }

  if (data.income) {
    const i = data.income
    lines.push('\nANNUAL INCOME:')
    lines.push(`  Gross Potential Rent (GPR):       ${fmt(i.gpr)}`)
    if (i.parking) lines.push(`  Parking Income:                  ${fmt(i.parking)}`)
    if (i.storage) lines.push(`  Storage Income:                  ${fmt(i.storage)}`)
    if (i.laundry) lines.push(`  Laundry Income:                  ${fmt(i.laundry)}`)
    if (i.other)   lines.push(`  Other Income:                    ${fmt(i.other)}`)
    lines.push(`  Vacancy Rate:                     ${fmtPct(i.vacancyRate)} (applied on total revenue)`)
    lines.push(`  Vacancy Loss:                    -${fmt(i.vacancyLoss)}`)
    lines.push(`  Effective Gross Income (EGI):     ${fmt(i.egi)}`)
  }

  if (data.expenses) {
    const e = data.expenses
    lines.push('\nANNUAL EXPENSES:')
    if (e.propertyTaxes)         lines.push(`  Property Taxes:                  ${fmt(e.propertyTaxes)}`)
    if (e.insurance)             lines.push(`  Insurance:                       ${fmt(e.insurance)}`)
    if (e.utilities)             lines.push(`  Utilities:                       ${fmt(e.utilities)}`)
    if (e.repairsAndMaintenance) lines.push(`  Repairs & Maintenance:           ${fmt(e.repairsAndMaintenance)}`)
    if (e.payrollAndAdmin)       lines.push(`  Payroll & Administration:        ${fmt(e.payrollAndAdmin)}`)
    lines.push(`  Management Fee:                  ${fmt(e.managementFee)} (${fmtPct(e.managementFeeRate)} of EGI)`)
    lines.push(`  Other Deductions:                ${fmt(e.otherDeductions)} (${fmtPct(e.otherDeductionsRate)} of EGI)`)
    if (e.replacementReserve)    lines.push(`  Replacement Reserve:             ${fmt(e.replacementReserve)}`)
    lines.push(`  Total Operating Expenses:        ${fmt(e.totalOpEx)}`)
  }

  lines.push(`\nNET OPERATING INCOME (NOI):         ${fmt(data.noi)}`)
  return lines.join('\n')
}

export function buildExcelMappingPrompt(cellMap, noiData) {
  const targetNOI = noiData.noi != null ? `$${Number(noiData.noi).toLocaleString('en-CA')}` : 'see data below'
  return `You are populating a CMHC Excel NOI underwriting template with real property data. Every input cell must be filled correctly. The final NOI the template computes must match the target NOI: ${targetNOI}.

PROPERTY DATA:
${formatNoiData(noiData)}

TEMPLATE STRUCTURE:
(Only blue-font input cells and their surrounding label rows are shown. [INPUT] = blue-font cell you must fill. [FORMULA] = auto-calculated, never touch.)
${cellMap}

INSTRUCTIONS:
1. Work sheet by sheet. Each [INPUT label="..."] cell tells you exactly what it represents — use that label to match the correct value from the property data.
2. Only map [INPUT] cells. Never map [FORMULA] cells or any cell not marked [INPUT].
3. The cell address is embedded in each [INPUT] marker (e.g. E15=[INPUT label="Property Taxes"]). Use that exact address — do not guess or shift columns.
4. For unit mix rows: fill both unit count AND monthly rent per unit. Read each row's label carefully — 1BR rent must go in the 1BR row, 2BR in the 2BR row, etc. Do not mix them up.
5. For percentage/rate cells: determine from context whether the template expects decimal (0.05) or whole number (5). Default to decimal.
6. Annual vs monthly: check the label or nearby context carefully. Do not put an annual amount where monthly is expected, or vice versa.
7. If a field appears on multiple sheets, map it on every sheet.
8. Numbers only — no $, no commas, no % symbols.

BEFORE FINALISING YOUR OUTPUT:
- Verify each cell address exists in the template structure above. Do not invent addresses.
- If a label does not clearly match the field you intend to assign, set confidence to "low".
- Cross-check: the sum of your input values should drive the template to NOI = ${targetNOI}. If something looks off, re-examine your unit mix and expense mappings.

Return only valid JSON:
{
  "mappings": [
    {
      "sheet": "exact sheet name",
      "cell": "B12",
      "value": 42,
      "field": "fieldName",
      "label": "the label you read",
      "confidence": "high"
    }
  ],
  "unmappedFields": ["list any NOI fields you could not find a cell for"]
}`
}
