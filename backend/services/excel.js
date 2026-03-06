import ExcelJS from 'exceljs'
import { getExcelMappings } from './claude.js'

const MAX_ROWS = 500
const MAX_COLS = 30
const CONTEXT_ROWS_BEFORE = 5
const CONTEXT_ROWS_AFTER  = 2

/**
 * Returns true if the cell has a blue font — the standard Excel convention
 * for user-input cells in CMHC underwriting templates.
 */
function isBlueFont(cell) {
  const color = cell.font?.color
  if (!color) return false

  if (color.argb) {
    const hex = color.argb.replace('#', '').padStart(8, '0')
    const r = parseInt(hex.slice(2, 4), 16)
    const g = parseInt(hex.slice(4, 6), 16)
    const b = parseInt(hex.slice(6, 8), 16)
    // Blue dominant: blue channel > 100, clearly higher than red and green
    return b > 100 && b > r * 1.3 && b > g * 1.1
  }

  // Theme indices 4–5 are typically blue in Office color schemes
  if (color.theme === 4 || color.theme === 5) return true

  return false
}

/**
 * Get the display text of a cell (handles rich text, dates, plain values).
 */
function getCellText(cell) {
  if (cell.type === ExcelJS.ValueType.Null || cell.value == null || cell.value === '') return ''
  if (cell.type === ExcelJS.ValueType.RichText) return cell.text || ''
  if (cell.type === ExcelJS.ValueType.Date) return cell.value?.toISOString?.()?.split('T')[0] ?? String(cell.value)
  return cell.text !== undefined && cell.text !== '' ? cell.text : String(cell.value ?? '')
}

/**
 * For a given blue INPUT cell, find the nearest label by scanning:
 * 1. Left along the same row
 * 2. Up in the same column (up to 5 rows)
 * Returns the label text, or null if nothing found.
 */
function findNearestLabel(sheet, rowNumber, colNumber) {
  // Scan left on the same row
  for (let c = colNumber - 1; c >= 1; c--) {
    const cell = sheet.getCell(rowNumber, c)
    if (cell.type === ExcelJS.ValueType.Merge || cell.type === ExcelJS.ValueType.Formula) continue
    if (isBlueFont(cell)) continue
    const val = getCellText(cell).trim()
    if (val) return val
  }
  // Scan up in the same column
  for (let r = rowNumber - 1; r >= Math.max(1, rowNumber - 5); r--) {
    const cell = sheet.getCell(r, colNumber)
    if (cell.type === ExcelJS.ValueType.Merge || cell.type === ExcelJS.ValueType.Formula) continue
    if (isBlueFont(cell)) continue
    const val = getCellText(cell).trim()
    if (val) return val
  }
  return null
}

/**
 * Walk every sheet and produce a compact text map for Claude.
 * Only blue-font cells (user input) are marked [INPUT label="..."].
 * The label is pre-computed so Claude never has to guess which column to use.
 * Formula cells → [FORMULA], other values → "text"
 */
function buildCellMap(workbook) {
  const sections = []

  workbook.eachSheet((sheet) => {
    const rowData = [] // { rowNumber, line: string, hasInput: boolean }
    let rowCount = 0

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowCount >= MAX_ROWS) return
      rowCount++

      const parts = []
      let hasInput = false
      const colLimit = Math.min(Math.max(row.actualCellCount + 3, 5), MAX_COLS)

      for (let c = 1; c <= colLimit; c++) {
        const cell = row.getCell(c)
        if (cell.type === ExcelJS.ValueType.Merge) continue

        const addr = cell.address
        const blue = isBlueFont(cell)

        if (cell.type === ExcelJS.ValueType.Formula || cell.formula) {
          parts.push(`${addr}=[FORMULA]`)
        } else if (blue) {
          const label = findNearestLabel(sheet, rowNumber, c)
          const labelStr = label ? ` label="${label}"` : ''
          const existing = cell.value != null && cell.value !== '' ? ` currently="${getCellText(cell)}"` : ''
          parts.push(`${addr}=[INPUT${labelStr}${existing}]`)
          hasInput = true
        } else {
          const val = getCellText(cell).trim()
          if (!val) continue
          parts.push(`${addr}="${val.length > 80 ? val.substring(0, 80) + '…' : val}"`)
        }
      }

      if (parts.length > 0) {
        rowData.push({ rowNumber, line: `Row ${rowNumber}: ${parts.join(', ')}`, hasInput })
      }
    })

    // Include only rows with [INPUT] cells + surrounding context rows
    const included = new Set()
    rowData.forEach((r, i) => {
      if (!r.hasInput) return
      for (let c = Math.max(0, i - CONTEXT_ROWS_BEFORE); c <= Math.min(rowData.length - 1, i + CONTEXT_ROWS_AFTER); c++) {
        included.add(c)
      }
    })

    if (included.size === 0) return // no blue input cells on this sheet — skip

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
 * Apply Claude's mappings — only to [INPUT] (blue-font) cells.
 * Formula cells are double-checked and never overwritten.
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

    if (!isBlueFont(cell)) {
      skipped.push(`NOT BLUE: ${m.sheet}!${m.cell} (${m.field}) — refusing to write to non-input cell`)
      continue
    }

    const safeValue = sanitizeValue(m.value, m.field, m.label)
    cell.value = safeValue

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

  console.log('Building cell map (blue-font input cells only)...')
  const cellMap = buildCellMap(workbook)
  console.log(`Cell map built (${cellMap.length} chars, ${cellMap.split('\n').length} lines)`)

  if (!cellMap.trim()) {
    throw new Error('No blue-font input cells found in this template. Make sure you are uploading the correct CMHC Excel file.')
  }

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
