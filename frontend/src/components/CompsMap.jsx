import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import MapGL, { Marker, Popup, NavigationControl } from 'react-map-gl/mapbox'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY

function streetViewUrl(lat, lng) {
  if (GOOGLE_KEY) {
    return `https://maps.googleapis.com/maps/api/streetview?size=400x200&location=${lat},${lng}&fov=90&pitch=10&key=${GOOGLE_KEY}`
  }
  return null
}

export default function CompsMap({ addresses, hoveredAddress, onHoverAddress, pinStarCoords }) {
  const mapRef = useRef(null)
  const [geocoded, setGeocoded] = useState({})
  const [viewState, setViewState] = useState({ longitude: -79.383, latitude: 43.653, zoom: 11 })
  const [popup, setPopup] = useState(null)
  const [markerOffsets, setMarkerOffsets] = useState({})
  const geocodingRef = useRef(new Set())
  const prevZoomRef = useRef(null)

  // Geocode any new addresses
  useEffect(() => {
    if (!MAPBOX_TOKEN) return
    for (const address of addresses) {
      if (address in geocoded || geocodingRef.current.has(address)) continue
      geocodingRef.current.add(address)
      fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=CA&limit=1`
      )
        .then((r) => r.json())
        .then((data) => {
          const center = data.features?.[0]?.center
          if (center) {
            setGeocoded((prev) => ({ ...prev, [address]: { lng: center[0], lat: center[1] } }))
          }
        })
        .catch(() => {})
    }
  }, [addresses])


  // Recompute pixel-based spread offsets for overlapping markers
  const recomputeOffsets = useCallback(() => {
    const map = mapRef.current?.getMap?.()
    if (!map) return

    const pixelPos = {}
    for (const address of addresses) {
      const c = geocoded[address]
      if (!c) continue
      const { x, y } = map.project([c.lng, c.lat])
      pixelPos[address] = { x, y }
    }

    const addrList = Object.keys(pixelPos)
    const visited = new Set()
    const result = {}
    const SPREAD_PX = 28
    const RADIUS_PX = 10

    for (const addr of addrList) {
      if (visited.has(addr)) continue
      const group = [addr]
      visited.add(addr)

      for (const other of addrList) {
        if (visited.has(other)) continue
        const dx = pixelPos[other].x - pixelPos[addr].x
        const dy = pixelPos[other].y - pixelPos[addr].y
        if (dx * dx + dy * dy < SPREAD_PX * SPREAD_PX) {
          group.push(other)
          visited.add(other)
        }
      }

      if (group.length === 1) {
        result[group[0]] = [0, 0]
      } else {
        group.forEach((a, i) => {
          const angle = (i / group.length) * 2 * Math.PI - Math.PI / 2
          result[a] = [
            Math.round(RADIUS_PX * Math.cos(angle)),
            Math.round(RADIUS_PX * Math.sin(angle)),
          ]
        })
      }
    }

    setMarkerOffsets(result)
  }, [addresses, geocoded])

  // Recompute after geocoding updates
  useEffect(() => {
    const t = setTimeout(recomputeOffsets, 50)
    return () => clearTimeout(t)
  }, [recomputeOffsets])

  // Recompute on zoom change
  const handleMove = useCallback((e) => {
    setViewState(e.viewState)
    const z = Math.round(e.viewState.zoom)
    if (z !== prevZoomRef.current) {
      prevZoomRef.current = z
      requestAnimationFrame(recomputeOffsets)
    }
  }, [recomputeOffsets])

  // Fit map to show all geocoded pins
  useEffect(() => {
    const coords = addresses.map((a) => geocoded[a]).filter(Boolean)
    if (coords.length === 0) return
    const map = mapRef.current?.getMap?.()
    if (!map) return

    if (coords.length === 1) {
      setViewState((v) => ({ ...v, longitude: coords[0].lng, latitude: coords[0].lat, zoom: 14 }))
      return
    }

    const lngs = coords.map((c) => c.lng)
    const lats = coords.map((c) => c.lat)
    const bounds = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ]
    map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 })
  }, [geocoded, addresses])

  const geocodedCount = addresses.filter((a) => geocoded[a]).length

  if (!MAPBOX_TOKEN) return null

  return (
    <div className="relative h-full rounded-xl overflow-hidden border border-border">
      <MapGL
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        mapLib={mapboxgl}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        onClick={() => setPopup(null)}
      >
        <NavigationControl position="top-right" />

        {/* Subject property star */}
        {pinStarCoords && (
          <Marker longitude={pinStarCoords.lng} latitude={pinStarCoords.lat} anchor="bottom">
            <svg className="w-8 h-8 drop-shadow-md" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" strokeWidth="1">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </Marker>
        )}

        {addresses.map((address, i) => {
          const c = geocoded[address]
          if (!c) return null
          const isHovered = address === hoveredAddress
          const isPopup = address === popup
          const num = i + 1

          return (
            <Marker
              key={address}
              longitude={c.lng}
              latitude={c.lat}
              anchor="center"
              offset={markerOffsets[address] || [0, 0]}
            >
              <div
                onMouseEnter={() => onHoverAddress?.(address)}
                onMouseLeave={() => onHoverAddress?.(null)}
                onClick={(e) => { e.stopPropagation(); setPopup(isPopup ? null : address) }}
                style={{ transition: 'transform 0.15s, box-shadow 0.15s' }}
                className={`cursor-pointer w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold select-none
                  ${isHovered || isPopup
                    ? 'bg-[#1D4ED8] scale-125 shadow-lg'
                    : 'bg-[#3B82F6] scale-100 shadow-md'
                  }`}
              >
                {num}
              </div>
            </Marker>
          )
        })}

        {popup && geocoded[popup] && (
          <Popup
            longitude={geocoded[popup].lng}
            latitude={geocoded[popup].lat}
            onClose={() => setPopup(null)}
            closeOnClick={false}
            anchor="top"
            maxWidth="260px"
            className="comp-map-popup"
          >
            <div className="p-1 min-w-[200px]">
              {streetViewUrl(geocoded[popup].lat, geocoded[popup].lng) && (
                <div className="w-full h-[110px] rounded overflow-hidden mb-2 bg-surface">
                  <img
                    src={streetViewUrl(geocoded[popup].lat, geocoded[popup].lng)}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                </div>
              )}
              <p className="text-xs font-semibold text-primary leading-snug">{popup}</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(popup)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[#3B82F6] hover:underline mt-1 inline-block"
              >
                Open in Google Maps →
              </a>
            </div>
          </Popup>
        )}
      </MapGL>

      {/* Geocoding progress */}
      {geocodedCount < addresses.length && (
        <div className="absolute bottom-3 left-3 bg-white border border-border rounded-lg px-3 py-1.5 text-xs text-[#777] shadow flex items-center gap-2">
          <div className="w-3 h-3 border border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
          Locating {geocodedCount}/{addresses.length}
        </div>
      )}
    </div>
  )
}
