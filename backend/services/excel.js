import ExcelJS from 'exceljs'

// ─── Hardcoded cell map ────────────────────────────────────────────────────────
// These never change because the template never changes.
// Economics expense columns: AJ=2024 Bills, AK=2024 O/S, AL=2024 Appraisal, AM=KS Estimate
// We fill all four with the same extracted value so the NOI formula works regardless of source.

const ECON      = 'Economics'
const RENT_ROLL = 'Rent Roll'

// Unit type → Rent Roll unit code (column B)
const UNIT_CODES = {
  'bachelor':    0, 'bach': 0, 'studio': 0,
  '1 bedroom':   1, '1br': 1, '1-bedroom': 1,
  '2 bedrooms':  2, '2br': 2, '2-bedroom': 2,
  '3 bedrooms':  3, '3br': 3, '3-bedroom': 3,
  '4+ bedrooms': 4, '4br': 4, '4+ bedroom': 4, '4-bedroom': 4,
  'single room occupancy (nhcf)': 5, 'sro (nhcf)': 5,
  'semi-private & ward beds':     6,
  'private beds':                 7,
  'shelter beds (nhcf)':          8,
}

function unitCode(unitType) {
  if (unitType == null) return 1
  return UNIT_CODES[String(unitType).toLowerCase().trim()] ?? 1
}

// ─── Safe cell write — never overwrites formula cells ─────────────────────────
function writeCell(sheet, addr, value) {
  if (value === null || value === undefined || value === '') return false
  const cell = sheet.getCell(addr)
  if (cell.type === ExcelJS.ValueType.Formula || cell.formula) return false
  cell.value = value
  return true
}

function writeCells(sheet, addrs, value) {
  let n = 0
  for (const addr of addrs) { if (writeCell(sheet, addr, value)) n++ }
  return n
}

// ─── Rent Roll writer ──────────────────────────────────────────────────────────
// One row per unit starting at row 30.
// B=unitCode  D=unitNumber  E=vacant("Yes"/"")  F=rent  H=sqft
//
// Falls back to synthesizing rows from unitBreakdown when unitDetails is empty
// (Claude only extracts individual units when a full rent roll is present in docs).
function writeRentRoll(workbook, unitDetails, unitBreakdown) {
  const log = []

  // Prefer individual unit rows; fall back to one row per unit from breakdown summary
  let rows = (Array.isArray(unitDetails) && unitDetails.length > 0) ? unitDetails : []
  if (rows.length === 0) {
    for (const ub of (unitBreakdown ?? [])) {
      for (let i = 0; i < (ub.count ?? 0); i++) {
        rows.push({
          unitType:    ub.type,
          unitNumber:  null,
          monthlyRent: ub.effectiveMonthlyRent ?? ub.avgMonthlyRent ?? null,
          sqft:        ub.avgSqft ?? null,
          vacant:      false,
        })
      }
    }
    if (rows.length > 0) log.push('  (synthesized from unit breakdown — no individual unit data)')
  }

  if (rows.length === 0) {
    return { written: 0, log: ['No unit data provided — Rent Roll skipped'] }
  }

  const sheet = workbook.getWorksheet(RENT_ROLL)
  if (!sheet) return { written: 0, log: ['Rent Roll sheet not found in template'] }

  const START_ROW = 30
  let written = 0

  rows.forEach((unit, i) => {
    const row = START_ROW + i
    sheet.getCell(`B${row}`).value = unitCode(unit.unitType)
    if (unit.unitNumber != null && unit.unitNumber !== '') {
      sheet.getCell(`D${row}`).value = String(unit.unitNumber)
    }
    sheet.getCell(`E${row}`).value = unit.vacant ? 'Yes' : 'No'
    if (unit.monthlyRent != null) sheet.getCell(`F${row}`).value = unit.monthlyRent
    if (unit.sqft != null)        sheet.getCell(`H${row}`).value = unit.sqft
    const isMarket = unit.marketUnit !== false  // false only for affordable/subsidized units; default true
    sheet.getCell(`I${row}`).value = isMarket ? 'Yes' : 'No'
    written++
    log.push(`  R${row}: ${unit.unitType ?? '?'} #${unit.unitNumber ?? '?'} $${unit.monthlyRent ?? '?'}/mo${unit.vacant ? ' [VACANT]' : ''}`)
  })

  return { written, log }
}

