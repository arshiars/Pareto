import { useState, useEffect } from 'react'
import MapGL, { Marker, NavigationControl } from 'react-map-gl/mapbox'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY

function streetViewUrl(lat, lng) {
  if (GOOGLE_KEY) {
    return `https://maps.googleapis.com/maps/api/streetview?size=800x300&location=${lat},${lng}&fov=90&pitch=10&key=${GOOGLE_KEY}`
  }
  return null
}

export default function PropertyMap({ address }) {
  const [coords, setCoords] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imgError, setImgError] = useState(false)
  const [viewState, setViewState] = useState(null)

  useEffect(() => {
    if (!MAPBOX_TOKEN || !address) return
    setLoading(true)
    setCoords(null)
    setImgError(false)
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=CA&limit=1`
    )
      .then((r) => r.json())
      .then((data) => {
        const center = data.features?.[0]?.center
        if (center) {
          const c = { lng: center[0], lat: center[1] }
          setCoords(c)
          setViewState({ longitude: c.lng, latitude: c.lat, zoom: 15 })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address])

  if (!MAPBOX_TOKEN) return null

  const svUrl = coords ? streetViewUrl(coords.lat, coords.lng) : null

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Interactive map */}
      <div className="rounded-xl overflow-hidden border border-border" style={{ height: 260 }}>
        {loading && (
          <div className="flex items-center justify-center h-full bg-surface text-xs text-[#999] gap-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Locating…
          </div>
        )}
        {!loading && !coords && (
          <div className="flex items-center justify-center h-full bg-surface text-xs text-[#999]">
            Could not locate address
          </div>
        )}
        {!loading && coords && viewState && (
          <MapGL
            {...viewState}
            onMove={(e) => setViewState(e.viewState)}
            mapLib={mapboxgl}
            mapStyle="mapbox://styles/mapbox/light-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />
            <Marker longitude={coords.lng} latitude={coords.lat} anchor="bottom">
              <svg className="w-8 h-8 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="#1F3A60" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#1F3A60" />
                <circle cx="12" cy="9" r="2.5" fill="white" />
              </svg>
            </Marker>
          </MapGL>
        )}
      </div>

      {/* Street View */}
      <div className="rounded-xl overflow-hidden border border-border bg-surface" style={{ height: 260 }}>
        {!coords || !svUrl ? (
          <div className="flex items-center justify-center h-full text-xs text-[#999]">
            {loading ? 'Loading…' : 'No street view available'}
          </div>
        ) : imgError ? (
          <div className="flex items-center justify-center h-full text-xs text-[#999]">
            Street view unavailable
          </div>
        ) : (
          <img
            src={svUrl}
            alt={`Street view of ${address}`}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        )}
      </div>
    </div>
  )
}
