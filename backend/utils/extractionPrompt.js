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
    "region": string | null,
    "housingType": string | null,
    "frameConstruction": string | null,
    "vintage": string | null,
    "vacancyRate": number | null,
    "source": string
  },
  "unitDetails": [
    {
      "unitNumber": string | null,
      "unitType": "Bachelor" | "1 Bedroom" | "2 Bedrooms" | "3 Bedrooms" | "4+ Bedrooms",
      "monthlyRent": number | null,
      "sqft": number | null,
      "vacant": boolean,
      "marketUnit": boolean
    }
  ],
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
    "parking": {
      "found": boolean,
      "ugStallsTotal": number | null,
      "ugStallsOccupied": number | null,
      "ugMonthlyRate": number | null,
      "exStallsTotal": number | null,
      "exStallsOccupied": number | null,
      "exMonthlyRate": number | null,
      "monthlyTotal": number | null,
      "source": string
    },
    "storage": {
      "found": boolean,
      "unitsTotal": number | null,
      "unitsOccupied": number | null,
      "monthlyRate": number | null,
      "monthlyTotal": number | null,
      "source": string
    },
    "laundry": { "found": boolean, "monthlyTotal": number | null, "source": string },
    "other":   { "found": boolean, "monthlyTotal": number | null, "description": string | null, "source": string }
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
- Extract exact numbers; do not estimate unless instructed
- Set "found": true only when the value is explicitly stated in the documents
- "source" should briefly describe where you found the value (e.g., "Rent Roll p.1", "Not found in documents")
- All dollar amounts as plain numbers (no $ or commas)

unitDetails rules:
- Extract EVERY individual unit from the rent roll — one object per unit
- unitType must be exactly one of the five allowed strings; map "1BR"→"1 Bedroom", "2BR"→"2 Bedrooms", "3BR"→"3 Bedrooms", "Studio"→"Bachelor", "4BR"/"4+"→"4+ Bedrooms"
- vacant: true if unit is marked vacant/empty, false if occupied
- marketUnit: false if the unit is affordable / subsidized / below-market-rent; true for all regular market-rate units; default true when not indicated
- If documents list only a summary (no individual units), return []

propertyInfo rules:
- region: province or city-region (e.g. "Ontario", "BC Lower Mainland", "Alberta") — null if not determinable
- housingType: "Standard Rental Housing", "Student", "Retirement", or "SRO" — infer from context if clear, else null
- frameConstruction: "Wood Frame", "Concrete", "Masonry", "Steel", or "Mixed" — from documents if stated, else null
- vintage: decade the building was built (e.g. "1970s", "1990s", "2010s") — from documents if stated, else null
- vacancyRate: if unitDetails are available, compute as (count of units where vacant=true) / (total unit count) expressed as decimal (e.g. 0.04 for 4%); also accept if a vacancy rate is explicitly stated in the document; null if neither is available
- If totalAppliances is not stated, estimate from unit count and note in appliancesNote

parking rules:
- Distinguish UG (underground) from EX (exterior/surface) if the documents do so
- ugMonthlyRate / exMonthlyRate are per-stall monthly amounts
- monthlyTotal is combined total monthly parking income
- If only a combined total is available, set ugStallsTotal/exStallsTotal/rates to null and populate monthlyTotal only

storage rules:
- monthlyRate is per-unit monthly amount; monthlyTotal is total monthly storage income

Operating expenses:
- annualAmount: annual CAD; if monthly is given multiply by 12
- For property taxes: use the grand total / total due (includes all levies and surcharges)
- For insurance: use the total premium including all taxes and fees

analysis.purchasePrice: formatted string if found (e.g. "$2,500,000"), else null
analysis.keyInfo: 3–6 concise bullet strings about the property
analysis.risks: 2–5 concise bullet strings identifying underwriting risks; empty array if none found`
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
