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
} from '../services/api.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(val) {
  if (val == null) return '—'
  return '$' + Number(val).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
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
            <h1 className="text-primary text-lg font-bold tracking-tight">Fundus</h1>
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

const PROPERTY_SECTIONS = [
  { title: 'General', fields: [
    ['property_type', 'Property Type'], ['zoning', 'Zoning'], ['municipality', 'Municipality'],
    ['year_built', 'Year Built'], ['num_floors', 'Floors'], ['num_units_total', 'Total Units'],
    ['unit_mix_description', 'Unit Mix'], ['construction_status', 'Status'],
    ['current_owner', 'Owner'], ['ownership_type', 'Ownership Type'],
  ]},
  { title: 'Building & Construction', fields: [
    ['construction_frame', 'Frame'], ['foundation_type', 'Foundation'],
    ['exterior_cladding', 'Cladding'], ['roof_type', 'Roof Type'], ['roof_material', 'Roof Material'],
    ['window_type', 'Windows'], ['wall_finish', 'Wall Finish'], ['ceiling_type', 'Ceiling'],
    ['doors_exterior', 'Exterior Doors'], ['doors_interior', 'Interior Doors'],
  ]},
  { title: 'Area & Lot', fields: [
    ['sqft_total_building', 'Total Building Sqft'], ['sqft_per_unit_habitable', 'Sqft/Unit'],
    ['sqft_ground_floor', 'Ground Floor'], ['sqft_upper_floors', 'Upper Floors'],
    ['sqft_basement', 'Basement'], ['basement_finished_pct', 'Basement Finished %'],
    ['lot_size_total', 'Lot Size'], ['lot_frontage', 'Frontage'], ['lot_depth', 'Depth'],
    ['lot_configuration', 'Configuration'], ['lot_topography', 'Topography'], ['lot_access', 'Access'],
  ]},
  { title: 'Mechanical & Electrical', fields: [
    ['heating_type', 'Heating'], ['heating_fuel', 'Fuel'], ['heating_num_units', 'Heating Units'],
    ['ac_type', 'AC Type'], ['ac_num_units', 'AC Units'],
    ['electrical_amperage', 'Amperage'], ['electrical_panel_type', 'Panel'], ['electrical_network_type', 'Network'],
    ['hot_water_tank_type', 'Hot Water'], ['hot_water_energy_source', 'HW Energy'],
  ]},
  { title: 'Interior Finishes', fields: [
    ['kitchen_cabinets', 'Cabinets'], ['kitchen_countertops', 'Countertops'], ['kitchen_appliances', 'Appliances'],
    ['flooring_living', 'Living Flooring'], ['flooring_kitchen', 'Kitchen Flooring'],
    ['flooring_bathroom', 'Bathroom Flooring'], ['flooring_basement', 'Basement Flooring'],
    ['bathrooms_per_unit', 'Baths/Unit'], ['bathroom_fixtures', 'Fixtures'],
    ['bathroom_vanity_finish', 'Vanity'], ['bathroom_tub_shower_finish', 'Tub/Shower'],
    ['laundry_type', 'Laundry'], ['laundry_location', 'Laundry Location'],
  ]},
  { title: 'Amenities & Features', fields: [
    ['amenity_elevator', 'Elevator'], ['amenity_intercoms', 'Intercoms'],
    ['amenity_fire_suppression', 'Fire Suppression'], ['amenity_central_vacuum', 'Central Vacuum'],
    ['amenity_emergency_lighting', 'Emergency Lighting'], ['amenity_exterior_lighting', 'Exterior Lighting'],
    ['amenity_security_cameras', 'Security Cameras'], ['amenity_other_common', 'Other'],
    ['unit_balcony', 'Balcony'], ['unit_washer_dryer_hookup', 'W/D Hookup'],
    ['unit_ac', 'Unit AC'], ['unit_other_features', 'Other Features'],
    ['parking_total_spaces', 'Parking Spaces'], ['parking_type', 'Parking Type'], ['parking_per_unit', 'Parking/Unit'],
    ['storage_lockers_num', 'Storage Lockers'], ['storage_lockers_type', 'Storage Type'],
  ]},
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
  { title: 'Safety & Security', fields: [
    ['fire_suppression_system', 'Fire Suppression'], ['fire_alarms', 'Fire Alarms'], ['sprinkler_system', 'Sprinklers'],
    ['security_system', 'Security System'], ['security_cameras', 'Cameras'], ['intercoms', 'Intercoms'],
    ['building_access_type', 'Access Type'], ['building_code_compliance', 'Code Compliance'],
  ]},
  { title: 'Environmental & Risk', fields: [
    ['contamination_risk', 'Contamination'], ['flood_risk', 'Flood Risk'],
    ['soil_issues', 'Soil Issues'], ['env_certifications', 'Certifications'],
  ]},
  { title: 'Market & Comparables', fields: [
    ['market_supply_demand', 'Supply/Demand'], ['market_price_trend', 'Price Trend'],
    ['avg_days_on_market', 'Days on Market'], ['num_comparables_used', 'Comparables Used'],
    ['comparable_date_range', 'Date Range'], ['comparable_price_range', 'Price Range'],
    ['comparable_avg_price_per_unit', 'Avg Price/Unit'],
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
  const [openSections, setOpenSections] = useState(new Set(['General', 'Financial']))

  if (!detail) return null

  const toggleSection = (title) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      next.has(title) ? next.delete(title) : next.add(title)
      return next
    })
  }

  return (
    <div className="space-y-3 mb-6">
      {PROPERTY_SECTIONS.map(({ title, fields }) => {
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
                    <p className="text-xs text-[#333] mt-0.5 break-words">{detail[key]}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )
      })}
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
      const saved = localStorage.getItem('fundus_selected_addresses')
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
      move_out: unit.move_out ?? '',
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
        move_out: editingValues.move_out || null,
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
    localStorage.setItem('fundus_selected_addresses', JSON.stringify([...selectedAddresses]))
  }, [selectedAddresses])

  useEffect(() => {
    if (view === 'property' && selectedPropertyId) {
      setLoadingDetail(true)
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
      <PageHeader onBack={view !== 'map' ? () => { navigate(BASE); setSelectedProperty(null); setSelectedPropertyId(null) } : () => navigate('/comparable-analysis')} />

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
                  onClearSelected={() => setSelectedAddresses(new Set())}
                  onOpenCompTable={() => setView('comptable')}
                  onSelectProperty={handleSelectProperty}
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
                        <div key={g.address} className="rounded-lg border border-border overflow-hidden">
                          <div className="px-4 py-2.5 bg-surface flex items-center gap-2">
                            <svg className="w-3.5 h-3.5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-xs font-semibold text-primary truncate">{g.address}</span>
                          </div>
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
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            {['Unit', 'Type', 'Beds', 'Baths', 'Sqft', 'Rent/mo', 'Move In', 'Move Out', ''].map((col) => (
                              <th key={col} className="text-left px-4 py-2.5 text-xs font-semibold text-[#777777] uppercase tracking-wider whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {prop.units.map((unit) => {
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
                                <td className="px-2 py-2">{isEditing ? <input type="date" className="w-32 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.move_in} onChange={(e) => setEditingValues((v) => ({ ...v, move_in: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555] whitespace-nowrap">{fmtDate(unit.move_in) ?? '—'}</span>}</td>
                                <td className="px-2 py-2">{isEditing ? <input type="date" className="w-32 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.move_out} onChange={(e) => setEditingValues((v) => ({ ...v, move_out: e.target.value }))} /> : <span className="px-2 whitespace-nowrap"><LeaseEndCell move_out={unit.move_out} /></span>}</td>
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
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-primary tracking-tight">{selectedProperty}</h2>
                <p className="text-[#777777] mt-0.5 text-sm">{propertyUnits.length} unit{propertyUnits.length !== 1 ? 's' : ''}</p>
              </div>

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
              <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Units ({propertyUnits.length})
              </h3>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        {['Unit', 'Type', 'Beds', 'Baths', 'Sqft', 'Rent/mo', 'Move In', 'Move Out', 'Source', ''].map((col) => (
                          <th key={col} className="text-left px-4 py-2.5 text-xs font-semibold text-[#777777] uppercase tracking-wider whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {propertyUnits.map((unit) => {
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
                            <td className="px-2 py-2">{isEditing ? <input type="date" className="w-32 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.move_in} onChange={(e) => setEditingValues((v) => ({ ...v, move_in: e.target.value }))} /> : <span className="px-2 text-xs text-[#555555] whitespace-nowrap">{unit.move_in ?? '—'}</span>}</td>
                            <td className="px-2 py-2">{isEditing ? <input type="date" className="w-32 text-xs px-2 py-1 border border-border rounded bg-white focus:outline-none focus:border-primary" value={ev.move_out} onChange={(e) => setEditingValues((v) => ({ ...v, move_out: e.target.value }))} /> : <span className="px-2 whitespace-nowrap"><LeaseEndCell move_out={unit.move_out} /></span>}</td>
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
