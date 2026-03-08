import ExcelJS from 'exceljs'
import { readFile } from 'fs/promises'

const buf = await readFile('./backend/templates/economics-template.xlsx')
const wb  = new ExcelJS.Workbook()
await wb.xlsx.load(buf)

console.log('Sheets:', wb.worksheets.map(s => s.name))

for (const sheetName of ['Economics', 'Rent Roll']) {
  const ws = wb.getWorksheet(sheetName)
  if (!ws) { console.log(`\n[${sheetName}] NOT FOUND`); continue }
  console.log(`\n${'='.repeat(60)}`)
  console.log(`SHEET: ${sheetName}`)
  console.log('='.repeat(60))

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value
      if (v === null || v === undefined || v === '') return
      const isFormula = cell.type === ExcelJS.ValueType.Formula || cell.formula
      const display = isFormula ? `[FORMULA: ${cell.formula ?? '?'}]` : JSON.stringify(v)
      console.log(`  ${cell.address.padEnd(6)} ${isFormula ? 'F' : 'V'} ${display}`)
    })
  })
}
