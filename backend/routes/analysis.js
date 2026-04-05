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

// POST /analysis/devils-advocate (streaming via SSE)
router.post('/devils-advocate', async (req, res) => {
  const { noiData, propertyInfo, defaults } = req.body
  if (!noiData) return res.status(400).json({ error: 'noiData is required' })

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = `You are a skeptical senior underwriter at a Canadian institutional lender. Poke holes in this deal. Be specific and quantitative.

## Property
- Address: ${propertyInfo?.address || 'Not specified'}
- Total Units: ${propertyInfo?.totalUnits || 'Unknown'}
- Year Built: ${propertyInfo?.yearBuilt || 'Unknown'}

## Assumptions: Vacancy ${((defaults?.vacancyRate ?? 0) * 100).toFixed(2)}%, Mgmt Fee ${((defaults?.managementFeeRate ?? 0) * 100).toFixed(2)}%, Cap Rate ${defaults?.capRate ? ((defaults.capRate) * 100).toFixed(2) + '%' : 'Not set'}

## NOI: GPR $${noiData.gpr?.toLocaleString() ?? 0} | Add'l Income $${noiData.additionalIncome?.toLocaleString() ?? 0} | Vacancy ($${noiData.vacancyLoss?.toLocaleString() ?? 0}) | EGI $${noiData.egi?.toLocaleString() ?? 0} | Prop Tax $${noiData.propertyTaxes?.toLocaleString() ?? 0} | Insurance $${noiData.insurance?.toLocaleString() ?? 0} | Utilities $${noiData.utilities?.toLocaleString() ?? 0} | R&M $${noiData.repairsAndMaintenance?.toLocaleString() ?? 0} | Payroll $${noiData.payrollAndAdmin?.toLocaleString() ?? 0} | Mgmt $${noiData.managementFee?.toLocaleString() ?? 0} | Total OpEx $${noiData.totalOpEx?.toLocaleString() ?? 0} | **NOI $${noiData.noi?.toLocaleString() ?? 0}**

Write your response in this EXACT format — one section at a time. Start with OVERALL, then each CHALLENGE. Use this exact structure with these exact markers:

OVERALL: 2-3 sentence assessment of whether the underwriting is aggressive, conservative, or reasonable.

CHALLENGE: Field Name
CURRENT: the current value
RISK: 2-3 sentence explanation of why this is questionable. Be specific.
SUGGESTED: your recommended alternative value or range

CHALLENGE: Next Field Name
CURRENT: ...
RISK: ...
SUGGESTED: ...

Rules:
- Only raise HIGH severity issues that materially impact NOI or deal value
- 3-6 challenges maximum
- Be specific and quantitative — cite CMHC benchmarks, typical Canadian multi-res ranges
- Do NOT use JSON. Use the exact plain text format above.`

    const stream = claude.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const text = event.delta.text
        res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    res.end()
  } catch (err) {
    console.error('[Devils Advocate] Stream error:', err.message)
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
    res.end()
  }
})

export default router
