import { Router } from 'express'
import { upload } from '../middleware/upload.js'
import { extractFromDocuments, extractField, researchField } from '../services/claude.js'

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
    console.log(`Extracting from ${req.files.length} file(s):`, req.files.map((f) => f.originalname))
    const result = await extractFromDocuments(req.files)
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

export default router
