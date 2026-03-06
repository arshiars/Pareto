export function buildExtractionPrompt() {
  return `You are a CMHC underwriting assistant. Analyze the provided property documents and extract all relevant financial and property information.

Return ONLY a valid JSON object (no markdown fences, no commentary) matching this exact schema:

{
  "propertyInfo": {
    "address": string | null,
    "propertyType": string | null,
    "totalUnits": number | null,
    "totalAppliances": number | null,
    "appliancesNote": string | null,
    "source": string
  },
  "unitBreakdown": [
    {
      "type": string,
      "count": number,
      "avgSqft": number | null,
      "avgMonthlyRent": number | null,
      "source": string
    }
  ],
  "additionalIncome": {
    "parking":  { "found": boolean, "monthlyTotal": number | null, "source": string },
    "storage":  { "found": boolean, "monthlyTotal": number | null, "source": string },
    "laundry":  { "found": boolean, "monthlyTotal": number | null, "source": string },
    "other":    { "found": boolean, "monthlyTotal": number | null, "description": string | null, "source": string }
  },
  "operatingExpenses": {
    "propertyTaxes":         { "found": boolean, "annualAmount": number | null, "source": string },
    "insurance":             { "found": boolean, "annualAmount": number | null, "source": string },
    "utilities":             { "found": boolean, "annualAmount": number | null, "source": string },
    "repairsAndMaintenance": { "found": boolean, "annualAmount": number | null, "source": string },
    "payrollAndAdmin":       { "found": boolean, "annualAmount": number | null, "source": string }
  },
  "analysis": {
    "purchasePrice": string | null,
    "keyInfo": [string],
    "risks": [string]
  }
}

Rules:
- Extract exact numbers from documents; do not estimate
- Set "found": true only when the value is explicitly stated in the documents
- "source" should briefly describe where you found the value (e.g., "Rent Roll - Page 1", "Not found in documents")
- For unitBreakdown, list each unit type separately (e.g., "1BR", "2BR", "Bachelor")
- Monthly rent should be per-unit average; all dollar amounts as plain numbers (no $ or commas)
- If totalAppliances is not stated, estimate from unit count and note in appliancesNote
- analysis.purchasePrice: formatted string if found (e.g., "$2,500,000"), otherwise null
- analysis.keyInfo: 3–6 concise bullet strings about the property (type, age, location, occupancy, renovations)
- analysis.risks: 2–5 concise bullet strings identifying underwriting risks (below-market rents, vacancy, deferred maintenance, etc.); empty array if none found`
}

export function buildResearchPrompt(fieldName, propertyContext) {
  return `You are a CMHC underwriting expert. A property document is missing the value for "${fieldName}".

Property context:
${JSON.stringify(propertyContext, null, 2)}

Based on industry standards, CMHC guidelines, and typical values for similar Canadian multi-residential properties, provide a reasonable estimate for "${fieldName}".

Return ONLY a valid JSON object (no markdown fences):
{
  "estimatedValue": number,
  "reasoning": string,
  "source": string
}

- estimatedValue: the annual dollar amount (for expenses) or monthly total (for income items)
- reasoning: brief explanation of how you arrived at this estimate
- source: "AI Estimate — Industry Standards" or similar`
}

export function buildFieldExtractionPrompt(fieldDescription) {
  return `You are a meticulous CMHC underwriting analyst extracting a specific financial figure from a property document.

Target field: ${fieldDescription}

EXTRACTION RULES — follow every one:

1. ALWAYS use the grand total / total due / total payable figure if one exists on the document. Do NOT manually sum line items if a final total is already printed — it will include taxes and fees you might otherwise miss.

2. Include EVERY component in the total:
   - Provincial taxes (Ontario RST/PST 8%, Quebec, etc.)
   - HST / GST
   - Premium surcharges, service fees, admin fees
   - Any line item that is part of the final amount owed
   Never report a subtotal when a higher all-in total is present on the same document.

3. If no single grand total exists, sum ALL line items visible in the document — premiums + taxes + fees + surcharges — and report the sum.

4. Convert to annual CAD: if the document shows a monthly, quarterly, or semi-annual figure, multiply to annual. State the conversion in the source field.

5. Return ONLY valid JSON, no prose, no markdown:
{ "value": number, "source": "concise description, e.g. Invoice #271256 — Total Due including Ontario RST" }

If the value truly cannot be found: { "value": null, "source": "Not found" }
Plain number only — no $ signs, no commas.`
}
