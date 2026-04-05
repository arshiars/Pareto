export function buildIppExtractionPrompt() {
  return `You are a commercial real estate underwriting analyst. You will be given one or more documents related to an Income Producing Property (IPP) — which may include a Broker CIM, Rent Roll, Operating Statements, and Bills (tax, insurance, utilities, etc.).

Your task is to extract structured data and return a single valid JSON object. Do NOT wrap the JSON in markdown code fences. Do NOT include any explanation or prose — only the JSON object.

IMPORTANT: Every leaf field must be an object with three keys:
  "value": the extracted value, or null if not found
  "source": a short string describing where you found it (e.g., "Broker CIM", "Rent Roll, p.4", "Operating Statement", "Tax Bill"), or null if not found
  "confidence": "high", "medium", or "low" — your confidence that the extracted value is correct:
    - "high": value is clearly stated in the document, unambiguous, and directly readable
    - "medium": value required interpretation, calculation, or was partially obscured/ambiguous
    - "low": value is estimated, inferred from context, or the document quality made it hard to read
    - null if value is null

For monetary amounts, "value" must be a number with no $ signs or commas.
For percentages, "value" must be a decimal (e.g., 0.05 for 5%).
For dates, "value" must be a string (YYYY-MM-DD preferred; use whatever form is in the document).
For text fields (address, vacant, renewalOption, rentSteps), "value" is a string.
For numeric fields (stories, buildings, parking, siteArea, yearBuilt), "value" is a number.
All dollar amounts are annual unless obviously monthly — if monthly, convert to annual by multiplying by 12.

Return exactly this JSON structure:

{
  "propertyInfo": {
    "address":   { "value": null, "source": null, "confidence": null },
    "siteArea":  { "value": null, "source": null, "confidence": null },
    "yearBuilt": { "value": null, "source": null, "confidence": null },
    "stories":   { "value": null, "source": null, "confidence": null },
    "buildings": { "value": null, "source": null, "confidence": null },
    "parking":   { "value": null, "source": null, "confidence": null },
    "vacant":    { "value": null, "source": null, "confidence": null }
  },
  "income": {
    "otherMiscRent": {
      "parkingRent":  { "value": null, "source": null, "confidence": null },
      "storageRent":  { "value": null, "source": null, "confidence": null },
      "other":        { "value": null, "source": null, "confidence": null },
      "annualTotal":  { "value": null, "source": null, "confidence": null }
    },
    "recoverableRent": {
      "propertyTax": { "value": null, "source": null, "confidence": null },
      "utilities":   { "value": null, "source": null, "confidence": null },
      "allOther":    { "value": null, "source": null, "confidence": null }
    },
    "vacancyAllowancePct": { "value": null, "source": null, "confidence": null }
  },
  "expenses": {
    "propertyTaxes":             { "value": null, "source": null, "confidence": null },
    "utilities":                 { "value": null, "source": null, "confidence": null },
    "otherRecoverableExpenses":  { "value": null, "source": null, "confidence": null },
    "managementFee":             { "value": null, "source": null, "confidence": null },
    "structuralReserve":         { "value": null, "source": null, "confidence": null }
  },
  "capRate": { "value": null, "source": null, "confidence": null },
  "deductions": {
    "tenantInducements": { "value": null, "source": null, "confidence": null },
    "lcs":               { "value": null, "source": null, "confidence": null },
    "noiLoss":           { "value": null, "source": null, "confidence": null },
    "requiredCapEx":     { "value": null, "source": null, "confidence": null }
  },
  "acquisition": {
    "purchasePrice":           { "value": null, "source": null, "confidence": null },
    "landCost":                { "value": null, "source": null, "confidence": null },
    "appraisalSurplus":        { "value": null, "source": null, "confidence": null },
    "landValue":               { "value": null, "source": null, "confidence": null },
    "dcsAndLevies":            { "value": null, "source": null, "confidence": null },
    "hardCosts":               { "value": null, "source": null, "confidence": null },
    "contingency":             { "value": null, "source": null, "confidence": null },
    "softCosts":               { "value": null, "source": null, "confidence": null },
    "devManagementFee":        { "value": null, "source": null, "confidence": null },
    "financingCosts":          { "value": null, "source": null, "confidence": null },
    "totalBudget":             { "value": null, "source": null, "confidence": null },
    "totalKingsettExposure":   { "value": null, "source": null, "confidence": null },
    "subDebtAmount":           { "value": null, "source": null, "confidence": null }
  },
  "usesOfFunds": {
    "payoutExistingDebt": { "value": null, "source": null, "confidence": null },
    "purchasePrice":      { "value": null, "source": null, "confidence": null },
    "closingCosts":       { "value": null, "source": null, "confidence": null },
    "equityTakeout":      { "value": null, "source": null, "confidence": null }
  },
  "tenants": []
}

For each occupied tenant AND each vacant unit found in a rent roll or lease schedule, append an object to "tenants":
{
  "tenant":        { "value": null, "source": null, "confidence": null },
  "area":          { "value": null, "source": null, "confidence": null },
  "rate":          { "value": null, "source": null, "confidence": null },
  "annualRent":    { "value": null, "source": null, "confidence": null },
  "leaseStart":    { "value": null, "source": null, "confidence": null },
  "leaseEnd":      { "value": null, "source": null, "confidence": null },
  "renewalOption": { "value": null, "source": null, "confidence": null },
  "rentSteps":     { "value": null, "source": null, "confidence": null },
  "tiAmount":      { "value": null, "source": null, "confidence": null },
  "lcAmount":      { "value": null, "source": null, "confidence": null }
}

Additional rules:
- "area" value is in square feet (number)
- "rate" value is annual rent per square foot (number)
- "annualRent" value is the total annual base rent in dollars (number); if only monthly rent is given, multiply by 12
- "rentSteps" value is a string describing rent escalations/steps, e.g. "3% annual CPI" or "Year 3: $26 psf, Year 6: $28 psf"
- "tiAmount" value is tenant improvement allowance in dollars (number)
- "lcAmount" value is leasing commission in dollars (number)
- "siteArea" value is the site/lot area in acres (number)
- "yearBuilt" value is the 4-digit construction year (number)
- "stories" value is the number of storeys (number)
- "buildings" value is the number of buildings on site (number)
- "parking" value is the total number of parking stalls (number)
- "contingency" value is the contingency dollar amount (number, not a percentage)
- "devManagementFee" value is the development management fee dollar amount (number, not a percentage)
- If a document label hint is provided (e.g., "Broker CIM", "Rent Roll"), use it as the source string for fields you extract from that document
- CRITICAL: Extract ALL rows including vacant units. Vacant units may appear under section headers like "Vacant", "Vacant Retail Units", "Available", or similar. For vacant rows, use the unit identifier (e.g. "Unit 101 — Vacant") or "Vacant" as the tenant name, set annualRent to 0 (or the broker's assumed rent if stated), and extract the area. Vacant units are essential for calculating total building square footage.
- Extract all tenants you can find, even if only partial information is available
- Be concise with source strings: "Broker CIM", "Rent Roll", "Operating Statement", "Tax Bill", "Insurance Bill", "Utility Bill" are preferred`
}

