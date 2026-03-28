const PROPERTY_FIELDS_SCHEMA = `{
  "property_address": "Full property address",
  "property_type": "e.g. Multi-residential, Commercial, Mixed-use",
  "zoning": "Zoning designation",
  "municipality": "City/municipality name",
  "cadastre_reference": "Cadastre or lot number",
  "year_built": "Year constructed",
  "num_floors": "Number of floors/storeys",
  "num_units_total": "Total number of units",
  "unit_mix_description": "Summary of unit mix e.g. '10x 1BR, 5x 2BR'",
  "construction_frame": "Wood frame, concrete, steel, etc.",
  "foundation_type": "Type of foundation",
  "heating_type": "Central, baseboard, forced air, etc.",
  "heating_fuel": "Gas, electric, oil, etc.",
  "heating_num_units": "Number of heating units/furnaces",
  "electrical_amperage": "Electrical service amperage",
  "electrical_panel_type": "Panel type",
  "electrical_network_type": "Network type",
  "hot_water_tank_type": "Tank or tankless",
  "hot_water_energy_source": "Gas, electric, etc.",
  "ac_type": "Central, window, split, none",
  "ac_num_units": "Number of AC units",
  "kitchen_cabinets": "Cabinet material/style",
  "kitchen_countertops": "Countertop material",
  "kitchen_appliances": "Included appliances",
  "amenity_central_vacuum": "Yes/No or description",
  "amenity_fire_suppression": "Yes/No or description",
  "amenity_intercoms": "Yes/No or description",
  "amenity_elevator": "Yes/No or description",
  "amenity_emergency_lighting": "Yes/No or description",
  "amenity_exterior_lighting": "Yes/No or description",
  "amenity_security_cameras": "Yes/No or description",
  "amenity_other_common": "Other common amenities",
  "unit_balcony": "Yes/No",
  "unit_washer_dryer_hookup": "Yes/No",
  "unit_central_vacuum": "Yes/No",
  "unit_ac": "Yes/No or type",
  "unit_other_features": "Other unit features",
  "parking_total_spaces": "Total parking spaces",
  "parking_type": "Underground, surface, garage, etc.",
  "parking_per_unit": "Parking spaces per unit ratio",
  "storage_lockers_num": "Number of storage lockers",
  "storage_lockers_type": "Type of storage",
  "exterior_cladding": "Brick, vinyl, stucco, etc.",
  "roof_type": "Flat, pitched, etc.",
  "window_type": "Single/double/triple pane, material",
  "sqft_per_unit_habitable": "Average habitable sqft per unit",
  "sqft_ground_floor": "Ground floor area",
  "sqft_upper_floors": "Upper floors total area",
  "sqft_basement": "Basement area",
  "basement_finished_pct": "Percentage of basement finished",
  "sqft_total_building": "Total building square footage",
  "lot_size_total": "Total lot size",
  "lot_frontage": "Lot frontage measurement",
  "lot_depth": "Lot depth measurement",
  "lot_configuration": "Regular, irregular, corner, etc.",
  "lot_topography": "Flat, sloped, etc.",
  "lot_access": "Street access details",
  "municipal_services": "Available municipal services",
  "current_owner": "Current owner name",
  "ownership_type": "Fee simple, leasehold, etc.",
  "permit_license_number": "Building permit or license number",
  "construction_status": "Completed, under construction, etc.",
  "appraised_value": "Appraised value",
  "evaluation_date": "Date of evaluation/appraisal",
  "valuation_method": "Income, cost, comparison, etc.",
  "value_per_unit": "Value per unit",
  "value_per_sqft": "Value per square foot",
  "wall_finish": "Interior wall finish",
  "ceiling_type": "Ceiling type/height",
  "flooring_living": "Living area flooring",
  "flooring_kitchen": "Kitchen flooring",
  "flooring_bathroom": "Bathroom flooring",
  "flooring_basement": "Basement flooring",
  "doors_exterior": "Exterior door type/material",
  "doors_interior": "Interior door type/material",
  "bathrooms_per_unit": "Average bathrooms per unit",
  "bathroom_fixtures": "Fixture descriptions",
  "bathroom_vanity_finish": "Vanity material/finish",
  "bathroom_tub_shower_finish": "Tub/shower type and finish",
  "laundry_type": "In-unit, shared, coin-op",
  "laundry_location": "Basement, in-unit, etc.",
  "roof_material": "Shingles, membrane, metal, etc.",
  "roof_remaining_life_yrs": "Estimated remaining roof life in years",
  "gutters_type": "Gutter type/material",
  "cladding_condition": "Good, fair, poor",
  "windows_condition": "Good, fair, poor",
  "doors_condition": "Good, fair, poor",
  "fire_suppression_system": "Type of fire suppression",
  "fire_alarms": "Type of fire alarm system",
  "sprinkler_system": "Yes/No, type",
  "security_system": "Type of security system",
  "security_cameras": "Yes/No, details",
  "intercoms": "Type of intercom system",
  "building_access_type": "Key, fob, buzzer, etc.",
  "building_code_compliance": "Compliance status",
  "contamination_risk": "Known contamination risks",
  "flood_risk": "Flood risk assessment",
  "soil_issues": "Known soil issues",
  "env_certifications": "Environmental certifications",
  "structural_issues": "Yes/No",
  "structural_issues_detail": "Details if yes",
  "roof_issues": "Yes/No",
  "roof_issues_detail": "Details if yes",
  "plumbing_issues": "Yes/No",
  "plumbing_issues_detail": "Details if yes",
  "electrical_issues": "Yes/No",
  "electrical_issues_detail": "Details if yes",
  "hvac_issues": "Yes/No",
  "hvac_issues_detail": "Details if yes",
  "moisture_issues": "Yes/No",
  "moisture_issues_detail": "Details if yes",
  "other_maintenance_issues": "Other maintenance concerns",
  "landscaping": "Landscaping description",
  "outdoor_amenities": "Outdoor amenities",
  "outdoor_utilities": "Outdoor utility details",
  "gross_potential_income_annual": "Gross potential income (annual)",
  "actual_rental_income_annual": "Actual rental income (annual)",
  "commercial_parking_revenue": "Parking revenue",
  "other_revenue": "Other revenue sources",
  "total_revenue": "Total revenue",
  "expense_property_taxes": "Property tax expense",
  "expense_school_taxes": "School tax expense",
  "expense_insurance": "Insurance expense",
  "expense_utilities": "Utilities expense",
  "expense_maintenance": "Maintenance expense",
  "expense_landscaping_snow": "Landscaping/snow removal expense",
  "expense_management": "Management expense",
  "expense_vacancy_bad_debt": "Vacancy/bad debt allowance",
  "total_operating_expenses": "Total operating expenses",
  "net_operating_income": "Net operating income",
  "gross_rent_multiplier": "Gross rent multiplier",
  "cap_rate": "Capitalization rate",
  "debt_service_coverage_ratio": "DSCR",
  "operating_expense_ratio": "Operating expense ratio",
  "avg_rent_per_unit": "Average rent per unit",
  "market_supply_demand": "Market supply/demand assessment",
  "market_price_trend": "Price trend direction",
  "avg_days_on_market": "Average days on market",
  "num_comparables_used": "Number of comparables used",
  "comparable_date_range": "Date range of comparables",
  "comparable_price_range": "Price range of comparables",
  "comparable_avg_price_per_unit": "Average comparable price per unit",
  "major_renovations": "Major renovations done/planned",
  "additions_modifications": "Additions or modifications",
  "previous_sales": "Previous sales history",
  "easements": "Easements on property",
  "restrictive_covenants": "Restrictive covenants",
  "servitudes": "Servitudes",
  "special_assessments_pending": "Yes/No",
  "special_assessment_amount": "Amount if pending",
  "reserve_fund_required": "Required reserve fund",
  "reserve_fund_current": "Current reserve fund balance",
  "reserve_fund_pct_funded": "Percent funded",
  "deferred_maintenance_budget": "Deferred maintenance budget",
  "appraisal_notes": "General appraisal notes"
}`

