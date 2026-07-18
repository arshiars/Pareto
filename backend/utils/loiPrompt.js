export function buildLoiExtractionPrompt() {
  return `You are extracting deal information from a real estate Confidential Information Memorandum (CIM) or broker package to pre-fill a Letter of Intent (LOI) template.

Extract the following fields and return ONLY a valid JSON object with no additional text or explanation. If a field cannot be confidently found in the document, return null for that field — do not guess.

{
  "subject": "Brief subject line for the LOI re: line (e.g. '123 Main Street, Toronto — Mortgage Financing')",
  "brokerName": "Name of the brokerage firm listed on the CIM (e.g. 'CBRE Limited')",
  "recipient": "First and last name of the broker contact person to address the letter to, if listed",
  "propertyDescription": "Full property description including full civic address with city and province, number of units, and property type (e.g. '123 Main Street, Toronto, Ontario — 48-unit multi-residential apartment building')",
  "borrowerName": "Legal entity name of the purchaser or borrower if explicitly mentioned, otherwise null",
  "askingPrice": "Asking price or listed price as a plain number with no dollar sign or commas (e.g. 12500000), or null if not found",
  "numberOfUnits": "Total number of residential units as a plain number",
  "propertyType": "Type of property (e.g. 'Multi-Residential', 'Mixed-Use', 'Commercial')",
  "term": "Loan or financing term in months if mentioned (e.g. 12), otherwise null",
  "interestReserveAmount": "Interest reserve amount as a plain number if mentioned, otherwise null",
  "guarantorName": "Name of guarantor if explicitly mentioned, otherwise null",
  "brokerContactEmail": "Email address of the broker contact if listed, otherwise null",
  "capRate": "Capitalization rate as a percentage number (e.g. 4.25) if mentioned, otherwise null",
  "noi": "Net Operating Income as a plain number if mentioned, otherwise null"
}`
}

export function buildConditionSuggestionPrompt(propertyDescription, existingConditions) {
  return `You are a Canadian commercial mortgage underwriter at Pareto drafting a Letter of Intent (LOI).

Property: ${propertyDescription || 'Multi-residential property'}

Existing conditions precedent already included:
${existingConditions.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Generate exactly 2 additional conditions precedent that are relevant to this property and not already listed above. These should be professional, specific, and written in the same formal legal style as the existing conditions. Use formal Canadian commercial mortgage lending language.

Return ONLY a JSON array of 2 strings, no explanation:
["Condition one text here", "Condition two text here"]`
}

export function buildConditionRephrasPrompt(userText) {
  return `You are a Canadian commercial mortgage underwriter at Pareto. Rephrase the following user-provided condition precedent into professional formal legal language suitable for a Letter of Intent (LOI) from a mortgage lender. Match the tone and style of standard CMHC/conventional lending conditions.

User text: "${userText}"

Return ONLY the rephrased condition as a plain string, no quotes, no explanation.`
}
