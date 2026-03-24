import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import MapGL, { Marker, Popup, NavigationControl, Source, Layer } from 'react-map-gl/mapbox'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY

const RADIUS_OPTIONS = [0.5, 1, 2, 3, 5, 10, 25]

function fmtCurrency(val) {
  if (val == null) return '—'
  return '$' + Number(val).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function circleGeoJSON(center, radiusMiles, steps = 64) {
  const coords = []
  const latR = radiusMiles / 69.11
  const lngR = radiusMiles / (69.11 * Math.cos(center.lat * (Math.PI / 180)))
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    coords.push([center.lng + lngR * Math.cos(angle), center.lat + latR * Math.sin(angle)])
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } }
}

function propertyImageUrl(lng, lat) {
  if (GOOGLE_KEY) {
    return `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${lat},${lng}&fov=90&pitch=10&key=${GOOGLE_KEY}`
  }
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-s+3B82F6(${lng},${lat})/${lng},${lat},15,0/400x160@2x?access_token=${MAPBOX_TOKEN}`
}

// ─── Layer definitions ───────────────────────────────────────────────────────

const CLUSTER_COLOR = '#3B82F6'

const clusterRingLayer = {
  id: 'cluster-ring',
  type: 'circle',
  source: 'properties',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': CLUSTER_COLOR,
    'circle-radius': [
      'interpolate', ['linear'], ['get', 'point_count'],
      2, 26,
      15, 36,
      50, 48,
    ],
    'circle-opacity': 0.12,
    'circle-opacity-transition': { duration: 350 },
    'circle-radius-transition': { duration: 350 },
  },
}

const clusterCircleLayer = {
  id: 'clusters',
  type: 'circle',
  source: 'properties',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': [
      'interpolate', ['linear'], ['get', 'point_count'],
      2, '#60A5FA',
      15, '#3B82F6',
      50, '#1D4ED8',
    ],
    'circle-radius': [
      'interpolate', ['linear'], ['get', 'point_count'],
      2, 20,
      15, 28,
      50, 38,
    ],
    'circle-stroke-width': 2.5,
    'circle-stroke-color': 'rgba(255,255,255,0.92)',
    'circle-opacity': 1,
    'circle-opacity-transition': { duration: 350 },
    'circle-radius-transition': { duration: 350 },
    'circle-color-transition': { duration: 350 },
  },
}

const clusterCountLayer = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'properties',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
    'text-size': [
      'interpolate', ['linear'], ['get', 'point_count'],
      2, 13,
      50, 18,
    ],
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: {
    'text-color': '#ffffff',
    'text-opacity-transition': { duration: 250 },
  },
}

const unclusteredRingLayer = {
  id: 'unclustered-ring',
  type: 'circle',
  source: 'properties',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': CLUSTER_COLOR,
    'circle-radius': 22,
    'circle-opacity': 0.12,
    'circle-opacity-transition': { duration: 350 },
    'circle-radius-transition': { duration: 350 },
  },
}

const unclusteredCircleLayer = {
  id: 'unclustered-point',
  type: 'circle',
  source: 'properties',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': '#60A5FA',
    'circle-radius': 17,
    'circle-stroke-width': 2.5,
    'circle-stroke-color': 'rgba(255,255,255,0.92)',
    'circle-opacity': 1,
    'circle-opacity-transition': { duration: 350 },
    'circle-radius-transition': { duration: 350 },
  },
}

const unclusteredLabelLayer = {
  id: 'unclustered-label',
  type: 'symbol',
  source: 'properties',
  filter: ['!', ['has', 'point_count']],
  layout: {
    'text-field': '1',
    'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
    'text-size': 13,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: {
    'text-color': '#ffffff',
    'text-opacity-transition': { duration: 250 },
  },
}

// ─── Sidebar property card ───────────────────────────────────────────────────

function PropertyCard({ prop, searchCoords, onClick, isSelected, onToggleSelect }) {
  const [imgError, setImgError] = useState(false)
  const dist = searchCoords
    ? distanceMiles(searchCoords.lat, searchCoords.lng, prop.coords.lat, prop.coords.lng).toFixed(1)
    : null

  return (
    <div
      className={`border-b border-border/60 px-4 py-4 hover:bg-blue-50/40 cursor-pointer transition-colors group relative ${isSelected ? 'bg-blue-50/50' : ''}`}
      onClick={onClick}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(prop.address) }}
        className={`absolute top-3 right-3 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          isSelected
            ? 'bg-[#3B82F6] border-[#3B82F6]'
            : 'border-gray-300 bg-white hover:border-[#3B82F6]'
        }`}
      >
        {isSelected && (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Property image */}
      <div className="w-full h-[120px] rounded-lg overflow-hidden mb-3 bg-surface relative">
        {!imgError ? (
          <img
            src={propertyImageUrl(prop.coords.lng, prop.coords.lat)}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#bbb]">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        )}
      </div>

      {/* Address */}
      <h4 className="text-[13px] font-semibold text-[#222] leading-snug group-hover:text-[#3B82F6] transition-colors line-clamp-2 pr-6">
        {prop.address}
      </h4>

      {/* Stats row */}
      <div className="flex items-center gap-2 mt-1.5 text-xs text-[#666]">
        <span className="font-medium">{prop.unitCount} unit{prop.unitCount !== 1 ? 's' : ''}</span>
        <span className="w-[3px] h-[3px] rounded-full bg-[#ccc]" />
        <span className="font-medium">
          {prop.avgRent != null ? fmtCurrency(prop.avgRent) + '/mo' : 'No rent data'}
        </span>
        {dist && (
          <>
            <span className="w-[3px] h-[3px] rounded-full bg-[#ccc]" />
            <span>{dist} mi</span>
          </>
        )}
      </div>

      {/* Bed badges */}
      {prop.beds.length > 0 && (
        <div className="flex gap-1.5 mt-2.5 flex-wrap">
          {prop.beds.map((b) => (
            <span key={b} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[11px] font-medium">
              {b === 0 ? 'Studio' : `${b} Bed`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ComparablesMap({ units, onSelectProperty, searchCoords, pinStarCoords, onPinStarChange, highlightAddress, selectedAddresses, onToggleSelect, onClearSelected, onOpenCompTable }) {
  const mapRef = useRef(null)
  const [viewState, setViewState] = useState({ longitude: -79.383, latitude: 43.653, zoom: 12 })
  const [geocoded, setGeocoded] = useState({})
  const [selected, setSelected] = useState(null)
  const [sidebarData, setSidebarData] = useState(null)
  const [searchRadiusMiles, setSearchRadiusMiles] = useState(3)
  const [pinStarRadiusMiles, setPinStarRadiusMiles] = useState(3)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    beds: '',
    yearBuiltMin: '',
    yearBuiltMax: '',
    leaseStartFrom: '',
    leaseStartTo: '',
    leaseExecutedFrom: '',
    leaseExecutedTo: '',
    constructionType: '',
    unitCountMin: '',
    unitCountMax: '',
    avgSqftMin: '',
    avgSqftMax: '',
  })
  const filterRef = useRef(null)
  const byAddressRef = useRef(new Map())

  const activeFilterCount = Object.values(filters).filter((v) => v !== '').length

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function clearFilters() {
    setFilters({
      beds: '',
      yearBuiltMin: '',
      yearBuiltMax: '',
      leaseStartFrom: '',
      leaseStartTo: '',
      leaseExecutedFrom: '',
      leaseExecutedTo: '',
      constructionType: '',
      unitCountMin: '',
      unitCountMax: '',
      avgSqftMin: '',
      avgSqftMax: '',
    })
  }

  // Close filter panel when clicking outside
  useEffect(() => {
    if (!showFilters) return
    function handleClickOutside(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilters(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilters])

  const byAddress = useMemo(() => {
    const map = new Map()
    for (const unit of units) {
      if (!unit.property_address) continue
      if (!map.has(unit.property_address)) map.set(unit.property_address, [])
      map.get(unit.property_address).push(unit)
    }
    byAddressRef.current = map
    return map
  }, [units])

  useEffect(() => {
    if (!MAPBOX_TOKEN) return
    for (const address of byAddress.keys()) {
      if (address in geocoded) continue
      setGeocoded((prev) => ({ ...prev, [address]: null }))
      fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=CA&limit=1`)
        .then((r) => r.json())
        .then((data) => {
          const center = data.features?.[0]?.center
          if (center) setGeocoded((prev) => ({ ...prev, [address]: { lng: center[0], lat: center[1] } }))
        })
        .catch(() => {})
    }
  }, [byAddress])

  useEffect(() => {
    if (searchCoords) {
      setViewState((v) => ({ ...v, longitude: searchCoords.lng, latitude: searchCoords.lat, zoom: 13 }))
    }
  }, [searchCoords])

  useEffect(() => {
    if (pinStarCoords) {
      setViewState((v) => ({ ...v, longitude: pinStarCoords.lng, latitude: pinStarCoords.lat, zoom: 13 }))
    }
  }, [pinStarCoords])

  // Highlight a matched address from search
  useEffect(() => {
    if (highlightAddress && geocoded[highlightAddress]) {
      const coords = geocoded[highlightAddress]
      setViewState((v) => ({ ...v, longitude: coords.lng, latitude: coords.lat, zoom: 15 }))
      setSelected(highlightAddress)
    }
  }, [highlightAddress, geocoded])

  // Use Pin Star radius if active, otherwise search radius
  const activeFilterCenter = pinStarCoords || searchCoords
  const activeFilterRadius = pinStarCoords ? pinStarRadiusMiles : searchRadiusMiles

  const geojsonData = useMemo(() => {
    const features = []
    for (const [address, addressUnits] of byAddress.entries()) {
      const coords = geocoded[address]
      if (!coords) continue
      if (activeFilterCenter) {
        const dist = distanceMiles(activeFilterCenter.lat, activeFilterCenter.lng, coords.lat, coords.lng)
        if (dist > activeFilterRadius) continue
      }

      // Apply property-level filters
      const unitCount = addressUnits.length

      // Beds filter
      if (filters.beds !== '') {
        const target = Number(filters.beds)
        if (!addressUnits.some((u) => u.beds != null && Number(u.beds) === target)) continue
      }

      // Year built filter
      const yearBuilt = addressUnits[0]?.year_built
      if (filters.yearBuiltMin !== '' && (yearBuilt == null || Number(yearBuilt) < Number(filters.yearBuiltMin))) continue
      if (filters.yearBuiltMax !== '' && (yearBuilt == null || Number(yearBuilt) > Number(filters.yearBuiltMax))) continue

      // Construction type filter
      const constructionType = addressUnits[0]?.construction_type
      if (filters.constructionType !== '' && (constructionType == null || constructionType !== filters.constructionType)) continue

      // Lease start (move_in) filter
      if (filters.leaseStartFrom !== '') {
        if (!addressUnits.some((u) => u.move_in && u.move_in >= filters.leaseStartFrom)) continue
      }
      if (filters.leaseStartTo !== '') {
        if (!addressUnits.some((u) => u.move_in && u.move_in <= filters.leaseStartTo)) continue
      }

      // Lease executed filter
      if (filters.leaseExecutedFrom !== '') {
        if (!addressUnits.some((u) => u.lease_executed && u.lease_executed >= filters.leaseExecutedFrom)) continue
      }
      if (filters.leaseExecutedTo !== '') {
        if (!addressUnits.some((u) => u.lease_executed && u.lease_executed <= filters.leaseExecutedTo)) continue
      }

      // Unit count filter
      if (filters.unitCountMin !== '' && unitCount < Number(filters.unitCountMin)) continue
      if (filters.unitCountMax !== '' && unitCount > Number(filters.unitCountMax)) continue

      // Avg sqft filter
      const sqftUnits = addressUnits.filter((u) => u.sqft != null)
      const avgSqft = sqftUnits.length > 0 ? sqftUnits.reduce((s, u) => s + Number(u.sqft), 0) / sqftUnits.length : null
      if (filters.avgSqftMin !== '' && (avgSqft == null || avgSqft < Number(filters.avgSqftMin))) continue
      if (filters.avgSqftMax !== '' && (avgSqft == null || avgSqft > Number(filters.avgSqftMax))) continue

      const ratedUnits = addressUnits.filter((u) => u.lease_rate != null)
      const avgRent = ratedUnits.length > 0
        ? Math.round(ratedUnits.reduce((s, u) => s + Number(u.lease_rate), 0) / ratedUnits.length)
        : null
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] },
        properties: {
          address,
          unitCount,
          avgRent,
        },
      })
    }
    return { type: 'FeatureCollection', features }
  }, [byAddress, geocoded, activeFilterCenter, activeFilterRadius, filters])

  const searchCircleData = useMemo(
    () => (searchCoords ? circleGeoJSON(searchCoords, searchRadiusMiles) : null),
    [searchCoords, searchRadiusMiles],
  )

  const pinStarCircleData = useMemo(
    () => (pinStarCoords ? circleGeoJSON(pinStarCoords, pinStarRadiusMiles) : null),
    [pinStarCoords, pinStarRadiusMiles],
  )

  const geocodedCount = useMemo(
    () => Array.from(byAddress.keys()).filter((addr) => geocoded[addr]).length,
    [byAddress, geocoded],
  )

  function buildPropertyList(features) {
    const ba = byAddressRef.current
    const props = features.map((f) => {
      const address = f.properties.address
      const addressUnits = ba.get(address) ?? []
      const ratedUnits = addressUnits.filter((u) => u.lease_rate != null)
      const avgRent = ratedUnits.length > 0
        ? Math.round(ratedUnits.reduce((s, u) => s + Number(u.lease_rate), 0) / ratedUnits.length)
        : null
      const beds = [...new Set(addressUnits.map((u) => u.beds).filter((b) => b != null))].sort((a, b) => a - b)
      return {
        address,
        unitCount: addressUnits.length,
        avgRent,
        beds,
        coords: { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] },
      }
    })
    props.sort((a, b) => b.unitCount - a.unitCount)
    return props
  }

  const handleClick = useCallback((e) => {
    const feature = e.features?.[0]
    if (!feature) {
      setSelected(null)
      setSidebarData(null)
      return
    }

    if (feature.properties?.cluster) {
      const clusterId = feature.properties.cluster_id
      const rawMap = mapRef.current?.getMap?.()
      if (!rawMap) return

      const source = rawMap.getSource('properties')
      if (!source?.getClusterLeaves) return

      source.getClusterLeaves(clusterId, 100, 0, (err, leaves) => {
        if (err || !leaves?.length) return
        setSelected(null)
        setSidebarData({ properties: buildPropertyList(leaves) })
      })
    } else {
      setSidebarData(null)
      setSelected(feature.properties?.address)
    }
  }, [])

  // Right-click to drop Pin Star
  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    const { lng, lat } = e.lngLat
    onPinStarChange?.({ lng, lat })
  }, [onPinStarChange])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-full bg-surface border border-border rounded-lg text-sm text-[#777777]">
        Add <code className="mx-1 px-1 bg-border rounded text-xs font-mono">VITE_MAPBOX_TOKEN</code> to your .env to enable the map.
      </div>
    )
  }

  const totalSidebarUnits = sidebarData
    ? sidebarData.properties.reduce((s, p) => s + p.unitCount, 0)
    : 0

  return (
    <div className="rounded-lg overflow-hidden border border-border relative h-full">
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={(e) => setViewState(e.viewState)}
        mapLib={mapboxgl}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={['clusters', 'unclustered-point']}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <NavigationControl position="top-right" />

        {/* Search address pin + radius (blue) */}
        {searchCircleData && (
          <Source id="search-radius-circle" type="geojson" data={searchCircleData}>
            <Layer id="search-radius-fill" type="fill" paint={{ 'fill-color': '#3B82F6', 'fill-opacity': 0.06 }} />
            <Layer id="search-radius-border" type="line" paint={{ 'line-color': '#3B82F6', 'line-width': 1.5, 'line-dasharray': [3, 2] }} />
          </Source>
        )}

        {searchCoords && (
          <Marker longitude={searchCoords.lng} latitude={searchCoords.lat} anchor="bottom">
            <div className="flex flex-col items-center">
              <svg className="w-7 h-7 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#3B82F6" />
                <circle cx="12" cy="9" r="2.5" fill="white" />
              </svg>
            </div>
          </Marker>
        )}

        {/* Pin Star + radius (amber) — separate from search */}
        {pinStarCircleData && (
          <Source id="pinstar-radius-circle" type="geojson" data={pinStarCircleData}>
            <Layer id="pinstar-radius-fill" type="fill" paint={{ 'fill-color': '#f59e0b', 'fill-opacity': 0.08 }} />
            <Layer id="pinstar-radius-border" type="line" paint={{ 'line-color': '#d97706', 'line-width': 1.5, 'line-dasharray': [3, 2] }} />
          </Source>
        )}

        {pinStarCoords && (
          <Marker longitude={pinStarCoords.lng} latitude={pinStarCoords.lat} anchor="bottom">
            <div className="flex flex-col items-center">
              <svg className="w-8 h-8 drop-shadow-md" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" strokeWidth="1">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
          </Marker>
        )}

        <Source
          id="properties"
          type="geojson"
          data={geojsonData}
          cluster={true}
          clusterMaxZoom={14}
          clusterRadius={50}
        >
          <Layer {...clusterRingLayer} />
          <Layer {...unclusteredRingLayer} />
          <Layer {...clusterCircleLayer} />
          <Layer {...unclusteredCircleLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredLabelLayer} />
        </Source>

        {selected && geocoded[selected] && (() => {
          const addressUnits = byAddress.get(selected) ?? []
          const occupied = addressUnits.filter((u) => u.lease_rate != null)
          const avgRent = occupied.length > 0
            ? occupied.reduce((s, u) => s + Number(u.lease_rate), 0) / occupied.length
            : null
          const bedBreakdown = [...new Set(addressUnits.map((u) => u.beds).filter((b) => b != null))]
            .sort((a, b) => a - b)
            .map((b) => {
              const count = addressUnits.filter((u) => Number(u.beds) === Number(b)).length
              return `${b === 0 ? 'Studio' : `${b}BR`}: ${count}`
            })
            .join(' · ')
          const distCenter = activeFilterCenter
          const dist = distCenter && geocoded[selected]
            ? distanceMiles(distCenter.lat, distCenter.lng, geocoded[selected].lat, geocoded[selected].lng).toFixed(1)
            : null

          return (
            <Popup
              longitude={geocoded[selected].lng}
              latitude={geocoded[selected].lat}
              onClose={() => setSelected(null)}
              closeOnClick={false}
              anchor="top"
              maxWidth="300px"
              className="font-sans"
            >
              <div className="p-1 space-y-3">
                <div className="w-full h-[100px] -mx-1 -mt-1 rounded overflow-hidden bg-surface relative">
                  <img
                    src={propertyImageUrl(geocoded[selected].lng, geocoded[selected].lat)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {/* Checkbox overlay on image */}
                  <button
                    onClick={() => onToggleSelect?.(selected)}
                    className={`absolute top-2 right-2 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors shadow-sm ${
                      selectedAddresses?.has(selected)
                        ? 'bg-[#3B82F6] border-[#3B82F6]'
                        : 'border-white bg-white/80 hover:border-[#3B82F6]'
                    }`}
                  >
                    {selectedAddresses?.has(selected) && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm text-[#222] leading-snug">{selected}</p>
                  {dist && <span className="text-xs text-[#999] whitespace-nowrap flex-shrink-0">{dist} mi</span>}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Units', value: addressUnits.length },
                    { label: 'Occupied', value: occupied.length },
                    { label: 'Avg Rent', value: avgRent != null ? fmtCurrency(avgRent) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-md p-2">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                      <p className="font-bold text-sm text-[#222] mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>

                {bedBreakdown && <p className="text-xs text-gray-500">{bedBreakdown}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={() => onToggleSelect?.(selected)}
                    className={`flex-1 py-1.5 px-3 text-xs font-medium rounded transition-colors ${
                      selectedAddresses?.has(selected)
                        ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                        : 'bg-gray-50 text-[#555] border border-border hover:bg-gray-100'
                    }`}
                  >
                    {selectedAddresses?.has(selected) ? 'Selected' : 'Select for Comp'}
                  </button>
                  <button
                    onClick={() => onSelectProperty?.(selected)}
                    className="flex-1 py-1.5 px-3 bg-[#3B82F6] text-white text-xs font-medium rounded hover:bg-[#2563EB] transition-colors"
                  >
                    View Units →
                  </button>
                </div>
              </div>
            </Popup>
          )
        })()}
      </MapGL>

      {/* ── Cluster sidebar ──────────────────────────────────────────────────── */}
      {sidebarData && (
        <div
          className="absolute top-0 left-0 bottom-0 z-20 flex"
          style={{ width: 370, animation: 'sidebarIn .22s ease-out' }}
        >
          <style>{`@keyframes sidebarIn{from{transform:translateX(-100%);opacity:.4}to{transform:translateX(0);opacity:1}}`}</style>
          <div className="flex-1 bg-white/[0.97] backdrop-blur-sm shadow-2xl flex flex-col rounded-r-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-[#222]">
                  {sidebarData.properties.length} {sidebarData.properties.length === 1 ? 'Property' : 'Properties'}
                </h3>
                <p className="text-[11px] text-[#999] mt-0.5">
                  {totalSidebarUnits} total unit{totalSidebarUnits !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setSidebarData(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#aaa] hover:text-[#555] hover:bg-surface transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Property list */}
            <div className="flex-1 overflow-y-auto">
              {sidebarData.properties.map((prop) => (
                <PropertyCard
                  key={prop.address}
                  prop={prop}
                  searchCoords={activeFilterCenter}
                  isSelected={selectedAddresses?.has(prop.address)}
                  onToggleSelect={onToggleSelect}
                  onClick={() => onSelectProperty?.(prop.address)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Radius overlays ──────────────────────────────────────────────────── */}
      {(searchCoords || pinStarCoords) && (
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
          {/* Search radius control */}
          {searchCoords && (
            <div className="bg-white border border-border rounded-lg shadow-md px-3 py-2.5 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-[#3B82F6] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#3B82F6" />
                <circle cx="12" cy="9" r="2.5" fill="white" />
              </svg>
              <span className="text-xs text-[#555555]">Search</span>
              <div className="flex gap-1 flex-wrap ml-1">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setSearchRadiusMiles(r)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      searchRadiusMiles === r ? 'bg-[#3B82F6] text-white' : 'bg-surface text-[#555555] hover:bg-border'
                    }`}
                  >
                    {r}mi
                  </button>
                ))}
              </div>
              <span className="text-xs text-[#999] ml-auto whitespace-nowrap">
                {geojsonData.features.length} listing{geojsonData.features.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Pin Star radius control */}
          {pinStarCoords && (
            <div className="bg-white border border-amber-200 rounded-lg shadow-md px-3 py-2.5 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" strokeWidth="1">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="text-xs text-[#555555]">Pin Star</span>
              <div className="flex gap-1 flex-wrap ml-1">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setPinStarRadiusMiles(r)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      pinStarRadiusMiles === r ? 'bg-amber-500 text-white' : 'bg-surface text-[#555555] hover:bg-border'
                    }`}
                  >
                    {r}mi
                  </button>
                ))}
              </div>
              <button
                onClick={() => onPinStarChange?.(null)}
                className="ml-1 text-[#aaa] hover:text-[#555] transition-colors"
                title="Remove Pin Star"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Filter button + panel ────────────────────────────────────────────── */}
      <div className="absolute top-3 right-14 z-10" ref={filterRef}>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg shadow-md text-xs font-medium transition-colors ${
            activeFilterCount > 0
              ? 'bg-[#3B82F6] text-white border border-[#3B82F6]'
              : 'bg-white text-[#555] border border-border hover:bg-gray-50'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 w-4 h-4 rounded-full bg-white text-[#3B82F6] text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {showFilters && (
          <div className="absolute top-full right-0 mt-2 w-[400px] bg-white border border-border rounded-xl shadow-xl overflow-hidden"
            style={{ animation: 'filterIn .18s ease-out' }}
          >
            <style>{`@keyframes filterIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gray-50/60">
              <h3 className="text-sm font-semibold text-[#222]">Filter Properties</h3>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-[11px] text-[#3B82F6] hover:text-[#2563EB] font-medium transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setShowFilters(false)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[#aaa] hover:text-[#555] hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Filter body */}
            <div className="px-4 py-3 space-y-4 max-h-[420px] overflow-y-auto">

              {/* Beds */}
              <div>
                <label className="block text-[11px] font-medium text-[#888] uppercase tracking-wide mb-1.5">Bedrooms</label>
                <div className="flex gap-1.5">
                  {[
                    { label: 'Any', value: '' },
                    { label: 'Studio', value: '0' },
                    { label: '1', value: '1' },
                    { label: '2', value: '2' },
                    { label: '3+', value: '3' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateFilter('beds', filters.beds === opt.value ? '' : opt.value)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        filters.beds === opt.value
                          ? 'bg-[#3B82F6] text-white'
                          : 'bg-gray-50 text-[#555] hover:bg-gray-100 border border-gray-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Construction Type (Frame) */}
              <div>
                <label className="block text-[11px] font-medium text-[#888] uppercase tracking-wide mb-1.5">Frame / Construction</label>
                <div className="flex gap-1.5">
                  {[
                    { label: 'Any', value: '' },
                    { label: 'Wood', value: 'wood' },
                    { label: 'Concrete', value: 'concrete' },
                    { label: 'Steel', value: 'steel' },
                    { label: 'Masonry', value: 'masonry' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateFilter('constructionType', filters.constructionType === opt.value ? '' : opt.value)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        filters.constructionType === opt.value
                          ? 'bg-[#3B82F6] text-white'
                          : 'bg-gray-50 text-[#555] hover:bg-gray-100 border border-gray-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Year Built */}
              <div>
                <label className="block text-[11px] font-medium text-[#888] uppercase tracking-wide mb-1.5">Year Built</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="From"
                    value={filters.yearBuiltMin}
                    onChange={(e) => updateFilter('yearBuiltMin', e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-md focus:outline-none focus:border-[#3B82F6] focus:bg-white"
                  />
                  <span className="text-[#ccc] self-center text-xs">—</span>
                  <input
                    type="number"
                    placeholder="To"
                    value={filters.yearBuiltMax}
                    onChange={(e) => updateFilter('yearBuiltMax', e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-md focus:outline-none focus:border-[#3B82F6] focus:bg-white"
                  />
                </div>
              </div>

              {/* Number of Units */}
              <div>
                <label className="block text-[11px] font-medium text-[#888] uppercase tracking-wide mb-1.5">Number of Units</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.unitCountMin}
                    onChange={(e) => updateFilter('unitCountMin', e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-md focus:outline-none focus:border-[#3B82F6] focus:bg-white"
                  />
                  <span className="text-[#ccc] self-center text-xs">—</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.unitCountMax}
                    onChange={(e) => updateFilter('unitCountMax', e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-md focus:outline-none focus:border-[#3B82F6] focus:bg-white"
                  />
                </div>
              </div>

              {/* Avg Square Foot */}
              <div>
                <label className="block text-[11px] font-medium text-[#888] uppercase tracking-wide mb-1.5">Avg Square Footage</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min sqft"
                    value={filters.avgSqftMin}
                    onChange={(e) => updateFilter('avgSqftMin', e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-md focus:outline-none focus:border-[#3B82F6] focus:bg-white"
                  />
                  <span className="text-[#ccc] self-center text-xs">—</span>
                  <input
                    type="number"
                    placeholder="Max sqft"
                    value={filters.avgSqftMax}
                    onChange={(e) => updateFilter('avgSqftMax', e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-md focus:outline-none focus:border-[#3B82F6] focus:bg-white"
                  />
                </div>
              </div>

              {/* Lease Start (Move In) */}
              <div>
                <label className="block text-[11px] font-medium text-[#888] uppercase tracking-wide mb-1.5">Lease Start</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={filters.leaseStartFrom}
                    onChange={(e) => updateFilter('leaseStartFrom', e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-md focus:outline-none focus:border-[#3B82F6] focus:bg-white"
                  />
                  <span className="text-[#ccc] self-center text-xs">—</span>
                  <input
                    type="date"
                    value={filters.leaseStartTo}
                    onChange={(e) => updateFilter('leaseStartTo', e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-md focus:outline-none focus:border-[#3B82F6] focus:bg-white"
                  />
                </div>
              </div>

              {/* Lease Executed */}
              <div>
                <label className="block text-[11px] font-medium text-[#888] uppercase tracking-wide mb-1.5">Lease Executed</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={filters.leaseExecutedFrom}
                    onChange={(e) => updateFilter('leaseExecutedFrom', e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-md focus:outline-none focus:border-[#3B82F6] focus:bg-white"
                  />
                  <span className="text-[#ccc] self-center text-xs">—</span>
                  <input
                    type="date"
                    value={filters.leaseExecutedTo}
                    onChange={(e) => updateFilter('leaseExecutedTo', e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-md focus:outline-none focus:border-[#3B82F6] focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Footer with result count */}
            <div className="px-4 py-3 border-t border-border bg-gray-50/60 flex items-center justify-between">
              <span className="text-xs text-[#888]">
                {geojsonData.features.length} propert{geojsonData.features.length === 1 ? 'y' : 'ies'} found
              </span>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-1.5 text-xs font-medium text-[#555] bg-white border border-border rounded-md hover:bg-gray-50 transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Selected properties tray + Comp Table button ──────────────────── */}
      {selectedAddresses?.size > 0 && (
        <div className="absolute bottom-4 right-3 z-10 flex items-end gap-3">
          {/* Selected tray */}
          <div className="bg-white border border-border rounded-xl shadow-lg max-w-[480px]"
            style={{ animation: 'filterIn .18s ease-out' }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
              <span className="text-xs font-semibold text-[#222]">
                {selectedAddresses.size} selected
              </span>
              <button
                onClick={onClearSelected}
                className="text-[11px] text-[#999] hover:text-[#555] font-medium transition-colors"
              >
                Clear all
              </button>
            </div>
            <div className="px-3 py-2 flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto">
              {[...selectedAddresses].map((addr) => (
                <span
                  key={addr}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-[11px] font-medium"
                >
                  <span className="truncate max-w-[180px]">{addr}</span>
                  <button
                    onClick={() => onToggleSelect?.(addr)}
                    className="flex-shrink-0 w-3.5 h-3.5 rounded-full hover:bg-blue-200 flex items-center justify-center transition-colors"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Comp Table button */}
          <button
            onClick={onOpenCompTable}
            className="flex-shrink-0 flex items-center gap-2 px-5 py-3 bg-[#3B82F6] text-white rounded-xl shadow-lg hover:bg-[#2563EB] transition-colors font-medium text-sm"
            style={{ animation: 'filterIn .18s ease-out' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M12 3v18M3 6h18v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
            </svg>
            Comp Table
          </button>
        </div>
      )}

      {/* ── Geocoding progress ───────────────────────────────────────────────── */}
      {byAddress.size > 0 && geocodedCount < byAddress.size && selectedAddresses?.size === 0 && (
        <div className="absolute bottom-4 left-3 bg-white border border-border rounded-lg px-3 py-1.5 text-xs text-[#777777] shadow flex items-center gap-2">
          <div className="w-3 h-3 border border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
          Locating {byAddress.size - geocodedCount} address{byAddress.size - geocodedCount !== 1 ? 'es' : ''}...
        </div>
      )}
    </div>
  )
}
