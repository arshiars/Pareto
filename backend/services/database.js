import { createClient } from '@supabase/supabase-js'
import alasql from 'alasql'

let supabase = null
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  }
  return supabase
}

// In-memory cache — loans fetched once and reused for subsequent queries
let cachedLoans = null
let cacheTime = null
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function getLoans() {
  const now = Date.now()
  if (cachedLoans && cacheTime && (now - cacheTime) < CACHE_TTL_MS) {
    return cachedLoans
  }

  console.log('[DB] Fetching loans from Supabase...')
  const { data, error } = await getSupabase()
    .from('cmhc_loans')
    .select('*')
    .order('funding_date', { ascending: false })

  if (error) throw new Error(`Failed to fetch loans: ${error.message}`)

  cachedLoans = data
  cacheTime = now
  console.log(`[DB] Cached ${data.length} loans`)
  return data
}

// Sanitize SQL: only allow SELECT statements — enforced server-side regardless of what the model generates
function assertSafeQuery(sql) {
  const lower = sql.toLowerCase().trim()
  if (!lower.startsWith('select')) {
    throw new Error('Only SELECT statements are permitted')
  }
  const blocked = [
    'insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate',
    'grant', 'revoke', 'execute', 'exec', 'call', 'merge', 'replace',
    'into', 'set', 'attach', 'detach', 'load',
  ]
  for (const kw of blocked) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(sql)) {
      throw new Error(`Blocked keyword in query: ${kw}`)
    }
  }
}

export async function runQuery(sql) {
  assertSafeQuery(sql)

  const loans = await getLoans()

  // Register loans as a named in-memory table so SQL can reference `cmhc_loans`
  alasql('CREATE TABLE IF NOT EXISTS cmhc_loans')
  alasql.tables.cmhc_loans.data = loans

  const cleanSql = sql.trim().replace(/;?\s*$/, '')
  console.log(`[DB] Running in-memory SQL: ${cleanSql.substring(0, 200)}`)

  const rows = alasql(cleanSql)

  const rowCount = Array.isArray(rows) ? rows.length : 0
  const fields = rowCount > 0 ? Object.keys(rows[0]) : []

  return { rows: Array.isArray(rows) ? rows : [], rowCount, fields }
}

// Expose for cache invalidation after a fresh import
export function invalidateCache() {
  cachedLoans = null
  cacheTime = null
}
