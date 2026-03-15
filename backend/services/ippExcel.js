import ExcelJS from 'exceljs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { generateIppExcelComments } from './ippClaude.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = path.join(__dirname, '../templates/ipp/IPP-Template.xlsm')

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns { value, source, isOverride, isNull } for a dotted key path.
function resolveMeta(extractedData, userOverrides, key) {
  const parts = key.split('.')
  let leaf = extractedData
  for (const part of parts) leaf = leaf?.[part]

  if (key in userOverrides) {
    const v = userOverrides[key]
    return { value: v, source: leaf?.source ?? null, isOverride: true, isNull: v == null }
  }
  return { value: leaf?.value ?? null, source: leaf?.source ?? null, isOverride: false, isNull: leaf?.value == null }
}

function parseDate(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

// Write value to a cell only if non-null and not a formula cell.
function setCell(sheet, addr, value) {
  if (value === null || value === undefined) return
  const cell = sheet.getCell(addr)
  if (cell.type === ExcelJS.ValueType.Formula) return
  cell.value = value
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function populateIppExcel(extractedData, userOverrides = {}) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(TEMPLATE_PATH)

  const uw = wb.getWorksheet('UW - IPP ICI')
  const rr = wb.getWorksheet('Rent Roll')

  // Accumulates comment metadata for the K-column pass at the end.
  // Each entry: { row: string, label: string, value, source, isOverride, isNull }
  const commentFields = []

  function write(sheet, addrs, key, kRow, label, transform) {
    const meta = resolveMeta(extractedData, userOverrides, key)
    const val  = transform ? (meta.value != null ? transform(meta.value) : meta.value) : meta.value
    const addresses = Array.isArray(addrs) ? addrs : [addrs]
    addresses.forEach(addr => setCell(sheet, addr, val))
    if (kRow != null) {
      commentFields.push({
        row:        String(kRow),
        label,
        value:      val,
        source:     meta.source,
        isOverride: meta.isOverride,
        isNull:     meta.isNull,
      })
    }
  }

  // ── Property Info ────────────────────────────────────────────────────────────
  // Row 3 has both J3 (address) and C3 (siteArea) — combine into one K3 comment.
  const addrMeta     = resolveMeta(extractedData, userOverrides, 'propertyInfo.address')
  const siteAreaMeta = resolveMeta(extractedData, userOverrides, 'propertyInfo.siteArea')
  setCell(uw, 'J3', addrMeta.value)
  setCell(uw, 'C3', siteAreaMeta.value)
  commentFields.push({
    row:        '3',
    label:      'Project Address (J3) and Site Area in acres (C3)',
    value:      `Address: ${addrMeta.value ?? 'not found'}, Site Area: ${siteAreaMeta.value != null ? siteAreaMeta.value + ' acres' : 'not found'}`,
    source:     addrMeta.source || siteAreaMeta.source,
    isOverride: addrMeta.isOverride || siteAreaMeta.isOverride,
    isNull:     addrMeta.isNull && siteAreaMeta.isNull,
  })

  write(uw, 'J4', 'propertyInfo.stories',   null, null)  // minor — no K comment
  write(uw, 'J5', 'propertyInfo.buildings',  null, null)
  write(uw, 'J6', 'propertyInfo.parking',    null, null)
  write(uw, 'C8', 'propertyInfo.yearBuilt',  8,    'Year Built (C8)')

  // ── Income ───────────────────────────────────────────────────────────────────
  write(uw, ['G20', 'J20'], 'income.otherMiscRent.annualTotal',    20, '(+) Other Misc. Rent (G20/J20)')
  write(uw, ['G21', 'J21'], 'income.recoverableRent.propertyTax',  21, '(+) Recoverable Rent — Property Tax (G21/J21)')
  write(uw, ['G22', 'J22'], 'income.recoverableRent.utilities',    22, '(+) Recoverable Rent — Utilities (G22/J22)')
  write(uw, ['G23', 'J23'], 'income.recoverableRent.allOther',     23, '(+) Recoverable Rent — All Other (G23/J23)')
  write(uw, 'I25',          'income.vacancyAllowancePct',          25, 'Stabilized Vacancy Allowance % (I25)', null)

  // ── Expenses ─────────────────────────────────────────────────────────────────
  write(uw, ['G27', 'J27'], 'expenses.propertyTaxes',            27, '(-) Property Taxes (G27/J27)')
  write(uw, ['G28', 'J28'], 'expenses.utilities',                28, '(-) Utilities (G28/J28)')
  write(uw, ['G29', 'J29'], 'expenses.otherRecoverableExpenses', 29, '(-) Other Recoverable Expenses (G29/J29)')
  write(uw, ['G30', 'J30'], 'expenses.managementFee',           30, '(-) Management Fee (G30/J30)')
  write(uw, ['G31', 'J31'], 'expenses.structuralReserve',        31, '(-) Structural Reserve (G31/J31)')

  // ── Cap Rate ─────────────────────────────────────────────────────────────────
  write(uw, ['E35', 'H35'], 'capRate', 35, 'Cap Rate (E35/H35)')

  // ── Deductions ───────────────────────────────────────────────────────────────
  write(uw, 'G36', 'deductions.tenantInducements', 36, 'Less: Tenant Inducements (G36)')
  write(uw, 'G37', 'deductions.lcs',               37, "Less: LC's (G37)")
  write(uw, 'G38', 'deductions.noiLoss',            38, 'Less: NOI Loss (G38)')
  write(uw, 'J39', 'deductions.requiredCapEx',      39, 'Less: Required Cap Ex (J39)')

  // ── Purchase Price ───────────────────────────────────────────────────────────
  write(uw, 'G41', 'acquisition.purchasePrice', 41, 'Purchase Price (G41)')

  // ── Acquisition / Cost Stack ─────────────────────────────────────────────────
  write(uw, ['G51', 'J51'], 'acquisition.landCost',         51, 'Land Cost (G51/J51)')
  write(uw, ['G53', 'J53'], 'acquisition.landValue',        53, 'Land Value (G53/J53)')
  write(uw, ['G54', 'J54'], 'acquisition.dcsAndLevies',     54, 'DCs and Levies (G54/J54)')
  write(uw, ['G55', 'J55'], 'acquisition.hardCosts',        55, 'Hard Costs (G55/J55)')
  write(uw, ['G56', 'J56'], 'acquisition.contingency',      56, 'Contingency $ (G56/J56)')
  write(uw, ['G57', 'J57'], 'acquisition.softCosts',        57, 'Soft Costs (G57/J57)')
  write(uw, ['G58', 'J58'], 'acquisition.devManagementFee', 58, 'Dev. Management Fee $ (G58/J58)')
  write(uw, ['G59', 'J59'], 'acquisition.financingCosts',   59, 'Financing Costs (G59/J59)')

  // ── Total KingSett Exposure ──────────────────────────────────────────────────
  const tkeMeta = resolveMeta(extractedData, userOverrides, 'acquisition.totalKingsettExposure')
  setCell(uw, 'G64', tkeMeta.value); setCell(uw, 'J64', tkeMeta.value)
  setCell(uw, 'G72', tkeMeta.value); setCell(uw, 'J72', tkeMeta.value)
  commentFields.push({
    row:        '64',
    label:      'Total KingSett Exposure / Loan Amount (G64, J64, G72, J72)',
    value:      tkeMeta.value,
    source:     tkeMeta.source,
    isOverride: tkeMeta.isOverride,
    isNull:     tkeMeta.isNull,
  })

  // ── Uses of Funds (no K comment — these cells are on the right side of sheet) ─
  setCell(uw, 'S5', resolveMeta(extractedData, userOverrides, 'usesOfFunds.payoutExistingDebt').value)
  setCell(uw, 'S6', resolveMeta(extractedData, userOverrides, 'usesOfFunds.purchasePrice').value)
  setCell(uw, 'S7', resolveMeta(extractedData, userOverrides, 'usesOfFunds.closingCosts').value)
  setCell(uw, 'S8', resolveMeta(extractedData, userOverrides, 'usesOfFunds.equityTakeout').value)

  // ── Rent Roll Sheet ──────────────────────────────────────────────────────────
  const tenants = extractedData.tenants ?? []

  function getTenantVal(tenant, idx, field) {
    const key = `tenants.${idx}.${field}`
    if (key in userOverrides) return userOverrides[key]
    return tenant[field]?.value ?? null
  }

  const resolved = tenants.map((t, i) => ({
    name:          getTenantVal(t, i, 'tenant') ?? '',
    area:          getTenantVal(t, i, 'area'),
    rate:          getTenantVal(t, i, 'rate'),
    annualRent:    getTenantVal(t, i, 'annualRent'),
    leaseStart:    getTenantVal(t, i, 'leaseStart'),
    leaseEnd:      getTenantVal(t, i, 'leaseEnd'),
    renewalOption: getTenantVal(t, i, 'renewalOption'),
  }))

  const leased = resolved.filter(t => !t.name.toLowerCase().includes('vacant'))
                          .sort((a, b) => (b.area ?? 0) - (a.area ?? 0))
  const vacant = resolved.filter(t =>  t.name.toLowerCase().includes('vacant'))
                          .sort((a, b) => (b.area ?? 0) - (a.area ?? 0))

  const MAX_ROWS        = 24
  const maxLeasedRows   = MAX_ROWS - vacant.length
  let leasedToWrite     = leased
  let overflowRow       = null

  if (leased.length > maxLeasedRows) {
    const keep     = leased.slice(0, maxLeasedRows - 1)
    const overflow = leased.slice(maxLeasedRows - 1)
    const totalArea = overflow.reduce((s, t) => s + (t.area ?? 0), 0)
    const totalRent = overflow.reduce((s, t) => s + (t.annualRent ?? 0), 0)
    const wAvgRate  = totalArea > 0 ? Math.round((totalRent / totalArea) * 100) / 100 : 0
    overflowRow = {
      name: 'Other Tenants',
      area: totalArea,
      rate: wAvgRate,
      annualRent: totalRent,
      leaseStart: null,
      leaseEnd: null,
      renewalOption: 'Varies',
    }
    leasedToWrite = keep
  }

  const allRows    = [...leasedToWrite, ...(overflowRow ? [overflowRow] : []), ...vacant]
  const START_ROW  = 5
  const INPUT_COLS = ['A', 'B', 'C', 'E', 'F', 'I']

  // Clear template sample data
  for (let i = 0; i < MAX_ROWS; i++) {
    const rowNum = START_ROW + i
    INPUT_COLS.forEach(col => {
      const cell = rr.getCell(`${col}${rowNum}`)
      if (cell.type !== ExcelJS.ValueType.Formula) cell.value = null
    })
  }

  // Write tenant rows
  for (let i = 0; i < Math.min(allRows.length, MAX_ROWS); i++) {
    const t      = allRows[i]
    const rowNum = START_ROW + i
    if (t.name)         rr.getCell(`A${rowNum}`).value = t.name
    if (t.area  != null) rr.getCell(`B${rowNum}`).value = t.area
    if (t.rate  != null) rr.getCell(`C${rowNum}`).value = t.rate
    if (t.leaseStart) {
      const d = parseDate(t.leaseStart)
      if (d) { const c = rr.getCell(`E${rowNum}`); c.value = d; c.numFmt = 'yyyy-mm-dd' }
    }
    if (t.leaseEnd) {
      const d = parseDate(t.leaseEnd)
      if (d) { const c = rr.getCell(`F${rowNum}`); c.value = d; c.numFmt = 'yyyy-mm-dd' }
    }
    if (t.renewalOption) rr.getCell(`I${rowNum}`).value = t.renewalOption
  }

  // ── Generate K-column comments via Claude ────────────────────────────────────
  try {
    const comments = await generateIppExcelComments(commentFields)
    for (const [rowStr, text] of Object.entries(comments)) {
      if (text) {
        const cell = uw.getCell(`K${rowStr}`)
        cell.value = text
      }
    }
    console.log(`[IPP] Wrote ${Object.keys(comments).length} K-column comments`)
  } catch (err) {
    // Non-fatal: export succeeds without comments if Claude call fails
    console.warn('[IPP] Comment generation failed (export continues):', err.message)
  }

  return wb.xlsx.writeBuffer()
}
