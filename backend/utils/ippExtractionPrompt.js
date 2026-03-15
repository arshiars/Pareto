export function buildIppExtractionPrompt() {
  return `You are a commercial real estate underwriting analyst. You will be given one or more documents related to an Income Producing Property (IPP) — which may include a Broker CIM, Rent Roll, Operating Statements, and Bills (tax, insurance, utilities, etc.).

Your task is to extract structured data and return a single valid JSON object. Do NOT wrap the JSON in markdown code fences. Do NOT include any explanation or prose — only the JSON object.

IMPORTANT: Every leaf field must be an object with two keys:
  "value": the extracted value, or null if not found
  "source": a short string describing where you found it (e.g., "Broker CIM", "Rent Roll, p.4", "Operating Statement", "Tax Bill"), or null if not found

For monetary amounts, "value" must be a number with no $ signs or commas.
For percentages, "value" must be a decimal (e.g., 0.05 for 5%).
For dates, "value" must be a string (YYYY-MM-DD preferred; use whatever form is in the document).
For text fields (address, vacant, renewalOption, rentSteps), "value" is a string.
For numeric fields (stories, buildings, parking, siteArea, yearBuilt), "value" is a number.
All dollar amounts are annual unless obviously monthly — if monthly, convert to annual by multiplying by 12.

Return exactly this JSON structure:

{
  "propertyInfo": {
    "address":   { "value": null, "source": null },
    "siteArea":  { "value": null, "source": null },
    "yearBuilt": { "value": null, "source": null },
    "stories":   { "value": null, "source": null },
    "buildings": { "value": null, "source": null },
    "parking":   { "value": null, "source": null },
    "vacant":    { "value": null, "source": null }
  },
  "income": {
    "otherMiscRent": {
      "parkingRent":  { "value": null, "source": null },
      "storageRent":  { "value": null, "source": null },
      "other":        { "value": null, "source": null },
      "annualTotal":  { "value": null, "source": null }
    },
    "recoverableRent": {
      "propertyTax": { "value": null, "source": null },
      "utilities":   { "value": null, "source": null },
      "allOther":    { "value": null, "source": null }
    },
    "vacancyAllowancePct": { "value": null, "source": null }
  },
  "expenses": {
    "propertyTaxes":             { "value": null, "source": null },
    "utilities":                 { "value": null, "source": null },
    "otherRecoverableExpenses":  { "value": null, "source": null },
    "managementFee":             { "value": null, "source": null },
    "structuralReserve":         { "value": null, "source": null }
  },
  "capRate": { "value": null, "source": null },
  "deductions": {
    "tenantInducements": { "value": null, "source": null },
    "lcs":               { "value": null, "source": null },
    "noiLoss":           { "value": null, "source": null },
    "requiredCapEx":     { "value": null, "source": null }
  },
  "acquisition": {
    "purchasePrice":           { "value": null, "source": null },
    "landCost":                { "value": null, "source": null },
    "appraisalSurplus":        { "value": null, "source": null },
    "landValue":               { "value": null, "source": null },
    "dcsAndLevies":            { "value": null, "source": null },
    "hardCosts":               { "value": null, "source": null },
    "contingency":             { "value": null, "source": null },
    "softCosts":               { "value": null, "source": null },
    "devManagementFee":        { "value": null, "source": null },
    "financingCosts":          { "value": null, "source": null },
    "totalBudget":             { "value": null, "source": null },
    "totalKingsettExposure":   { "value": null, "source": null },
    "subDebtAmount":           { "value": null, "source": null }
  },
  "usesOfFunds": {
    "payoutExistingDebt": { "value": null, "source": null },
    "purchasePrice":      { "value": null, "source": null },
    "closingCosts":       { "value": null, "source": null },
    "equityTakeout":      { "value": null, "source": null }
  },
  "tenants": []
}

For each tenant found in a rent roll or lease schedule, append an object to "tenants":
{
  "tenant":        { "value": null, "source": null },
  "area":          { "value": null, "source": null },
  "rate":          { "value": null, "source": null },
  "annualRent":    { "value": null, "source": null },
  "leaseStart":    { "value": null, "source": null },
  "leaseEnd":      { "value": null, "source": null },
  "renewalOption": { "value": null, "source": null },
  "rentSteps":     { "value": null, "source": null },
  "tiAmount":      { "value": null, "source": null },
  "lcAmount":      { "value": null, "source": null }
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
      "tenant":        { "value": null, "source": null },
      "area":          { "value": null, "source": null },
      "rate":          { "value": null, "source": null },
      "annualRent":    { "value": null, "source": null },
      "leaseStart":    { "value": null, "source": null },
      "leaseEnd":      { "value": null, "source": null },
      "renewalOption": { "value": null, "source": null },
      "rentSteps":     { "value": null, "source": null },
      "tiAmount":      { "value": null, "source": null },
      "lcAmount":      { "value": null, "source": null }
    }
  ]
}

Rules:
- Extract every tenant you can find, even partial rows
- area: rentable square feet (number)
- rate: annual rent per square foot (number)
- annualRent: total annual base rent in dollars (number); if only monthly stated, multiply by 12
- leaseStart / leaseEnd: date strings, YYYY-MM-DD preferred
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
{ "value": null, "source": null }

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
  "tenant":        { "value": null, "source": null },
  "area":          { "value": null, "source": null },
  "rate":          { "value": null, "source": null },
  "annualRent":    { "value": null, "source": null },
  "leaseStart":    { "value": null, "source": null },
  "leaseEnd":      { "value": null, "source": null },
  "renewalOption": { "value": null, "source": null },
  "rentSteps":     { "value": null, "source": null },
  "tiAmount":      { "value": null, "source": null },
  "lcAmount":      { "value": null, "source": null },
  "notes":         { "value": null, "source": null }
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
