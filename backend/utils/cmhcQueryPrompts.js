import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let schemaCache = null
async function getSchema() {
  if (!schemaCache) {
    schemaCache = await readFile(join(__dirname, 'cmhcDatabaseSchema.md'), 'utf-8')
  }
  return schemaCache
}

export async function buildSqlGenerationPrompt(question) {
  const schema = await getSchema()
  return `You are a SQL expert. Generate a single SQL SELECT query to answer the user's question about KingSett Capital's CMHC loan database. The SQL runs on alasql (an in-memory JavaScript SQL engine), not PostgreSQL.

${schema}

Rules:
- Output ONLY the raw SQL — no explanation, no markdown fences, no comments
- Only SELECT statements — no INSERT, UPDATE, DELETE, DROP, or DDL
- Table name is exactly: cmhc_loans
- Use exact column names from the schema
- Ratios (cap_rate, ltv_net, opex_ratio, etc.) are decimals — multiply by 100 to display as percentages
- Rents (bachelor_rent_market, bed1_rent_market, etc.) are monthly CAD — multiply by 12 for annual
- Use ROUND() for cleaner numeric output
- Use standard SQL aggregates: AVG(), SUM(), COUNT(), MIN(), MAX()
- For GROUP BY queries, only reference grouped or aggregated columns in SELECT
- Handle nulls: use IS NOT NULL filters when aggregating numeric columns
- For "top N" questions, use ORDER BY col DESC LIMIT N
- For percentage value comparisons, use decimals (cap rate > 5% → cap_rate > 0.05)
- DO NOT use PostgreSQL-specific syntax: no EXTRACT(), no TO_CHAR(), no ILIKE, no ::cast, no NULLIF(), no COALESCE()
- For date filtering use simple string comparison: funding_date >= '2022-01-01'
- For case-insensitive text matching use LIKE with uppercase: UPPER(province) LIKE 'ON'

Question: ${question}

SQL:`
}

export async function buildAnalysisPrompt(question, sql, results) {
  const { rows, rowCount } = results

  let resultText
  if (rows.length === 0) {
    resultText = 'The query returned no rows.'
  } else {
    const headers = Object.keys(rows[0]).join(' | ')
    const divider = Object.keys(rows[0]).map(() => '---').join(' | ')
    const dataRows = rows.map(r =>
      Object.values(r).map(v => (v === null ? '—' : String(v))).join(' | ')
    ).join('\n')
    resultText = `${headers}\n${divider}\n${dataRows}\n\n(${rowCount} row${rowCount !== 1 ? 's' : ''} returned)`
  }

  return `You are a senior real estate analyst at KingSett Capital. A SQL query was run against the approved CMHC loan database. Interpret the results and answer the user's question clearly and professionally.

Question: ${question}

SQL executed:
${sql}

Results:
${resultText}

Instructions:
- Lead with the direct answer to the question
- Support with specific numbers from the results
- Use **bold** for key figures
- Use bullet points or a short table for lists of loans/values
- Format currency as $X.XM (millions) or $XXX,XXX — never raw numbers like 3953774
- Display percentages as X.XX% (the DB stores them as decimals — if a result column already shows 4.50 it means 4.50%, but if it shows 0.045 multiply by 100)
- If results are empty, explain what that likely means
- Keep it concise and investment-committee ready — no filler phrases`
}
