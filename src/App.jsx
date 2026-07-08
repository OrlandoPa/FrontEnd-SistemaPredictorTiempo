import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Helper de hora local actual en formato YYYY-MM-DDTHH:MM
const localNow = () => {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const API_URL = import.meta.env.VITE_API_URL || 'https://sistema-predictor-tiempo-transporte.onrender.com';

export default function App() {
  const [clickMode, setClickMode] = useState('origin');
  const [origLat, setOrigLat] = useState('');
  const [origLon, setOrigLon] = useState('');
  const [destLat, setDestLat] = useState('');
  const [destLon, setDestLon] = useState('');
  const [tripDatetime, setTripDatetime] = useState(localNow());
  const [addressSearch, setAddressSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('');
  const [predictionResult, setPredictionResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  const mapInstanceRef = useRef(null);
  const markersRef = useRef({ origin: null, destination: null });
  const routeLayerRef = useRef(null);
  const clickModeRef = useRef('origin');
  const osrmDistanceRef = useRef(null);
  const osrmDurationRef = useRef(null);

  // Mantener clickModeRef sincronizado para callbacks de Leaflet
  useEffect(() => {
    clickModeRef.current = clickMode;
  }, [clickMode]);

  // Inicialización del mapa Leaflet
  useEffect(() => {
    // Centrado en Trujillo, Perú
    const map = L.map('map', { zoomControl: true }).setView([-8.1116, -79.0288], 13);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      placeMarker(lat, lng, clickModeRef.current);
      setClickMode(prev => prev === 'origin' ? 'destination' : 'origin');
    });

    return () => {
      map.remove();
    };
  }, []);

  // Actualizar trazado de ruta en mapa al cambiar coordenadas
  useEffect(() => {
    fetchRoute();
  }, [origLat, origLon, destLat, destLon]);

  // Sincronizar marcadores del mapa cuando el usuario tipea coordenadas
  useEffect(() => {
    const oLat = parseFloat(origLat);
    const oLon = parseFloat(origLon);
    if (!isNaN(oLat) && !isNaN(oLon)) {
      syncMarker(oLat, oLon, 'origin');
    }
  }, [origLat, origLon]);

  useEffect(() => {
    const dLat = parseFloat(destLat);
    const dLon = parseFloat(destLon);
    if (!isNaN(dLat) && !isNaN(dLon)) {
      syncMarker(dLat, dLon, 'destination');
    }
  }, [destLat, destLon]);

  const syncMarker = (lat, lng, type) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentMarker = markersRef.current[type];
    if (currentMarker) {
      const currLatLng = currentMarker.getLatLng();
      if (currLatLng.lat.toFixed(6) !== lat.toFixed(6) || currLatLng.lng.toFixed(6) !== lng.toFixed(6)) {
        currentMarker.setLatLng([lat, lng]);
      }
    } else {
      createMarker(lat, lng, type);
    }
  };

  const createMarker = (lat, lng, type) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const iconColor = type === 'origin' ? '#22c55e' : '#ef4444';
    const customIcon = L.divIcon({
      html: `<div style="
        width:16px;height:16px;
        background:${iconColor};
        border:3px solid rgba(255,255,255,0.95);
        border-radius:50%;
        box-shadow:0 2px 8px rgba(0,0,0,0.55);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      className: ''
    });

    const marker = L.marker([lat, lng], {
      icon: customIcon,
      draggable: true
    }).addTo(map)
      .bindPopup(type === 'origin' ? '📍 Origen' : '🏁 Destino')
      .openPopup();

    markersRef.current[type] = marker;

    marker.on('dragend', (e) => {
      const { lat: dLat, lng: dLng } = e.target.getLatLng();
      if (type === 'origin') {
        setOrigLat(dLat.toFixed(6));
        setOrigLon(dLng.toFixed(6));
      } else {
        setDestLat(dLat.toFixed(6));
        setDestLon(dLng.toFixed(6));
      }
    });
  };

  const placeMarker = (lat, lng, type) => {
    createMarker(lat, lng, type);
    if (type === 'origin') {
      setOrigLat(lat.toFixed(6));
      setOrigLon(lng.toFixed(6));
    } else {
      setDestLat(lat.toFixed(6));
      setDestLon(lng.toFixed(6));
    }
  };

  const fetchRoute = async () => {
    const oLat = parseFloat(origLat);
    const oLon = parseFloat(origLon);
    const dLat = parseFloat(destLat);
    const dLon = parseFloat(destLon);

    if (routeLayerRef.current) {
      mapInstanceRef.current.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (isNaN(oLat) || isNaN(oLon) || isNaN(dLat) || isNaN(dLon)) return;
    if (oLat === dLat && oLon === dLon) return;

    setIsRouteLoading(true);

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?overview=full&geometries=geojson&steps=false`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('OSRM HTTP error ' + resp.status);

      const data = await resp.json();

      if (data.code !== 'Ok' || !data.routes?.length) {
        drawFallbackLine(oLat, oLon, dLat, dLon);
        return;
      }

      const route = data.routes[0];
      const geojson = route.geometry;

      osrmDistanceRef.current = route.distance / 1000;
      osrmDurationRef.current = route.duration / 60;

      const layer = L.geoJSON(geojson, {
        style: {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round'
        }
      }).addTo(mapInstanceRef.current);

      routeLayerRef.current = layer;
      mapInstanceRef.current.fitBounds(layer.getBounds(), { padding: [55, 55], maxZoom: 16 });

    } catch (err) {
      console.warn('OSRM error, using fallback:', err);
      drawFallbackLine(oLat, oLon, dLat, dLon);
    } finally {
      setIsRouteLoading(false);
    }
  };

  const drawFallbackLine = (oLat, oLon, dLat, dLon) => {
    if (routeLayerRef.current) {
      mapInstanceRef.current.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    const layer = L.polyline(
      [[oLat, oLon], [dLat, dLon]],
      { color: '#64748b', weight: 2, dashArray: '8, 6', opacity: 0.65 }
    ).addTo(mapInstanceRef.current);

    routeLayerRef.current = layer;
    mapInstanceRef.current.fitBounds(layer.getBounds(), { padding: [55, 55], maxZoom: 16 });

    osrmDistanceRef.current = null;
    osrmDurationRef.current = null;
  };

  const handleSearchAddress = async (e) => {
    if (e) e.preventDefault();
    const q = addressSearch.trim();
    if (!q) return;

    setSearchStatus('Buscando…');

    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=4&countrycodes=pe`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await resp.json();

      if (!data.length) {
        setSearchStatus('Sin resultados. Intenta ser más específico.');
        setSearchResults([]);
        return;
      }

      setSearchStatus('');
      setSearchResults(data);
    } catch (err) {
      setSearchStatus('Error de red. Comprueba tu conexión.');
      setSearchResults([]);
    }
  };

  const applyResult = (lat, lon) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    if (clickMode === 'origin') {
      setOrigLat(latNum.toFixed(6));
      setOrigLon(lonNum.toFixed(6));
      setClickMode('destination');
    } else {
      setDestLat(latNum.toFixed(6));
      setDestLon(lonNum.toFixed(6));
      setClickMode('origin');
    }

    map.setView([latNum, lonNum], 15);
    setSearchResults([]);
    setAddressSearch('');
  };

  const handleSubmitPrediction = async (e) => {
    if (e) e.preventDefault();

    const oLat = parseFloat(origLat);
    const oLon = parseFloat(origLon);
    const dLat = parseFloat(destLat);
    const dLon = parseFloat(destLon);

    if (isNaN(oLat) || isNaN(oLon) || isNaN(dLat) || isNaN(dLon)) {
      alert('Por favor completa las coordenadas de origen y destino.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orig_lat: oLat,
          orig_lon: oLon,
          dest_lat: dLat,
          dest_lon: dLon
        })
      });

      const result = await response.json();

      if (!result.success) throw new Error(result.error || 'Error en el servidor');

      const minutos = result.predicted_minutes;

      let durText = minutos >= 60 
        ? `${Math.floor(minutos/60)}h ${Math.round(minutos % 60)}m` 
        : `${Math.round(minutos)}`;
      
      let durUnit = minutos < 60 ? (Math.round(minutos) === 1 ? 'minuto' : 'minutos') : '';

      setPredictionResult({
        predictedMinutes: minutos,
        durationText: durText,
        durationUnit: durUnit,
        distanceText: `Predicción IA • ${minutos.toFixed(1)} minutos`
      });

    } catch (err) {
      console.error(err);
      alert(`No se pudo conectar con el servidor. Asegúrate de que el backend esté activo en: ${API_URL}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setPredictionResult(null);
    setOrigLat('');
    setOrigLon('');
    setDestLat('');
    setDestLon('');
    setTripDatetime(localNow());

    const map = mapInstanceRef.current;
    if (map) {
      if (markersRef.current.origin) {
        map.removeLayer(markersRef.current.origin);
        markersRef.current.origin = null;
      }
      if (markersRef.current.destination) {
        map.removeLayer(markersRef.current.destination);
        markersRef.current.destination = null;
      }
      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }
      map.setView([-8.1116, -79.0288], 13);
    }

    osrmDistanceRef.current = null;
    osrmDurationRef.current = null;
    setSearchResults([]);
    setAddressSearch('');
    setClickMode('origin');
  };

  return (
    <>
      <div className="header">
        <div className="header-brand">
          <div className="brand-icon">🗺️</div>
          <h1>Travel<span>Time</span></h1>
        </div>
      </div>

      <div className="app-body">
        {/* MAP */}
        <div className="map-wrap">
          <div id="map"></div>
          <div className="map-hint" id="map-hint">
            {clickMode === 'origin' ? (
              <>📍 Haz clic para fijar el <strong>origen</strong></>
            ) : (
              <>🏁 Haz clic para fijar el <strong>destino</strong></>
            )}
          </div>
          <div className={`route-loading ${isRouteLoading ? '' : 'hidden'}`} id="route-loading">
            <span className="spinner"></span> Trazando ruta…
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="sidebar-header">
            <p className="sidebar-title">¿Cuánto tardarás en llegar?</p>
            <p className="sidebar-sub">Haz clic en el mapa para marcar origen y destino, o busca una dirección.</p>
          </div>

          {/* Búsqueda de Direcciones */}
          <div className="search-section">
            <p className="section-label">🔍 Buscar dirección</p>
            <form className="search-row" onSubmit={handleSearchAddress}>
              <input 
                type="text" 
                className="search-input" 
                value={addressSearch}
                onChange={(e) => setAddressSearch(e.target.value)}
                placeholder="Ej: Av. España, Trujillo"
              />
              <button type="submit" className="search-go-btn">Buscar</button>
            </form>
            
            {searchStatus && (
              <p style={{ fontSize: '0.73rem', color: '#ef4444', marginTop: '0.4rem' }}>{searchStatus}</p>
            )}

            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((r, i) => {
                  const label = r.display_name.split(',').slice(0, 3).join(', ');
                  return (
                    <div 
                      key={i}
                      className="result-item" 
                      onClick={() => applyResult(r.lat, r.lon)}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Badges de Coordenadas */}
          <div className="points-grid">
            <div 
              className={`point-badge ${clickMode === 'origin' ? 'active' : ''} ${origLat && origLon ? 'placed' : ''}`} 
              onClick={() => setClickMode('origin')}
            >
              <div className="badge-label"><span className="badge-dot o"></span> Origen</div>
              <div className={`badge-coords ${origLat && origLon ? 'set' : ''}`}>
                {origLat && origLon ? `${parseFloat(origLat).toFixed(4)}, ${parseFloat(origLon).toFixed(4)}` : 'Sin seleccionar'}
              </div>
            </div>
            <div 
              className={`point-badge ${clickMode === 'destination' ? 'active' : ''} ${destLat && destLon ? 'placed' : ''}`} 
              onClick={() => setClickMode('destination')}
            >
              <div className="badge-label"><span className="badge-dot d"></span> Destino</div>
              <div className={`badge-coords ${destLat && destLon ? 'set' : ''}`}>
                {destLat && destLon ? `${parseFloat(destLat).toFixed(4)}, ${parseFloat(destLon).toFixed(4)}` : 'Sin seleccionar'}
              </div>
            </div>
          </div>

          <hr className="divider" />

          {/* Formulario de Coordenadas */}
          <form id="prediction-form" autoComplete="off" onSubmit={handleSubmitPrediction}>
            <div className="form-fields">
              <div className="form-group">
                <label className="form-label">Origen — Lat / Lon</label>
                <div className="coords-grid">
                  <input 
                    type="number" 
                    className="coord-input" 
                    value={origLat}
                    onChange={(e) => setOrigLat(e.target.value)}
                    step="0.000001" 
                    placeholder="Latitud"
                  />
                  <input 
                    type="number" 
                    className="coord-input" 
                    value={origLon}
                    onChange={(e) => setOrigLon(e.target.value)}
                    step="0.000001" 
                    placeholder="Longitud"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Destino — Lat / Lon</label>
                <div className="coords-grid">
                  <input 
                    type="number" 
                    className="coord-input" 
                    value={destLat}
                    onChange={(e) => setDestLat(e.target.value)}
                    step="0.000001" 
                    placeholder="Latitud"
                  />
                  <input 
                    type="number" 
                    className="coord-input" 
                    value={destLon}
                    onChange={(e) => setDestLon(e.target.value)}
                    step="0.000001" 
                    placeholder="Longitud"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">📅 Fecha y hora del viaje</label>
                <input 
                  type="datetime-local" 
                  className="datetime-input" 
                  value={tripDatetime}
                  onChange={(e) => setTripDatetime(e.target.value)}
                />
              </div>

              <button type="submit" className="predict-btn" disabled={isLoading}>
                {isLoading ? 'Calculando con IA...' : '🔮 Estimar tiempo de viaje'}
              </button>
            </div>
          </form>

          {/* Resultado */}
          {predictionResult && (
            <div className="result-card" id="result">
              <p className="result-eyebrow">⏱ Tu viaje tomará aproximadamente</p>
              <p className="result-duration">{predictionResult.durationText}</p>
              <p className="result-unit">{predictionResult.durationUnit}</p>
              <p className="result-distance">{predictionResult.distanceText}</p>
              <div id="traffic-indicator">
                <span className="traffic-pill medium">🤖 LightGBM Model</span>
              </div>
              <p className="speed-note">Estimación basada en Machine Learning</p>
              <button className="reset-btn" onClick={handleReset}>↩ Nueva estimación</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
