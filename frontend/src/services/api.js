const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api'

// Token stored in localStorage as fallback for cross-origin cookie issues
const TOKEN_KEY = 'gateway_token'

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

function authHeaders(extra = {}) {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}`, ...extra } : extra
}

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
  const res = await fetch(`${BASE_URL}/auth/check`, {
    credentials: 'include',
    headers: authHeaders(),
  })
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
  const data = await res.json()
  // Store token in localStorage so it can be sent as Authorization header
  if (data.token) localStorage.setItem(TOKEN_KEY, data.token)
  return data
}

export async function extractDocuments(files, labels = []) {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  if (labels.some(Boolean)) formData.append('labels', JSON.stringify(labels))

  const res = await fetch(`${BASE_URL}/analysis/extract`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: authHeaders(),
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
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ extractedData }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function researchField(fieldName, propertyContext) {
  const res = await fetch(`${BASE_URL}/analysis/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ fieldName, propertyContext }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function queryLoanDatabase(question) {
  const res = await fetch(`${BASE_URL}/analysis/database-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ question }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

// ─── Rent Comparables ────────────────────────────────────────────────────────

export async function fetchRentComparables() {
  const res = await fetch(`${BASE_URL}/comparables`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function fetchProperties() {
  const res = await fetch(`${BASE_URL}/comparables/properties`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function fetchPropertyDetail(propertyId) {
  const res = await fetch(`${BASE_URL}/comparables/property/${propertyId}`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function renamePropertyAddress(propertyId, address) {
  const res = await fetch(`${BASE_URL}/comparables/property/${propertyId}/address`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ address }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function updateUnit(id, fields) {
  const res = await fetch(`${BASE_URL}/comparables/unit/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function deleteProperty(propertyId) {
  const res = await fetch(`${BASE_URL}/comparables/property/${propertyId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

// ─── S3 Pipeline Upload ─────────────────────────────────────────────────────

export async function uploadFilesToS3(address, docType, files) {
  const fileList = files.map((f) => ({ fileName: f.name }))

  const presignRes = await fetch(`${BASE_URL}/pipeline/presign-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ address, docType, files: fileList }),
  })
  if (!presignRes.ok) throw new Error(await parseError(presignRes))
  const { uploads } = await presignRes.json()

  const results = []
  for (const { fileName, uploadUrl } of uploads) {
    const file = files.find((f) => f.name === fileName)
    if (!file) continue

    try {
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      })
      if (!putRes.ok) throw new Error(`S3 upload failed: HTTP ${putRes.status}`)
      results.push({ file: fileName, success: true })
    } catch (err) {
      results.push({ file: fileName, success: false, error: err.message })
    }
  }

  return results
}

export async function fetchPipelineStatus() {
  const res = await fetch(`${BASE_URL}/pipeline/status`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}
