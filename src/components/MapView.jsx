import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Circle, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';

// Custom MapController sub-component to handle map fly-to and auto-recentering
const MapController = ({ center, autoFollow, bounds }) => {
  const map = useMap();

  // Invalidate size on mount to make sure Leaflet occupies full dimensions
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);

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

// Custom House Emoji marker for survey mapping
const houseMarkerIcon = L.divIcon({
  className: 'house-marker-icon-container',
  html: `<div class="house-marker-emoji">🏠</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -10]
});

// Component to handle map click events
const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
};

const MapView = ({ activeGeoJson, allBoundaries = {}, selectedHlb, coords, trail, autoFollow, mapType, setMapType, isInside, houses = [], onDeleteHouse, onMapClick }) => {
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
        <MapController center={userCenter} autoFollow={autoFollow} bounds={mapBounds} />

        {/* Map click listener to add houses */}
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

        {/* Render all boundaries */}
        {Object.entries(allBoundaries).map(([hlbId, geojson]) => {
          const isActive = hlbId === selectedHlb;
          const style = isActive ? geojsonStyle : {
            color: '#64748b',       // Soft slate gray
            weight: 2.5,
            opacity: 0.7,
            fillColor: '#94a3b8',
            fillOpacity: 0.05,
            dashArray: '6, 8'       // Dashed border to indicate neighbor
          };
          
          return (
            <GeoJSON
              key={`${hlbId}-${isActive}-${isActive ? isInside : ''}`} // Re-render when active status changes
              data={geojson}
              style={style}
            />
          );
        })}

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

        {/* Render house markers */}
        {houses.map(house => (
          <Marker 
            key={house.id} 
            position={[house.latitude, house.longitude]} 
            icon={houseMarkerIcon}
          >
            <Popup className="house-leaflet-popup">
              <div className="house-popup-card">
                <h5>🏠 {house.number ? `${house.number} - ${house.name}` : house.name}</h5>
                <div className="house-popup-details">
                  {house.number && <p><strong>House No (നമ്പർ):</strong> {house.number}</p>}
                  {house.name && <p><strong>House Name (പേര്):</strong> {house.name}</p>}
                  {house.owner && <p><strong>Owner (ഉടമസ്ഥൻ):</strong> {house.owner}</p>}
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
        ))}
      </MapContainer>
    </div>
  );
};

export default MapView;
