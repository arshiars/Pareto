import { Router } from 'express'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'
import { PDFDocument } from 'pdf-lib'
import { buildLoiExtractionPrompt, buildConditionSuggestionPrompt, buildConditionRephrasPrompt } from '../utils/loiPrompt.js'
import { generateLoiDocx } from '../services/loiDocx.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

function getClaude() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25' },
  })
}

async function getFirstChunk(buffer, maxPages = 60) {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const total = pdfDoc.getPageCount()
  if (total <= maxPages) return buffer

  const chunk = await PDFDocument.create()
  const pages = await chunk.copyPages(pdfDoc, Array.from({ length: maxPages }, (_, i) => i))
  pages.forEach(p => chunk.addPage(p))
  return Buffer.from(await chunk.save())
}

function safeParseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  try { return JSON.parse(cleaned) } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) { try { return JSON.parse(match[0]) } catch {} }
  return {}
}

// POST /api/loi/extract
// Upload a CIM PDF and extract LOI fields using Claude
router.post('/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const chunkBuffer = await getFirstChunk(req.file.buffer)
    const b64 = chunkBuffer.toString('base64')

    const claude = getClaude()
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildLoiExtractionPrompt(),
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: 'Extract all available LOI fields from this document. Return only the JSON object.' },
        ],
      }],
    })

    const text = response.content.find(b => b.type === 'text')?.text || '{}'
    const extracted = safeParseJson(text)

    res.json({ extracted })
  } catch (err) {
    console.error('[LOI/extract]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/loi/generate
// Takes all LOI fields and returns a populated DOCX file
router.post('/generate', async (req, res) => {
  try {
    const { fields, disabledRows = [], conditionsPrecedent = null } = req.body
    if (!fields) return res.status(400).json({ error: 'fields is required' })

    const docxBuffer = await generateLoiDocx(fields, disabledRows, conditionsPrecedent)

    const subject = fields.subject || 'LOI'
    const filename = `${subject.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_').substring(0, 60)}.docx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(docxBuffer)
  } catch (err) {
    console.error('[LOI/generate]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/loi/suggest-conditions
// Generate 2 additional conditions precedent using Claude
router.post('/suggest-conditions', async (req, res) => {
  try {
    const { propertyDescription = '', existingConditions = [] } = req.body
    const claude = getClaude()
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: buildConditionSuggestionPrompt(propertyDescription, existingConditions) }],
    })
    const text = response.content.find(b => b.type === 'text')?.text || '[]'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    let suggestions
    try { suggestions = JSON.parse(cleaned) } catch { suggestions = [] }
    if (!Array.isArray(suggestions)) suggestions = []
    res.json({ suggestions: suggestions.slice(0, 2) })
  } catch (err) {
    console.error('[LOI/suggest-conditions]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/loi/rephrase-condition
// Rephrase a user-written condition into formal LOI language
router.post('/rephrase-condition', async (req, res) => {
  try {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' })
    const claude = getClaude()
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{ role: 'user', content: buildConditionRephrasPrompt(text) }],
    })
    const rephrased = response.content.find(b => b.type === 'text')?.text?.trim() || text
    res.json({ rephrased })
  } catch (err) {
    console.error('[LOI/rephrase-condition]', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
