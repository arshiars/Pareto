import Anthropic from '@anthropic-ai/sdk'
import { PDFDocument } from 'pdf-lib'
import { buildIppExtractionPrompt, buildTenantLeaseExtractionPrompt, buildRentRollExtractionPrompt, buildExpenseFieldExtractionPrompt, buildDealSummaryPrompt, buildExcelCommentPrompt } from '../utils/ippExtractionPrompt.js'
import { safeParseJson } from './claude.js'

const MAX_PDF_PAGES = 100

function getClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 3,
    defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25,prompt-caching-2024-07-31' },
  })
}

async function splitPdf(buffer) {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const totalPages = pdfDoc.getPageCount()
  if (totalPages <= MAX_PDF_PAGES) return [buffer]

  console.log(`  PDF has ${totalPages} pages — splitting into chunks of ${MAX_PDF_PAGES}`)
  const chunks = []
  for (let start = 0; start < totalPages; start += MAX_PDF_PAGES) {
    const end = Math.min(start + MAX_PDF_PAGES, totalPages)
    const chunk = await PDFDocument.create()
    const copiedPages = await chunk.copyPages(pdfDoc, Array.from({ length: end - start }, (_, i) => start + i))
    copiedPages.forEach((p) => chunk.addPage(p))
    chunks.push(Buffer.from(await chunk.save()))
  }
  return chunks
}

async function fileToContentBlocks(file) {
  const isPdf = file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf'
  if (isPdf) {
    const chunks = await splitPdf(file.buffer)
    return chunks.map((chunk) => ({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: chunk.toString('base64') },
    }))
  }
  return [{
    type: 'image',
    source: { type: 'base64', media_type: file.mimetype, data: file.buffer.toString('base64') },
  }]
}

// ─── Merge helpers ─────────────────────────────────────────────────────────────

// Merges { value, source } leaf fields — prefers first non-null value
function mergeField(fields) {
  return fields.find((f) => f?.value != null) ?? fields.find(Boolean) ?? { value: null, source: null }
}

// Recursively merges objects whose leaves are { value, source } pairs
function mergeObject(objects) {
  const base = objects.find(Boolean)
  if (!base) return {}
  const out = {}
  for (const key of Object.keys(base)) {
    const vals = objects.map((o) => o?.[key])
    const first = vals.find(Boolean)
    if (first && typeof first === 'object' && 'value' in first) {
      // leaf field
      out[key] = mergeField(vals)
    } else if (first && typeof first === 'object') {
      // nested object — recurse
      out[key] = mergeObject(vals)
    } else {
      out[key] = vals.find((v) => v != null) ?? null
    }
  }
  return out
}

function mergeTenants(arrays) {
  const seen = new Set()
  const out = []
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue
    for (const t of arr) {
      const key = `${t.tenant?.value}|${t.leaseStart?.value}|${t.leaseEnd?.value}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push(t)
      }
    }
  }
  return out
}

function mergeIppExtractions(results) {
  if (results.length === 1) return results[0]
  return {
    propertyInfo: mergeObject(results.map((r) => r.propertyInfo)),
    income: {
      otherMiscRent:     mergeObject(results.map((r) => r.income?.otherMiscRent)),
      recoverableRent:   mergeObject(results.map((r) => r.income?.recoverableRent)),
      vacancyAllowancePct: mergeField(results.map((r) => r.income?.vacancyAllowancePct)),
    },
    expenses:     mergeObject(results.map((r) => r.expenses)),
    capRate:      mergeField(results.map((r) => r.capRate)),
    deductions:   mergeObject(results.map((r) => r.deductions)),
    acquisition:  mergeObject(results.map((r) => r.acquisition)),
    usesOfFunds:  mergeObject(results.map((r) => r.usesOfFunds)),
    tenants:      mergeTenants(results.map((r) => r.tenants)),
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function extractIppFromDocuments(files, labels = []) {
  const results = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const label = labels[i] || null
    console.log(`[IPP ${i + 1}/${files.length}] Processing: ${file.originalname} (${file.mimetype})${label ? ` [${label}]` : ''}`)

    const contentBlocks = await fileToContentBlocks(file)
    if (label) {
      contentBlocks.unshift({
        type: 'text',
        text: `Document type: "${label}". Use this context to prioritize extraction for this document type.`,
      })
    }

    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      system: [
        {
          type: 'text',
          text: buildIppExtractionPrompt(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: contentBlocks }],
    })

    if (!response?.content?.length) throw new Error('Claude returned an empty response (model may be overloaded — retry)')
    const raw = response.content[0].text
    results.push(safeParseJson(raw))
  }

  return mergeIppExtractions(results)
}

export async function extractRentRoll(file) {
  console.log(`[IPP] Extracting rent roll from: ${file.originalname}`)
  const contentBlocks = await fileToContentBlocks(file)

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8192,
    system: buildRentRollExtractionPrompt(),
    messages: [{ role: 'user', content: contentBlocks }],
  })

  if (!response?.content?.length) throw new Error('Claude returned an empty response (model may be overloaded — retry)')
  const parsed = safeParseJson(response.content[0].text)
  return parsed.tenants ?? []
}

export async function extractIppExpenseField(file, fieldDescription) {
  console.log(`[IPP] Extracting expense field "${fieldDescription}" from: ${file.originalname}`)
  const contentBlocks = await fileToContentBlocks(file)

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 256,
    system: buildExpenseFieldExtractionPrompt(fieldDescription),
    messages: [{ role: 'user', content: contentBlocks }],
  })

  if (!response?.content?.length) throw new Error('Claude returned an empty response (model may be overloaded — retry)')
  return safeParseJson(response.content[0].text)
}

export async function generateIppExcelComments(fields) {
  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{ role: 'user', content: buildExcelCommentPrompt(fields) }],
  })
  if (!response?.content?.length) throw new Error('Empty response from Claude')
  return safeParseJson(response.content[0].text)
}

export async function generateIppDealSummary(extractedData) {
  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: buildDealSummaryPrompt(),
    messages: [{ role: 'user', content: JSON.stringify(extractedData, null, 2) }],
  })

  if (!response?.content?.length) throw new Error('Claude returned an empty response')
  return safeParseJson(response.content[0].text)
}

export async function extractTenantFromLease(file) {
  console.log(`[IPP] Extracting tenant from lease: ${file.originalname}`)
  const contentBlocks = await fileToContentBlocks(file)

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: buildTenantLeaseExtractionPrompt(),
    messages: [{ role: 'user', content: contentBlocks }],
  })

  if (!response?.content?.length) throw new Error('Claude returned an empty response (model may be overloaded — retry)')
  return safeParseJson(response.content[0].text)
}
