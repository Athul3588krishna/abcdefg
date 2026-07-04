import React, { useState, useEffect, useRef } from 'react';
import * as turf from '@turf/turf';
import './App.css';

// Import components
import MapView from './components/MapView';
import StatusCard from './components/StatusCard';
import GPSInfo from './components/GPSInfo';
import LiveLocation from './components/LiveLocation';

// Import services
import { startTracking, stopTracking } from './services/gps';
import { checkGeofence, getPolygonCenter } from './services/geofence';
import {
  getSelectedHlb,
  saveSelectedHlb,
  getGpsTrail,
  saveGpsTrail,
  clearGpsTrail,
  getAutoFollow,
  saveAutoFollow,
  getSavedHouses,
  saveHouses
} from './services/storage';

const ROAD_TYPES = new Set(['pucca_road', 'kutcha_road', 'footpath']);

const isRoadType = (type) => ROAD_TYPES.has(type);

const getItemCoordinates = (item) => {
  if (item.points?.length === 2) {
    const [start, end] = item.points;
    return `${start.latitude.toFixed(6)}, ${start.longitude.toFixed(6)} -> ${end.latitude.toFixed(6)}, ${end.longitude.toFixed(6)}`;
  }

  return `${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)}`;
};

// Static SVG map for print — converts GeoJSON polygon + markers to SVG path
const PrintMapSvg = ({ activeGeoJson, houses, selectedHlb }) => {
  if (!activeGeoJson) return <div className="print-svg-placeholder">No boundary loaded</div>;

  const SVG_W = 700;
  const SVG_H = 620;
  const PADDING = 36;

  // Collect all coordinate rings from the GeoJSON
  const allCoords = [];
  activeGeoJson.features?.forEach((feature) => {
    const geom = feature.geometry;
    if (!geom) return;
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.type === 'MultiPolygon' ? geom.coordinates.flat() : [];
    rings.forEach((ring) => ring.forEach(([lng, lat]) => allCoords.push({ lng, lat })));
  });

  if (allCoords.length === 0) return <div className="print-svg-placeholder">No coordinates</div>;

  const minLng = Math.min(...allCoords.map(c => c.lng));
  const maxLng = Math.max(...allCoords.map(c => c.lng));
  const minLat = Math.min(...allCoords.map(c => c.lat));
  const maxLat = Math.max(...allCoords.map(c => c.lat));

  const rangeX = maxLng - minLng || 0.001;
  const rangeY = maxLat - minLat || 0.001;

  // Project geo coord to SVG pixel, flipping Y axis (lat increases upward, SVG y downward)
  const toSvg = (lng, lat) => {
    const x = PADDING + ((lng - minLng) / rangeX) * (SVG_W - PADDING * 2);
    const y = PADDING + ((maxLat - lat) / rangeY) * (SVG_H - PADDING * 2);
    return [x, y];
  };

  // Build SVG path strings for each polygon ring
  const paths = [];
  activeGeoJson.features?.forEach((feature, fi) => {
    const geom = feature.geometry;
    if (!geom) return;
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.type === 'MultiPolygon' ? geom.coordinates.flat() : [];
    rings.forEach((ring, ri) => {
      const pts = ring.map(([lng, lat]) => toSvg(lng, lat).join(','));
      paths.push(<polygon
        key={`${fi}-${ri}`}
        points={pts.join(' ')}
        fill="rgba(16,185,129,0.12)"
        stroke="#10b981"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />);
    });
  });

  // Plot road lines
  const roadLines = houses
    .filter(h => h.hlb === selectedHlb && h.points?.length === 2)
    .map((road) => {
      const [s, e] = road.points;
      const [x1, y1] = toSvg(s.longitude, s.latitude);
      const [x2, y2] = toSvg(e.longitude, e.latitude);
      const isKutcha = road.type === 'kutcha_road';
      const isFootpath = road.type === 'footpath';
      return (
        <line
          key={road.id}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#111827"
          strokeWidth={isFootpath ? 1.5 : 4}
          strokeDasharray={isKutcha ? '8,5' : isFootpath ? '2,6' : undefined}
          strokeLinecap="round"
        />
      );
    });

  // Plot house/landmark markers
  const markerSymbols = { pucca_residential: '☐', pucca_non_residential: '◼', kutcha_residential: '△', kutcha_non_residential: '▲', temple: '🛕', mosque: '🕌', church: '⛪', school: '🏫', dispensary: '🏥', post_office: '📮', well_tap: '🚰', other: '📍' };
  const markerDots = houses
    .filter(h => h.hlb === selectedHlb && !h.points)
    .map((house) => {
      const [cx, cy] = toSvg(house.longitude, house.latitude);
      const sym = markerSymbols[house.type] || '📍';
      return (
        <g key={house.id} transform={`translate(${cx},${cy})`}>
          <circle r="6" fill="#1d4ed8" fillOpacity="0.85" stroke="#fff" strokeWidth="1.5" />
          <text x="9" y="4" fontSize="9" fill="#111827" fontFamily="system-ui,sans-serif" fontWeight="700">{house.number ? `${house.number}` : sym}</text>
        </g>
      );
    });

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width="100%"
      height="auto"
      className="print-boundary-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <rect width={SVG_W} height={SVG_H} fill="#f0f9f6" stroke="#cbd5e1" strokeWidth="1" rx="4" />
      {/* Grid lines for readability */}
      {[1,2,3,4].map(i => (
        <line key={`gh-${i}`} x1={PADDING} y1={PADDING + i*(SVG_H-PADDING*2)/5} x2={SVG_W-PADDING} y2={PADDING + i*(SVG_H-PADDING*2)/5} stroke="#d1fae5" strokeWidth="1" />
      ))}
      {[1,2,3,4].map(i => (
        <line key={`gv-${i}`} x1={PADDING + i*(SVG_W-PADDING*2)/5} y1={PADDING} x2={PADDING + i*(SVG_W-PADDING*2)/5} y2={SVG_H-PADDING} stroke="#d1fae5" strokeWidth="1" />
      ))}
      {/* HLB Boundary Polygon */}
      {paths}
      {/* Roads */}
      {roadLines}
      {/* House markers */}
      {markerDots}
      {/* Title */}
      <text x={SVG_W/2} y={PADDING - 16} textAnchor="middle" fontSize="13" fontWeight="800" fill="#065f46" fontFamily="system-ui,sans-serif">
        HLB {selectedHlb} — Block Boundary Map
      </text>
    </svg>
  );
};

