import { useCallback, useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { slugify, matchesSlug } from '../utils/slug.js'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
const ComparablesMap = lazy(() => import('../components/ComparablesMap.jsx'))
const CompTable = lazy(() => import('../components/CompTable.jsx'))
const PropertyMap = lazy(() => import('../components/PropertyMap.jsx'))
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
import {
  fetchRentComparables,
  fetchPropertyDetail,
  deleteProperty,
  updateUnit,
  renamePropertyAddress,
  uploadFilesToS3,
  uploadPropertyImage,
  setPreviewImage,
  deletePropertyImage,
  researchMarketData,
  researchSubjectProperty,
  aiRankComps,
  checkDuplicateAddress,
  enrichUnits,
  deleteUnits,
} from '../services/api.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Haversine distance ─────────────────────────────────────────────────────

function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Comparable scoring ─────────────────────────────────────────────────────
// Scores a candidate property against a subject. Lower score = better match.
// Weights: proximity (40%), unit count (15%), bed mix (20%), year built (15%), building type (10%)

function scoreComparable(subject, candidate, distance) {
  const breakdown = {}

  // 1. Proximity (40%) — 0 mi = 0, 5+ mi = 1
  const proxRaw = Math.min(distance / 5, 1)
  breakdown.proximity = { score: proxRaw * 40, weight: 40, distance: Math.round(distance * 10) / 10, detail: `${Math.round(distance * 10) / 10} mi away` }

  // 2. Unit count similarity (15%)
  if (subject.unitCount > 0 && candidate.unitCount > 0) {
    const ratio = Math.abs(subject.unitCount - candidate.unitCount) / Math.max(subject.unitCount, candidate.unitCount)
    breakdown.unitCount = { score: ratio * 15, weight: 15, subject: subject.unitCount, candidate: candidate.unitCount, detail: `${candidate.unitCount} units (subject: ${subject.unitCount})` }
  } else {
    breakdown.unitCount = { score: 7.5, weight: 15, detail: 'Unit count unknown' }
  }

  // 3. Storeys similarity (20%) — low-rise vs mid-rise vs high-rise
  if (subject.storeys && candidate.storeys) {
    const diff = Math.abs(Number(subject.storeys) - Number(candidate.storeys))
    const storeysRaw = Math.min(diff / 15, 1) // 15+ storey diff = max penalty
    breakdown.storeys = { score: storeysRaw * 20, weight: 20, subject: subject.storeys, candidate: candidate.storeys, detail: `${candidate.storeys} storeys (subject: ${subject.storeys}, ${diff} diff)` }
  } else {
    breakdown.storeys = { score: 10, weight: 20, detail: 'Storeys unknown' }
  }

  // 4. Year built proximity (15%)
  if (subject.yearBuilt && candidate.yearBuilt) {
    const yrDiff = Math.abs(Number(subject.yearBuilt) - Number(candidate.yearBuilt))
    breakdown.yearBuilt = { score: Math.min(yrDiff / 30, 1) * 15, weight: 15, subject: subject.yearBuilt, candidate: candidate.yearBuilt, detail: `Built ${candidate.yearBuilt} (subject: ${subject.yearBuilt}, ${yrDiff}yr diff)` }
  } else {
    breakdown.yearBuilt = { score: 7.5, weight: 15, detail: 'Year built unknown' }
  }

  // 5. Building type match (10%)
  if (subject.propertyType && candidate.propertyType) {
    const match = subject.propertyType.toLowerCase() === candidate.propertyType.toLowerCase()
    breakdown.buildingType = { score: (match ? 0 : 1) * 10, weight: 10, match, detail: match ? `Same type: ${candidate.propertyType}` : `${candidate.propertyType} (subject: ${subject.propertyType})` }
  } else {
    breakdown.buildingType = { score: 5, weight: 10, detail: 'Building type unknown' }
  }

  const totalScore = Object.values(breakdown).reduce((s, b) => s + b.score, 0)
  return { totalScore, breakdown }
}

function buildPropertyProfile(units) {
  return {
    unitCount: units.length,
    storeys: units[0]?.num_floors ?? null,
    yearBuilt: units[0]?.year_built ?? null,
    propertyType: units[0]?.property_type ?? null,
    constructionFrame: units[0]?.construction_frame ?? null,
  }
}

function fmtCurrency(val) {
  if (val == null) return '—'
  return '$' + Number(val).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtPsf(lease_rate, sqft) {
  if (lease_rate == null || sqft == null || Number(sqft) === 0) return '—'
  const psf = Number(lease_rate) / Number(sqft)
  return '$' + psf.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(val) {
  if (!val) return null
  return val
}

function LeaseEndCell({ move_out }) {
  if (!move_out) return <span className="text-green-600 font-medium text-xs">Active</span>
  const today = new Date().toISOString().split('T')[0]
  if (move_out < today) return <span className="text-red-400 text-xs">{move_out}</span>
  return <span className="text-xs text-[#555555]">{move_out}</span>
}

function groupByProperty(units) {
  const map = new Map()
  for (const unit of units) {
    const key = unit.property_id
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, {
        property_id: key,
        property_address: unit.property_address,
        property_type: unit.property_type,
        source_file: unit.source_file,
        uploaded_at: unit.uploaded_at,
        units: [],
      })
    }
    map.get(key).units.push(unit)
  }
  return Array.from(map.values())
}

// ─── Editable cell for edit-mode tables ─────────────────────────────────────

const CELL_INPUT_BASE = 'text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary'

function EditableCell({ value, onChange, onBlur, type, width, saving }) {
  return (
    <div className="relative">
      <input
        type={type || 'text'}
        className={`${CELL_INPUT_BASE} ${width}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
      />
      {saving && <div className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
    </div>
  )
}

// ─── Shared header ───────────────────────────────────────────────────────────

function PageHeader({ onBack }) {
  return (
    <header className="bg-white border-b border-border flex-shrink-0">
      <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[#777777] hover:text-primary transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="h-6 w-px bg-border" />
          <div>
            <h1 className="text-primary text-lg font-bold tracking-tight">Pareto</h1>
            <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">Real Estate Underwriting</p>
          </div>
          <div className="h-6 w-px bg-border" />
          <span className="text-[#555555] text-xs tracking-widest uppercase font-medium">KingSett Capital</span>
        </div>
        <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-14 w-auto" />
      </div>
    </header>
  )
}

// ─── Property Detail Sections ────────────────────────────────────────────────

// ─── Property detail field formatting ────────────────────────────────────────

const CURRENCY_FIELDS = new Set([
  'appraised_value', 'value_per_unit', 'value_per_sqft',
  'gross_potential_income_annual', 'actual_rental_income_annual',
  'commercial_parking_revenue', 'other_revenue', 'total_revenue',
  'expense_property_taxes', 'expense_school_taxes', 'expense_insurance',
  'expense_utilities', 'expense_maintenance', 'expense_landscaping_snow',
  'expense_management', 'expense_vacancy_bad_debt', 'total_operating_expenses',
  'net_operating_income', 'avg_rent_per_unit', 'deferred_maintenance_budget',
  'special_assessment_amount', 'reserve_fund_required', 'reserve_fund_current',
  'comparable_avg_price_per_unit',
])

const PERCENT_FIELDS = new Set([
  'cap_rate', 'operating_expense_ratio', 'basement_finished_pct', 'reserve_fund_pct_funded',
])

const RATIO_FIELDS = new Set([
  'gross_rent_multiplier', 'debt_service_coverage_ratio',
])

// Numeric fields that should show with commas (sqft, counts, etc.)
const NUMERIC_FIELDS = new Set([
  'sqft_total_building', 'sqft_per_unit_habitable', 'sqft_ground_floor',
  'sqft_upper_floors', 'sqft_basement', 'lot_size_total', 'lot_frontage', 'lot_depth',
  'num_units_total', 'num_floors', 'parking_total_spaces', 'storage_lockers_num',
  'heating_num_units', 'ac_num_units', 'roof_remaining_life_yrs',
  'num_comparables_used', 'avg_days_on_market',
  'comparable_price_range',
])

function fmtPropertyValue(key, val) {
  if (val == null || val === '') return '—'
  const str = String(val)
  const num = Number(str.replace(/,/g, ''))
  if (CURRENCY_FIELDS.has(key) && !isNaN(num)) {
    return '$' + num.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }
  if (PERCENT_FIELDS.has(key) && !isNaN(num)) {
    const pct = num < 1 && num > 0 ? num * 100 : num
    return pct.toLocaleString('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%'
  }
  if (RATIO_FIELDS.has(key) && !isNaN(num)) {
    return num.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'x'
  }
  if (NUMERIC_FIELDS.has(key) && !isNaN(num)) {
    return num.toLocaleString('en-CA')
  }
  return str
}

// Primary sections — always visible, most relevant for rent comparable analysis
const PRIMARY_SECTIONS = [
  { title: 'Financial', fields: [
    ['appraised_value', 'Appraised Value'], ['evaluation_date', 'Evaluation Date'],
    ['valuation_method', 'Valuation Method'], ['value_per_unit', 'Value/Unit'], ['value_per_sqft', 'Value/Sqft'],
    ['gross_potential_income_annual', 'Gross Potential Income'], ['actual_rental_income_annual', 'Actual Rental Income'],
    ['commercial_parking_revenue', 'Parking Revenue'], ['other_revenue', 'Other Revenue'], ['total_revenue', 'Total Revenue'],
    ['expense_property_taxes', 'Property Taxes'], ['expense_school_taxes', 'School Taxes'],
    ['expense_insurance', 'Insurance'], ['expense_utilities', 'Utilities'],
    ['expense_maintenance', 'Maintenance'], ['expense_landscaping_snow', 'Landscaping/Snow'],
    ['expense_management', 'Management'], ['expense_vacancy_bad_debt', 'Vacancy/Bad Debt'],
    ['total_operating_expenses', 'Total Expenses'], ['net_operating_income', 'NOI'],
    ['cap_rate', 'Cap Rate'], ['gross_rent_multiplier', 'GRM'],
    ['debt_service_coverage_ratio', 'DSCR'], ['operating_expense_ratio', 'OER'], ['avg_rent_per_unit', 'Avg Rent/Unit'],
  ]},
  { title: 'General', fields: [
    ['property_type', 'Property Type'], ['zoning', 'Zoning'], ['municipality', 'Municipality'],
    ['year_built', 'Year Built'], ['num_floors', 'Floors'], ['num_units_total', 'Total Units'],
    ['unit_mix_description', 'Unit Mix'], ['construction_status', 'Status'],
    ['current_owner', 'Owner'], ['ownership_type', 'Ownership Type'],
  ]},
  { title: 'Area & Lot', fields: [
    ['sqft_total_building', 'Total Building Sqft'], ['sqft_per_unit_habitable', 'Sqft/Unit'],
    ['sqft_ground_floor', 'Ground Floor'], ['sqft_upper_floors', 'Upper Floors'],
    ['sqft_basement', 'Basement'], ['basement_finished_pct', 'Basement Finished %'],
    ['lot_size_total', 'Lot Size'], ['lot_frontage', 'Frontage'], ['lot_depth', 'Depth'],
    ['lot_configuration', 'Configuration'], ['lot_topography', 'Topography'], ['lot_access', 'Access'],
  ]},
  { title: 'Condition & Maintenance', fields: [
    ['cladding_condition', 'Cladding'], ['windows_condition', 'Windows'], ['doors_condition', 'Doors'],
    ['roof_remaining_life_yrs', 'Roof Life (yrs)'], ['gutters_type', 'Gutters'],
    ['structural_issues', 'Structural'], ['structural_issues_detail', 'Detail'],
    ['roof_issues', 'Roof'], ['roof_issues_detail', 'Detail'],
    ['plumbing_issues', 'Plumbing'], ['plumbing_issues_detail', 'Detail'],
    ['electrical_issues', 'Electrical'], ['electrical_issues_detail', 'Detail'],
    ['hvac_issues', 'HVAC'], ['hvac_issues_detail', 'Detail'],
    ['moisture_issues', 'Moisture'], ['moisture_issues_detail', 'Detail'],
    ['other_maintenance_issues', 'Other'], ['deferred_maintenance_budget', 'Deferred Budget'],
  ]},
]

// Secondary sections — hidden behind "Show More", less relevant for rent analysis
const SECONDARY_SECTIONS = [
  { title: 'Building & Construction', fields: [
    ['construction_frame', 'Frame'], ['foundation_type', 'Foundation'],
    ['exterior_cladding', 'Cladding'], ['roof_type', 'Roof Type'], ['roof_material', 'Roof Material'],
    ['window_type', 'Windows'], ['wall_finish', 'Wall Finish'], ['ceiling_type', 'Ceiling'],
    ['doors_exterior', 'Exterior Doors'], ['doors_interior', 'Interior Doors'],
  ]},
  { title: 'Interior Finishes', fields: [
    ['kitchen_cabinets', 'Cabinets'], ['kitchen_countertops', 'Countertops'], ['kitchen_appliances', 'Appliances'],
    ['flooring_living', 'Living Flooring'], ['flooring_kitchen', 'Kitchen Flooring'],
    ['flooring_bathroom', 'Bathroom Flooring'], ['flooring_basement', 'Basement Flooring'],
    ['bathrooms_per_unit', 'Baths/Unit'], ['bathroom_fixtures', 'Fixtures'],
    ['bathroom_vanity_finish', 'Vanity'], ['bathroom_tub_shower_finish', 'Tub/Shower'],
    ['laundry_type', 'Laundry'], ['laundry_location', 'Laundry Location'],
  ]},
  { title: 'Mechanical & Electrical', fields: [
    ['heating_type', 'Heating'], ['heating_fuel', 'Fuel'], ['heating_num_units', 'Heating Units'],
    ['ac_type', 'AC Type'], ['ac_num_units', 'AC Units'],
    ['electrical_amperage', 'Amperage'], ['electrical_panel_type', 'Panel'], ['electrical_network_type', 'Network'],
    ['hot_water_tank_type', 'Hot Water'], ['hot_water_energy_source', 'HW Energy'],
  ]},
  { title: 'Amenities & Parking', fields: [
    ['amenity_elevator', 'Elevator'], ['amenity_intercoms', 'Intercoms'],
    ['amenity_central_vacuum', 'Central Vacuum'],
    ['unit_balcony', 'Balcony'], ['unit_washer_dryer_hookup', 'W/D Hookup'],
    ['unit_ac', 'Unit AC'], ['unit_other_features', 'Other Features'],
    ['parking_total_spaces', 'Parking Spaces'], ['parking_type', 'Parking Type'], ['parking_per_unit', 'Parking/Unit'],
    ['storage_lockers_num', 'Storage Lockers'], ['storage_lockers_type', 'Storage Type'],
  ]},
  { title: 'Legal & Other', fields: [
    ['cadastre_reference', 'Cadastre'], ['permit_license_number', 'Permit/License'],
    ['major_renovations', 'Renovations'], ['additions_modifications', 'Additions'],
    ['previous_sales', 'Previous Sales'], ['easements', 'Easements'],
    ['restrictive_covenants', 'Covenants'], ['servitudes', 'Servitudes'],
    ['special_assessments_pending', 'Special Assessments'], ['special_assessment_amount', 'Assessment Amount'],
    ['reserve_fund_required', 'Reserve Required'], ['reserve_fund_current', 'Reserve Current'],
    ['reserve_fund_pct_funded', '% Funded'],
    ['municipal_services', 'Municipal Services'], ['landscaping', 'Landscaping'],
    ['outdoor_amenities', 'Outdoor Amenities'], ['outdoor_utilities', 'Outdoor Utilities'],
    ['appraisal_notes', 'Notes'],
  ]},
]

function PropertyDetailsPanel({ detail }) {
  const [openSections, setOpenSections] = useState(new Set())
  const [showMore, setShowMore] = useState(false)

  if (!detail) return null

  const toggleSection = (title) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      next.has(title) ? next.delete(title) : next.add(title)
      return next
    })
  }

  function renderSections(sections) {
    return sections.map(({ title, fields }) => {
      const populated = fields.filter(([key]) => detail[key] != null && detail[key] !== '')
      if (populated.length === 0) return null
      const isOpen = openSections.has(title)

      return (
        <Card key={title} className="overflow-hidden">
          <button
            onClick={() => toggleSection(title)}
            className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-border/30 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <svg
                className={`w-3.5 h-3.5 text-[#777] transition-transform ${isOpen ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-sm font-semibold text-primary">{title}</span>
            </div>
            <span className="text-[10px] text-[#999]">{populated.length} field{populated.length !== 1 ? 's' : ''}</span>
          </button>
          {isOpen && (
            <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3 border-t border-border">
              {populated.map(([key, label]) => (
                <div key={key} className="min-w-0">
                  <p className="text-[10px] text-[#999] uppercase tracking-wider font-medium truncate">{label}</p>
                  <p className="text-xs text-[#333] mt-0.5 break-words">{fmtPropertyValue(key, detail[key])}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )
    })
  }

  const secondaryHasData = SECONDARY_SECTIONS.some(({ fields }) =>
    fields.some(([key]) => detail[key] != null && detail[key] !== '')
  )

  return (
    <div className="space-y-3 mb-6">
      {renderSections(PRIMARY_SECTIONS)}

      {secondaryHasData && (
        <>
          <button
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-[#777] hover:text-primary transition-colors py-1"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {showMore ? 'Show Less' : 'Show More Details'}
          </button>
          {showMore && renderSections(SECONDARY_SECTIONS)}
        </>
      )}
    </div>
  )
}

// ─── Property Image Gallery ──────────────────────────────────────────────────

function PropertyImageGallery({ propertyId, images, onImagesChange }) {
  const [uploading, setUploading] = useState(false)
  const [settingPreview, setSettingPreview] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const fileInputRef = useRef(null)

  async function handleUpload(e) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const isFirst = images.length === 0
      for (let i = 0; i < files.length; i++) {
        const asPreview = isFirst && i === 0
        const saved = await uploadPropertyImage(propertyId, files[i], asPreview)
        onImagesChange((prev) => [saved, ...prev])
      }
    } catch {}
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSetPreview(imageId) {
    setSettingPreview(imageId)
    try {
      await setPreviewImage(propertyId, imageId)
      onImagesChange((prev) =>
        prev.map((img) => ({ ...img, is_preview: img.id === imageId }))
      )
    } catch {}
    setSettingPreview(null)
  }

  async function handleDelete(imageId) {
    setDeleting(imageId)
    try {
      await deletePropertyImage(propertyId, imageId)
      onImagesChange((prev) => prev.filter((img) => img.id !== imageId))
    } catch {}
    setDeleting(null)
  }

  const previewImage = images.find((img) => img.is_preview)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Property Images
          {previewImage && <span className="text-[10px] text-[#999] font-normal ml-1">· preview set</span>}
        </h3>
        <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
          uploading ? 'bg-surface border-border text-[#999]' : 'bg-white border-border text-primary hover:border-primary'
        }`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {uploading ? 'Uploading...' : 'Upload Images'}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {images.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
          <p className="text-xs text-[#999]">No images uploaded. Upload images to replace the default Street View preview.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${
              img.is_preview ? 'border-primary' : 'border-border hover:border-primary/40'
            }`}>
              <div className="aspect-[4/3] bg-surface">
                {img.url ? (
                  <img src={img.url} alt={img.filename ?? ''} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#ccc]">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {img.is_preview && (
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-primary text-white text-[9px] font-bold uppercase tracking-wider rounded">
                  Preview
                </div>
              )}

              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-center opacity-0 group-hover:opacity-100 pb-2 gap-1.5">
                {!img.is_preview && (
                  <button
                    onClick={() => handleSetPreview(img.id)}
                    disabled={settingPreview === img.id}
                    className="px-2 py-1 bg-white text-primary text-[10px] font-semibold rounded shadow hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                  >
                    {settingPreview === img.id ? '...' : 'Set as Preview'}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(img.id)}
                  disabled={deleting === img.id}
                  className="px-2 py-1 bg-white text-red-500 text-[10px] font-semibold rounded shadow hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                >
                  {deleting === img.id ? '...' : 'Delete'}
                </button>
              </div>

              <div className="px-2 py-1.5 bg-white">
                <p className="text-[10px] text-[#777] truncate">{img.filename ?? 'image'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Filename parsing ─────────────────────────────────────────────────────────

const APPRAISAL_RE = /^(.+?)\s*-\s*Appraisal\.pdf$/i
const RENTROLL_RE  = /^(.+?)\s*-\s*Rent[- ]?Roll\.pdf$/i

function parseFileName(name) {
  let m = name.match(APPRAISAL_RE)
  if (m) return { address: m[1].trim(), docType: 'appraisal' }
  m = name.match(RENTROLL_RE)
  if (m) return { address: m[1].trim(), docType: 'rentroll' }
  return null
}

function groupFilesByAddress(files) {
  const groups = {}
  const unrecognised = []
  for (const file of files) {
    const parsed = parseFileName(file.name)
    if (!parsed) { unrecognised.push(file); continue }
    const key = parsed.address
    if (!groups[key]) groups[key] = { address: parsed.address, appraisal: [], rentroll: [] }
    groups[key][parsed.docType].push(file)
  }
  return { groups: Object.values(groups), unrecognised }
}

// ─── Upload Dropzone (multi-property) ─────────────────────────────────────────

function UploadDropzone({ files, onAdd, onRemove }) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: onAdd,
    accept: { 'application/pdf': ['.pdf'] },
    noClick: true,
  })

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
          isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <p className="text-primary font-medium text-sm">
              {isDragActive ? 'Drop your PDFs here' : 'Drag & drop all PDFs here'}
            </p>
            <p className="text-[#777777] text-xs mt-1">
              Appraisals and rent rolls for multiple properties at once
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={open}>Select Files</Button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {files.map((file, idx) => {
            const parsed = parseFileName(file.name)
            return (
              <div key={`${file.name}-${idx}`} className="flex items-center gap-3 p-2.5 bg-background border border-border rounded-lg">
                <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 ${
                  !parsed ? 'bg-amber-100' : parsed.docType === 'appraisal' ? 'bg-blue-100' : 'bg-emerald-100'
                }`}>
                  <svg className={`w-3.5 h-3.5 ${
                    !parsed ? 'text-amber-500' : parsed.docType === 'appraisal' ? 'text-blue-500' : 'text-emerald-500'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-primary truncate">{file.name}</p>
                  <p className="text-[10px] text-[#777777]">
                    {(file.size / 1024).toFixed(0)} KB
                    {parsed && <> · <span className={parsed.docType === 'appraisal' ? 'text-blue-500' : 'text-emerald-500'}>{parsed.docType}</span></>}
                    {!parsed && <> · <span className="text-amber-500">unrecognised</span></>}
                  </p>
                </div>
                <button onClick={() => onRemove(file)} className="text-[#777777] hover:text-error transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RentComparablesPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const BASE = '/comparable-analysis/rent-comparables'

  // Derive view from URL path
  const pathSuffix = location.pathname.replace(BASE, '').replace(/^\//, '')
  const view = pathSuffix === 'upload' ? 'upload'
    : pathSuffix === 'comptable' ? 'comptable'
    : pathSuffix.startsWith('property/') ? 'property'
    : 'map'

  function setView(v) {
    // Reset edit mode when switching views
    setEditMode(false)
    setEditModeValues({})
    setSelectedUnits(new Set())
    setBatchField('')
    setBatchValue('')
    if (v === 'map') navigate(BASE)
    else navigate(`${BASE}/${v}`)
  }

  // Upload state
  const [uploadFiles, setUploadFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadResults, setUploadResults] = useState(null)

  // History state
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [deletingProperty, setDeletingProperty] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingValues, setEditingValues] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
  // Edit mode: all cells editable at once, auto-save on blur
  const [editMode, setEditMode] = useState(false)
  const [editModeValues, setEditModeValues] = useState({}) // { [unitId]: { field: value, ... } }
  const [savingUnits, setSavingUnits] = useState(new Set()) // unit IDs currently saving
  // Batch editing
  const [selectedUnits, setSelectedUnits] = useState(new Set())
  const [batchField, setBatchField] = useState('')
  const [batchValue, setBatchValue] = useState('')
  const [applyingBatch, setApplyingBatch] = useState(false)
  // Per-property upload
  const [propertyUploading, setPropertyUploading] = useState(false)
  const [propertyUploadResult, setPropertyUploadResult] = useState(null) // { success, message }
  // Market research
  const [researching, setResearching] = useState(false)
  // Unit enrichment
  const [enriching, setEnriching] = useState(false)
  const [enrichResult, setEnrichResult] = useState(null)
  // Auto-suggest comp scores: { [address]: { totalScore, breakdown, rank } }
  const [compScores, setCompScores] = useState({})
  const [suggestSteps, setSuggestSteps] = useState(null) // null = idle, array = step objects while running

  function updateSuggestStep(id, updates) {
    setSuggestSteps((prev) => prev ? prev.map((s) => s.id === id ? { ...s, ...updates } : s) : prev)
  }
  const [subjectProfile, setSubjectProfile] = useState(null) // cached subject profile for display
  const [historyView, setHistoryView] = useState('list')
  // The slug from the URL — used to resolve selectedProperty once history loads
  const propertySlug = view === 'property'
    ? location.pathname.replace(`${BASE}/property/`, '')
    : null
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [selectedPropertyId, setSelectedPropertyId] = useState(null)
  const [propertyDetail, setPropertyDetail] = useState(null)
  const [propertyImages, setPropertyImages] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [expandedProperties, setExpandedProperties] = useState(new Set())
  const [renamingPropertyId, setRenamingPropertyId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  const [addressSearch, setAddressSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchCoords, setSearchCoords] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef(null)
  const debounceRef = useRef(null)
  const [pinStarCoords, setPinStarCoords] = useState(null)
  const [subjectLabel, setSubjectLabel] = useState(null)
  const [highlightAddress, setHighlightAddress] = useState(null)
  const [selectedAddresses, setSelectedAddresses] = useState(() => {
    try {
      const saved = localStorage.getItem('pareto_selected_addresses')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })
  const [bedsFilter, setBedsFilter] = useState('')
  const [sqftMin, setSqftMin] = useState('')
  const [sqftMax, setSqftMax] = useState('')
  const [moveInFrom, setMoveInFrom] = useState('')
  const [moveInTo, setMoveInTo] = useState('')
  const [leaseRateMin, setLeaseRateMin] = useState('')
  const [leaseRateMax, setLeaseRateMax] = useState('')
  const [bathsFilter, setBathsFilter] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)

  const [error, setError] = useState(null)

  const handleSelectProperty = useCallback((address) => {
    setSelectedProperty(address)
    const match = history.find((u) => u.property_address === address)
    setSelectedPropertyId(match?.property_id ?? null)
    navigate(`${BASE}/property/${slugify(address)}`)
  }, [history, navigate])

  // Resolve selectedProperty + selectedPropertyId from URL slug once history loads
  useEffect(() => {
    if (propertySlug && history.length > 0 && !selectedProperty) {
      const match = history.find((u) => matchesSlug(u.property_address, propertySlug))
      if (match) {
        setSelectedProperty(match.property_address)
        setSelectedPropertyId(match.property_id)
      }
    }
  }, [propertySlug, history, selectedProperty])

  // ── Upload helpers ───────────────────────────────────────────────────────

  const { groups: uploadGroups, unrecognised: uploadUnrecognised } = useMemo(
    () => groupFilesByAddress(uploadFiles),
    [uploadFiles],
  )

  // Duplicate detection: { [address]: { duplicates: [...], dismissed: bool } }
  const [uploadDuplicates, setUploadDuplicates] = useState({})

  useEffect(() => {
    if (uploadGroups.length === 0) { setUploadDuplicates({}); return }
    for (const g of uploadGroups) {
      if (g.address in uploadDuplicates) continue
      checkDuplicateAddress(g.address)
        .then(({ duplicates }) => {
          if (duplicates.length > 0) {
            setUploadDuplicates((prev) => ({ ...prev, [g.address]: { duplicates, dismissed: false } }))
          }
        })
        .catch(() => {})
    }
  }, [uploadGroups])

  const handleAddFiles = useCallback((accepted) => {
    setUploadFiles((prev) => {
      const next = [...prev]
      accepted.forEach((f) => {
        if (!next.find((x) => x.name === f.name && x.size === f.size)) next.push(f)
      })
      return next
    })
  }, [])

  function handleRemoveFile(file) {
    setUploadFiles((prev) => prev.filter((f) => f !== file))
  }

  async function handleUpload() {
    if (uploadGroups.length === 0) {
      setError('No valid files to upload. Please name files as: Address - Appraisal.pdf or Address - Rent-Roll.pdf')
      return
    }
    setUploading(true)
    setError(null)
    const allResults = []

    try {
      for (const group of uploadGroups) {
        setUploadProgress(`Uploading files for ${group.address}...`)
        if (group.appraisal.length > 0) {
          const results = await uploadFilesToS3(group.address, 'appraisal', group.appraisal)
          allResults.push(...results.map((r) => ({ ...r, type: 'appraisal', address: group.address })))
        }
        if (group.rentroll.length > 0) {
          const results = await uploadFilesToS3(group.address, 'rentroll', group.rentroll)
          allResults.push(...results.map((r) => ({ ...r, type: 'rentroll', address: group.address })))
        }
      }
      setUploadResults(allResults)
    } catch (err) {
      setError(err.message)
    }

    setUploading(false)
    setUploadProgress(null)
  }

  function handleUploadDone() {
    setUploadFiles([])
    setUploadResults(null)
    setView('map')
  }

  // ── History handlers ─────────────────────────────────────────────────────

  async function loadHistory() {
    setLoadingHistory(true)
    try {
      const data = await fetchRentComparables()
      setHistory(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingHistory(false)
    }
  }

  const uniqueAddresses = useMemo(() => {
    const set = new Set()
    for (const u of history) {
      if (u.property_address) set.add(u.property_address)
    }
    return [...set]
  }, [history])

  function handleSearchChange(value) {
    setSearchInput(value)
    clearTimeout(debounceRef.current)

    if (!value.trim()) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const q = value.trim().toLowerCase()
    const propertyMatches = uniqueAddresses
      .filter((a) => a.toLowerCase().includes(q))
      .slice(0, 5)
      .map((a) => ({ type: 'property', label: a }))

    setSuggestions(propertyMatches)
    setShowSuggestions(true)

    if (MAPBOX_TOKEN) {
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value.trim())}.json?access_token=${MAPBOX_TOKEN}&limit=5&country=ca&types=address,place,locality,neighborhood,postcode`
          )
          const data = await res.json()
          const geoResults = (data.features ?? []).map((f) => ({
            type: 'location',
            label: f.place_name,
            coords: { lng: f.center[0], lat: f.center[1] },
          }))

          setSuggestions((prev) => {
            const props = prev.filter((s) => s.type === 'property')
            return [...props, ...geoResults]
          })
        } catch {}
      }, 300)
    }
  }

  function handleSelectSuggestion(suggestion) {
    setShowSuggestions(false)
    setSearchInput(suggestion.label)

    if (suggestion.type === 'property') {
      setSearchCoords(null)
      setHighlightAddress(suggestion.label)
    } else {
      setHighlightAddress(null)
      setSearchCoords(suggestion.coords)
    }
  }

  function handleSearchSubmit(e) {
    e?.preventDefault()
    if (suggestions.length > 0) {
      handleSelectSuggestion(suggestions[0])
    }
  }

  function clearSearch() {
    setSearchInput('')
    setSearchCoords(null)
    setHighlightAddress(null)
    setSuggestions([])
    setShowSuggestions(false)
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      clearTimeout(debounceRef.current)
    }
  }, [])

  function pinCurrentAsSubject() {
    if (!searchCoords) return
    setPinStarCoords(searchCoords)
    setSubjectLabel(searchInput.trim() || null)
    setSearchCoords(null)
  }

  function clearSubject() {
    setPinStarCoords(null)
    setSubjectLabel(null)
    setCompScores({})
    setSubjectProfile(null)
  }

  // Auto-suggest best comparables based on similarity scoring
  // geocodedMap: { [address]: { lat, lng } } from ComparablesMap
  async function autoSuggestComps(subjectCoords, geocodedMap) {
    if (!subjectCoords || history.length === 0) return

    setSuggestSteps([
      { id: 'scan',    label: 'Scanning database',          status: 'active',  detail: null },
      { id: 'subject', label: 'Building subject profile',   status: 'pending', detail: null },
      { id: 'score',   label: 'Scoring candidates',         status: 'pending', detail: null },
      { id: 'ai',      label: 'AI selecting best matches',  status: 'pending', detail: null },
    ])
    setError(null)

    try {
      // Kick off web research in parallel with DB scan (subject may not be in DB)
      const searchAddress = subjectLabel || 'Unknown address'
      const researchPromise = researchSubjectProperty(searchAddress).catch(() => null)

      // Group units by property
      const propMap = new Map()
      for (const unit of history) {
        if (!unit.property_address) continue
        if (!propMap.has(unit.property_address)) propMap.set(unit.property_address, [])
        propMap.get(unit.property_address).push(unit)
      }

      // Find the closest DB property to the pin
      let subjectAddress = null
      let minDist = Infinity
      for (const [address] of propMap) {
        const coords = geocodedMap?.[address]
        if (!coords) continue
        const d = distanceMiles(subjectCoords.lat, subjectCoords.lng, coords.lat, coords.lng)
        if (d < minDist) { minDist = d; subjectAddress = address }
      }

      updateSuggestStep('scan', { status: 'done', detail: `${propMap.size} properties in database` })

      // Build subject profile
      let profile
      if (subjectAddress && minDist < 0.3) {
        // Subject is in our DB — use its actual data
        updateSuggestStep('subject', { status: 'active', detail: `Found in database — loading…` })
        const dbProfile = buildPropertyProfile(propMap.get(subjectAddress))
        // If DB is missing key fields, supplement with web research
        const needsResearch = !dbProfile.yearBuilt || !dbProfile.storeys || !dbProfile.propertyType
        if (needsResearch) {
          const research = await researchPromise
          if (research) {
            const numUnits = research.num_units != null && research.num_units > 0 && research.num_units < 2000 ? research.num_units : null
            const yearBuilt = research.year_built != null && research.year_built > 1800 && research.year_built <= new Date().getFullYear() ? research.year_built : null
            profile = {
              unitCount: dbProfile.unitCount || numUnits || 0,
              storeys: dbProfile.storeys ?? research.num_storeys ?? null,
              yearBuilt: dbProfile.yearBuilt ?? yearBuilt,
              propertyType: dbProfile.propertyType ?? research.property_type ?? null,
              constructionFrame: dbProfile.constructionFrame ?? research.construction_frame ?? null,
              summary: research.summary ?? null,
              source: 'database+web',
              address: subjectAddress,
            }
          } else {
            profile = { ...dbProfile, source: 'database', address: subjectAddress }
          }
        } else {
          profile = { ...dbProfile, source: 'database', address: subjectAddress }
        }
        updateSuggestStep('subject', { status: 'done', detail: `Found in database · ${[profile.unitCount && `${profile.unitCount} units`, profile.storeys && `${profile.storeys} storeys`, profile.yearBuilt && `built ${profile.yearBuilt}`].filter(Boolean).join(' · ')}` })
      } else {
        // Subject NOT in our DB — use web research
        updateSuggestStep('subject', { status: 'active', detail: `Searching web for ${searchAddress.split(',')[0]}…` })
        const research = await researchPromise
        if (research) {
          const numUnits = research.num_units != null && research.num_units > 0 && research.num_units < 2000 ? research.num_units : null
          const yearBuilt = research.year_built != null && research.year_built > 1800 && research.year_built <= new Date().getFullYear() ? research.year_built : null
          profile = {
            unitCount: numUnits ?? 0,
            storeys: research.num_storeys ?? null,
            yearBuilt: yearBuilt,
            propertyType: research.property_type ?? null,
            constructionFrame: research.construction_frame ?? null,
            summary: research.summary ?? null,
            source: 'web_research',
            address: searchAddress,
          }
          const profileDetail = [
            profile.unitCount && `${profile.unitCount} units`,
            profile.storeys && `${profile.storeys} storeys`,
            profile.yearBuilt && `built ${profile.yearBuilt}`,
            profile.propertyType,
            profile.constructionFrame && `${profile.constructionFrame} frame`,
          ].filter(Boolean).join(' · ')
          updateSuggestStep('subject', { status: 'done', detail: profileDetail || 'Profile built from web research' })
        } else {
          // Fallback: empty profile for manual entry
          profile = {
            unitCount: 0,
            storeys: null,
            yearBuilt: null,
            propertyType: null,
            constructionFrame: null,
            summary: null,
            source: 'manual',
            address: searchAddress,
          }
          updateSuggestStep('subject', { status: 'done', detail: 'Scoring by proximity only' })
        }
      }

      setSubjectProfile(profile)

      // Phase 1: Numeric pre-filter — score all candidates, keep top 10
      updateSuggestStep('score', { status: 'active', detail: 'Evaluating proximity, age, size & type…' })
      const scored = []
      for (const [address, units] of propMap) {
        if (address === subjectAddress) continue
        const coords = geocodedMap?.[address]
        if (!coords) continue
        const dist = distanceMiles(subjectCoords.lat, subjectCoords.lng, coords.lat, coords.lng)
        if (dist > 15) continue
        const candidate = buildPropertyProfile(units)
        const { totalScore, breakdown } = scoreComparable(profile, candidate, dist)
        // Compute avg rent and sqft for AI context
        const ratedUnits = units.filter((u) => u.lease_rate != null)
        const sqftUnits = units.filter((u) => u.sqft != null)
        const avgRent = ratedUnits.length > 0 ? Math.round(ratedUnits.reduce((s, u) => s + Number(u.lease_rate), 0) / ratedUnits.length) : null
        const avgSqft = sqftUnits.length > 0 ? Math.round(sqftUnits.reduce((s, u) => s + Number(u.sqft), 0) / sqftUnits.length) : null
        scored.push({ address, totalScore, breakdown, dist, ...candidate, avgRent, avgSqft })
      }

      scored.sort((a, b) => a.totalScore - b.totalScore)
      const shortlist = scored.slice(0, 10)
      updateSuggestStep('score', { status: 'done', detail: `${scored.length} properties evaluated · ${shortlist.length} shortlisted` })

      // Phase 2: AI reasoning — Claude picks the best 5 from the 10 with explanations
      updateSuggestStep('ai', { status: 'active', detail: `Reviewing ${shortlist.length} candidates…` })
      let aiPicks = null
      try {
        const candidatesForAI = shortlist.map((s) => ({
          address: s.address,
          unitCount: s.unitCount,
          storeys: s.storeys,
          yearBuilt: s.yearBuilt,
          propertyType: s.propertyType,
          constructionFrame: s.constructionFrame,
          avgRent: s.avgRent,
          avgSqft: s.avgSqft,
          distance: Math.round(s.dist * 10) / 10,
        }))
        const result = await aiRankComps(profile, candidatesForAI)
        aiPicks = result.picks
        updateSuggestStep('ai', { status: 'done', detail: `${aiPicks.length} best matches selected` })
      } catch (aiErr) {
        console.warn('AI ranking failed, falling back to numeric scoring:', aiErr.message)
        updateSuggestStep('ai', { status: 'done', detail: 'Ranked by numeric scoring' })
      }

      // Build final selection
      const scoreMap = {}
      if (aiPicks?.length > 0) {
        // Use AI picks — map back to scored data for breakdown
        aiPicks.forEach((pick) => {
          const match = shortlist.find((s) => s.address === pick.address)
          if (!match) return
          scoreMap[pick.address] = {
            totalScore: match.totalScore,
            breakdown: match.breakdown,
            rank: pick.rank,
            dist: match.dist,
            aiReason: pick.reason,
            aiCaveat: pick.caveat,
            aiQuality: pick.match_quality,
          }
        })
        setCompScores(scoreMap)
        setSelectedAddresses(new Set(aiPicks.map((p) => p.address)))
      } else {
        // Fallback: use numeric top 5
        const top = shortlist.slice(0, 5)
        top.forEach((s, i) => {
          scoreMap[s.address] = { totalScore: s.totalScore, breakdown: s.breakdown, rank: i + 1, dist: s.dist }
        })
        setCompScores(scoreMap)
        setSelectedAddresses(new Set(top.map((s) => s.address)))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setTimeout(() => setSuggestSteps(null), 2000)
    }
  }

  function handleEditStart(unit) {
    setEditingId(unit.id)
    setEditingValues({
      unit_number: unit.unit_number ?? '',
      unit_type: unit.unit_type ?? '',
      beds: unit.beds ?? '',
      baths: unit.baths ?? '',
      sqft: unit.sqft ?? '',
      lease_rate: unit.lease_rate ?? '',
      move_in: unit.move_in ?? '',
      notes: unit.notes ?? '',
    })
  }

  function handleEditCancel() {
    setEditingId(null)
    setEditingValues({})
  }

  async function handleEditSave() {
    setSavingEdit(true)
    setError(null)
    try {
      const fields = {
        unit_number: editingValues.unit_number || null,
        unit_type: editingValues.unit_type || null,
        beds: editingValues.beds === '' ? null : String(editingValues.beds),
        baths: editingValues.baths === '' ? null : String(editingValues.baths),
        sqft: editingValues.sqft === '' ? null : Number(editingValues.sqft),
        lease_rate: editingValues.lease_rate === '' ? null : Number(editingValues.lease_rate),
        move_in: editingValues.move_in || null,
        notes: editingValues.notes || null,
      }
      const updated = await updateUnit(editingId, fields)
      setHistory((prev) => prev.map((u) => (u.id === editingId ? { ...u, ...updated } : u)))
      setEditingId(null)
      setEditingValues({})
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  // ── Edit Mode helpers ──────────────────────────────────────────────────────
  function toggleEditMode() {
    if (editMode) {
      // Exiting edit mode — clear state
      setEditModeValues({})
      setSelectedUnits(new Set())
      setBatchField('')
      setBatchValue('')
    }
    setEditMode((prev) => !prev)
    // Also clear single-row editing
    setEditingId(null)
    setEditingValues({})
  }

  function getEditValue(unit, field) {
    return editModeValues[unit.id]?.[field] ?? unit[field] ?? ''
  }

  function setEditField(unitId, field, value) {
    setEditModeValues((prev) => ({
      ...prev,
      [unitId]: { ...prev[unitId], [field]: value },
    }))
  }

  async function handleCellBlur(unit, field) {
    const changed = editModeValues[unit.id]
    if (!changed || !(field in changed)) return
    const newVal = changed[field]
    const oldVal = unit[field] ?? ''
    if (String(newVal) === String(oldVal)) return

    const fields = {}
    if (['beds', 'baths'].includes(field)) fields[field] = newVal === '' ? null : String(newVal)
    else if (['sqft', 'lease_rate'].includes(field)) fields[field] = newVal === '' ? null : Number(newVal)
    else fields[field] = newVal || null

    setSavingUnits((prev) => new Set(prev).add(unit.id))
    try {
      const updated = await updateUnit(unit.id, fields)
      setHistory((prev) => prev.map((u) => (u.id === unit.id ? { ...u, ...updated } : u)))
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingUnits((prev) => { const s = new Set(prev); s.delete(unit.id); return s })
    }
  }

  function toggleUnitSelection(unitId) {
    setSelectedUnits((prev) => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }

  function toggleSelectAll(unitIds) {
    setSelectedUnits((prev) => {
      const allSelected = unitIds.every((id) => prev.has(id))
      if (allSelected) return new Set()
      return new Set(unitIds)
    })
  }

  async function handleDeleteSelectedUnits() {
    const ids = [...selectedUnits]
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} unit${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setError(null)
    try {
      await deleteUnits(ids)
      setHistory((prev) => prev.filter((u) => !selectedUnits.has(u.id)))
      setSelectedUnits(new Set())
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleBatchApply(unitIds) {
    if (!batchField || batchValue === '') return
    setApplyingBatch(true)
    setError(null)
    try {
      const ids = unitIds.filter((id) => selectedUnits.has(id))
      for (const id of ids) {
        const fields = {}
        if (['beds', 'baths'].includes(batchField)) fields[batchField] = batchValue === '' ? null : String(batchValue)
        else if (['sqft', 'lease_rate'].includes(batchField)) fields[batchField] = batchValue === '' ? null : Number(batchValue)
        else if (batchField === 'move_in') fields[batchField] = batchValue || null
        else fields[batchField] = batchValue || null
        const updated = await updateUnit(id, fields)
        setHistory((prev) => prev.map((u) => (u.id === id ? { ...u, ...updated } : u)))
      }
      setSelectedUnits(new Set())
      setBatchField('')
      setBatchValue('')
    } catch (err) {
      setError(err.message)
    } finally {
      setApplyingBatch(false)
    }
  }

  const EDITABLE_FIELDS = [
    { key: 'unit_number', label: 'Unit' },
    { key: 'unit_type', label: 'Type' },
    { key: 'beds', label: 'Beds', type: 'number' },
    { key: 'baths', label: 'Baths', type: 'number' },
    { key: 'sqft', label: 'Sqft', type: 'number' },
    { key: 'lease_rate', label: 'Rent/mo', type: 'number' },
    { key: 'move_in', label: 'Move In', type: 'date' },
    { key: 'notes', label: 'Notes' },
  ]

  async function handleEnrichUnits(propertyId) {
    setEnriching(true)
    setEnrichResult(null)
    setError(null)
    try {
      const result = await enrichUnits(propertyId)
      // Update history with enriched unit data
      if (result.units?.length) {
        setHistory((prev) => {
          const enrichedMap = new Map(result.units.map((u) => [u.id, u]))
          return prev.map((u) => enrichedMap.has(u.id) ? { ...u, ...enrichedMap.get(u.id) } : u)
        })
      }
      setEnrichResult(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnriching(false)
    }
  }

  async function handleResearch(propertyId) {
    setResearching(true)
    setError(null)
    try {
      const result = await researchMarketData(propertyId)
      // Update propertyDetail with the new fields
      setPropertyDetail((prev) => prev ? {
        ...prev,
        building_amenities: result.building_amenities,
        utility_responsibility: result.utility_responsibility,
        market_incentives: result.market_incentives,
        market_research_at: new Date().toISOString(),
      } : prev)
    } catch (err) {
      setError(err.message)
    } finally {
      setResearching(false)
    }
  }

  async function handlePropertyUpload(address, docType, files) {
    setPropertyUploading(true)
    setPropertyUploadResult(null)
    setError(null)
    try {
      const results = await uploadFilesToS3(address, docType, Array.from(files))
      const succeeded = results.filter((r) => r.success).length
      const failed = results.filter((r) => !r.success).length
      setPropertyUploadResult({
        success: failed === 0,
        message: `${succeeded} file${succeeded !== 1 ? 's' : ''} uploaded${failed > 0 ? `, ${failed} failed` : ''}. Data extraction will run automatically in the background.`,
      })
    } catch (err) {
      setPropertyUploadResult({ success: false, message: err.message })
    } finally {
      setPropertyUploading(false)
    }
  }

  function handleRenameStart(propertyId, currentAddress) {
    setRenamingPropertyId(propertyId)
    setRenameValue(currentAddress || '')
  }

  async function handleRenameSave(propertyId) {
    if (!renameValue.trim()) return
    setSavingRename(true)
    setError(null)
    try {
      await renamePropertyAddress(propertyId, renameValue.trim())
      setHistory((prev) =>
        prev.map((u) => u.property_id === propertyId ? { ...u, property_address: renameValue.trim() } : u)
      )
      setRenamingPropertyId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingRename(false)
    }
  }

  async function handleDeleteProperty(propertyId) {
    setDeletingProperty(propertyId)
    try {
      await deleteProperty(propertyId)
      setHistory((prev) => prev.filter((u) => u.property_id !== propertyId))
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingProperty(null)
    }
  }

  useEffect(() => {
    if (view === 'history' || view === 'map') loadHistory()
  }, [view])

  useEffect(() => {
    localStorage.setItem('pareto_selected_addresses', JSON.stringify([...selectedAddresses]))
  }, [selectedAddresses])

  useEffect(() => {
    if (view === 'property' && selectedPropertyId) {
      setLoadingDetail(true)
      setPropertyUploadResult(null)
      setEnrichResult(null)
      fetchPropertyDetail(selectedPropertyId)
        .then((data) => {
          setPropertyDetail(data.property ?? null)
          setPropertyImages(data.images ?? [])
        })
        .catch(() => { setPropertyDetail(null); setPropertyImages([]) })
        .finally(() => setLoadingDetail(false))
    } else {
      setPropertyDetail(null)
      setPropertyImages([])
    }
  }, [view, selectedPropertyId])

  // ── Derived data ─────────────────────────────────────────────────────────

  const filteredHistory = history.filter((u) => {
    if (addressSearch && !u.property_address?.toLowerCase().includes(addressSearch.toLowerCase())) return false
    if (bedsFilter === '3+' && (u.beds == null || Number(u.beds) < 3)) return false
    if (bedsFilter && bedsFilter !== '3+' && String(Math.floor(u.beds)) !== bedsFilter) return false
    if (sqftMin !== '' && (u.sqft == null || Number(u.sqft) < Number(sqftMin))) return false
    if (sqftMax !== '' && (u.sqft == null || Number(u.sqft) > Number(sqftMax))) return false
    if (moveInFrom && (u.move_in == null || u.move_in < moveInFrom)) return false
    if (moveInTo && (u.move_in == null || u.move_in > moveInTo)) return false
    if (leaseRateMin !== '' && (u.lease_rate == null || Number(u.lease_rate) < Number(leaseRateMin))) return false
    if (leaseRateMax !== '' && (u.lease_rate == null || Number(u.lease_rate) > Number(leaseRateMax))) return false
    if (bathsFilter !== '' && String(Math.floor(u.baths)) !== bathsFilter) return false
    return true
  })

  const properties = groupByProperty(filteredHistory)
  const totalUnits = filteredHistory.length
  const occupiedUnits = filteredHistory.filter((u) => u.lease_rate != null).length
  const ratedUnits = filteredHistory.filter((u) => u.lease_rate != null)
  const avgRent = ratedUnits.length > 0
    ? ratedUnits.reduce((sum, u) => sum + Number(u.lease_rate), 0) / ratedUnits.length
    : null
  const totalProperties = new Set(history.map((u) => u.property_id)).size

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={`bg-background flex flex-col ${view === 'map' || view === 'comptable' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <PageHeader onBack={
        view === 'property'
          ? () => { navigate(-1); setSelectedProperty(null); setSelectedPropertyId(null) }
          : view !== 'map'
          ? () => navigate(BASE)
          : () => navigate('/comparable-analysis')
      } />

      {error && (
        <div className="px-8 pt-4 flex-shrink-0">
          <div className="max-w-6xl mx-auto p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm flex items-start justify-between gap-4">
            <span><strong>Error:</strong> {error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0 text-xs underline">Dismiss</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MAP VIEW
      ══════════════════════════════════════════════════════ */}
      {view === 'map' && (
        <div className="contents page-in">
          <div className="px-6 py-3 flex items-center gap-3 border-b border-border bg-white flex-shrink-0">
            <div ref={searchRef} className="flex-1 relative">
              <form onSubmit={handleSearchSubmit}>
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#aaa] z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
                  placeholder="Search address — your properties or any location..."
                  className="w-full pl-10 pr-10 py-2.5 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:border-primary"
                  autoComplete="off"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
                  {searchInput && (
                    <button type="button" onClick={clearSearch} className="w-6 h-6 flex items-center justify-center text-[#aaa] hover:text-[#555]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </form>

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                  {suggestions.some((s) => s.type === 'property') && (
                    <div>
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-[#999] uppercase tracking-wider bg-surface border-b border-border">
                        Your Properties
                      </div>
                      {suggestions.filter((s) => s.type === 'property').map((s) => (
                        <button
                          key={s.label}
                          onClick={() => handleSelectSuggestion(s)}
                          className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-primary/5 transition-colors border-b border-border last:border-0"
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                          </div>
                          <span className="text-sm text-primary truncate">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {suggestions.some((s) => s.type === 'location') && (
                    <div>
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-[#999] uppercase tracking-wider bg-surface border-b border-border">
                        Locations
                      </div>
                      {suggestions.filter((s) => s.type === 'location').map((s, i) => (
                        <button
                          key={`${s.label}-${i}`}
                          onClick={() => handleSelectSuggestion(s)}
                          className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-primary/5 transition-colors border-b border-border last:border-0"
                        >
                          <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <span className="text-sm text-[#555] truncate">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Set as Subject Property button */}
            <button
              type="button"
              onClick={pinCurrentAsSubject}
              disabled={!searchCoords}
              title={searchCoords ? 'Set as Subject Property' : 'Search an address first, then set it as the Subject Property'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors flex-shrink-0 ${
                searchCoords
                  ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 cursor-pointer'
                  : 'bg-surface border-border text-[#bbb] cursor-not-allowed'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Set as Subject
            </button>
            {/* Subject property chip — shown when star is pinned */}
            {pinStarCoords && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex-shrink-0">
                <svg className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                {subjectLabel && (
                  <span className="text-xs text-amber-800 font-medium max-w-[160px] truncate" title={subjectLabel}>{subjectLabel}</span>
                )}
                <button onClick={clearSubject} className="text-amber-400 hover:text-amber-700 transition-colors flex-shrink-0" title="Clear subject property">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <Button variant="primary" size="sm" onClick={() => setView('upload')}>
              + Add Property
            </Button>
          </div>
          <div className="flex-1 min-h-0 px-6 pb-4 pt-4">
            {loadingHistory ? (
              <div className="h-full rounded-xl bg-gray-100 animate-pulse" />
            ) : (
              <Suspense fallback={<div className="h-full rounded-xl bg-gray-100 animate-pulse" />}>
                <ComparablesMap
                  units={history}
                  searchCoords={searchCoords}
                  pinStarCoords={pinStarCoords}
                  onPinStarChange={(coords) => { setPinStarCoords(coords); setSubjectLabel(null) }}
                  highlightAddress={highlightAddress}
                  selectedAddresses={selectedAddresses}
                  onToggleSelect={(address) => {
                    setSelectedAddresses((prev) => {
                      const next = new Set(prev)
                      if (next.has(address)) next.delete(address)
                      else next.add(address)
                      return next
                    })
                  }}
                  onClearSelected={() => { setSelectedAddresses(new Set()); setCompScores({}); setSubjectProfile(null) }}
                  onOpenCompTable={() => setView('comptable')}
                  onSelectProperty={handleSelectProperty}
                  onAutoSuggest={(geocodedMap) => autoSuggestComps(pinStarCoords, geocodedMap)}
                  suggestSteps={suggestSteps}
                  compScores={compScores}
                  subjectProfile={subjectProfile}
                  onSubjectProfileChange={setSubjectProfile}
                  onRescore={(geocodedMap) => {
                    if (!subjectProfile || !pinStarCoords) return
                    // Re-run scoring with updated subject profile (no API call needed)
                    const propMap = new Map()
                    for (const unit of history) {
                      if (!unit.property_address) continue
                      if (!propMap.has(unit.property_address)) propMap.set(unit.property_address, [])
                      propMap.get(unit.property_address).push(unit)
                    }
                    const scored = []
                    for (const [address, units] of propMap) {
                      if (address === subjectProfile.address) continue
                      const coords = geocodedMap?.[address]
                      if (!coords) continue
                      const dist = distanceMiles(pinStarCoords.lat, pinStarCoords.lng, coords.lat, coords.lng)
                      if (dist > 15) continue
                      const candidate = buildPropertyProfile(units)
                      const { totalScore, breakdown } = scoreComparable(subjectProfile, candidate, dist)
                      scored.push({ address, totalScore, breakdown, dist })
                    }
                    scored.sort((a, b) => a.totalScore - b.totalScore)
                    const top = scored.slice(0, 8)
                    const scoreMap = {}
                    top.forEach((s, i) => { scoreMap[s.address] = { totalScore: s.totalScore, breakdown: s.breakdown, rank: i + 1, dist: s.dist } })
                    setCompScores(scoreMap)
                    setSelectedAddresses(new Set(top.map((s) => s.address)))
                  }}
                />
              </Suspense>
            )}
          </div>
        </div>
      )}

      {/* COMP TABLE VIEW */}
      {view === 'comptable' && (
        <div className="flex-1 min-h-0 page-in">
          <Suspense fallback={
            <div className="p-6 space-y-3">
              <div className="h-8 bg-gray-100 rounded-lg animate-pulse w-1/3" />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          }>
            <CompTable
              selectedAddresses={selectedAddresses}
              units={history}
              onSelectProperty={handleSelectProperty}
              pinStarCoords={pinStarCoords}
              subjectProfile={subjectProfile}
              compScores={compScores}
            />
          </Suspense>
        </div>
      )}

      {view !== 'map' && view !== 'comptable' && (
      <main className="flex-1 px-8 py-10 page-in">

        {/* ══════════════════════════════════════════════════════
            UPLOAD
        ══════════════════════════════════════════════════════ */}
        {view === 'upload' && (
          <div className="max-w-3xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-primary tracking-tight">Add Properties</h2>
              <p className="text-[#777777] mt-1 text-sm">
                Drop all your PDFs at once — appraisals and rent rolls for one or many properties.
              </p>
            </div>

            {/* Uploading progress */}
            {uploading && (
              <Card className="p-8 space-y-6">
                <div className="text-center">
                  <p className="text-primary font-semibold text-lg">Uploading to Cloud</p>
                  <p className="text-[#777777] text-sm mt-1">
                    Uploading {uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''} across {uploadGroups.length} propert{uploadGroups.length !== 1 ? 'ies' : 'y'}...
                  </p>
                </div>
                <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-2 rounded-full transition-all duration-500 animate-pulse" style={{ width: '60%' }} />
                </div>
                <div className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <p className="text-sm text-primary truncate">{uploadProgress || 'Uploading files to S3...'}</p>
                </div>
              </Card>
            )}

            {/* Upload complete */}
            {!uploading && uploadResults && (
              <Card className="p-8 space-y-6">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-primary font-semibold text-lg">Upload Complete</p>
                  {(() => {
                    const succeeded = uploadResults.filter((r) => r.success)
                    const failed = uploadResults.filter((r) => !r.success)
                    const addresses = [...new Set(uploadResults.map((r) => r.address))]
                    return (
                      <p className="text-[#777777] text-sm mt-1">
                        {succeeded.length} file{succeeded.length !== 1 ? 's' : ''} uploaded for {addresses.length} propert{addresses.length !== 1 ? 'ies' : 'y'}
                        {failed.length > 0 && <span className="text-error"> · {failed.length} failed</span>}
                      </p>
                    )
                  })()}
                  <p className="text-[#999] text-xs mt-3">
                    Data extraction runs automatically in the background. Check back in a few minutes to see results on the map.
                  </p>
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {uploadResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {r.success
                        ? <span className="text-green-500 font-bold flex-shrink-0">✓</span>
                        : <span className="text-error font-bold flex-shrink-0">✗</span>}
                      <span className="text-[#999] flex-shrink-0 w-16">{r.type}</span>
                      <span className="text-[#555555] truncate flex-1" title={r.address}>{r.file}</span>
                      {!r.success && <span className="text-error flex-shrink-0 truncate max-w-[160px]">{r.error}</span>}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button variant="primary" onClick={handleUploadDone}>
                    Done
                  </Button>
                </div>
              </Card>
            )}

            {/* Upload form */}
            {!uploading && !uploadResults && (
              <div className="space-y-5">
                {/* Naming convention info */}
                <Card className="p-4 bg-blue-50/60 border-blue-200">
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-xs text-blue-900 space-y-1.5">
                      <p className="font-semibold text-sm text-blue-800">File naming convention</p>
                      <p>Name your PDF files using this format so the system can detect the address and document type automatically:</p>
                      <div className="bg-white/70 rounded-md px-3 py-2 font-mono text-[11px] space-y-1 border border-blue-200">
                        <p><span className="text-blue-600">Appraisal:</span> Address, City, Province - Appraisal.pdf</p>
                        <p><span className="text-blue-600">Rent Roll:</span> Address, City, Province - Rent-Roll.pdf</p>
                      </div>
                      <p className="text-blue-700">
                        Example: <span className="font-medium">388 Albert Street, Ottawa, ON - Appraisal.pdf</span>
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Dropzone */}
                <Card className="p-6">
                  <UploadDropzone files={uploadFiles} onAdd={handleAddFiles} onRemove={handleRemoveFile} />
                </Card>

                {/* Grouped preview */}
                {(uploadGroups.length > 0 || uploadUnrecognised.length > 0) && (
                  <Card className="p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Detected {uploadGroups.length} propert{uploadGroups.length !== 1 ? 'ies' : 'y'}
                    </h3>

                    <div className="space-y-3">
                      {uploadGroups.map((g) => (
                        <div key={g.address} className={`rounded-lg border overflow-hidden ${uploadDuplicates[g.address]?.duplicates?.length > 0 && !uploadDuplicates[g.address]?.dismissed ? 'border-amber-300' : 'border-border'}`}>
                          <div className="px-4 py-2.5 bg-surface flex items-center gap-2">
                            <svg className="w-3.5 h-3.5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-xs font-semibold text-primary truncate">{g.address}</span>
                          </div>
                          {/* Duplicate warning */}
                          {uploadDuplicates[g.address]?.duplicates?.length > 0 && !uploadDuplicates[g.address]?.dismissed && (
                            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
                              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                              <div className="flex-1">
                                <p className="text-[11px] font-semibold text-amber-800">Possible duplicate</p>
                                <p className="text-[10px] text-amber-700 mt-0.5">
                                  Similar to existing: {uploadDuplicates[g.address].duplicates.map((d) => d.address).join(', ')}
                                </p>
                                <p className="text-[10px] text-amber-600 mt-0.5">Uploading will merge new data into the existing property.</p>
                              </div>
                              <button
                                onClick={() => setUploadDuplicates((prev) => ({ ...prev, [g.address]: { ...prev[g.address], dismissed: true } }))}
                                className="text-[10px] text-amber-600 hover:text-amber-800 font-medium flex-shrink-0"
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                          <div className="px-4 py-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#555]">
                            {g.appraisal.length > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-blue-400" />
                                {g.appraisal.length} appraisal{g.appraisal.length !== 1 ? 's' : ''}
                              </span>
                            )}
                            {g.rentroll.length > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                {g.rentroll.length} rent roll{g.rentroll.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {uploadUnrecognised.length > 0 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                        <p className="text-xs font-semibold text-amber-800 mb-1.5">
                          {uploadUnrecognised.length} file{uploadUnrecognised.length !== 1 ? 's' : ''} could not be matched
                        </p>
                        <p className="text-[11px] text-amber-700 mb-2">
                          These files don't follow the naming convention and will be skipped.
                        </p>
                        <div className="space-y-1">
                          {uploadUnrecognised.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px] text-amber-800">
                              <span className="text-amber-500">!</span>
                              <span className="truncate">{f.name}</span>
                              <button onClick={() => handleRemoveFile(f)} className="ml-auto text-amber-500 hover:text-error flex-shrink-0">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-[#777777]">
                    {uploadFiles.length === 0 ? 'No files selected' :
                      `${uploadFiles.length} file${uploadFiles.length !== 1 ? 's' : ''} · ${uploadGroups.length} propert${uploadGroups.length !== 1 ? 'ies' : 'y'}`
                    }
                    {uploadUnrecognised.length > 0 && <span className="text-amber-600"> · {uploadUnrecognised.length} unmatched</span>}
                  </p>
                  <Button
                    variant="primary"
                    size="md"
                    disabled={uploadGroups.length === 0}
                    onClick={handleUpload}
                  >
                    Upload {uploadGroups.length > 0 ? `${uploadGroups.length} Propert${uploadGroups.length !== 1 ? 'ies' : 'y'}` : 'to Cloud'}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            HISTORY VIEW
        ══════════════════════════════════════════════════════ */}
        {view === 'history' && (
          <div className="max-w-7xl mx-auto">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-primary tracking-tight">Rent Comparables Database</h2>
                <p className="text-[#777777] mt-1 text-sm">All uploaded rent roll data across properties.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex rounded border border-border overflow-hidden text-xs">
                  {[['list', 'List'], ['map', 'Map']].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setHistoryView(val)}
                      className={`px-3 py-1.5 transition-colors ${historyView === val ? 'bg-primary text-white' : 'bg-white text-[#555555] hover:bg-surface'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {historyView === 'list' && (
                  <button
                    onClick={toggleEditMode}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors ${editMode ? 'bg-primary text-white' : 'border border-border text-[#555555] hover:bg-surface'}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {editMode ? 'Done Editing' : 'Edit Mode'}
                  </button>
                )}
                <Button variant="primary" size="sm" onClick={() => setView('upload')}>
                  + Upload New
                </Button>
              </div>
            </div>

            {/* Stats */}
            {history.length > 0 && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Total Units', value: totalUnits },
                  { label: 'Avg Rent / mo', value: avgRent != null ? fmtCurrency(avgRent) : '—' },
                  { label: 'Occupied', value: totalUnits > 0 ? `${Math.round((occupiedUnits / totalUnits) * 100)}%` : '—' },
                  { label: 'Properties', value: totalProperties },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border border-border rounded-sm px-5 py-4">
                    <p className="text-xs text-[#777777] uppercase tracking-wider font-medium">{label}</p>
                    <p className="text-2xl font-bold text-primary mt-1">{value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Filters */}
            {(() => {
              const activeFilters = [addressSearch, bedsFilter, sqftMin, sqftMax, moveInFrom, moveInTo, leaseRateMin, leaseRateMax, bathsFilter].some(Boolean)
              return (
                <div className="mb-6 space-y-2">
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Address</label>
                      <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#777777]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          className="w-56 pl-9 pr-4 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary"
                          placeholder="Search address..."
                          value={addressSearch}
                          onChange={(e) => setAddressSearch(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Beds</label>
                      <select className="text-sm border border-border rounded-sm px-3 py-2 bg-white focus:outline-none focus:border-primary text-[#555555]" value={bedsFilter} onChange={(e) => setBedsFilter(e.target.value)}>
                        <option value="">All</option><option value="0">Studio</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="3+">3+</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Baths</label>
                      <select className="text-sm border border-border rounded-sm px-3 py-2 bg-white focus:outline-none focus:border-primary text-[#555555]" value={bathsFilter} onChange={(e) => setBathsFilter(e.target.value)}>
                        <option value="">All</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Unit Size (sqft)</label>
                      <div className="flex items-center gap-1.5">
                        <input type="number" className="w-24 px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary" placeholder="Min" value={sqftMin} onChange={(e) => setSqftMin(e.target.value)} />
                        <span className="text-[#aaaaaa] text-sm">–</span>
                        <input type="number" className="w-24 px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary" placeholder="Max" value={sqftMax} onChange={(e) => setSqftMax(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Lease Rate ($/mo)</label>
                      <div className="flex items-center gap-1.5">
                        <input type="number" className="w-24 px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary" placeholder="Min" value={leaseRateMin} onChange={(e) => setLeaseRateMin(e.target.value)} />
                        <span className="text-[#aaaaaa] text-sm">–</span>
                        <input type="number" className="w-24 px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary" placeholder="Max" value={leaseRateMax} onChange={(e) => setLeaseRateMax(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#777777] font-medium uppercase tracking-wider">Move-In Date</label>
                      <div className="flex items-center gap-1.5">
                        <input type="date" className="px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary text-[#555555]" value={moveInFrom} onChange={(e) => setMoveInFrom(e.target.value)} />
                        <span className="text-[#aaaaaa] text-sm">–</span>
                        <input type="date" className="px-3 py-2 text-sm border border-border rounded-sm bg-white focus:outline-none focus:border-primary text-[#555555]" value={moveInTo} onChange={(e) => setMoveInTo(e.target.value)} />
                      </div>
                    </div>
                    {activeFilters && (
                      <button
                        className="py-2 px-3 text-xs text-[#777777] hover:text-primary underline transition-colors self-end mb-0.5"
                        onClick={() => { setAddressSearch(''); setBedsFilter(''); setBathsFilter(''); setSqftMin(''); setSqftMax(''); setMoveInFrom(''); setMoveInTo(''); setLeaseRateMin(''); setLeaseRateMax('') }}
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  {activeFilters && (
                    <p className="text-xs text-[#777777]">
                      Showing {filteredHistory.length} of {history.length} unit{history.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Map view */}
            {historyView === 'map' && !loadingHistory && (
              <Suspense fallback={<div className="flex items-center justify-center h-64 gap-3"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-[#777777] text-sm">Loading map...</span></div>}>
                <ComparablesMap
                  units={filteredHistory}
                  onSelectProperty={handleSelectProperty}
                />
              </Suspense>
            )}

            {/* List view */}
            {historyView === 'list' && (loadingHistory ? (
              <div className="flex items-center justify-center py-24 gap-3">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-[#777777] text-sm">Loading database...</span>
              </div>
            ) : properties.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-[#777777] text-sm">
                  {history.length === 0 ? 'No properties uploaded yet.' : 'No results match your filters.'}
                </p>
                {history.length === 0 && (
                  <Button variant="primary" size="sm" className="mt-4" onClick={() => setView('upload')}>
                    Upload Your First Property
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {properties.map((prop) => {
                  const isExpanded = expandedProperties.has(prop.property_id)
                  const addressLabel = prop.property_address || prop.source_file || 'Unknown'

                  return (
                  <Card key={prop.property_id} className="overflow-hidden">
                    <div
                      className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border cursor-pointer select-none hover:bg-border/30 transition-colors"
                      onClick={() => {
                        if (renamingPropertyId === prop.property_id) return
                        setExpandedProperties((prev) => {
                          const next = new Set(prev)
                          next.has(prop.property_id) ? next.delete(prop.property_id) : next.add(prop.property_id)
                          return next
                        })
                      }}
                    >
                      <div className="flex items-center gap-2 text-xs text-[#777777] min-w-0">
                        <svg
                          className={`w-3.5 h-3.5 flex-shrink-0 text-[#777777] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>

                        {renamingPropertyId === prop.property_id ? (
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              className="text-sm font-medium px-2 py-0.5 border border-primary rounded bg-white focus:outline-none w-64"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSave(prop.property_id)
                                if (e.key === 'Escape') setRenamingPropertyId(null)
                              }}
                            />
                            <button onClick={() => handleRenameSave(prop.property_id)} disabled={savingRename} className="text-xs px-2 py-0.5 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">{savingRename ? '…' : 'Save'}</button>
                            <button onClick={() => setRenamingPropertyId(null)} className="text-xs text-[#777777] hover:text-primary">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium text-primary text-sm truncate">{addressLabel}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRenameStart(prop.property_id, prop.property_address || '') }}
                              className="text-[#aaaaaa] hover:text-primary transition-colors flex-shrink-0"
                              title="Rename property"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </div>
                        )}

                        <span className="flex-shrink-0">·</span>
                        <span className="flex-shrink-0">{prop.units.length} unit{prop.units.length !== 1 ? 's' : ''}</span>
                        {prop.property_type && <>
                          <span className="flex-shrink-0">·</span>
                          <span className="flex-shrink-0 text-[#999]">{prop.property_type}</span>
                        </>}
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDeleteProperty(prop.property_id)}
                          disabled={deletingProperty === prop.property_id}
                          className="flex items-center gap-1.5 text-xs text-[#777777] hover:text-error transition-colors disabled:opacity-40"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          {deletingProperty === prop.property_id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {isExpanded && <div className="overflow-x-auto">
                      {/* Batch edit bar for this property in list view */}
                      {editMode && selectedUnits.size > 0 && prop.units.some((u) => selectedUnits.has(u.id)) && (
                        <div className="flex items-center gap-3 bg-blue-50 border-b border-blue-200 px-4 py-2">
                          <span className="text-xs font-medium text-blue-700">{prop.units.filter((u) => selectedUnits.has(u.id)).length} selected</span>
                          <select value={batchField} onChange={(e) => { setBatchField(e.target.value); setBatchValue('') }} className="text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary">
                            <option value="">Set field…</option>
                            {EDITABLE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                          {batchField && <input type={EDITABLE_FIELDS.find((f) => f.key === batchField)?.type || 'text'} value={batchValue} onChange={(e) => setBatchValue(e.target.value)} placeholder={`New ${EDITABLE_FIELDS.find((f) => f.key === batchField)?.label ?? ''}`} className="text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary w-28" />}
                          <button onClick={() => handleBatchApply(prop.units.map((u) => u.id))} disabled={!batchField || batchValue === '' || applyingBatch} className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-40">{applyingBatch ? '…' : 'Apply'}</button>
                          <div className="h-4 w-px bg-blue-200 ml-1" />
                          <button onClick={handleDeleteSelectedUnits} className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors">Delete</button>
                        </div>
                      )}
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            {editMode && (
                              <th className="px-3 py-2.5 w-8">
                                <input type="checkbox" checked={prop.units.every((u) => selectedUnits.has(u.id))} onChange={() => toggleSelectAll(prop.units.map((u) => u.id))} className="rounded border-border" />
                              </th>
                            )}
                            {['Unit', 'Type', 'Beds', 'Baths', 'Sqft', 'Rent/mo', '$/Sqft', 'Move In', ...(editMode ? [] : [''])].map((col) => (
                              <th key={col} className="text-left px-4 py-2.5 text-xs font-semibold text-[#777777] uppercase tracking-wider whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {prop.units.map((unit) => {
                            const isSaving = savingUnits.has(unit.id)
                            if (editMode) {
                              return (
                                <tr key={unit.id} className={`border-b border-border last:border-0 ${selectedUnits.has(unit.id) ? 'bg-blue-50' : ''}`}>
                                  <td className="px-3 py-2 w-8"><input type="checkbox" checked={selectedUnits.has(unit.id)} onChange={() => toggleUnitSelection(unit.id)} className="rounded border-border" /></td>
                                  <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'unit_number')} onChange={(v) => setEditField(unit.id, 'unit_number', v)} onBlur={() => handleCellBlur(unit, 'unit_number')} width="w-14" saving={isSaving} /></td>
                                  <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'unit_type')} onChange={(v) => setEditField(unit.id, 'unit_type', v)} onBlur={() => handleCellBlur(unit, 'unit_type')} width="w-24" saving={isSaving} /></td>
                                  <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'beds')} onChange={(v) => setEditField(unit.id, 'beds', v)} onBlur={() => handleCellBlur(unit, 'beds')} type="number" width="w-14" saving={isSaving} /></td>
                                  <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'baths')} onChange={(v) => setEditField(unit.id, 'baths', v)} onBlur={() => handleCellBlur(unit, 'baths')} type="number" width="w-14" saving={isSaving} /></td>
                                  <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'sqft')} onChange={(v) => setEditField(unit.id, 'sqft', v)} onBlur={() => handleCellBlur(unit, 'sqft')} type="number" width="w-16" saving={isSaving} /></td>
                                  <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'lease_rate')} onChange={(v) => setEditField(unit.id, 'lease_rate', v)} onBlur={() => handleCellBlur(unit, 'lease_rate')} type="number" width="w-20" saving={isSaving} /></td>
                                  <td className="px-2 py-1.5"><span className="text-xs text-[#999] whitespace-nowrap">{fmtPsf(editModeValues[unit.id]?.lease_rate ?? unit.lease_rate, editModeValues[unit.id]?.sqft ?? unit.sqft)}</span></td>
                                  <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'move_in')} onChange={(v) => setEditField(unit.id, 'move_in', v)} onBlur={() => handleCellBlur(unit, 'move_in')} type="date" width="w-32" saving={isSaving} /></td>
                                </tr>
                              )
                            }
                            const isEditing = editingId === unit.id
                            const ev = editingValues
                            return (
                              <tr key={unit.id} className={`border-b border-border last:border-0 ${isEditing ? 'bg-blue-50' : ''}`}>
                                <td className="px-2 py-2">{isEditing ? <input className="w-14 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.unit_number} onChange={(e) => setEditingValues((v) => ({ ...v, unit_number: e.target.value }))} /> : <span className="px-2 text-xs font-medium text-primary whitespace-nowrap">{unit.unit_number ?? '—'}</span>}</td>
                                <td className="px-2 py-2">{isEditing ? <input className="w-24 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.unit_type} onChange={(e) => setEditingValues((v) => ({ ...v, unit_type: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555] whitespace-nowrap">{unit.unit_type ?? '—'}</span>}</td>
                                <td className="px-2 py-2">{isEditing ? <input type="number" className="w-12 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.beds} onChange={(e) => setEditingValues((v) => ({ ...v, beds: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555]">{unit.beds ?? '—'}</span>}</td>
                                <td className="px-2 py-2">{isEditing ? <input type="number" className="w-12 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.baths} onChange={(e) => setEditingValues((v) => ({ ...v, baths: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555]">{unit.baths ?? '—'}</span>}</td>
                                <td className="px-2 py-2">{isEditing ? <input type="number" className="w-16 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.sqft} onChange={(e) => setEditingValues((v) => ({ ...v, sqft: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555]">{unit.sqft ?? '—'}</span>}</td>
                                <td className="px-2 py-2">{isEditing ? <input type="number" className="w-20 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.lease_rate} onChange={(e) => setEditingValues((v) => ({ ...v, lease_rate: e.target.value }))} /> : <span className="px-2 text-xs font-semibold text-primary whitespace-nowrap">{fmtCurrency(unit.lease_rate)}</span>}</td>
                                <td className="px-2 py-2"><span className="px-2 text-xs text-[#999] whitespace-nowrap">{fmtPsf(unit.lease_rate, unit.sqft)}</span></td>
                                <td className="px-2 py-2">{isEditing ? <input type="date" className="w-32 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.move_in} onChange={(e) => setEditingValues((v) => ({ ...v, move_in: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555] whitespace-nowrap">{fmtDate(unit.move_in) ?? '—'}</span>}</td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {isEditing ? (
                                    <div className="flex items-center gap-2">
                                      <button onClick={handleEditSave} disabled={savingEdit} className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">{savingEdit ? '…' : 'Save'}</button>
                                      <button onClick={handleEditCancel} disabled={savingEdit} className="text-xs px-2.5 py-1 rounded border border-border text-[#555555] hover:bg-surface">Cancel</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => handleEditStart(unit)} className="text-xs text-[#777777] hover:text-primary transition-colors px-1" title="Edit row">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>}
                  </Card>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            PROPERTY DETAIL VIEW
        ══════════════════════════════════════════════════════ */}
        {view === 'property' && selectedProperty && (() => {
          const propertyUnits = history.filter((u) => u.property_address === selectedProperty)
          const occupied = propertyUnits.filter((u) => u.lease_rate != null)
          const propAvgRent = occupied.length > 0
            ? occupied.reduce((s, u) => s + Number(u.lease_rate), 0) / occupied.length
            : null
          const bedGroups = [...new Set(propertyUnits.map((u) => u.beds).filter((b) => b != null))].sort((a, b) => a - b)

          return (
            <div className="max-w-7xl mx-auto">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-primary tracking-tight">{selectedProperty}</h2>
                  <p className="text-[#777777] mt-0.5 text-sm">{propertyUnits.length} unit{propertyUnits.length !== 1 ? 's' : ''}</p>
                </div>
                {selectedPropertyId && (
                  <button
                    onClick={() => {
                      if (!confirm('Delete this property and all its units? This cannot be undone.')) return
                      handleDeleteProperty(selectedPropertyId).then(() => {
                        setView('map')
                        setSelectedProperty(null)
                        setSelectedPropertyId(null)
                      })
                    }}
                    disabled={deletingProperty === selectedPropertyId}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {deletingProperty === selectedPropertyId ? 'Deleting…' : 'Delete Property'}
                  </button>
                )}
              </div>

              {/* Upload documents for this property */}
              <Card className="mb-6 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-[#777]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-primary">Upload Documents</p>
                      <p className="text-xs text-[#999] mt-0.5">Upload an appraisal or rent roll to enrich this property's data</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer ${propertyUploading ? 'opacity-40 pointer-events-none' : ''}`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 0h0m6 0h0M9 12V9m0 3v3m3-6V6m0 3V6m0 3h3m-3 0H9" />
                      </svg>
                      Appraisal
                      <input
                        type="file"
                        accept=".pdf"
                        multiple
                        className="hidden"
                        onChange={(e) => { if (e.target.files.length) handlePropertyUpload(selectedProperty, 'appraisal', e.target.files); e.target.value = '' }}
                      />
                    </label>
                    <label className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer ${propertyUploading ? 'opacity-40 pointer-events-none' : ''}`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 0h0m6 0h0M9 12V9m0 3v3m3-6V6m0 3V6m0 3h3m-3 0H9" />
                      </svg>
                      Rent Roll
                      <input
                        type="file"
                        accept=".pdf"
                        multiple
                        className="hidden"
                        onChange={(e) => { if (e.target.files.length) handlePropertyUpload(selectedProperty, 'rentroll', e.target.files); e.target.value = '' }}
                      />
                    </label>
                  </div>
                </div>
                {propertyUploading && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-primary">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Uploading…
                  </div>
                )}
                {propertyUploadResult && (
                  <div className={`mt-3 text-xs px-3 py-2 rounded ${propertyUploadResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {propertyUploadResult.message}
                  </div>
                )}
              </Card>

              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Total Units', value: propertyUnits.length },
                  { label: 'Occupied', value: occupied.length },
                  { label: 'Vacancy Rate', value: propertyUnits.length > 0 ? `${Math.round(((propertyUnits.length - occupied.length) / propertyUnits.length) * 100)}%` : '—' },
                  { label: 'Avg Rent / mo', value: propAvgRent != null ? fmtCurrency(propAvgRent) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border border-border rounded-sm px-5 py-4">
                    <p className="text-xs text-[#777777] uppercase tracking-wider font-medium">{label}</p>
                    <p className="text-2xl font-bold text-primary mt-1">{value}</p>
                  </div>
                ))}
              </div>

              {/* Market Research */}
              {propertyDetail?.market_research_at ? (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Market Research
                    </h3>
                    <button
                      onClick={() => handleResearch(selectedPropertyId)}
                      disabled={researching}
                      className="flex items-center gap-1 text-[10px] text-[#999] hover:text-primary transition-colors disabled:opacity-40"
                      title="Re-run market research"
                    >
                      <svg className={`w-3 h-3 ${researching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {researching ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Building Amenities', value: propertyDetail.building_amenities, icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
                      { label: 'Utility Responsibility', value: propertyDetail.utility_responsibility, icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                      { label: 'Market Incentives', value: propertyDetail.market_incentives, icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                    ].map(({ label, value, icon }) => (
                      <Card key={label} className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                          </svg>
                          <p className="text-xs font-semibold text-primary uppercase tracking-wider">{label}</p>
                        </div>
                        <p className="text-xs text-[#555] leading-relaxed">{value || '—'}</p>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : selectedPropertyId && (
                <Card className="mb-6 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-primary">Market Research</p>
                    <p className="text-xs text-[#999] mt-0.5">Search the web for building amenities, utility responsibility, and market incentives</p>
                  </div>
                  <button
                    onClick={() => handleResearch(selectedPropertyId)}
                    disabled={researching}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border text-[#555] hover:bg-surface transition-colors disabled:opacity-40"
                  >
                    {researching ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Researching…
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Research Market Data
                      </>
                    )}
                  </button>
                </Card>
              )}

              {bedGroups.length > 0 && (
                <div className="flex gap-3 mb-6 flex-wrap">
                  {bedGroups.map((beds) => {
                    const groupUnits = propertyUnits.filter((u) => Number(u.beds) === Number(beds))
                    const groupOccupied = groupUnits.filter((u) => u.lease_rate != null)
                    const groupAvg = groupOccupied.length > 0
                      ? groupOccupied.reduce((s, u) => s + Number(u.lease_rate), 0) / groupOccupied.length
                      : null
                    return (
                      <div key={beds} className="bg-white border border-border rounded-sm px-4 py-3 flex items-center gap-4">
                        <p className="text-sm font-semibold text-primary">{beds === 0 || beds === '0' ? 'Studio' : `${beds} Bed`}</p>
                        <div className="h-4 w-px bg-border" />
                        <p className="text-xs text-[#777777]">{groupUnits.length} units</p>
                        {groupAvg != null && (
                          <>
                            <div className="h-4 w-px bg-border" />
                            <p className="text-xs text-[#777777]">avg {fmtCurrency(groupAvg)}/mo</p>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Map + Street View */}
              <div className="mb-6">
                <Suspense fallback={<div className="h-[260px] rounded-xl bg-surface border border-border flex items-center justify-center text-xs text-[#999]">Loading map…</div>}>
                  <PropertyMap address={selectedProperty} previewImageUrl={propertyImages.find((img) => img.is_preview)?.url ?? null} />
                </Suspense>
              </div>

              {/* Property Details */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Property Details
                </h3>
                {loadingDetail ? (
                  <div className="flex items-center gap-3 py-8 justify-center">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-[#777]">Loading property details...</span>
                  </div>
                ) : propertyDetail ? (
                  <PropertyDetailsPanel detail={propertyDetail} />
                ) : (
                  <Card className="px-4 py-6 text-center">
                    <p className="text-xs text-[#999]">No property-level details available. Upload an appraisal document to populate this section.</p>
                  </Card>
                )}
              </div>

              {/* Property Images */}
              {selectedPropertyId && (
                <div className="mb-6">
                  <PropertyImageGallery
                    propertyId={selectedPropertyId}
                    images={propertyImages}
                    onImagesChange={setPropertyImages}
                  />
                </div>
              )}

              {/* Units */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  Units ({propertyUnits.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleEditMode}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors ${editMode ? 'bg-primary text-white' : 'border border-border text-[#555555] hover:bg-surface'}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {editMode ? 'Done Editing' : 'Edit Mode'}
                  </button>
                  {selectedPropertyId && propertyUnits.some((u) => u.sqft == null || u.baths == null) && (
                    <button
                      onClick={() => handleEnrichUnits(selectedPropertyId)}
                      disabled={enriching}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40"
                    >
                      {enriching ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          Enriching…
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Fill Missing Data
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              {enrichResult && (
                <div className={`mb-3 text-xs px-3 py-2 rounded ${enrichResult.enriched > 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-[#777] border border-border'}`}>
                  {enrichResult.enriched > 0
                    ? `Filled ${enrichResult.enriched} unit${enrichResult.enriched !== 1 ? 's' : ''} (${enrichResult.fromAppraisal} from appraisal, ${enrichResult.fromWeb} from web search)`
                    : enrichResult.message || 'No missing data to fill.'
                  }
                </div>
              )}

              {/* Batch edit bar */}
              {editMode && selectedUnits.size > 0 && (
                <div className="mb-3 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded px-4 py-2.5">
                  <span className="text-xs font-medium text-blue-700">{selectedUnits.size} unit{selectedUnits.size !== 1 ? 's' : ''} selected</span>
                  <div className="h-4 w-px bg-blue-200" />
                  <select
                    value={batchField}
                    onChange={(e) => { setBatchField(e.target.value); setBatchValue('') }}
                    className="text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary"
                  >
                    <option value="">Set field…</option>
                    {EDITABLE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  {batchField && (
                    <input
                      type={EDITABLE_FIELDS.find((f) => f.key === batchField)?.type || 'text'}
                      value={batchValue}
                      onChange={(e) => setBatchValue(e.target.value)}
                      placeholder={`New ${EDITABLE_FIELDS.find((f) => f.key === batchField)?.label ?? ''}`}
                      className="text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary w-32"
                    />
                  )}
                  <button
                    onClick={() => handleBatchApply(propertyUnits.map((u) => u.id))}
                    disabled={!batchField || batchValue === '' || applyingBatch}
                    className="text-xs px-3 py-1 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-40"
                  >
                    {applyingBatch ? 'Applying…' : 'Apply'}
                  </button>
                  <div className="h-4 w-px bg-blue-200 ml-1" />
                  <button
                    onClick={handleDeleteSelectedUnits}
                    className="text-xs px-3 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => { setSelectedUnits(new Set()); setBatchField(''); setBatchValue('') }}
                    className="text-xs text-[#777] hover:text-primary ml-auto"
                  >
                    Clear
                  </button>
                </div>
              )}

              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        {editMode && (
                          <th className="px-3 py-2.5 w-8">
                            <input
                              type="checkbox"
                              checked={propertyUnits.length > 0 && propertyUnits.every((u) => selectedUnits.has(u.id))}
                              onChange={() => toggleSelectAll(propertyUnits.map((u) => u.id))}
                              className="rounded border-border"
                            />
                          </th>
                        )}
                        {['Unit', 'Type', 'Beds', 'Baths', 'Sqft', 'Rent/mo', '$/Sqft', 'Move In', 'Notes', 'Source', ...(editMode ? [] : [''])].map((col) => (
                          <th key={col} className="text-left px-4 py-2.5 text-xs font-semibold text-[#777777] uppercase tracking-wider whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {propertyUnits.map((unit) => {
                        const isSaving = savingUnits.has(unit.id)
                        if (editMode) {
                          return (
                            <tr key={unit.id} className={`border-b border-border last:border-0 ${selectedUnits.has(unit.id) ? 'bg-blue-50' : ''}`}>
                              <td className="px-3 py-2 w-8">
                                <input type="checkbox" checked={selectedUnits.has(unit.id)} onChange={() => toggleUnitSelection(unit.id)} className="rounded border-border" />
                              </td>
                              <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'unit_number')} onChange={(v) => setEditField(unit.id, 'unit_number', v)} onBlur={() => handleCellBlur(unit, 'unit_number')} width="w-14" saving={isSaving} /></td>
                              <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'unit_type')} onChange={(v) => setEditField(unit.id, 'unit_type', v)} onBlur={() => handleCellBlur(unit, 'unit_type')} width="w-24" saving={isSaving} /></td>
                              <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'beds')} onChange={(v) => setEditField(unit.id, 'beds', v)} onBlur={() => handleCellBlur(unit, 'beds')} type="number" width="w-14" saving={isSaving} /></td>
                              <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'baths')} onChange={(v) => setEditField(unit.id, 'baths', v)} onBlur={() => handleCellBlur(unit, 'baths')} type="number" width="w-14" saving={isSaving} /></td>
                              <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'sqft')} onChange={(v) => setEditField(unit.id, 'sqft', v)} onBlur={() => handleCellBlur(unit, 'sqft')} type="number" width="w-16" saving={isSaving} /></td>
                              <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'lease_rate')} onChange={(v) => setEditField(unit.id, 'lease_rate', v)} onBlur={() => handleCellBlur(unit, 'lease_rate')} type="number" width="w-20" saving={isSaving} /></td>
                              <td className="px-2 py-1.5"><span className="text-xs text-[#999] whitespace-nowrap">{fmtPsf(editModeValues[unit.id]?.lease_rate ?? unit.lease_rate, editModeValues[unit.id]?.sqft ?? unit.sqft)}</span></td>
                              <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'move_in')} onChange={(v) => setEditField(unit.id, 'move_in', v)} onBlur={() => handleCellBlur(unit, 'move_in')} type="date" width="w-32" saving={isSaving} /></td>
                              <td className="px-2 py-1.5"><EditableCell value={getEditValue(unit, 'notes')} onChange={(v) => setEditField(unit.id, 'notes', v)} onBlur={() => handleCellBlur(unit, 'notes')} width="w-40" saving={isSaving} /></td>
                              <td className="px-4 py-2 text-xs text-[#999] whitespace-nowrap max-w-[160px] truncate" title={unit.source_file}>{unit.source_file ?? '—'}</td>
                            </tr>
                          )
                        }
                        const isEditing = editingId === unit.id
                        const ev = editingValues
                        return (
                          <tr key={unit.id} className={`border-b border-border last:border-0 ${isEditing ? 'bg-blue-50' : ''}`}>
                            <td className="px-2 py-2">{isEditing ? <input className="w-14 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.unit_number} onChange={(e) => setEditingValues((v) => ({ ...v, unit_number: e.target.value }))} /> : <span className="px-2 text-xs font-medium text-primary">{unit.unit_number ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input className="w-24 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.unit_type} onChange={(e) => setEditingValues((v) => ({ ...v, unit_type: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555]">{unit.unit_type ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input type="number" className="w-12 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.beds} onChange={(e) => setEditingValues((v) => ({ ...v, beds: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555]">{unit.beds ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input type="number" className="w-12 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.baths} onChange={(e) => setEditingValues((v) => ({ ...v, baths: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555]">{unit.baths ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input type="number" className="w-16 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.sqft} onChange={(e) => setEditingValues((v) => ({ ...v, sqft: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555]">{unit.sqft ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input type="number" className="w-20 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.lease_rate} onChange={(e) => setEditingValues((v) => ({ ...v, lease_rate: e.target.value }))} /> : <span className="px-2 text-xs font-semibold text-primary whitespace-nowrap">{fmtCurrency(unit.lease_rate)}</span>}</td>
                            <td className="px-2 py-2"><span className="px-2 text-xs text-[#999] whitespace-nowrap">{fmtPsf(unit.lease_rate, unit.sqft)}</span></td>
                            <td className="px-2 py-2">{isEditing ? <input type="date" className="w-32 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.move_in} onChange={(e) => setEditingValues((v) => ({ ...v, move_in: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555] whitespace-nowrap">{unit.move_in ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input className="w-40 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.notes} onChange={(e) => setEditingValues((v) => ({ ...v, notes: e.target.value }))} placeholder="Add note…" /> : <span className="px-2 text-xs text-[#777] italic max-w-[160px] truncate block" title={unit.notes}>{unit.notes || '—'}</span>}</td>
                            <td className="px-4 py-2 text-xs text-[#999] whitespace-nowrap max-w-[160px] truncate" title={unit.source_file}>{unit.source_file ?? '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <button onClick={handleEditSave} disabled={savingEdit} className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50">{savingEdit ? '…' : 'Save'}</button>
                                  <button onClick={handleEditCancel} disabled={savingEdit} className="text-xs px-2.5 py-1 rounded border border-border text-[#555555] hover:bg-surface">Cancel</button>
                                </div>
                              ) : (
                                <button onClick={() => handleEditStart(unit)} className="text-xs text-[#777777] hover:text-primary transition-colors px-1" title="Edit row">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )
        })()}
      </main>
      )}
    </div>
  )
}