const UNIT_FIELDS_SCHEMA = `{
  "unit_number": "Unit identifier",
  "unit_type": "Unit type description (e.g. 1BR, 2BR, Studio, Bachelor)",
  "beds": "Number of bedrooms (numeric)",
  "baths": "Number of bathrooms (numeric)",
  "sqft": 650,
  "lease_rate": 1850.00,
  "move_in": "YYYY-MM-DD",
  "move_out": "YYYY-MM-DD or null if active"
}`

const SHARED_RULES = `
Field rules:
- For all text fields: use the exact text from the document, or null if not found
- For financial/numeric fields: plain numbers without $ or commas
- Do not guess or fabricate data that is not present in the document
- If a field is partially readable, extract the best reading
- Return raw JSON only — no markdown fences, no commentary`

function multiPartNote(partNumber, totalParts, existingData) {
  if (totalParts <= 1) return ''
  let note = `\n\nIMPORTANT: This is part ${partNumber} of ${totalParts} of the same document.`
  if (existingData) {
    note += `\nData already extracted from previous parts:\n${JSON.stringify(existingData, null, 2)}\n\nExtract any NEW or ADDITIONAL information. Only overwrite a field if this section has a clearly more complete or accurate value. For unit-level data, add any new units found.`
  }
  return note
}

export function buildAppraisalPrompt(partNumber, totalParts, existingData) {
  return `You are a specialized real estate data extraction system focused on APPRAISAL documents.

Extract ALL property-level information from the provided appraisal document into the schema below.
If the document also contains a rent roll or unit listing, extract those units as well.

Return a JSON object with this exact structure:
{
  "property": ${PROPERTY_FIELDS_SCHEMA},
  "units": [
    ${UNIT_FIELDS_SCHEMA}
  ]
}

${SHARED_RULES}
- Extract EVERY unit row you can find, including vacant units
- lease_rate: monthly rent in CAD as a plain number
- beds/baths: numeric values (e.g. 1, 1.5, 2)
- sqft: numeric, no commas
- move_in/move_out: YYYY-MM-DD format, move_out null means currently occupied${multiPartNote(partNumber, totalParts, existingData)}`
}

export function buildRentRollPrompt(partNumber, totalParts, existingData) {
  return `You are a specialized real estate data extraction system focused on RENT ROLL documents.

Extract ALL unit-level information from the provided rent roll. Also extract any property-level information visible (like property address, property type, number of units, etc.).

Return a JSON object with this exact structure:
{
  "property_address": "Full property address as shown on the document",
  "property_type": "e.g. Multi-residential, Commercial, Mixed-use (if stated)",
  "units": [
    ${UNIT_FIELDS_SCHEMA}
  ]
}

${SHARED_RULES}
- Extract EVERY unit row you can identify, including vacant units
- lease_rate: monthly rent in CAD as a plain number (no $ sign, no commas)
- beds and baths: numeric values (e.g. 1, 1.5, 2)
- sqft: numeric square footage with no commas
- move_in / move_out: ISO 8601 format YYYY-MM-DD
- move_out null means currently occupied with no stated end date
- If a unit appears vacant (no tenant, no rent), still include it with lease_rate as null${multiPartNote(partNumber, totalParts, existingData)}`
}
