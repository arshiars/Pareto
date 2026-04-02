const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api'

function getStoredToken() {
  return localStorage.getItem('gateway_token')
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
    return `HTTP ${res.status}`
  }
}

export async function extractLoiFields(file) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${BASE_URL}/loi/extract`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
    body: formData,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function suggestConditions(propertyDescription, existingConditions) {
  const res = await fetch(`${BASE_URL}/loi/suggest-conditions`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ propertyDescription, existingConditions }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function rephraseCondition(text) {
  const res = await fetch(`${BASE_URL}/loi/rephrase-condition`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function generateLoi(fields, disabledRows = [], conditionsPrecedent = null) {
  const res = await fetch(`${BASE_URL}/loi/generate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ fields, disabledRows, conditionsPrecedent }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.blob()
}
