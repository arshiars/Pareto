import { Router } from 'express'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { upload } from '../middleware/upload.js'
import { extractFromDocuments, extractField, researchField, generatePptSuggestions, generateSqlQuery, analyzeQueryResults } from '../services/claude.js'
import { runQuery } from '../services/database.js'
import { populateExcelTemplate } from '../services/excel.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const router = Router()

function runUpload(req, res, handler) {
  return new Promise((resolve, reject) => {
    handler(req, res, (err) => (err ? reject(err) : resolve()))
  })
}

router.post('/extract', async (req, res) => {
  try {
    await runUpload(req, res, upload.array('files', 20))
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' })
    }
    let labels = []
    try { labels = JSON.parse(req.body.labels || '[]') } catch {}
    console.log(`Extracting from ${req.files.length} file(s):`, req.files.map((f) => f.originalname))
    const result = await extractFromDocuments(req.files, labels)
    res.json(result)
  } catch (err) {
    console.error('Extraction error:', err.message)
    res.status(500).json({ error: err.message || 'Extraction failed' })
  }
})

router.post('/extract-field', async (req, res) => {
  try {
    await runUpload(req, res, upload.single('file'))
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const { fieldDescription } = req.body
    if (!fieldDescription) return res.status(400).json({ error: 'fieldDescription is required' })

    console.log(`Extracting field "${fieldDescription}" from ${req.file.originalname}`)
    const result = await extractField(req.file, fieldDescription)
    res.json(result)
  } catch (err) {
    console.error('Field extraction error:', err.message)
    res.status(500).json({ error: err.message || 'Field extraction failed' })
  }
})

router.post('/research', async (req, res) => {
  try {
    const { fieldName, propertyContext } = req.body
    if (!fieldName) return res.status(400).json({ error: 'fieldName is required' })
    const result = await researchField(fieldName, propertyContext || {})
    res.json(result)
  } catch (err) {
    console.error('Research error:', err.message)
    res.status(500).json({ error: err.message || 'Research failed' })
  }
})

router.post('/ppt-suggestions', async (req, res) => {
  try {
    const { extractedData } = req.body
    if (!extractedData) return res.status(400).json({ error: 'extractedData is required' })
    console.log('Generating PowerPoint suggestions')
    const suggestions = await generatePptSuggestions(extractedData)
    res.json(suggestions)
  } catch (err) {
    console.error('PPT suggestions error:', err.message)
    res.status(500).json({ error: err.message || 'PPT suggestions failed' })
  }
})

router.post('/populate-excel', async (req, res) => {
  try {
    await runUpload(req, res, upload.none())
    let noiData = {}
    try { noiData = JSON.parse(req.body.noiData || '{}') } catch {}

    const templatePath = join(__dirname, '../templates/economics-template.xlsx')
    const templateBuffer = await readFile(templatePath)

    console.log('Populating built-in Economics template')
    const { buffer, report } = await populateExcelTemplate(templateBuffer, noiData)

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="CMHC_Populated.xlsx"',
      'Content-Length': buffer.length,
      'X-Population-Report': Buffer.from(JSON.stringify(report)).toString('base64'),
      'Access-Control-Expose-Headers': 'X-Population-Report',
    })
    res.send(buffer)
  } catch (err) {
    console.error('Excel population error:', err.message)
    res.status(500).json({ error: err.message || 'Excel population failed' })
  }
})

router.post('/database-query', async (req, res) => {
  try {
    const { question } = req.body
    if (!question) return res.status(400).json({ error: 'question is required' })

    // Step 1 — Haiku generates SQL
    console.log(`[DB Query] Question: "${question}"`)
    const sql = await generateSqlQuery(question)
    console.log(`[DB Query] SQL: ${sql.substring(0, 150)}`)

    // Step 2 — Execute SQL against Supabase
    const results = await runQuery(sql, 150)
    console.log(`[DB Query] Rows returned: ${results.rowCount}`)

    // Step 3 — Sonnet analyzes results and answers
    const answer = await analyzeQueryResults(question, sql, results)

    res.json({ answer, sql, rowCount: results.rowCount })
  } catch (err) {
    console.error('[DB Query] Error:', err.message)
    res.status(500).json({ error: err.message || 'Query failed' })
  }
})

export default router