export function buildRentRollExtractionPrompt() {
  return `You are a commercial real estate analyst. Extract the complete tenant schedule from this document and return a single valid JSON object only — no markdown, no prose.

Every leaf field uses { "value": ..., "source": "Rent Roll" } structure. Return null value for anything not found.

Return exactly this structure:
{
  "tenants": [
    {
      "tenant":        { "value": null, "source": null, "confidence": null },
      "area":          { "value": null, "source": null, "confidence": null },
      "rate":          { "value": null, "source": null, "confidence": null },
      "annualRent":    { "value": null, "source": null, "confidence": null },
      "leaseStart":    { "value": null, "source": null, "confidence": null },
      "leaseEnd":      { "value": null, "source": null, "confidence": null },
      "renewalOption": { "value": null, "source": null, "confidence": null },
      "rentSteps":     { "value": null, "source": null, "confidence": null },
      "tiAmount":      { "value": null, "source": null, "confidence": null },
      "lcAmount":      { "value": null, "source": null, "confidence": null }
    }
  ]
}

Rules:
- Extract every row including vacant units — do NOT skip rows just because rent is $0 or the unit is unoccupied
- Vacant units may appear under section headers like "Vacant", "Vacant Retail Units", "Available", or similar. Include each one as a separate entry. Use the unit identifier (e.g. "Unit 101 — Vacant") or "Vacant" as the tenant name; set annualRent to 0 unless the document states an assumed rent
- area: rentable square feet (number)
- rate: annual rent per square foot (number)
- annualRent: total annual base rent in dollars (number); if only monthly stated, multiply by 12; 0 for vacant units unless a broker assumption is stated
- leaseStart / leaseEnd: date strings, YYYY-MM-DD preferred; null for vacant units
- renewalOption: string, e.g. "2 x 5 years at FMR", or null
- rentSteps: string describing escalations, or null
- tiAmount: tenant improvement allowance in dollars (number), or null
- lcAmount: leasing commission in dollars (number), or null
- All monetary values are plain numbers — no $, no commas
- Use "Rent Roll" as the source string for every found field`
}

export function buildExpenseFieldExtractionPrompt(fieldDescription) {
  return `You are a commercial real estate analyst. Extract the following value from this document:

"${fieldDescription}"

Return a single valid JSON object only — no markdown, no prose:
{ "value": null, "source": null, "confidence": null }

Rules:
- value must be an annual dollar amount (number, no $ or commas)
- If the document shows a monthly amount, multiply by 12 to convert to annual
- source should briefly describe where you found it, e.g. "Tax Assessment 2024, p.2" or "Utility Bill"
- Return null for value if the amount cannot be found in the document`
}

