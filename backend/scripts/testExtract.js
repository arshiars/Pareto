import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'
import { pdfToText, sliceQSSections, buildQSExtractionPrompt } from '../utils/qsExtract.js'
import { safeParseJson } from '../services/claude.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })

const filePath = join(__dirname, '24092 - Elevate Condos - Report No. 16 at January 31, 2026.pdf')
const buffer = readFileSync(filePath)
const fileName = '24092 - Elevate Condos - Report No. 16 at January 31, 2026.pdf'

console.log('Step 1: pdftotext...')
const fullText = pdfToText(buffer)
console.log(`  → ${fullText.split('\n').length} lines extracted`)

console.log('Step 2: slicing sections...')
const sections = sliceQSSections(fullText)
console.log(`  → projectInfo: ${sections.projectInfo.split('\n').length} lines`)
console.log(`  → budgetSummary: ${sections.budgetSummary.split('\n').length} lines`)
console.log(`  → costReport: ${sections.costReport.split('\n').length} lines`)

console.log('Step 3: Claude extraction...')
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const prompt = buildQSExtractionPrompt(sections, fileName)
console.log(`  → prompt length: ${prompt.length} chars`)

const message = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 8192,
  messages: [{ role: 'user', content: prompt }],
})

const raw = message.content[0]?.text ?? ''
const extracted = safeParseJson(raw)

console.log('\n─── RESULT ───────────────────────────────────────────')
console.log(JSON.stringify(extracted, null, 2))
console.log('\nUsage:', message.usage)
