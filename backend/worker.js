import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { buildAppraisalPrompt, buildRentRollPrompt } from './utils/dummyExtractionPrompt.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })

const MAX_PAGES_PER_CHUNK = 20

function getS3() {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  })
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function getClaude() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 3,
    defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25,prompt-caching-2024-07-31' },
  })
}

function safeParseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  try { return JSON.parse(cleaned) } catch {}

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch {}
  }

  const jsonStart = cleaned.indexOf('{')
  if (jsonStart >= 0) {
    let attempt = cleaned.substring(jsonStart)
    attempt = attempt.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, '')
    let openBraces = 0, openBrackets = 0
    for (const ch of attempt) {
      if (ch === '{') openBraces++
      else if (ch === '}') openBraces--
      else if (ch === '[') openBrackets++
      else if (ch === ']') openBrackets--
    }
    attempt += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces))
    try { return JSON.parse(attempt) } catch {}
  }

  throw new Error(`Non-JSON response: "${cleaned.substring(0, 200)}..."`)
}

// ─── S3 helpers ──────────────────────────────────────────────────────────────

const BUCKET = () => process.env.AWS_S3_BUCKET

async function s3GetBuffer(s3, key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }))
  const chunks = []
  for await (const chunk of res.Body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function s3Put(s3, key, body, contentType = 'application/octet-stream') {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET(), Key: key, Body: body, ContentType: contentType }))
}

async function s3Delete(s3, key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }))
}

async function s3List(s3, prefix) {
  const allContents = []
  let continuationToken
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET(), Prefix: prefix, ContinuationToken: continuationToken,
    }))
    if (res.Contents) allContents.push(...res.Contents)
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)
  return allContents
}

async function s3WriteError(s3, prefix, message) {
  const timestamp = new Date().toISOString()
  const content = `[${timestamp}]\n${message}\n`
  await s3Put(s3, `${prefix}error.txt`, content, 'text/plain')
}

// ─── PDF splitting ───────────────────────────────────────────────────────────

async function splitPdf(buffer) {
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const totalPages = pdfDoc.getPageCount()
  if (totalPages <= MAX_PAGES_PER_CHUNK) return [buffer]

  const chunks = []
  for (let start = 0; start < totalPages; start += MAX_PAGES_PER_CHUNK) {
    const end = Math.min(start + MAX_PAGES_PER_CHUNK, totalPages)
    const chunk = await PDFDocument.create()
    const copiedPages = await chunk.copyPages(pdfDoc, Array.from({ length: end - start }, (_, i) => start + i))
    copiedPages.forEach((p) => chunk.addPage(p))
    chunks.push(Buffer.from(await chunk.save()))
  }
  return chunks
}

// ─── Claude extraction ───────────────────────────────────────────────────────

async function extractFromPdf(pdfBuffer, docType, partNumber, totalParts, existingData) {
  const prompt = docType === 'appraisal'
    ? buildAppraisalPrompt(partNumber, totalParts, existingData)
    : buildRentRollPrompt(partNumber, totalParts, existingData)

  const b64 = pdfBuffer.toString('base64')

  const stream = getClaude().messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 16384,
    system: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: 'Extract all available data from this document section into the schema provided.' },
      ],
    }],
  })

  const response = await stream.finalMessage()

  if (response.stop_reason === 'max_tokens') {
    console.warn('[Worker]   WARNING: Response truncated (max_tokens). Attempting partial parse.')
  }
  if (!response?.content?.length) throw new Error('Claude returned empty response')

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock) throw new Error('Claude returned no text content')
  return safeParseJson(textBlock.text)
}

// ─── Merge extracted data across parts ───────────────────────────────────────

function mergeExtracted(existing, incoming) {
  if (!existing) return incoming
  const merged = { ...existing }

  // Merge property-level fields
  if (incoming.property) {
    merged.property = merged.property ?? {}
    for (const [key, val] of Object.entries(incoming.property)) {
      if (val != null && val !== '' && (merged.property[key] == null || merged.property[key] === '')) {
        merged.property[key] = val
      }
    }
  }

  // Merge top-level fields (rent roll returns property_address at top level)
  for (const key of ['property_address', 'property_type']) {
    if (incoming[key] && !merged[key]) merged[key] = incoming[key]
  }

  // Merge units
  if (incoming.units?.length) {
    merged.units = merged.units ?? []
    for (const newUnit of incoming.units) {
      const exists = merged.units.some(
        (u) => u.unit_number && newUnit.unit_number && u.unit_number === newUnit.unit_number
      )
      if (!exists) merged.units.push(newUnit)
    }
  }

  return merged
}

