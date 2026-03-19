const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api'

async function parseError(res) {
  try {
    const data = await res.json()
    return data.error || `HTTP ${res.status}`
  } catch {
    const text = await res.text().catch(() => '')
    return text ? `Server error: ${text.substring(0, 200)}` : `HTTP ${res.status}`
  }
}

export async function checkAuth() {
  const res = await fetch(`${BASE_URL}/auth/check`, { credentials: 'include' })
  if (!res.ok) return false
  const data = await res.json()
  return data.authenticated
}

export async function verifyPassword(password) {
  const res = await fetch(`${BASE_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function extractDocuments(files, labels = []) {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  if (labels.some(Boolean)) formData.append('labels', JSON.stringify(labels))

  const res = await fetch(`${BASE_URL}/analysis/extract`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function extractFieldFromDocument(file, fieldDescription) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('fieldDescription', fieldDescription)

  const res = await fetch(`${BASE_URL}/analysis/extract-field`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function populateExcel(noiData) {
  const formData = new FormData()
  formData.append('noiData', JSON.stringify(noiData))

  const res = await fetch(`${BASE_URL}/analysis/populate-excel`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error(await parseError(res))

  const buffer = await res.arrayBuffer()
  let report = null
  try {
    const h = res.headers.get('X-Population-Report')
    if (h) report = JSON.parse(atob(h))
  } catch {}
  return { buffer, report }
}

export async function fetchPptSuggestions(extractedData) {
  const res = await fetch(`${BASE_URL}/analysis/ppt-suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ extractedData }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function researchField(fieldName, propertyContext) {
  const res = await fetch(`${BASE_URL}/analysis/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ fieldName, propertyContext }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function queryLoanDatabase(question) {
  const res = await fetch(`${BASE_URL}/analysis/database-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ question }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}