// ─── ControlBackEnd normalizers ───────────────────────────────────────────────
// All values written to F200-F220 must exactly match ControlBackEnd list values.

function normalizeRegion(v) {
  if (!v) return null
  const s = String(v).toLowerCase()
  if (/ontario|\bon\b|toronto|ottawa|london|hamilton|windsor|kingston|brampton|mississauga/.test(s)) return 'ON'
  if (/british columbia|\bbc\b|vancouver|victoria|surrey|kelowna|burnaby/.test(s))                  return 'BC'
  if (/qu[eé]bec|\bqc\b|montr[eé]al|laval|gatineau/.test(s))                                       return 'QC'
  if (/atlantic|nova scotia|new brunswick|prince edward|newfoundland|labrador|moncton|fredericton|halifax/.test(s)) return 'Atlantic'
  if (/alberta|saskatchewan|manitoba|prairies|territories|yukon|northwest|nunavut|calgary|edmonton|winnipeg|regina|saskatoon/.test(s)) return 'Prairies & Territories'
  const valid = ['ON', 'BC', 'QC', 'Atlantic', 'Prairies & Territories']
  return valid.includes(v) ? v : null
}

function normalizeHousingType(v) {
  if (!v) return null
  const s = String(v).toLowerCase()
  if (/student/.test(s))                           return 'Student'
  if (/sro|single.?room/.test(s))                  return 'SRO'
  if (/retirement|senior/.test(s))                 return 'Retirement'
  if (/standard/.test(s))                          return 'Standard Rental Housing'
  const valid = ['Standard Rental Housing', 'Student', 'SRO', 'Retirement']
  return valid.includes(v) ? v : null
}

function normalizeFrameConstruction(v) {
  if (!v) return null
  const s = String(v).toLowerCase()
  if (/wood/.test(s))     return 'Wood Frame'
  if (/concrete/.test(s)) return 'Concrete Frame'
  const valid = ['Wood Frame', 'Concrete Frame']
  return valid.includes(v) ? v : null
}

function unitCountCategory(n) {
  if (n == null) return null
  return n <= 11 ? '11 units and less' : '12 units and more'
}

