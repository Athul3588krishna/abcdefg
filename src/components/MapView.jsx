import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Circle, Polyline, Popup, useMap, useMapEvents, useMapEvent } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';

// Custom MapController sub-component to handle map fly-to and auto-recentering
const MapController = ({ center, autoFollow, bounds, pendingRoad, isDashboardExpanded }) => {
  const map = useMap();

  // Invalidate size on mount to make sure Leaflet occupies full dimensions
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);

  // Re-invalidate when pendingRoad mode or dashboard expansion changes (layout shifts)
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [pendingRoad, isDashboardExpanded, map]);

  // Fit bounds when the boundary polygon changes
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, {
        padding: [40, 40],
        maxZoom: 18,
        animate: true,
        duration: 1.0
      });
    }
  }, [bounds, map]);

  // Centering on user's real-time coordinates
  useEffect(() => {
    if (center && autoFollow) {
      map.setView(center, Math.max(map.getZoom(), 17), {
        animate: true,
        duration: 0.8
      });
    }
  }, [center, autoFollow, map]);

  return null;
};

// Preview line tracker: shows a live line from road start to mouse cursor
const RoadPreviewLine = ({ startLatLng }) => {
  const [mouseLatLng, setMouseLatLng] = useState(null);

  useMapEvent('mousemove', (e) => {
    setMouseLatLng([e.latlng.lat, e.latlng.lng]);
  });

  if (!mouseLatLng) return null;

  return (
    <Polyline
      positions={[[startLatLng.latitude, startLatLng.longitude], mouseLatLng]}
      color="#f59e0b"
      weight={3}
      opacity={0.85}
      dashArray="8, 6"
    />
  );
};