export function buildTenantLeaseExtractionPrompt() {
  return `You are a commercial real estate analyst. Extract tenant lease data from the provided document and return a single valid JSON object only — no markdown, no prose.

Every field uses { "value": ..., "source": "Lease" } structure. Return null value (not omit the key) for anything not found.

Return exactly this structure:
{
  "tenant":        { "value": null, "source": null, "confidence": null },
  "area":          { "value": null, "source": null, "confidence": null },
  "rate":          { "value": null, "source": null, "confidence": null },
  "annualRent":    { "value": null, "source": null, "confidence": null },
  "leaseStart":    { "value": null, "source": null, "confidence": null },
  "leaseEnd":      { "value": null, "source": null, "confidence": null },
  "renewalOption": { "value": null, "source": null, "confidence": null },
  "rentSteps":     { "value": null, "source": null, "confidence": null },
  "tiAmount":      { "value": null, "source": null, "confidence": null },
  "lcAmount":      { "value": null, "source": null, "confidence": null },
  "notes":         { "value": null, "source": null, "confidence": null }
}

Rules:
- area: rentable square feet (number)
- rate: annual rent per square foot (number)
- annualRent: total annual base rent in dollars (number); if only monthly stated, multiply by 12
- leaseStart / leaseEnd: date strings, YYYY-MM-DD preferred
- renewalOption: string, e.g. "2 x 5 years at FMR", or null
- rentSteps: string describing escalations, e.g. "3% annual CPI increase" or "Year 3: $26 psf, Year 6: $28 psf", or null
- tiAmount: tenant improvement allowance in dollars (number), or null
- lcAmount: leasing commission in dollars (number), or null
- notes: a concise plain-text summary of ALL material lease provisions that affect deal risk or value. MUST include (if present): rent step-up schedule with specific amounts/dates, TI allowance context (e.g. paid over what period), leasing commission structure, co-tenancy clauses, early termination or kick-out rights, ROFR/ROFO provisions, assignment/subletting restrictions, personal guarantees, gross vs. net lease structure, any unusual or landlord-unfriendly clauses. Write in point-form sentences. If nothing material beyond standard terms, return null.
- All monetary values are plain numbers — no $, no commas
- Use "Lease" as the source string for every field that was found`
}

export function buildExcelCommentPrompt(fields) {
  return `You are a commercial real estate underwriting analyst at KingSett Capital populating an IPP underwriting Excel model.

For each field below, write a comment to place beside that cell in the spreadsheet. Each comment must be 1–2 sentences maximum and must cover one or more of:
- The document source the value came from (name it specifically)
- Any assumption or conversion applied (e.g. monthly → annual, estimated from psf)
- A reliability caveat or risk flag (e.g. stale figures, single-source, estimated)
- If null/not found: state it was not found in uploaded documents and must be entered manually
- If user-overridden: note it was manually entered by the user; reference the original extracted source if available

Style: direct, professional, deal-memo tone. No filler. Max 2 sentences.

Return ONLY a single valid JSON object — no markdown, no prose — mapping each field's "row" string key to a comment string:
{ "3": "Extracted from Broker CIM; verify address matches the legal description on title.", "20": "...", ... }

Fields:
${JSON.stringify(fields, null, 2)}`
}

export function buildDealSummaryPrompt() {
  return `You are a senior commercial real estate underwriting analyst at KingSett Capital. You will be given extracted data from an Income Producing Property (IPP) underwriting package as JSON.

Analyze the data and return a single valid JSON object only — no markdown, no prose.

Return exactly this structure:
{
  "overview": "string — 2-3 sentence deal overview: property type, location, tenancy, and headline NOI/value metrics",
  "keyMetrics": [
    "string — each bullet is one concise metric or observation (e.g. cap rate, occupancy, WALT, coverage ratios)"
  ],
  "keyRisks": [
    "string — each bullet is one specific, actionable risk that could affect underwriting, value, or repayment"
  ]
}

Rules:
- overview: factual, no fluff. Mention property address, dominant tenants, lease term, and NOI if available.
- keyMetrics: 4-8 bullets. Include: cap rate, implied value vs purchase price, total GLA, occupancy rate, weighted average lease term (WALT) if calculable, total TI/LC exposure, vacancy allowance.
- keyRisks: 4-8 bullets ranked by severity. Consider: lease rollover / near-term expiries, tenant credit quality, co-tenancy or termination clauses, above/below market rents, TI/LC cost vs. NOI, single-tenant concentration, market vacancy, cap rate sensitivity, structural reserve adequacy.
- If data is missing or null, omit that metric/risk rather than speculating.
- Write in the style of a deal memo — direct, precise, no padding.`
}
