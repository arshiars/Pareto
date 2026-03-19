import Anthropic from '@anthropic-ai/sdk'
import { PDFDocument } from 'pdf-lib'
import { buildExtractionPrompt, buildResearchPrompt, buildFieldExtractionPrompt, buildPptSuggestionsPrompt } from '../utils/extractionPrompt.js'
import { buildSqlGenerationPrompt, buildAnalysisPrompt } from '../utils/cmhcQueryPrompts.js'

const MAX_PDF_PAGES = 100

function getClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 3,
    defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25,prompt-caching-2024-07-31' },
  })
}

function stripCodeFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

export function safeParseJson(text) {
  const cleaned = stripCodeFences(text)
  try {
    return JSON.parse(cleaned)
  } catch {
    // Claude sometimes wraps JSON in prose — extract the first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) } catch {}
    }
    throw new Error(`Claude returned non-JSON response: "${cleaned.substring(0, 120)}..."`)
  }
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

// ─── Merge helpers ────────────────────────────────────────────────────────────

function mergePropertyInfo(infos) {
  const out = {
    address: null, propertyType: null, totalUnits: null, totalAppliances: null,
    appliancesNote: null, region: null, housingType: null,
    frameConstruction: null, vintage: null, vacancyRate: null, source: '',
  }
  for (const info of infos) {
    if (!info) continue
    for (const key of Object.keys(out)) {
      if (out[key] == null && info[key] != null) out[key] = info[key]
    }
  }
  return out
}

function mergeUnitBreakdown(breakdowns) {
  const byType = new Map()
  for (const bd of breakdowns) {
    if (!Array.isArray(bd)) continue
    for (const unit of bd) {
      const existing = byType.get(unit.type)
      if (!existing || (unit.avgMonthlyRent != null && existing.avgMonthlyRent == null)) {
        byType.set(unit.type, unit)
      }
    }
  }
  return Array.from(byType.values())
}

function mergeFoundField(candidates) {
  return candidates.find((c) => c?.found === true) ?? candidates.find(Boolean) ?? { found: false, source: 'Not found in documents' }
}

function mergeAdditionalIncome(incomes) {
  return Object.fromEntries(
    ['parking', 'storage', 'laundry', 'other'].map((k) => [k, mergeFoundField(incomes.map((i) => i?.[k]))])
  )
}

function mergeOperatingExpenses(expenses) {
  return Object.fromEntries(
    ['propertyTaxes', 'insurance', 'utilities', 'repairsAndMaintenance', 'payrollAndAdmin'].map((k) => [
      k,
      mergeFoundField(expenses.map((e) => e?.[k])),
    ])
  )
}

function mergeAnalysis(analyses) {
  return {
    purchasePrice: analyses.map((a) => a?.purchasePrice).find(Boolean) ?? null,
    capRate: analyses.map((a) => a?.capRate).find((v) => v != null) ?? null,
    keyInfo: [...new Set(analyses.flatMap((a) => a?.keyInfo ?? []))],
    risks: [...new Set(analyses.flatMap((a) => a?.risks ?? []))],
  }
}

function mergeExtractions(results) {
  if (results.length === 1) return results[0]
  return {
    propertyInfo: mergePropertyInfo(results.map((r) => r.propertyInfo)),
    unitDetails: results.flatMap((r) => r.unitDetails ?? []),
    unitBreakdown: mergeUnitBreakdown(results.map((r) => r.unitBreakdown)),
    additionalIncome: mergeAdditionalIncome(results.map((r) => r.additionalIncome)),
    operatingExpenses: mergeOperatingExpenses(results.map((r) => r.operatingExpenses)),
    analysis: mergeAnalysis(results.map((r) => r.analysis)),
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function extractFromDocuments(files, labels = []) {
  const results = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const label = labels[i] || null
    console.log(`[${i + 1}/${files.length}] Processing: ${file.originalname} (${file.mimetype})${label ? ` [${label}]` : ''}`)

    const contentBlocks = await fileToContentBlocks(file)
    if (label) {
      contentBlocks.unshift({ type: 'text', text: `Document type: "${label}". Use this context to focus your extraction accordingly.` })
    }
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: buildExtractionPrompt(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: contentBlocks }],
    })

    if (!response?.content?.length) throw new Error('Claude returned an empty response (model may be overloaded — retry)')
    const raw = response.content[0].text
    results.push(safeParseJson(raw))
  }

  return mergeExtractions(results)
}

export async function extractField(file, fieldDescription) {
  const contentBlocks = await fileToContentBlocks(file)
  contentBlocks.push({ type: 'text', text: buildFieldExtractionPrompt(fieldDescription) })

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: contentBlocks }],
  })

  if (!response?.content?.length) throw new Error('Claude returned an empty response (model may be overloaded — retry)')
  return safeParseJson(response.content[0].text)
}

export async function generatePptSuggestions(extractedData) {
  const response = await getClient().messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildPptSuggestionsPrompt(extractedData) }],
  })

  if (!response?.content?.length) throw new Error('Claude returned an empty response (model may be overloaded — retry)')
  return safeParseJson(response.content[0].text)
}

export async function researchField(fieldName, propertyContext) {
  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildResearchPrompt(fieldName, propertyContext) }],
  })

  if (!response?.content?.length) throw new Error('Claude returned an empty response (model may be overloaded — retry)')
  return safeParseJson(response.content[0].text)
}

// ── Step 1: Haiku generates SQL from the question ────────────────────────────
export async function generateSqlQuery(question) {
  const prompt = await buildSqlGenerationPrompt(question)
  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })
  if (!response?.content?.length) throw new Error('No response from SQL generation model')
  let sql = response.content[0].text.trim()
  // Strip any markdown fences the model might add despite instructions
  sql = sql.replace(/^```sql\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  return sql
}

// ── Step 2: Sonnet analyzes the query results and answers ─────────────────────
export async function analyzeQueryResults(question, sql, results) {
  const prompt = await buildAnalysisPrompt(question, sql, results)
  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })
  if (!response?.content?.length) throw new Error('No response from analysis model')
  return response.content[0].text
}

