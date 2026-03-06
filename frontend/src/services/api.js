const BASE_URL = 'http://localhost:3001/api'

async function parseError(res) {
  try {
    const data = await res.json()
    return data.error || `HTTP ${res.status}`
  } catch {
    const text = await res.text().catch(() => '')
    return text ? `Server error: ${text.substring(0, 200)}` : `HTTP ${res.status}`
  }
}

export async function extractDocuments(files) {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))

  const res = await fetch(`${BASE_URL}/analysis/extract`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function extractFieldFromDocument(file, fieldDescription) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('fieldDescription', fieldDescription)

  const res = await fetch(`${BASE_URL}/analysis/extract-field`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function researchField(fieldName, propertyContext) {
  const res = await fetch(`${BASE_URL}/analysis/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fieldName, propertyContext }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}
