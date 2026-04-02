import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Extract raw text from a PDF buffer using pdftotext (poppler).
 * Returns empty string (not an error) if the PDF is scanned/image-based.
 */
export function pdfToText(buffer) {
  const tmp = join(tmpdir(), `qs_${Date.now()}.pdf`)
  try {
    writeFileSync(tmp, buffer)
    return execSync(
      `pdftotext -layout "${tmp}" -`,
      {
        env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
        maxBuffer: 50 * 1024 * 1024,
      }
    ).toString()
  } finally {
    try { unlinkSync(tmp) } catch {}
  }
}

/**
 * CCS prompt — extracts project identity + top-level budget only.
 * Pass fullText for text-based PDFs; pass empty string when using vision (PDF block sent separately).
 */
export function buildCCSPrompt(fullText, fileName) {
  const content = fullText
    ? `─── REPORT TEXT ──────────────────────────────────────────────────────────────\n${fullText}\n──────────────────────────────────────────────────────────────────────────────`
    : `The QS report is attached as a PDF. Focus only on the Capital Cost Summary (CCS) section — it shows the top-level project budget. Ignore the Construction Budget & Cost Report division table.`

  return `You are extracting data from a Quantity Surveyor (QS) report prepared for a real estate lender.
Your task: extract ONLY the project identity and top-level budget from the Capital Cost Summary (CCS) section.
Do not extract division breakdowns — those are in a separate call.

Source file: ${fileName}

${content}

Return ONLY raw JSON — no markdown fences, no explanation.

{
  "project": {
    "name": "string",
    "address": "string",
    "city": "string",
    "province": "string — two-letter code e.g. 'ON'",
    "project_type": "string — one of: condo | rental | mixed-use | commercial | industrial | other",
    "gfa_sqft": number | null,
    "units": number | null,
    "storeys": number | null,
    "report_number": number | null,
    "report_date": "YYYY-MM-DD | null",
    "qs_firm": "string"
  },
  "top_level_budget": {
    "land_cost": number | null,
    "construction_cost": number | null,
    "municipal_charges": number | null,
    "soft_costs": number | null,
    "financing_cost": number | null,
    "development_contingency": number | null,
    "total_budget": number | null
  }
}

Rules:
- All monetary amounts are plain numbers, no $ or commas (e.g. 1234567).
- null if absent; 0 only if the report explicitly states zero.
- Where multiple budget columns exist (anchor, previous, current), use the most recent/current.
- report_date is the reporting period date, not the document issued date.
`
}

/**
 * CCR prompt — extracts 16 divisions, fees, and milestones only.
 * Pass fullText for text-based PDFs; pass empty string when using vision (PDF block sent separately).
 */
export function buildCCRPrompt(fullText, fileName) {
  const content = fullText
    ? `─── REPORT TEXT ──────────────────────────────────────────────────────────────\n${fullText}\n──────────────────────────────────────────────────────────────────────────────`
    : `The QS report is attached as a PDF. Focus only on the Construction Budget & Cost Report (CCR) section — it contains the 16 CSI division breakdown. Ignore the Capital Cost Summary section.`

  return `You are extracting data from a Quantity Surveyor (QS) report prepared for a real estate lender.
Your task: extract ONLY the 16 CSI construction divisions, fees, and project schedule milestones from the Construction Budget & Cost Report (CCR) section.

Source file: ${fileName}

${content}

Return ONLY raw JSON — no markdown fences, no explanation.

{
  "fees": {
    "construction_mgmt_fee": number | null,
    "construction_contingency": number | null,
    "development_mgmt_fee": number | null
  },
  "divisions": [
    {
      "division_number": number,
      "division_name": "string — short name, no 'DIVISION X -' prefix",
      "budget_amount": number,
      "line_items": [
        { "description": "string", "budget_amount": number }
      ]
    }
  ],
  "milestones": [
    {
      "milestone_name": "string",
      "previous_date": "YYYY-MM-DD | null",
      "current_date": "YYYY-MM-DD | null",
      "status": "Achieved | On Schedule | Pending | Delayed"
    }
  ]
}

Rules:
- All monetary amounts are plain numbers, no $ or commas.
- null if absent; 0 only if explicitly stated.
- Where multiple budget columns exist (anchor, previous, current), use the most recent/current.
- Extract all 16 CSI divisions: Site Overheads, Site Work, Concrete, Masonry, Metals, Carpentry,
  Thermal & Moisture Protection, Doors & Windows, Finishes, Specialties, Equipment, Furnishings,
  Special Construction, Conveying Systems, Mechanical, Electrical.
- For each division, extract every individual line item listed under it.
  If no line items are listed (only a total), return an empty line_items array.
- construction_mgmt_fee: CM/GC fee listed separately from the 16 divisions.
- construction_contingency: contingency allowance within the construction budget.
- development_mgmt_fee: developer's own management fee. null if not present.
- Milestones: convert "November 2024" → "2024-11-01".
`
}