function App() {
  // App state
  const [selectedHlb, setSelectedHlbState] = useState(getSelectedHlb());
  const [allBoundaries, setAllBoundaries] = useState({});
  const [coords, setCoords] = useState(null);
  const [trail, setTrail] = useState(getGpsTrail());
  const [houses, setHouses] = useState(getSavedHouses());
  const [autoFollow, setAutoFollowState] = useState(getAutoFollow());
  const [mapType, setMapType] = useState('streets');
  const [gpsError, setGpsError] = useState(null);

  // Geofencing state
  const [isInside, setIsInside] = useState(false);
  const [distance, setDistance] = useState(null);

  // Custom Landmark Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCoords, setModalCoords] = useState(null);
  const [landmarkType, setLandmarkType] = useState('pucca_residential');
  const [houseNumber, setHouseNumber] = useState('');
  const [houseName, setHouseName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [pendingRoad, setPendingRoad] = useState(null);
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(false);

  const watchIdRef = useRef(null);

  const activeGeoJson = allBoundaries[selectedHlb] || null;

  // Trigger modal display when adding a house/landmark at coordinates
  const handleAddHouseAtCoords = (lat, lng) => {
    if (pendingRoad) {
      const endPoint = { latitude: lat, longitude: lng };
      const midpoint = {
        latitude: (pendingRoad.start.latitude + endPoint.latitude) / 2,
        longitude: (pendingRoad.start.longitude + endPoint.longitude) / 2
      };
      const geoResult = checkGeofence(midpoint, activeGeoJson);
      const newRoad = {
        id: Date.now(),
        type: pendingRoad.type,
        number: '',
        name: pendingRoad.name,
        owner: pendingRoad.owner,
        latitude: midpoint.latitude,
        longitude: midpoint.longitude,
        points: [pendingRoad.start, endPoint],
        hlb: selectedHlb,
        isInside: geoResult.isInside,
        timestamp: Date.now()
      };

      const updatedHouses = [...houses, newRoad];
      setHouses(updatedHouses);
      saveHouses(updatedHouses);

      // Clear pending road mode — do NOT toggle autoFollow to avoid map re-layout
      setPendingRoad(null);
      return;
    }

    setModalCoords({ latitude: lat, longitude: lng });
    setLandmarkType('pucca_residential');
    setHouseNumber('');
    setHouseName('');
    setOwnerName('');
    setIsModalOpen(true);
  };

  // Handle saving of modal contents
  const handleModalSubmit = (e) => {
    e.preventDefault();
    if (!modalCoords) return;

    const finalNumber = houseNumber.trim();
    const finalName = houseName.trim();
    const finalOwner = ownerName.trim();

    // Check if we need details based on category (at least something should be filled for residential, or default name for landmarks)
    let displayName = finalName;
    if (!displayName) {
      if (landmarkType === 'pucca_residential' || landmarkType === 'kutcha_residential') {
        displayName = finalNumber ? `House No: ${finalNumber}` : 'Residential Building';
      } else {
        const typeLabels = {
          pucca_non_residential: 'Pucca Non-Residential',
          kutcha_non_residential: 'Kutcha Non-Residential',
          temple: 'Temple (ക്ഷേത്രം)',
          mosque: 'Mosque (മോസ്ക്)',
          church: 'Church (പള്ളി)',
          school: 'School (സ്കൂൾ)',
          dispensary: 'Dispensary (ആശുപത്രി)',
          post_office: 'Post Office (പി.ഒ.)',
          well_tap: 'Well/Tap (കിണർ/ടാപ്പ്)',
          other: 'Landmark (അടയാളം)'
        };
        displayName = typeLabels[landmarkType] || 'Landmark';
      }
    }

    if (isRoadType(landmarkType)) {
      const roadLabels = {
        pucca_road: 'Pucca Road',
        kutcha_road: 'Kutcha Road',
        footpath: 'Footpath'
      };

      // Do NOT toggle autoFollow — toggling causes map re-layout which offsets click coords
      setPendingRoad({
        type: landmarkType,
        name: finalName || roadLabels[landmarkType],
        owner: finalOwner || '',
        start: modalCoords
      });
      setIsModalOpen(false);
      setModalCoords(null);
      return;
    }

    const geoResult = checkGeofence({ latitude: modalCoords.latitude, longitude: modalCoords.longitude }, activeGeoJson);

    const newHouse = {
      id: Date.now(),
      type: landmarkType,
      number: finalNumber,
      name: displayName,
      owner: finalOwner || '',
      latitude: modalCoords.latitude,
      longitude: modalCoords.longitude,
      hlb: selectedHlb,
      isInside: geoResult.isInside,
      timestamp: Date.now()
    };

    const updatedHouses = [...houses, newHouse];
    setHouses(updatedHouses);
    saveHouses(updatedHouses);

    setIsModalOpen(false);
    setModalCoords(null);
  };

  // Add house at current location
  const handleAddHouse = () => {
    if (!coords) {
      alert("ലൊക്കേഷൻ ലഭ്യമല്ല. ദയവായി GPS ലഭിക്കുന്നത് വരെ കാത്തിരിക്കുക.\nLocation not acquired yet. Please wait for GPS signal.");
      return;
    }
    handleAddHouseAtCoords(coords.latitude, coords.longitude);
  };

  // Delete house marker
  const handleDeleteHouse = (houseId) => {
    if (window.confirm("ഈ വീട് അടയാളപ്പെടുത്തിയത് ഒഴിവാക്കണോ?\nAre you sure you want to delete this marked house?")) {
      const updatedHouses = houses.filter((h) => h.id !== houseId);
      setHouses(updatedHouses);
      saveHouses(updatedHouses);
    }
  };

  // Export marked houses data to CSV
  const handleExportHouses = () => {
    if (houses.length === 0) {
      alert("ഡൗൺലോഡ് ചെയ്യാൻ അടയാളപ്പെടുത്തിയ വീടുകൾ ലഭ്യമല്ല (No houses marked to export).");
      return;
    }

    // Format headers and rows
    const headers = "ID,Type,House_Number,House_Name,Owner_Name,Geometry,Latitude,Longitude,HLB,Geofence_Status,Date_Created\n";
    const rows = houses
      .map(
        (h) =>
          `"${h.id}","${h.type || 'pucca_residential'}","${(h.number || '').replace(/"/g, '""')}","${(h.name || '').replace(/"/g, '""')}","${(h.owner || '').replace(/"/g, '""')}","${getItemCoordinates(h)}","${h.latitude}","${h.longitude}","${h.hlb}","${h.isInside ? 'Inside' : 'Outside'
          }","${new Date(h.timestamp).toLocaleString('en-IN')}"`
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `census_marked_houses_hlb_${selectedHlb}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger print view after forcing a layout refresh to settle Leaflet tile sizes
  const handlePrintMap = () => {
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => {
      window.print();
    }, 350);
  };

  // Load all boundaries on mount
  useEffect(() => {
    const loadAllBoundaries = async () => {
      const boundaryMap = {};
      for (const hlbId of ['0572', '0573']) {
        try {
          const response = await fetch(`./maps/${hlbId}.geojson`);
          if (response.ok) {
            const data = await response.json();
            if (data && data.features && data.features.length > 0) {
              boundaryMap[hlbId] = data;
            }
          }
        } catch (err) {
          console.error(`Error loading boundary ${hlbId}:`, err);
        }
      }
      setAllBoundaries(boundaryMap);
    };

    loadAllBoundaries();
  }, []);

  // Set up real-time GPS tracking on mount
  useEffect(() => {
    const handleLocationUpdate = (newCoords) => {
      setCoords(newCoords);
      setGpsError(null);

      // Append to walking trail if coordinate is valid and moving
      setTrail((prevTrail) => {
        if (prevTrail.length === 0) {
          const initialTrail = [newCoords];
          saveGpsTrail(initialTrail);
          return initialTrail;
        }

        const lastPoint = prevTrail[prevTrail.length - 1];
        // Calculate distance from last recorded point using Turf.js to filter out GPS jitter
        const from = turf.point([lastPoint.longitude, lastPoint.latitude]);
        const to = turf.point([newCoords.longitude, newCoords.latitude]);
        const movementMeters = turf.distance(from, to, { units: 'meters' });

        // Only add point if the enumerator has moved more than 2 meters
        if (movementMeters > 2.0) {
          const updatedTrail = [...prevTrail, newCoords];
          saveGpsTrail(updatedTrail);
          return updatedTrail;
        }
        return prevTrail;
      });
    };

    const handleGpsError = (err) => {
      console.warn("GPS Tracking Warning/Error:", err.message);
      setGpsError(err);
    };

    // Start high-accuracy watchPosition
    watchIdRef.current = startTracking(handleLocationUpdate, handleGpsError);

    // Clean up on component unmount
    return () => {
      if (watchIdRef.current) {
        stopTracking(watchIdRef.current);
      }
    };
  }, []);

  // Update inside/outside geofence evaluations when coordinates or polygon boundary changes
  useEffect(() => {
    if (coords && activeGeoJson) {
      const result = checkGeofence(coords, activeGeoJson);
      setIsInside(result.isInside);
      setDistance(result.distance);
    } else {
      setIsInside(false);
      setDistance(null);
    }
  }, [coords, activeGeoJson]);

  // Save selected HLB in storage
  const handleHlbChange = (e) => {
    const nextHlb = e.target.value;
    setSelectedHlbState(nextHlb);
    saveSelectedHlb(nextHlb);
  };

  // Change auto-centering
  const handleAutoFollowToggle = (checked) => {
    setAutoFollowState(checked);
    saveAutoFollow(checked);
  };

  // Force map to snap-recenter on the user's location
  const handleRecenter = () => {
    if (coords) {
      setAutoFollowState(true);
      saveAutoFollow(true);
      // Trigger a temporary state tick to force sub-component update if already true
      setCoords((prev) => prev ? { ...prev, timestamp: Date.now() } : null);
    }
  };

  // Clear trail
  const handleClearTrail = () => {
    if (window.confirm("ഈ സർവേയിലെ പാത വിവരങ്ങൾ ഒഴിവാക്കണമെന്നുറപ്പാണോ?\nAre you sure you want to clear the recorded trail?")) {
      clearGpsTrail();
      setTrail([]);
    }
  };

  // Open Google Maps navigation to the center of the active block
  const handleNavigateToBlock = () => {
    if (activeGeoJson) {
      const center = getPolygonCenter(activeGeoJson);
      const url = `https://www.google.com/maps/dir/?api=1&destination=${center[0]},${center[1]}`;
      window.open(url, '_blank');
    }
  };

  
const filteredHouses = houses.filter(
  (house) => house.hlb === selectedHlb
);

return (
    <div className="app-container">
      {/* Helper Header */}
      <header className="app-header">
        <div className="header-logo-group">
          <span className="helper-badge">ENUMERATOR FIELD ASSISTANT</span>
          <h1>HLB GEOLOCATION & NAVIGATION HELP</h1>
          <span className="malayalam-title">സെൻസസ് ബ്ലോക്ക് അതിർത്തി സഹായി (Helper App)</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-main">
        {/* HLB Selector Card - Floating Top */}
        <div className="hlb-selector-floating">
          <label htmlFor="hlb-select">ആക്ടീവ് ബ്ലോക്ക് (Select HLB):</label>
          <select
            id="hlb-select"
            value={selectedHlb}
            onChange={handleHlbChange}
            className="hlb-dropdown"
          >
            <option value="0572">HLB 0572 (ചീരട്ടമല / പാലൂർ ഈസ്റ്റ്)</option>
            <option value="0573">HLB 0573 (പാലൂർ വെസ്റ്റ് )</option>
          </select>
        </div>

        {/* Floating geofence notification card */}
        <StatusCard
          isInside={isInside}
          distance={distance}
          selectedHlb={selectedHlb}
          hasLocation={!!coords}
          onNavigateToBlock={handleNavigateToBlock}
        />

        {/* Floating action button for adding house */}
        <button
          className={`btn-add-house-floating ${!coords ? 'disabled' : ''}`}
          onClick={handleAddHouse}
          disabled={!coords}
          title="Mark house at current GPS location"
        >
          ➕ 🏠 വീട് ചേർക്കുക (Add House)
        </button>

        {pendingRoad && (
          <div className="road-draw-hint">
            <strong>🛣️ {pendingRoad.name}</strong>
            <span>→ ഇപ്പോൾ റോഡിന്റെ അവസാന പോയിന്റ് (End Point) മാപ്പിൽ ക്ലിക്ക് ചെയ്യുക</span>
            <button type="button" onClick={() => setPendingRoad(null)}>✕ Cancel</button>
          </div>
        )}

        {/* Leaflet Map */}
        <MapView
          activeGeoJson={activeGeoJson}
          allBoundaries={allBoundaries}
          selectedHlb={selectedHlb}
          coords={coords}
          trail={trail}
          autoFollow={autoFollow}
          mapType={mapType}
          setMapType={setMapType}
          isInside={isInside}
          houses={houses}
          onDeleteHouse={handleDeleteHouse}
          onMapClick={handleAddHouseAtCoords}
          pendingRoad={pendingRoad}
          isDashboardExpanded={isDashboardExpanded}
        />
      </main>

      {/* Bottom Information Dashboard */}
      <footer className={`app-dashboard ${isDashboardExpanded ? 'expanded' : 'collapsed'}`}>
        <div className="dashboard-toggle-bar" onClick={() => setIsDashboardExpanded(!isDashboardExpanded)}>
          <span className="toggle-bar-title">
            {isDashboardExpanded ? '👇 വിവരങ്ങൾ ഒതുക്കുക (Hide Dashboard)' : '👆 വിവരങ്ങൾ കാണുക (Show Dashboard & Stats)'}
          </span>
          <span className="toggle-bar-badge">{filteredHouses.length} Items</span>
        </div>
        <div className="dashboard-grid">
          <div className="dashboard-column">
            <h4>📡 ലൊക്കേഷൻ വിവരങ്ങൾ (GPS Diagnostics)</h4>
            <LiveLocation
              autoFollow={autoFollow}
              setAutoFollow={handleAutoFollowToggle}
              onRecenter={handleRecenter}
              hasLocation={!!coords}
              gpsError={gpsError}
            />
          </div>

          <div className="dashboard-column separator">
            <h4>🛰️ നിർണ്ണയ വിവരങ്ങൾ (GPS Parameters)</h4>
            <GPSInfo
              coords={coords}
              trailLength={trail.length}
              onClearTrail={handleClearTrail}
            />

            {/* House Mark & CSV Export buttons */}
            <div className="house-marking-actions-row">
              <button
                className="btn-mark-house"
                onClick={handleAddHouse}
                disabled={!coords}
              >
                🏠 വിവരം ചേർക്കുക (Add Marker)
              </button>
              <button
                className="btn-export-houses"
                onClick={handleExportHouses}
                disabled={houses.length === 0}
              >
                📥 CSV ഡൗൺലോഡ് ({houses.length})
              </button>
              <button
                className="btn-print-map"
                onClick={handlePrintMap}
                title="Print Map and Landmarks as PDF"
              >
                🖨️ PDF ആക്കുക (Print Map)
              </button>
            </div>
          </div>

          <div className="dashboard-column separator">
            <h4>🏠 ചേർത്ത വിവരങ്ങൾ (Marked - {houses.length})</h4>
            <div className="houses-scroll-list">
              {filteredHouses.length === 0 ? (
                <p className="no-houses-text">
                  വിവരങ്ങൾ ഒന്നും അടയാളപ്പെടുത്തിയിട്ടില്ല.<br />
                  <span className="sub-text">മാപ്പിൽ ക്ലിക്ക് ചെയ്‌തോ മുകളിലെ ബട്ടൺ ഉപയോഗിച്ചോ ചേർക്കാം.</span>
                </p>
              ) : (
                houses.map((house) => {
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
                  return (
                    <div key={house.id} className="house-list-item">
                      <span className="house-item-name" title={`${house.number || ''} - ${house.name || ''} (${house.owner || ''})`}>
                        <span className="house-item-emoji-prefix">{getEmoji(house.type)}</span> {house.number ? `${house.number} - ${house.name}` : house.name}
                        {house.owner && <span className="house-item-owner"> ({house.owner})</span>}
                      </span>
                      <div className="house-item-meta">
                        <span className={`house-item-badge ${house.isInside ? 'inside' : 'outside'}`}>
                          {house.isInside ? 'അകത്ത്' : 'പുറത്ത്'}
                        </span>
                        <button
                          className="btn-navigate-house-small"
                          onClick={() => {
                            const url = `https://www.google.com/maps/dir/?api=1&destination=${house.latitude},${house.longitude}`;
                            window.open(url, '_blank');
                          }}
                          title="Navigate to house"
                        >
                          🧭
                        </button>
                        <button
                          className="btn-delete-house-small"
                          onClick={() => handleDeleteHouse(house.id)}
                          title="Delete house"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* Print-Only Report Layout — hidden on screen, shown in @media print */}
      <div className="print-report-container">
        <div className="print-report-header">
          <h2>CENSUS OF INDIA 2027 — FIELD SURVEY REPORT</h2>
          <h3>LAYOUT MAP (ഫീൽഡ് സർവേ ലേഔട്ട് മാപ്പ്)</h3>
          <table className="print-metadata-table">
            <tbody>
              <tr>
                <td><strong>State (സംസ്ഥാനം):</strong> KERALA (34)</td>
                <td><strong>District (ജില്ല):</strong> MALAPPURAM (01)</td>
              </tr>
              <tr>
                <td><strong>Taluk/PS (താലൂക്ക്):</strong> PERINTHALMANNA (006)</td>
                <td><strong>Town/Village (ഗ്രാമം):</strong> {selectedHlb === '0572' ? 'Cheerattamala / Paloory East' : 'Paloory West / Kuzhikkad'}</td>
              </tr>
              <tr>
                <td><strong>Ward Code (വാർഡ്):</strong> 0000</td>
                <td><strong>HLB Block No (ബ്ലോക്ക് നമ്പർ):</strong> {selectedHlb}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Static SVG boundary map — always renders in print, no Leaflet tile dependency */}
        <div className="print-svg-map-box">
          <PrintMapSvg activeGeoJson={activeGeoJson} houses={houses} selectedHlb={selectedHlb} />
        </div>

        <div className="print-legend-box">
          <h4>CENSUS MAP LEGEND / സൂചിക</h4>
          <div className="print-legend-grid">
            <div className="legend-item"><span className="legend-sym">☐</span> Pucca Residential</div>
            <div className="legend-item"><span className="legend-sym">◼</span> Pucca Non-Residential</div>
            <div className="legend-item"><span className="legend-sym">△</span> Kutcha Residential</div>
            <div className="legend-item"><span className="legend-sym">▲</span> Kutcha Non-Residential</div>
            <div className="legend-item"><span className="legend-sym">🛕</span> Temple / ക്ഷേത്രം</div>
            <div className="legend-item"><span className="legend-sym">🕌</span> Mosque / പള്ളി</div>
            <div className="legend-item"><span className="legend-sym">⛪</span> Church / പള്ളി</div>
            <div className="legend-item"><span className="legend-sym">🏫</span> School</div>
            <div className="legend-item"><span className="legend-sym">🏥</span> Dispensary</div>
            <div className="legend-item"><span className="legend-sym">📮</span> Post Office</div>
            <div className="legend-item"><span className="legend-sym">🚰</span> Well/Tap/Pump</div>
            <div className="legend-item">— Pucca Road &nbsp; - - Kutcha Road &nbsp; · · Path</div>
          </div>
        </div>

        <div className="print-details-section">
          <h4>MARKED STRUCTURES &amp; LANDMARKS — HLB {selectedHlb} / അടയാളപ്പെടുത്തിയ കെട്ടിടങ്ങൾ</h4>
          <table className="print-data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Type (തരം)</th>
                <th>Bldg No</th>
                <th>Name (പേര്)</th>
                <th>Owner / Info</th>
                <th>Status</th>
                <th>Coordinates</th>
              </tr>
            </thead>
            <tbody>
              {filteredHouses.length === 0 ? (
                <tr>
                  <td colSpan="7" className="print-empty-row">No structures marked for HLB {selectedHlb}.</td>
                </tr>
              ) : (
                filteredHouses.map((house, idx) => {
                  const typeLabels = {
                    pucca_residential: 'Pucca Residential (☐)',
                    pucca_non_residential: 'Pucca Non-Residential (◼)',
                    kutcha_residential: 'Kutcha Residential (△)',
                    kutcha_non_residential: 'Kutcha Non-Residential (▲)',
                    pucca_road: 'Pucca Road (══)',
                    kutcha_road: 'Kutcha Road (- -)',
                    footpath: 'Footpath (· · ·)',
                    temple: 'Temple (🛕)',
                    mosque: 'Mosque (🕌)',
                    church: 'Church (⛪)',
                    school: 'School (🏫)',
                    dispensary: 'Dispensary (🏥)',
                    post_office: 'Post Office (📮)',
                    well_tap: 'Well/Tap (🚰)',
                    other: 'Landmark (📍)'
                  };
                  return (
                    <tr key={house.id}>
                      <td>{idx + 1}</td>
                      <td>{typeLabels[house.type] || house.type}</td>
                      <td>{house.number || '-'}</td>
                      <td>{house.name}</td>
                      <td>{house.owner || '-'}</td>
                      <td>{house.isInside ? 'Inside' : 'Outside'}</td>
                      <td style={{fontSize:'0.7rem'}}>{getItemCoordinates(house)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom Modal for Adding Landmarks */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content-card">
            <h3>സ്ഥലം / കെട്ടിട വിവരങ്ങൾ ചേർക്കുക</h3>
            <span className="modal-subtitle">Add Structure / Landmark Details</span>

            <form onSubmit={handleModalSubmit} className="modal-form">
              <div className="form-group">
                <label htmlFor="landmark-type">ചിഹ്നം / കെട്ടിടത്തിന്റെ തരം (Category/Symbol):</label>
                <select
                  id="landmark-type"
                  value={landmarkType}
                  onChange={(e) => setLandmarkType(e.target.value)}
                  className="modal-select"
                >
                  <optgroup label="Buildings (കെട്ടിടങ്ങൾ)">
                    <option value="pucca_residential">☐ Pucca Residential (പാക്ക വീട് - താമസം)</option>
                    <option value="pucca_non_residential">◼ Pucca Non-Residential (പാക്ക ഇതര ആവശ്യങ്ങൾക്ക്)</option>
                    <option value="kutcha_residential">△ Kutcha Residential (കച്ച വീട് - താമസം)</option>
                    <option value="kutcha_non_residential">▲ Kutcha Non-Residential (കച്ച ഇതര ആവശ്യങ്ങൾക്ക്)</option>
                  </optgroup>
                  <optgroup label="Religious Places (ആരാധനാലയങ്ങൾ)">
                    <option value="temple">🛕 Temple (ക്ഷേത്രം)</option>
                    <option value="mosque">🕌 Mosque (മോസ്ക് / പള്ളി)</option>
                    <option value="church">⛪ Church (ചർച്ച് / പള്ളി)</option>
                  </optgroup>
                  <optgroup label="Institutions & Utilities (സ്ഥാപനങ്ങൾ / സൗകര്യങ്ങൾ)">
                    <option value="school">🏫 School (സ്കൂൾ)</option>
                    <option value="dispensary">🏥 Dispensary/Clinic (ആശുപത്രി / ഡിസ്പെൻസറി)</option>
                    <option value="post_office">📮 Post Office (പോസ്റ്റ് ഓഫീസ്)</option>
                    <option value="well_tap">🚰 Well / Tap / Handpump (കിണർ / പൈപ്പ് / പമ്പ്)</option>
                  </optgroup>
                  <optgroup label="Roads & Paths">
                    <option value="pucca_road">══ Pucca Road (solid road)</option>
                    <option value="kutcha_road">- - Kutcha Road (broken road)</option>
                    <option value="footpath">··· Footpath / Lane</option>
                  </optgroup>
                  <optgroup label="Others">
                    <option value="other">📍 Other Landmark (മറ്റു സ്ഥലങ്ങൾ)</option>
                  </optgroup>
                </select>
              </div>

              {(landmarkType === 'pucca_residential' || landmarkType === 'kutcha_residential') && (
                <div className="form-group">
                  <label htmlFor="house-number">വീട്ടുനമ്പർ / കെട്ടിട നമ്പർ (House/Building Number):</label>
                  <input
                    type="text"
                    id="house-number"
                    value={houseNumber}
                    onChange={(e) => setHouseNumber(e.target.value)}
                    placeholder="E.g., 55"
                    className="modal-input"
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="house-name">പേര് / അടയാളം (Name / Label):</label>
                <input
                  type="text"
                  id="house-name"
                  value={houseName}
                  onChange={(e) => setHouseName(e.target.value)}
                  placeholder="E.g., Paloor Temple, Aravind's House"
                  className="modal-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="owner-name">ഉടമസ്ഥൻ / വിവരണം (Owner Name / Description):</label>
                <input
                  type="text"
                  id="owner-name"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="E.g., John Doe"
                  className="modal-input"
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsModalOpen(false)}>
                  റദ്ദാക്കുക (Cancel)
                </button>
                <button type="submit" className="btn-modal-submit">
                  സേവ് ചെയ്യുക (Save)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
