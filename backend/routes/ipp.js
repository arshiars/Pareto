import { Router } from 'express'
import { upload } from '../middleware/upload.js'
import { extractIppFromDocuments, extractTenantFromLease, extractRentRoll, extractIppExpenseField, generateIppDealSummary } from '../services/ippClaude.js'

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
    console.log(`[IPP] Extracting from ${req.files.length} file(s):`, req.files.map((f) => f.originalname))
    const result = await extractIppFromDocuments(req.files, labels)
    res.json(result)
  } catch (err) {
    console.error('[IPP] Extraction error:', err.message)
    res.status(500).json({ error: err.message || 'IPP extraction failed' })
  }
})

router.post('/extract-rent-roll', async (req, res) => {
  try {
    await runUpload(req, res, upload.single('file'))
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    console.log(`[IPP] Extracting rent roll from: ${req.file.originalname}`)
    const tenants = await extractRentRoll(req.file)
    res.json({ tenants })
  } catch (err) {
    console.error('[IPP] Rent roll extraction error:', err.message)
    res.status(500).json({ error: err.message || 'Rent roll extraction failed' })
  }
})

router.post('/extract-expense-field', async (req, res) => {
  try {
    await runUpload(req, res, upload.single('file'))
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const { fieldDescription } = req.body
    if (!fieldDescription) return res.status(400).json({ error: 'fieldDescription is required' })
    const result = await extractIppExpenseField(req.file, fieldDescription)
    res.json(result)
  } catch (err) {
    console.error('[IPP] Expense field extraction error:', err.message)
    res.status(500).json({ error: err.message || 'Expense field extraction failed' })
  }
})

router.post('/extract-tenant-lease', async (req, res) => {
  try {
    await runUpload(req, res, upload.single('file'))
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    console.log(`[IPP] Extracting tenant lease from: ${req.file.originalname}`)
    const result = await extractTenantFromLease(req.file)
    res.json(result)
  } catch (err) {
    console.error('[IPP] Tenant lease extraction error:', err.message)
    res.status(500).json({ error: err.message || 'Tenant lease extraction failed' })
  }
})

router.post('/deal-summary', async (req, res) => {
  try {
    const extractedData = req.body
    if (!extractedData || typeof extractedData !== 'object') {
      return res.status(400).json({ error: 'extractedData JSON body is required' })
    }
    console.log('[IPP] Generating deal summary')
    const result = await generateIppDealSummary(extractedData)
    res.json(result)
  } catch (err) {
    console.error('[IPP] Deal summary error:', err.message)
    res.status(500).json({ error: err.message || 'Deal summary generation failed' })
  }
})

export default router
