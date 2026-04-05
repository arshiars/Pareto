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

export async function deleteUnits(ids) {
  const res = await fetch(`${BASE_URL}/comparables/units`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function enrichUnits(propertyId) {
  const res = await fetch(`${BASE_URL}/comparables/property/${propertyId}/enrich-units`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function checkDuplicateAddress(address) {
  const res = await fetch(`${BASE_URL}/comparables/check-duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ address }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function aiRankComps(subject, candidates) {
  const res = await fetch(`${BASE_URL}/comparables/ai-rank-comps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ subject, candidates }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function researchSubjectProperty(address) {
  const res = await fetch(`${BASE_URL}/comparables/research-subject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ address }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function researchMarketData(propertyId) {
  const res = await fetch(`${BASE_URL}/comparables/property/${propertyId}/research`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function translateProperty(propertyId) {
  const res = await fetch(`${BASE_URL}/comparables/property/${propertyId}/translate`, {
    method: 'POST',
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

// ─── Property Images ─────────────────────────────────────────────────────────

export async function uploadPropertyImage(propertyId, file, setAsPreview = false) {
  const presignRes = await fetch(`${BASE_URL}/comparables/property/${propertyId}/images/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ fileName: file.name, contentType: file.type }),
  })
  if (!presignRes.ok) throw new Error(await parseError(presignRes))
  const { uploadUrl, s3Key, contentType } = await presignRes.json()

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!putRes.ok) throw new Error(`S3 upload failed: HTTP ${putRes.status}`)

  const saveRes = await fetch(`${BASE_URL}/comparables/property/${propertyId}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ s3Key, filename: file.name, setAsPreview }),
  })
  if (!saveRes.ok) throw new Error(await parseError(saveRes))
  return saveRes.json()
}

export async function setPreviewImage(propertyId, imageId) {
  const res = await fetch(`${BASE_URL}/comparables/property/${propertyId}/images/${imageId}/preview`, {
    method: 'PATCH',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function deletePropertyImage(propertyId, imageId) {
  const res = await fetch(`${BASE_URL}/comparables/property/${propertyId}/images/${imageId}`, {
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

// ─── Triple-C QS Report Upload ───────────────────────────────────────────────

export async function extractTripleCFile(file) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${BASE_URL}/triple-c/extract`, {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() // { extracted, fileName }
}

export async function fetchTripleCProjects() {
  const res = await fetch(`${BASE_URL}/triple-c/projects`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const { projects } = await res.json()
  return projects
}

export async function fetchTripleCProject(id) {
  const res = await fetch(`${BASE_URL}/triple-c/projects/${id}`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() // { project, divisions, milestones }
}

export async function saveTripleCProject(payload) {
  const res = await fetch(`${BASE_URL}/triple-c/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() // { success, projectId }
}

export async function deleteTripleCProject(id) {
  const res = await fetch(`${BASE_URL}/triple-c/projects/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function updateTripleCProject(id, payload) {
  const res = await fetch(`${BASE_URL}/triple-c/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function fetchTripleCAnalytics(filters = {}) {
  const params = new URLSearchParams()
  if (filters.type) params.set('type', filters.type)
  if (filters.province) params.set('province', filters.province)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  if (filters.gfaMin) params.set('gfaMin', filters.gfaMin)
  if (filters.gfaMax) params.set('gfaMax', filters.gfaMax)
  if (filters.exclude) params.set('exclude', filters.exclude)
  const qs = params.toString()
  const res = await fetch(`${BASE_URL}/triple-c/analytics${qs ? '?' + qs : ''}`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function fetchTripleCComparison(ids) {
  const res = await fetch(`${BASE_URL}/triple-c/compare?ids=${ids.join(',')}`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function uploadTripleCFiles(files) {
  const formData = new FormData()
  files.forEach((f) => formData.append('files', f))

  const res = await fetch(`${BASE_URL}/triple-c/upload`, {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error(await parseError(res))
  const { uploads } = await res.json()
  return uploads
}

export async function fetchPipelineStatus() {
  const res = await fetch(`${BASE_URL}/pipeline/status`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}
