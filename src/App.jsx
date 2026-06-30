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

  const watchIdRef = useRef(null);

  const activeGeoJson = allBoundaries[selectedHlb] || null;

  // Add house at a specific coordinate (either GPS or clicked on map)
  const handleAddHouseAtCoords = (lat, lng) => {
    const houseNumber = prompt("വീട്ടുനമ്പർ നൽകുക:\nEnter House Number:");
    if (houseNumber === null) return; // Cancelled by user
    
    const houseName = prompt("വീട്ടുപേര് നൽകുക:\nEnter House Name:");
    if (houseName === null) return; // Cancelled by user

    const ownerName = prompt("വീട്ടുടമസ്ഥന്റെ പേര് നൽകുക:\nEnter House Owner Name:");
    if (ownerName === null) return; // Cancelled by user

    const finalNumber = houseNumber.trim();
    const finalName = houseName.trim();
    const finalOwner = ownerName.trim();

    // Require at least one to be filled
    if (!finalNumber && !finalName && !finalOwner) {
      alert("വിവരങ്ങൾ ഒന്നും നൽകിയിട്ടില്ല.\nNo details provided.");
      return;
    }

    // Evaluate geofence status for these coordinates
    const geoResult = checkGeofence({ latitude: lat, longitude: lng }, activeGeoJson);

    const newHouse = {
      id: Date.now(),
      number: finalNumber,
      name: finalName || 'Unnamed House',
      owner: finalOwner || 'Unknown Owner',
      latitude: lat,
      longitude: lng,
      hlb: selectedHlb,
      isInside: geoResult.isInside,
      timestamp: Date.now()
    };

    const updatedHouses = [...houses, newHouse];
    setHouses(updatedHouses);
    saveHouses(updatedHouses);
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
    const headers = "ID,House_Number,House_Name,Owner_Name,Latitude,Longitude,HLB,Geofence_Status,Date_Created\n";
    const rows = houses
      .map(
        (h) =>
          `"${h.id}","${(h.number || '').replace(/"/g, '""')}","${(h.name || '').replace(/"/g, '""')}","${(h.owner || '').replace(/"/g, '""')}","${h.latitude}","${h.longitude}","${h.hlb}","${
            h.isInside ? 'Inside' : 'Outside'
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
            <option value="0573">HLB 0573 (പാലൂർ വെസ്റ്റ് / കുഴിക്കാട്)</option>
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
        />
      </main>

      {/* Bottom Information Dashboard */}
      <footer className="app-dashboard">
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
                🏠 വീട് ചേർക്കുക (Mark House)
              </button>
              <button 
                className="btn-export-houses" 
                onClick={handleExportHouses}
                disabled={houses.length === 0}
              >
                📥 ലിസ്റ്റ് ഡൗൺലോഡ് ചെയ്യുക (Export CSV - {houses.length})
              </button>
            </div>
          </div>

          <div className="dashboard-column separator">
            <h4>🏠 ചേർത്ത വീടുകൾ (Marked Houses - {houses.length})</h4>
            <div className="houses-scroll-list">
              {houses.length === 0 ? (
                <p className="no-houses-text">
                  വീടുകൾ ഒന്നും അടയാളപ്പെടുത്തിയിട്ടില്ല.<br/>
                  <span className="sub-text">മാപ്പിൽ ക്ലിക്ക് ചെയ്‌തോ മുകളിലെ ബട്ടൺ ഉപയോഗിച്ചോ വീടുകൾ ചേർക്കാം.</span>
                </p>
              ) : (
                houses.map((house) => (
                  <div key={house.id} className="house-list-item">
                    <span className="house-item-name" title={`${house.number || ''} - ${house.name || ''} (${house.owner || ''})`}>
                      🏠 {house.number ? `${house.number} - ${house.name}` : house.name}
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
                ))
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
