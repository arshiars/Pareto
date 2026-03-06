import ExcelJS from 'exceljs'
import { getExcelMappings } from './claude.js'

const MAX_ROWS = 500
const MAX_COLS = 30
const CONTEXT_ROWS_BEFORE = 5 // label rows to include above each empty-cell row
const CONTEXT_ROWS_AFTER  = 2 // rows to include below (helps Claude see units, totals)

/**
 * Walk every sheet and produce a compact text map of cells for Claude.
 * Only rows containing [EMPTY] cells (plus CONTEXT_ROWS of label context above them)
 * are emitted. Sheets with no input cells are skipped entirely.
 * Formula cells → [FORMULA], empty cells → [EMPTY], values → "text"
 */
function buildCellMap(workbook) {
  const sections = []

  workbook.eachSheet((sheet) => {
    // Phase 1: collect every row's representation
    const rowData = [] // { rowNumber, line: string, hasEmpty: boolean }
    let rowCount = 0

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowCount >= MAX_ROWS) return
      rowCount++

      const parts = []
      let hasEmpty = false
      const colLimit = Math.min(Math.max(row.actualCellCount + 3, 5), MAX_COLS)

      for (let c = 1; c <= colLimit; c++) {
        const cell = row.getCell(c)
        if (cell.type === ExcelJS.ValueType.Merge) continue

        const addr = cell.address

        if (cell.type === ExcelJS.ValueType.Formula || cell.formula) {
          parts.push(`${addr}=[FORMULA]`)
        } else if (
          cell.type === ExcelJS.ValueType.Null ||
          cell.value === null ||
          cell.value === undefined ||
          cell.value === ''
        ) {
          parts.push(`${addr}=[EMPTY]`)
          hasEmpty = true
        } else {
          let val
          if (cell.type === ExcelJS.ValueType.RichText) {
            val = cell.text || ''
          } else if (cell.type === ExcelJS.ValueType.Date) {
            val = cell.value?.toISOString?.()?.split('T')[0] ?? String(cell.value)
          } else {
            val = cell.text !== undefined && cell.text !== '' ? cell.text : String(cell.value ?? '')
          }
          val = String(val).trim()
          if (val.length > 80) val = val.substring(0, 80) + '…'
          parts.push(`${addr}="${val}"`)
        }
      }

      if (parts.length > 0) {
        rowData.push({ rowNumber, line: `Row ${rowNumber}: ${parts.join(', ')}`, hasEmpty })
      }
    })

    // Phase 2: select only empty-cell rows + context rows before and after
    const included = new Set()
    rowData.forEach((r, i) => {
      if (!r.hasEmpty) return
      for (let c = Math.max(0, i - CONTEXT_ROWS_BEFORE); c <= Math.min(rowData.length - 1, i + CONTEXT_ROWS_AFTER); c++) {
        included.add(c)
      }
    })

    if (included.size === 0) return // sheet has no input cells — skip it

    const lines = [`\n=== Sheet: "${sheet.name}" ===`]
    const sortedIdxs = [...included].sort((a, b) => a - b)
    let prev = -1
    for (const idx of sortedIdxs) {
      if (prev !== -1 && idx > prev + 1) lines.push('  ...')
      lines.push(rowData[idx].line)
      prev = idx
    }

    sections.push(lines.join('\n'))
  })

  return sections.join('\n')
}

const RATE_FIELD_PATTERN = /rate|pct|percent/i
const RATE_LABEL_PATTERN = /rate|%|percent/i

/**
 * If a value looks like a whole-number percentage (e.g. 5) but the field/label
 * indicates it should be a decimal rate (e.g. 0.05), divide by 100.
 */
function sanitizeValue(value, field = '', label = '') {
  if (typeof value !== 'number') return value
  const looksLikeRate = RATE_FIELD_PATTERN.test(field) || RATE_LABEL_PATTERN.test(label)
  if (looksLikeRate && value > 1) {
    const fixed = value / 100
    console.log(`  ⚠ Rate sanity fix: ${field} ${value} → ${fixed} (divided by 100)`)
    return fixed
  }
  return value
}

/**
 * Apply Claude's cell mappings to the workbook.
 * - Skips [FORMULA] cells (double-checked here, never just trusting Claude)
 * - Skips low-confidence mappings
 * - Applies percentage sanity fix before writing
 */
function applyMappings(workbook, mappings) {
  const applied = []
  const skipped = []
  const lowConfidence = []

  for (const m of mappings) {
    if (m.confidence === 'low') {
      lowConfidence.push(`LOW CONFIDENCE skipped: ${m.sheet}!${m.cell} = ${JSON.stringify(m.value)} (${m.field}: ${m.label})`)
      continue
    }

    const sheet = workbook.getWorksheet(m.sheet)
    if (!sheet) {
      skipped.push(`Sheet not found: "${m.sheet}" for cell ${m.cell}`)
      continue
    }

    const cell = sheet.getCell(m.cell)

    if (cell.type === ExcelJS.ValueType.Formula || cell.formula) {
      skipped.push(`FORMULA PROTECTED: ${m.sheet}!${m.cell} (${m.field})`)
      continue
    }

    const safeValue = sanitizeValue(m.value, m.field, m.label)
    cell.value = safeValue

    // Read-back verification
    const readBack = sheet.getCell(m.cell).value
    if (readBack !== safeValue) {
      skipped.push(`WRITE VERIFY FAILED: ${m.sheet}!${m.cell} wrote ${safeValue} but read back ${readBack}`)
    } else {
      applied.push(`✓ ${m.sheet}!${m.cell} = ${JSON.stringify(safeValue)} (${m.field}: ${m.label})`)
    }
  }

  console.log('\n── Excel Population Results ──')
  applied.forEach((l) => console.log(l))
  if (lowConfidence.length) {
    console.log('\n── Low Confidence (skipped) ──')
    lowConfidence.forEach((l) => console.log(' ⚠', l))
  }
  if (skipped.length) {
    console.log('\n── Skipped ──')
    skipped.forEach((l) => console.log(' ⚠', l))
  }
  console.log(`\nTotal: ${applied.length} applied, ${lowConfidence.length} low-confidence skipped, ${skipped.length} skipped\n`)

  return { applied, skipped, lowConfidence }
}

export async function populateExcelTemplate(buffer, noiData) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  console.log('Building cell map...')
  const cellMap = buildCellMap(workbook)
  console.log(`Cell map built (${cellMap.length} chars, ${cellMap.split('\n').length} lines)`)

  console.log('Asking Claude for cell mappings...')
  const result = await getExcelMappings(cellMap, noiData)
  const mappings = result?.mappings ?? []
  const unmappedFields = result?.unmappedFields ?? []
  console.log(`Claude returned ${mappings.length} mappings, ${unmappedFields.length} unmapped fields`)
  if (unmappedFields.length) console.log('Unmapped fields:', unmappedFields)

  const { applied, lowConfidence } = applyMappings(workbook, mappings)

  const outBuffer = await workbook.xlsx.writeBuffer()
  return {
    buffer: Buffer.from(outBuffer),
    report: {
      applied: applied.length,
      lowConfidenceSkipped: lowConfidence.length,
      unmappedFields,
    },
  }
}