// ─── Discover upload groups ──────────────────────────────────────────────────
// S3 structure: uploads/{address}/{appraisal|rentroll}/{file}.pdf

function discoverUploadGroups(objects) {
  const groups = new Map()

  for (const obj of objects) {
    if (!obj.Key.endsWith('.pdf')) continue
    // uploads/{address}/{docType}/{filename}.pdf
    const parts = obj.Key.replace(/^uploads\//, '').split('/')
    if (parts.length < 3) continue

    const address = decodeURIComponent(parts[0])
    const docType = parts[1] // 'appraisal' or 'rentroll'
    if (docType !== 'appraisal' && docType !== 'rentroll') continue

    if (!groups.has(address)) {
      groups.set(address, { address, appraisals: [], rentrolls: [] })
    }
    const group = groups.get(address)
    if (docType === 'appraisal') group.appraisals.push(obj.Key)
    else group.rentrolls.push(obj.Key)
  }

  return Array.from(groups.values())
}

// ─── Process a single PDF through splitting + extraction ─────────────────────

async function processSinglePdf(s3, pdfKey, docType, processingPrefix) {
  const fileName = pdfKey.split('/').pop()
  console.log(`[Worker]   Processing ${docType}: ${fileName}`)

  const buffer = await s3GetBuffer(s3, pdfKey)
  const chunks = await splitPdf(buffer)
  const totalParts = chunks.length

  console.log(`[Worker]     ${totalParts === 1 ? 'Single part' : `Split into ${totalParts} parts`}`)

  let extractedData = null
  for (let i = 0; i < totalParts; i++) {
    const partNum = i + 1
    console.log(`[Worker]     Sending part ${partNum}/${totalParts} to Claude...`)
    const result = await extractFromPdf(chunks[i], docType, partNum, totalParts, extractedData)
    extractedData = mergeExtracted(extractedData, result)
    console.log(`[Worker]     Part ${partNum} done. Units so far: ${extractedData?.units?.length ?? 0}`)
  }

  // Delete original from uploads/
  await s3Delete(s3, pdfKey)
  return { fileName, extractedData }
}

// ─── Database operations ─────────────────────────────────────────────────────

async function upsertProperty(supabase, address, propertyData, sourceFile) {
  // Check if property with this address already exists
  const { data: existing } = await supabase
    .from('property')
    .select('id')
    .eq('property_address', address)
    .limit(1)
    .single()

  const row = { ...propertyData, property_address: address, source_file: sourceFile }
  // Remove keys that don't belong in the property table
  delete row.units

  if (existing?.id) {
    // Update only non-null fields
    const updates = {}
    for (const [key, val] of Object.entries(row)) {
      if (val != null && val !== '') updates[key] = val
    }
    const { data, error } = await supabase
      .from('property')
      .update(updates)
      .eq('id', existing.id)
      .select('id')
      .single()
    if (error) throw new Error(`Property update failed: ${error.message}`)
    console.log(`[Worker]   Updated property ${data.id} (${address})`)
    return data.id
  } else {
    const { data, error } = await supabase
      .from('property')
      .insert(row)
      .select('id')
      .single()
    if (error) throw new Error(`Property insert failed: ${error.message}`)
    console.log(`[Worker]   Created property ${data.id} (${address})`)
    return data.id
  }
}

async function insertUnits(supabase, propertyId, units, sourceFile) {
  if (!units?.length) return 0

  // Duplicate check: skip units already in DB for this property + source file
  const { data: existingUnits } = await supabase
    .from('unit')
    .select('unit_number')
    .eq('property_id', propertyId)
    .eq('source_file', sourceFile)

  const existingSet = new Set((existingUnits ?? []).map((u) => u.unit_number))

  const rows = units
    .filter((u) => !existingSet.has(u.unit_number))
    .map((unit) => ({
      property_id: propertyId,
      unit_number: unit.unit_number ?? null,
      unit_type: unit.unit_type ?? null,
      beds: unit.beds != null ? String(unit.beds) : null,
      baths: unit.baths != null ? String(unit.baths) : null,
      sqft: unit.sqft != null ? Number(unit.sqft) || null : null,
      lease_rate: unit.lease_rate != null ? Number(unit.lease_rate) || null : null,
      move_in: unit.move_in ?? null,
      move_out: unit.move_out ?? null,
      source_file: sourceFile,
    }))

  if (rows.length === 0) {
    console.log(`[Worker]   All ${units.length} units already exist, skipping`)
    return 0
  }

  const { error } = await supabase.from('unit').insert(rows)
  if (error) throw new Error(`Unit insert failed: ${error.message}`)
  return rows.length
}

// ─── Main processing ─────────────────────────────────────────────────────────

async function processAllUploads() {
  const s3 = getS3()
  const supabase = getSupabase()

  const uploads = await s3List(s3, 'uploads/')
  const groups = discoverUploadGroups(uploads)

  if (groups.length === 0) {
    console.log('[Worker] No new uploads found')
    return
  }

  console.log(`[Worker] Found ${groups.length} property group(s) to process`)

  for (const group of groups) {
    const { address, appraisals, rentrolls } = group
    const processingPrefix = `processing/${encodeURIComponent(address)}/`

    console.log(`[Worker] ── ${address} (${appraisals.length} appraisal, ${rentrolls.length} rent roll) ──`)

    try {
      let propertyId = null

      // Phase 1: Process appraisals → upsert property
      for (const key of appraisals) {
        try {
          const { fileName, extractedData } = await processSinglePdf(s3, key, 'appraisal', processingPrefix)
          if (!extractedData) continue

          const propData = extractedData.property ?? {}
          // Use address from extraction if available, otherwise use the folder name
          const resolvedAddress = propData.property_address || address
          propertyId = await upsertProperty(supabase, resolvedAddress, propData, fileName)

          // Appraisals may also contain unit data
          if (extractedData.units?.length) {
            const inserted = await insertUnits(supabase, propertyId, extractedData.units, fileName)
            console.log(`[Worker]   Inserted ${inserted} unit(s) from appraisal`)
          }
        } catch (err) {
          console.error(`[Worker]   Appraisal error (${key}):`, err.message)
          await s3WriteError(s3, processingPrefix, `Appraisal error for ${key}: ${err.message}`)
        }
      }

      // Phase 2: Process rent rolls → insert units
      for (const key of rentrolls) {
        try {
          const { fileName, extractedData } = await processSinglePdf(s3, key, 'rentroll', processingPrefix)
          if (!extractedData) continue

          // Ensure property exists (create from rent roll if no appraisal was uploaded)
          if (!propertyId) {
            const rentRollAddress = extractedData.property_address || address
            propertyId = await upsertProperty(supabase, rentRollAddress, {
              property_address: rentRollAddress,
              property_type: extractedData.property_type ?? null,
            }, fileName)
          }

          if (extractedData.units?.length) {
            const inserted = await insertUnits(supabase, propertyId, extractedData.units, fileName)
            console.log(`[Worker]   Inserted ${inserted} unit(s) from rent roll`)
          } else {
            console.log('[Worker]   No units extracted from rent roll')
          }
        } catch (err) {
          console.error(`[Worker]   Rent roll error (${key}):`, err.message)
          await s3WriteError(s3, processingPrefix, `Rent roll error for ${key}: ${err.message}`)
        }
      }

      // Cleanup processing folder (only error.txt files may remain)
      const processingFiles = await s3List(s3, processingPrefix)
      for (const f of processingFiles) await s3Delete(s3, f.Key)
      if (processingFiles.length > 0) {
        console.log(`[Worker]   Cleaned up ${processingFiles.length} processing file(s)`)
      }

    } catch (err) {
      console.error(`[Worker] Fatal error for ${address}:`, err.message)
      await s3WriteError(s3, processingPrefix, `Fatal: ${err.message}`)
    }
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  console.log('[Worker] Starting pipeline run...')
  console.log(`[Worker] Bucket: ${BUCKET()}, Region: ${process.env.AWS_REGION}`)

  try {
    await processAllUploads()
  } catch (err) {
    console.error('[Worker] Fatal error:', err.message)
    process.exit(1)
  }

  console.log('[Worker] Pipeline run complete')
}

main()
