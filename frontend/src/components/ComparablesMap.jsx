import { useState, useEffect, useMemo, useRef } from 'react'
import MapGL, { Marker, Popup, NavigationControl, Source, Layer } from 'react-map-gl/mapbox'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const RADIUS_OPTIONS = [0.5, 1, 2, 3, 5, 10, 25]

function fmtCurrency(val) {
  if (val == null) return '—'
  return '$' + Number(val).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Haversine distance in miles between two lat/lng points
function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Approximate GeoJSON circle polygon for a given center + radius in miles
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

export default function ComparablesMap({ units, onSelectProperty }) {
  const [viewState, setViewState] = useState({ longitude: -79.38, latitude: 43.75, zoom: 9 })
  const [geocoded, setGeocoded] = useState({})
  const [selected, setSelected] = useState(null)

  // Subject address search
  const [searchInput, setSearchInput] = useState('')
  const [searchCoords, setSearchCoords] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [radiusMiles, setRadiusMiles] = useState(3)
  const inputRef = useRef(null)

  // Group units by unique property address
  const byAddress = useMemo(() => {
    const map = new Map()
    for (const unit of units) {
      if (!unit.property_address) continue
      if (!map.has(unit.property_address)) map.set(unit.property_address, [])
      map.get(unit.property_address).push(unit)
    }
    return map
  }, [units])

  // Geocode property addresses
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

  // Auto-center on first resolved point
  useEffect(() => {
    const coords = Object.values(geocoded).filter(Boolean)
    if (coords.length === 1) setViewState((v) => ({ ...v, longitude: coords[0].lng, latitude: coords[0].lat, zoom: 13 }))
  }, [geocoded])

  // Geocode the subject address
  async function handleSearch(e) {
    e?.preventDefault()
    if (!searchInput.trim()) return
    setSearchLoading(true)
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchInput.trim())}.json?access_token=${MAPBOX_TOKEN}&limit=1`
      )
      const data = await res.json()
      const center = data.features?.[0]?.center
      if (center) {
        const coords = { lng: center[0], lat: center[1] }
        setSearchCoords(coords)
        setViewState((v) => ({ ...v, longitude: coords.lng, latitude: coords.lat, zoom: 13 }))
      }
    } catch {}
    setSearchLoading(false)
  }

  function clearSearch() {
    setSearchInput('')
    setSearchCoords(null)
  }

  // All geocoded property markers, filtered by radius if a search point is set
  const allMarkers = useMemo(() =>
    Array.from(byAddress.entries())
      .map(([address, addressUnits]) => ({ address, addressUnits, coords: geocoded[address] }))
      .filter((p) => p.coords),
    [byAddress, geocoded]
  )

  const visibleMarkers = useMemo(() => {
    if (!searchCoords) return allMarkers
    return allMarkers.filter(({ coords }) =>
      distanceMiles(searchCoords.lat, searchCoords.lng, coords.lat, coords.lng) <= radiusMiles
    )
  }, [allMarkers, searchCoords, radiusMiles])

  const circleData = useMemo(() =>
    searchCoords ? circleGeoJSON(searchCoords, radiusMiles) : null,
    [searchCoords, radiusMiles]
  )

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-64 bg-surface border border-border rounded text-sm text-[#777777]">
        Add <code className="mx-1 px-1 bg-border rounded text-xs font-mono">VITE_MAPBOX_TOKEN</code> to your .env to enable the map.
      </div>
    )
  }

  return (
    <div className="rounded overflow-hidden border border-border relative" style={{ height: 600 }}>

      {/* Search panel */}
      <div className="absolute top-3 left-3 z-10 w-72 space-y-2">
        <form onSubmit={handleSearch} className="flex gap-1.5">
          <div className="relative flex-1">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#999]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Subject address..."
              className="w-full pl-8 pr-7 py-2 text-sm bg-white border border-border rounded shadow-md focus:outline-none focus:border-primary"
            />
            {searchInput && (
              <button type="button" onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#aaa] hover:text-[#555]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={searchLoading || !searchInput.trim()}
            className="px-3 py-2 bg-primary text-white text-xs font-medium rounded shadow-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {searchLoading ? '…' : 'Pin'}
          </button>
        </form>

        {/* Radius selector — only shown when a subject address is pinned */}
        {searchCoords && (
          <div className="bg-white border border-border rounded shadow-md px-3 py-2.5 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-[#777777] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <line x1="12" y1="12" x2="19" y2="12" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-xs text-[#555555]">Radius</span>
            <div className="flex gap-1 flex-wrap ml-1">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRadiusMiles(r)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${radiusMiles === r ? 'bg-primary text-white' : 'bg-surface text-[#555555] hover:bg-border'}`}
                >
                  {r}mi
                </button>
              ))}
            </div>
            <span className="text-xs text-[#999] ml-auto whitespace-nowrap">
              {visibleMarkers.length} listing{visibleMarkers.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      <MapGL
        {...viewState}
        onMove={(e) => setViewState(e.viewState)}
        mapLib={mapboxgl}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        onClick={() => setSelected(null)}
      >
        <NavigationControl position="top-right" />

        {/* Radius circle */}
        {circleData && (
          <Source id="radius-circle" type="geojson" data={circleData}>
            <Layer id="radius-fill" type="fill" paint={{ 'fill-color': '#2563eb', 'fill-opacity': 0.07 }} />
            <Layer id="radius-border" type="line" paint={{ 'line-color': '#2563eb', 'line-width': 1.5, 'line-dasharray': [3, 2] }} />
          </Source>
        )}

        {/* Subject address star marker */}
        {searchCoords && (
          <Marker longitude={searchCoords.lng} latitude={searchCoords.lat} anchor="bottom">
            <div className="flex flex-col items-center">
              <svg className="w-8 h-8 drop-shadow-md" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" strokeWidth="1">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
          </Marker>
        )}

        {/* Property markers */}
        {visibleMarkers.map(({ address, addressUnits, coords }) => {
          const ratedUnits = addressUnits.filter((u) => u.lease_rate != null)
          const avgRent = ratedUnits.length > 0
            ? ratedUnits.reduce((s, u) => s + Number(u.lease_rate), 0) / ratedUnits.length
            : null
          const isSelected = selected === address
          const dist = searchCoords
            ? distanceMiles(searchCoords.lat, searchCoords.lng, coords.lat, coords.lng).toFixed(1)
            : null

          return (
            <Marker
              key={address}
              longitude={coords.lng}
              latitude={coords.lat}
              anchor="bottom"
              onClick={(e) => { e.originalEvent.stopPropagation(); setSelected(address) }}
            >
              <div className="flex flex-col items-center cursor-pointer">
                <div className={`px-2.5 py-1 rounded-full text-white text-xs font-semibold shadow-lg whitespace-nowrap transition-all ${isSelected ? 'bg-primary scale-110' : 'bg-[#222] hover:bg-primary hover:scale-105'}`}>
                  {addressUnits.length} unit{addressUnits.length !== 1 ? 's' : ''}
                  {avgRent != null && <span className="ml-1.5 opacity-75">{fmtCurrency(avgRent)}</span>}
                </div>
                <div className={`w-2 h-2 rotate-45 -mt-1 ${isSelected ? 'bg-primary' : 'bg-[#222]'}`} />
              </div>
            </Marker>
          )
        })}

        {/* Popup */}
        {selected && geocoded[selected] && (() => {
          const addressUnits = byAddress.get(selected) ?? []
          const occupied = addressUnits.filter((u) => u.lease_rate != null)
          const avgRent = occupied.length > 0
            ? occupied.reduce((s, u) => s + Number(u.lease_rate), 0) / occupied.length
            : null
          const bedBreakdown = [...new Set(addressUnits.map((u) => u.beds).filter((b) => b != null))]
            .sort((a, b) => a - b)
            .map((b) => { const count = addressUnits.filter((u) => Number(u.beds) === Number(b)).length; return `${b === 0 ? 'Studio' : `${b}BR`}: ${count}` })
            .join(' · ')
          const dist = searchCoords && geocoded[selected]
            ? distanceMiles(searchCoords.lat, searchCoords.lng, geocoded[selected].lat, geocoded[selected].lng).toFixed(1)
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

                <button
                  onClick={() => onSelectProperty?.(selected)}
                  className="w-full py-1.5 px-3 bg-primary text-white text-xs font-medium rounded hover:bg-primary/90 transition-colors"
                >
                  View All Units →
                </button>
              </div>
            </Popup>
          )
        })()}
      </MapGL>

      {/* Geocoding progress */}
      {byAddress.size > 0 && allMarkers.length < byAddress.size && (
        <div className="absolute bottom-4 left-3 bg-white border border-border rounded px-3 py-1.5 text-xs text-[#777777] shadow flex items-center gap-2">
          <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
          Locating {byAddress.size - allMarkers.length} address{byAddress.size - allMarkers.length !== 1 ? 'es' : ''}...
        </div>
      )}
    </div>
  )
}