// ─── Economics writer ──────────────────────────────────────────────────────────
function writeEconomics(workbook, data) {
  const sheet = workbook.getWorksheet(ECON)
  if (!sheet) return { written: 0, log: ['Economics sheet not found in template'] }

  const log = []
  let written = 0

  function w(addr, value, label) {
    if (value == null) return
    if (writeCell(sheet, addr, value)) {
      written++
      log.push(`  ${addr}: ${label} = ${value}`)
    } else {
      log.push(`  ${addr}: SKIPPED (formula cell) — ${label}`)
    }
  }
  function wMany(addrs, value, label) {
    if (value == null) return
    const n = writeCells(sheet, addrs, value)
    written += n
    log.push(`  ${addrs.join('/')}: ${label} = ${value}`)
  }

  // ── Parking ──────────────────────────────────────────────────────────────────
  // E16-E18 = occupancy efficiency = 90% (only when parking/storage data is present)
  const pk = data.additionalIncome?.parking
  if (pk?.found) {
    w('E16', 0.9, 'UG Parking efficiency')
    w('E17', 0.9, 'EX Parking efficiency')
    if (pk.ugStallsTotal != null) {
      w('F16', pk.ugStallsTotal, 'UG Parking total stalls')
      w('G16', pk.ugMonthlyRate, 'UG Parking $/stall/mo')
    }
    if (pk.exStallsTotal != null) {
      w('F17', pk.exStallsTotal, 'EX Parking total stalls')
      w('G17', pk.exMonthlyRate, 'EX Parking $/stall/mo')
    }
  }

  // ── Storage ───────────────────────────────────────────────────────────────────
  const st = data.additionalIncome?.storage
  if (st?.found && st.unitsTotal != null) {
    w('E18', 0.9, 'Storage efficiency')
    w('F18', st.unitsTotal,  'Storage total units')
    w('G18', st.monthlyRate, 'Storage $/unit/mo')
  }

  // ── H19: Other income (annual) ────────────────────────────────────────────────
  // Anything without a stall/unit breakdown falls here, plus laundry and "other"
  const laundryAnnual = (data.additionalIncome?.laundry?.monthlyTotal ?? 0) * 12
  const otherAnnual   = (data.additionalIncome?.other?.monthlyTotal   ?? 0) * 12
  const pkFallback    = (pk?.found && pk.ugStallsTotal == null && pk.exStallsTotal == null)
    ? (pk.monthlyTotal ?? 0) * 12 : 0
  const stFallback    = (st?.found && st.unitsTotal == null)
    ? (st.monthlyTotal ?? 0) * 12 : 0
  const h19Total      = laundryAnnual + otherAnnual + pkFallback + stFallback
  if (h19Total > 0) w('H19', h19Total, 'Other income (annual, H19)')

  // ── Vacancy rate ──────────────────────────────────────────────────────────────
  // Read from income (frontend defaults), fall back to extracted propertyInfo
  const vacancy = data.income?.vacancyRate ?? data.propertyInfo?.vacancyRate ?? null
  if (vacancy != null) {
    w('G22', vacancy, 'Vacancy Rate (G22)')
    // AJ18 is market-level vacancy (5-yr average zone), not subject property — do not conflate
  }

  // ── Expenses (4 columns each) ─────────────────────────────────────────────────
  const opex = data.operatingExpenses ?? {}

  // Prefer raw extracted values; fall back to calculated values from noiData.expenses
  const taxes = opex.propertyTaxes?.annualAmount ?? data.expenses?.propertyTaxes ?? null
  const ins   = opex.insurance?.annualAmount     ?? data.expenses?.insurance      ?? null
  const util  = opex.utilities?.annualAmount     ?? data.expenses?.utilities      ?? null

  if (taxes != null) wMany(['AJ24', 'AK24', 'AL24', 'AM24'], taxes, 'Property Taxes')
  if (ins   != null) wMany(['AJ25', 'AK25', 'AL25', 'AM25'], ins,   'Insurance')
  if (util  != null) wMany(['AK26', 'AL26', 'AM26'],         util,  'Utilities')

  // R&M (row 27) and Payroll (row 28) are fully benchmark-driven in this template.
  // H27 = I27*$F$15 where I27 = X27*(1+$AK$30). No manual input columns exist.
  // Writing extracted values here has no effect — leave blank so benchmarks apply.

  // ── KS underwriting inputs ────────────────────────────────────────────────────
  // ksInputs (user-selected dropdowns) take precedence; fall back to extracted propertyInfo.
  // All values normalized to exact ControlBackEnd strings before writing.
  const pi = data.propertyInfo ?? {}
  const ks = data.ksInputs ?? {}

  // D26 = utilities type dropdown — drives the utilities benchmark lookup
  if (ks.utilitiesType) w('D26', ks.utilitiesType, 'Utilities Type (D26)')

  // Normalize: user dropdown values already match ControlBackEnd; raw extracted values need mapping
  const region   = normalizeRegion(ks.region || pi.region)
  const housing  = normalizeHousingType(ks.housingType || pi.housingType)
  const frame    = normalizeFrameConstruction(ks.frameConstruction || pi.frameConstruction)
  const propType = ks.propertyType || pi.propertyType
  const vintage  = ks.vintage      || pi.vintage

  // ── Mortgage / financing parameters ──────────────────────────────────────────
  // I68 = CMHC Term (5 or 10 yrs) — master switch for pricing regime
  // I69 = Amortization (years) — used in every PMT formula; 0 or blank causes #NUM!
  // I71 = Max Rate per COI — used in all DSC stress tests and buydown calc
  if (ks.term != null && ks.term !== '') {
    const termVal = parseInt(ks.term)
    if (!isNaN(termVal)) w('I68', termVal, 'CMHC Term (I68)')
  }
  if (ks.amortization != null && ks.amortization !== '') {
    const amortVal = parseInt(ks.amortization)
    if (!isNaN(amortVal) && amortVal > 0) w('I69', amortVal, 'Amortization (I69)')
  }
  if (ks.cmhcMaxRate != null && ks.cmhcMaxRate !== '') {
    const maxRateVal = parseFloat(ks.cmhcMaxRate)
    if (!isNaN(maxRateVal) && maxRateVal > 0) w('I71', maxRateVal > 1 ? maxRateVal / 100 : maxRateVal, 'CMHC Max Rate (I71)')
  }
  if (ks.lenderFee != null && ks.lenderFee !== '') {
    const feeVal = parseFloat(ks.lenderFee)
    if (!isNaN(feeVal) && feeVal >= 0) w('I66', feeVal > 1 ? feeVal / 100 : feeVal, 'Lender Fee (I66)')
  }

  // ── KS underwriting inputs (F200–F220) ───────────────────────────────────────
  // Only F column matters — D200-D220 are cosmetic display cells with no formula references.
  if (ks.loanType)           w('F200', ks.loanType,           'Loan Type')
  if (region)                w('F201', region,                 'Region')
  if (propType)              w('F202', propType,               'Property Type')
  if (housing)               w('F203', housing,                'Housing Type')
  if (ks.program)            w('F204', ks.program,             'Program')
  if (ks.egiTestMet)         w('F205', ks.egiTestMet,          'EGI Test Met')
  if (frame)                 w('F206', frame,                  'Frame Construction')
  if (ks.projectStatus)      w('F207', ks.projectStatus,       'Project Status')
  if (ks.premiumUsed)        w('F208', ks.premiumUsed,         'Premium Used')
  if (vintage)               w('F209', vintage,                'Estimated Vintage')
  if (pi.totalUnits) {
    // F211: ControlBackEnd category string for DSC VLOOKUP (raw integer would break VLOOKUP)
    w('F211', unitCountCategory(pi.totalUnits), 'Number of Units (F211 — category)')
  }
  if (ks.numberOfAdvances)   w('F212', ks.numberOfAdvances,    'Number of Advances')

  if (ks.ltv != null && ks.ltv !== '') {
    const ltv = parseFloat(ks.ltv)
    if (!isNaN(ltv)) w('F213', ltv > 1 ? ltv / 100 : ltv, 'LTV Limit')
  }

  if (pi.totalAppliances && pi.totalUnits && pi.totalUnits > 0) {
    w('F214', Math.round(pi.totalAppliances / pi.totalUnits), 'Appliances Per Unit')
  }

  if (ks.heatPumps != null && ks.heatPumps !== '')               w('F215', Number(ks.heatPumps),          'Heat Pumps & AC')
  if (ks.elevators != null && ks.elevators !== '')                w('F216', Number(ks.elevators),           'Elevators')
  if (ks.affordabilityPts != null && ks.affordabilityPts !== '')  w('F217', Number(ks.affordabilityPts),   'Affordability Points')
  if (ks.energyEfficiencyPts != null && ks.energyEfficiencyPts !== '') w('F218', Number(ks.energyEfficiencyPts), 'Energy Efficiency Pts')
  if (ks.accessibilityPts != null && ks.accessibilityPts !== '')  w('F219', Number(ks.accessibilityPts),   'Accessibility Points')

  // F220 is a formula (=+H118 from Budget sheet) — cannot be overwritten directly.
  // For acquisitions: write purchase price to Budget!K9 (Land Value), which flows through
  // H112 → H118 → F220, giving a correct cost basis for LTC calculations.
  const devCost = (ks.totalDevCost != null && ks.totalDevCost !== '')
    ? Number(ks.totalDevCost)
    : (() => {
        const pp = data.analysis?.purchasePrice
        if (!pp) return null
        const n = parseFloat(String(pp).replace(/[^0-9.]/g, ''))
        return n > 0 ? n : null
      })()
  if (devCost != null) {
    const budgetSheet = workbook.getWorksheet('Budget')
    if (budgetSheet) {
      const k9 = budgetSheet.getCell('K9')
      if (k9.type !== ExcelJS.ValueType.Formula && !k9.formula) {
        k9.value = devCost
        written++
        log.push(`  Budget!K9: Purchase Price / Dev Cost = ${devCost}`)
      } else {
        log.push(`  Budget!K9: SKIPPED (formula cell) — Dev Cost`)
      }
    }
    // Also attempt F220 in case this template has it as an input cell
    w('F220', devCost, 'Total Dev Cost (F220 fallback)')
  }

  // Cap rate → G34; guard against zero (would cause H34 = NOI/0 = #DIV/0!)
  if (ks.capRate != null && ks.capRate !== '') {
    const capVal = parseFloat(ks.capRate)
    if (!isNaN(capVal) && capVal > 0) w('G34', capVal > 1 ? capVal / 100 : capVal, 'Cap Rate (G34)')
  }

  return { written, log }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function populateExcelTemplate(buffer, data) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  console.log(`Template has ${workbook.worksheets.length} sheets`)

  // ExcelJS 4.4.0 bug: CF rules are loaded with formula=undefined and crash writeBuffer.
  // CF rules are visual-only and not needed in the populated output.
  for (const ws of workbook.worksheets) {
    // @ts-ignore — conditionalFormattings exists at runtime despite incomplete type def
    ws.conditionalFormattings = []
  }

  const rrResult   = writeRentRoll(workbook, data.unitDetails, data.unitBreakdown)
  const econResult = writeEconomics(workbook, data)

  console.log('\n── Rent Roll ──')
  rrResult.log.forEach(l => console.log(l))
  console.log(`Written: ${rrResult.written} unit rows`)

  console.log('\n── Economics ──')
  econResult.log.forEach(l => console.log(l))
  console.log(`Written: ${econResult.written} cells`)

  // Build missing-fields report
  const missingFields = []
  const opex = data.operatingExpenses ?? {}
  if (!opex.propertyTaxes?.annualAmount && !data.expenses?.propertyTaxes)
    missingFields.push('Property Taxes')
  if (!opex.insurance?.annualAmount && !data.expenses?.insurance)
    missingFields.push('Insurance')
  if (!opex.utilities?.annualAmount && !data.expenses?.utilities)
    missingFields.push('Utilities')
  if (!data.unitDetails?.length && !data.unitBreakdown?.length)
    missingFields.push('Unit data (Rent Roll)')
  if (!data.propertyInfo?.region)
    missingFields.push('Region (Economics F201)')
  if (!data.propertyInfo?.housingType)
    missingFields.push('Housing Type (Economics F203)')
  if (missingFields.length) console.log('\nMissing fields:', missingFields)

  const outBuffer = await workbook.xlsx.writeBuffer()
  return {
    buffer: Buffer.from(outBuffer),
    report: {
      rentRollRows:    rrResult.written,
      economicsCells:  econResult.written,
      totalWritten:    rrResult.written + econResult.written,
      missingFields,
    },
  }
}
