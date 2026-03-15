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

export async function extractRentRollDocument(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BASE_URL}/ipp/extract-rent-roll`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() // { tenants: [...] }
}

export async function extractExpenseField(file, fieldDescription) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('fieldDescription', fieldDescription)
  const res = await fetch(`${BASE_URL}/ipp/extract-expense-field`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() // { value, source }
}

export async function extractTenantLease(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BASE_URL}/ipp/extract-tenant-lease`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function exportIppExcel(extractedData, userOverrides) {
  const res = await fetch(`${BASE_URL}/ipp/export-excel`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extractedData, userOverrides }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.blob()
}

export async function generateDealSummary(extractedData) {
  const res = await fetch(`${BASE_URL}/ipp/deal-summary`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(extractedData),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() // { overview, keyMetrics, keyRisks }
}

export async function extractIppDocuments(files, labels = []) {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  if (labels.some(Boolean)) formData.append('labels', JSON.stringify(labels))

  const res = await fetch(`${BASE_URL}/ipp/extract`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}