// Custom SVG Pulsing Dot for user location marker
const userLocationIcon = L.divIcon({
  className: 'user-location-container',
  html: `
    <div class="user-pulse-dot"></div>
    <div class="user-pulse-ring"></div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

// Custom Census Marker generator for dynamic symbol rendering
const getCensusMarkerIcon = (type, number) => {
  let html = '';
  const size = [30, 30];
  const markerNumber = escapeHtml(number);

  if (type === 'pucca_residential') {
    // Open square with house number inside
    html = `<div class="census-marker pucca-residential">${markerNumber}</div>`;
  } else if (type === 'pucca_non_residential') {
    // Solid square
    html = `<div class="census-marker pucca-non-residential"></div>`;
  } else if (type === 'kutcha_residential') {
    // Open triangle with number inside using SVG
    html = `
      <div class="census-marker kutcha-residential">
        <svg viewBox="0 0 30 30" width="30" height="30">
          <polygon points="15,2 28,26 2,26" fill="white" stroke="white" stroke-width="2.5"/>
          <text x="15" y="21" font-size="10" font-family="system-ui, -apple-system, sans-serif" font-weight="900" text-anchor="middle" fill="black">${markerNumber}</text>
        </svg>
      </div>
    `;
  } else if (type === 'kutcha_non_residential') {
    // Solid triangle using SVG
    html = `
      <div class="census-marker kutcha-non-residential">
        <svg viewBox="0 0 30 30" width="30" height="30">
          <polygon points="15,2 28,26 2,26" fill="white" stroke="black" stroke-width="2.5"/>
        </svg>
      </div>
    `;
  } else {
    // Landmark emojis (temple, mosque, church, school, dispensary, post_office, well_tap, other)
    let emoji = '📍';
    if (type === 'temple') emoji = '🛕';
    else if (type === 'mosque') emoji = '🕌';
    else if (type === 'church') emoji = '⛪';
    else if (type === 'school') emoji = '🏫';
    else if (type === 'dispensary') emoji = '🏥';
    else if (type === 'post_office') emoji = '📮';
    else if (type === 'well_tap') emoji = '🚰';

    html = `<div class="census-marker landmark-marker">${emoji}</div>`;
  }

  return L.divIcon({
    className: `census-marker-icon-container marker-type-${type || 'pucca_residential'}`,
    html: html,
    iconSize: size,
    iconAnchor: [15, 15],
    popupAnchor: [0, -10]
  });
};

// Component to handle map click events
const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      // Stop propagation to prevent duplicate events on mobile
      e.originalEvent.stopPropagation();
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
};

const MapView = ({ activeGeoJson, allBoundaries = {}, selectedHlb, coords, trail, autoFollow, mapType, setMapType, isInside, houses = [], onDeleteHouse, onMapClick, pendingRoad, isDashboardExpanded }) => {
  const [mapBounds, setMapBounds] = useState(null);

  // Compute GeoJSON polygon bounds using Turf.js
  useEffect(() => {
    if (activeGeoJson) {
      try {
        const bbox = turf.bbox(activeGeoJson);
        // bbox returns [minLng, minLat, maxLng, maxLat]
        // Leaflet expects [[minLat, minLng], [maxLat, maxLng]]
        const bounds = [
          [bbox[1], bbox[0]],
          [bbox[3], bbox[2]]
        ];
        setMapBounds(bounds);
      } catch (err) {
        console.error("Failed to compute boundary bounds with turf.bbox:", err);
      }
    }
  }, [activeGeoJson]);

  const userCenter = coords ? [coords.latitude, coords.longitude] : null;
  const polylinePositions = trail.map(pt => [pt.latitude, pt.longitude]);
  const roadItems = houses.filter((item) => item.points?.length === 2 && item.hlb === selectedHlb);
  const houseRoutePositions = houses
    .slice()
    .filter((item) => !item.points && item.hlb === selectedHlb)
    .sort((a, b) => (a.timestamp || a.id) - (b.timestamp || b.id))
    .map(house => [house.latitude, house.longitude]);

  // Dynamic style for the boundary polygon
  const geojsonStyle = {
    color: isInside ? '#10b981' : '#ef4444', // Green if inside, Red if outside
    weight: 3,
    opacity: 0.85,
    fillColor: isInside ? '#10b981' : '#ef4444',
    fillOpacity: 0.15,
    dashArray: isInside ? 'none' : '5, 8'
  };

  return (
    <div className="map-view-wrapper">
      {/* Sleek Custom Map Layer Switcher */}
      <div className="map-layer-selector">
        <button
          className={`layer-btn ${mapType === 'streets' ? 'active' : ''}`}
          onClick={() => setMapType('streets')}
          title="Street map view"
        >
          🗺️ Map
        </button>
        <button
          className={`layer-btn ${mapType === 'satellite' ? 'active' : ''}`}
          onClick={() => setMapType('satellite')}
          title="Satellite imagery view"
        >
          🛰️ Satellite
        </button>
      </div>

      <MapContainer
        center={[10.940, 76.200]} // Pulamanthole initial default center
        zoom={16}
        zoomControl={false} // Disable default zoom control to position custom controls beautifully
        className="leaflet-map-container"
      >
        {mapType === 'streets' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        )}

        {/* Map state updates */}
        <MapController center={userCenter} autoFollow={autoFollow} bounds={mapBounds} pendingRoad={pendingRoad} isDashboardExpanded={isDashboardExpanded} />

        {/* Map click listener to add houses */}
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

        {/* Preview line while drawing a road */}
        {pendingRoad && <RoadPreviewLine startLatLng={pendingRoad.start} />}

        {/* Render only the selected active boundary */}
        {activeGeoJson && (
          <GeoJSON
            key={`${selectedHlb}-${isInside}`}
            data={activeGeoJson}
            style={geojsonStyle}
          />
        )}

        {/* Walking trail path */}
        {polylinePositions.length > 0 && (
          <Polyline
            positions={polylinePositions}
            color="#aa3bff"
            weight={3.5}
            opacity={0.8}
            dashArray="1, 5"
          />
        )}

        {/* Census layout order path between marked structures */}
        {houseRoutePositions.length > 1 && (
          <Polyline
            positions={houseRoutePositions}
            color="#111827"
            weight={2.5}
            opacity={0.72}
            dashArray="8, 8"
          />
        )}

        {/* Census road and path symbols */}
        {roadItems.map((road) => {
          const positions = road.points.map(point => [point.latitude, point.longitude]);
          const isKutchaRoad = road.type === 'kutcha_road';
          const isFootpath = road.type === 'footpath';
          const roadLabel = road.type === 'pucca_road'
            ? 'Pucca Road'
            : road.type === 'kutcha_road'
              ? 'Kutcha Road'
              : 'Footpath / Lane';

          if (isFootpath) {
            return (
              <Polyline
                key={road.id}
                positions={positions}
                color="#111827"
                weight={3}
                opacity={0.9}
                dashArray="1, 8"
              >
                <Popup className="house-leaflet-popup">
                  <div className="house-popup-card">
                    <h5>{roadLabel}: {road.name}</h5>
                    {road.owner && <p><strong>Info:</strong> {road.owner}</p>}
                  </div>
                </Popup>
              </Polyline>
            );
          }

          return (
            <React.Fragment key={road.id}>
              <Polyline
                positions={positions}
                color="#111827"
                weight={9}
                opacity={0.85}
                dashArray={isKutchaRoad ? '14, 10' : undefined}
              />
              <Polyline
                positions={positions}
                color="#ffffff"
                weight={5}
                opacity={0.95}
                dashArray={isKutchaRoad ? '14, 10' : undefined}
              >
                <Popup className="house-leaflet-popup">
                  <div className="house-popup-card">
                    <h5>{roadLabel}: {road.name}</h5>
                    {road.owner && <p><strong>Info:</strong> {road.owner}</p>}
                    <p><strong>HLB:</strong> {road.hlb}</p>
                    <p><strong>Status:</strong> <span className={road.isInside ? 'txt-success' : 'txt-danger'}>
                      {road.isInside ? 'Inside' : 'Outside'}
                    </span></p>
                  </div>
                </Popup>
              </Polyline>
            </React.Fragment>
          );
        })}

        {/* Live GPS location marker & accuracy circle */}
        {coords && (
          <>
            <Marker position={userCenter} icon={userLocationIcon} />
            <Circle
              center={userCenter}
              radius={coords.accuracy}
              pathOptions={{
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.12,
                weight: 1
              }}
            />
          </>
        )}

        {/* Render markers only belonging to the active HLB */}
        {houses.filter((house) => !house.points && house.hlb === selectedHlb).map(house => {
          const getEmoji = (type) => {
            if (type === 'pucca_residential') return '☐';
            if (type === 'pucca_non_residential') return '◼';
            if (type === 'kutcha_residential') return '△';
            if (type === 'kutcha_non_residential') return '▲';
            if (type === 'temple') return '🛕';
            if (type === 'mosque') return '🕌';
            if (type === 'church') return '⛪';
            if (type === 'school') return '🏫';
            if (type === 'dispensary') return '🏥';
            if (type === 'post_office') return '📮';
            if (type === 'well_tap') return '🚰';
            return '📍';
          };

          const typeLabels = {
            pucca_residential: 'Pucca Residential (പാക്ക വീട്)',
            pucca_non_residential: 'Pucca Non-Residential (പാക്ക ഇതര കെട്ടിടം)',
            kutcha_residential: 'Kutcha Residential (കച്ച വീട്)',
            kutcha_non_residential: 'Kutcha Non-Residential (കച്ച ഇതര കെട്ടിടം)',
            temple: 'Temple (ക്ഷേത്രം)',
            mosque: 'Mosque (മോസ്ക് / പള്ളി)',
            church: 'Church (ചർച്ച് / പള്ളി)',
            school: 'School (സ്കൂൾ)',
            dispensary: 'Dispensary/Hospital (ആശുപത്രി / ഡിസ്പെൻസറി)',
            post_office: 'Post Office (പോസ്റ്റ് ഓഫീസ്)',
            well_tap: 'Well/Tap/Pump (കിണർ / പൈപ്പ് / പമ്പ്)',
            other: 'Landmark (മറ്റു പ്രധാന സ്ഥലങ്ങൾ)'
          };

          return (
            <Marker 
              key={house.id} 
              position={[house.latitude, house.longitude]} 
              icon={getCensusMarkerIcon(house.type, house.number)}
            >
              <Popup className="house-leaflet-popup">
                <div className="house-popup-card">
                  <h5><span className="house-popup-emoji-prefix">{getEmoji(house.type)}</span> {house.number ? `${house.number} - ${house.name}` : house.name}</h5>
                  <div className="house-popup-details">
                    <p><strong>Type (തരം):</strong> {typeLabels[house.type] || 'Pucca Residential'}</p>
                    {house.number && <p><strong>Building No (നമ്പർ):</strong> {house.number}</p>}
                    {house.name && <p><strong>Name (പേര്):</strong> {house.name}</p>}
                    {house.owner && <p><strong>Owner/Info (ഉടമസ്ഥൻ):</strong> {house.owner}</p>}
                    <p><strong>HLB:</strong> {house.hlb}</p>
                    <p><strong>Lat:</strong> {house.latitude.toFixed(6)}</p>
                    <p><strong>Lng:</strong> {house.longitude.toFixed(6)}</p>
                    <p><strong>Status:</strong> <span className={house.isInside ? 'txt-success' : 'txt-danger'}>
                      {house.isInside ? '🟢 Inside (അകത്ത്)' : '🔴 Outside (പുറത്ത്)'}
                    </span></p>
                  </div>
                  <div className="house-popup-actions">
                    <button 
                      className="btn-popup-navigate"
                      onClick={() => {
                        const url = `https://www.google.com/maps/dir/?api=1&destination=${house.latitude},${house.longitude}`;
                        window.open(url, '_blank');
                      }}
                    >
                      🧭 വഴി കാട്ടുക (Directions)
                    </button>
                    <button 
                      className="btn-popup-delete-house"
                      onClick={() => onDeleteHouse(house.id)}
                    >
                      Delete 🗑️
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapView;
