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

function PropertyCard({ prop, searchCoords, onClick }) {
  const [imgError, setImgError] = useState(false)
  const dist = searchCoords
    ? distanceMiles(searchCoords.lat, searchCoords.lng, prop.coords.lat, prop.coords.lng).toFixed(1)
    : null

  return (
    <div
      className="border-b border-border/60 px-4 py-4 hover:bg-blue-50/40 cursor-pointer transition-colors group"
      onClick={onClick}
    >
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
      <h4 className="text-[13px] font-semibold text-[#222] leading-snug group-hover:text-[#3B82F6] transition-colors line-clamp-2">
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

export default function ComparablesMap({ units, onSelectProperty, searchCoords }) {
  const mapRef = useRef(null)
  const [viewState, setViewState] = useState({ longitude: -79.383, latitude: 43.653, zoom: 12 })
  const [geocoded, setGeocoded] = useState({})
  const [selected, setSelected] = useState(null)
  const [sidebarData, setSidebarData] = useState(null)
  const [radiusMiles, setRadiusMiles] = useState(3)
  const byAddressRef = useRef(new Map())

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

  const geojsonData = useMemo(() => {
    const features = []
    for (const [address, addressUnits] of byAddress.entries()) {
      const coords = geocoded[address]
      if (!coords) continue
      if (searchCoords) {
        const dist = distanceMiles(searchCoords.lat, searchCoords.lng, coords.lat, coords.lng)
        if (dist > radiusMiles) continue
      }
      const ratedUnits = addressUnits.filter((u) => u.lease_rate != null)
      const avgRent = ratedUnits.length > 0
        ? Math.round(ratedUnits.reduce((s, u) => s + Number(u.lease_rate), 0) / ratedUnits.length)
        : null
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] },
        properties: {
          address,
          unitCount: addressUnits.length,
          avgRent,
        },
      })
    }
    return { type: 'FeatureCollection', features }
  }, [byAddress, geocoded, searchCoords, radiusMiles])

  const circleData = useMemo(
    () => (searchCoords ? circleGeoJSON(searchCoords, radiusMiles) : null),
    [searchCoords, radiusMiles],
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
      >
        <NavigationControl position="top-right" />

        {circleData && (
          <Source id="radius-circle" type="geojson" data={circleData}>
            <Layer id="radius-fill" type="fill" paint={{ 'fill-color': '#3B82F6', 'fill-opacity': 0.06 }} />
            <Layer id="radius-border" type="line" paint={{ 'line-color': '#3B82F6', 'line-width': 1.5, 'line-dasharray': [3, 2] }} />
          </Source>
        )}

        {searchCoords && (
          <Marker longitude={searchCoords.lng} latitude={searchCoords.lat} anchor="bottom">
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
                <div className="w-full h-[100px] -mx-1 -mt-1 rounded overflow-hidden bg-surface">
                  <img
                    src={propertyImageUrl(geocoded[selected].lng, geocoded[selected].lat)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
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

                <button
                  onClick={() => onSelectProperty?.(selected)}
                  className="w-full py-1.5 px-3 bg-[#3B82F6] text-white text-xs font-medium rounded hover:bg-[#2563EB] transition-colors"
                >
                  View All Units →
                </button>
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
                  searchCoords={searchCoords}
                  onClick={() => onSelectProperty?.(prop.address)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Radius overlay ───────────────────────────────────────────────────── */}
      {searchCoords && (
        <div className="absolute top-3 left-3 z-10">
          <div className="bg-white border border-border rounded-lg shadow-md px-3 py-2.5 flex items-center gap-2">
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
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    radiusMiles === r ? 'bg-[#3B82F6] text-white' : 'bg-surface text-[#555555] hover:bg-border'
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
        </div>
      )}

      {/* ── Geocoding progress ───────────────────────────────────────────────── */}
      {byAddress.size > 0 && geocodedCount < byAddress.size && (
        <div className="absolute bottom-4 left-3 bg-white border border-border rounded-lg px-3 py-1.5 text-xs text-[#777777] shadow flex items-center gap-2">
          <div className="w-3 h-3 border border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
          Locating {byAddress.size - geocodedCount} address{byAddress.size - geocodedCount !== 1 ? 'es' : ''}...
        </div>
      )}
    </div>
  )
}
