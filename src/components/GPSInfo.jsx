import React from 'react';

const GPSInfo = ({ coords, trailLength, onClearTrail }) => {
  if (!coords) {
    return (
      <div className="gps-info-empty">
        <p>ലൊക്കേഷൻ ഡാറ്റ ലഭ്യമല്ല (Waiting for location data...)</p>
      </div>
    );
  }

  const isPoorAccuracy = coords.accuracy > 10;

  return (
    <div className="gps-info-grid">
      <div className="gps-info-card">
        <span className="gps-label">LATITUDE (അക്ഷാംശം)</span>
        <span className="gps-val">{coords.latitude.toFixed(6)}°</span>
      </div>
      <div className="gps-info-card">
        <span className="gps-label">LONGITUDE (രേഖാംശം)</span>
        <span className="gps-val">{coords.longitude.toFixed(6)}°</span>
      </div>
      <div className="gps-info-card">
        <span className="gps-label">ACCURACY (കൃത്യത)</span>
        <span className={`gps-val ${isPoorAccuracy ? 'poor-accuracy' : 'good-accuracy'}`}>
          ± {coords.accuracy.toFixed(1)} m
        </span>
        <span className="gps-accuracy-desc">
          {isPoorAccuracy ? '⚠️ Weak signal (പുറത്തിറങ്ങി നിൽക്കുക)' : '⚡ Strong signal (കൃത്യതയുള്ളത്)'}
        </span>
      </div>
      <div className="gps-info-card trail-card">
        <span className="gps-label">TRAIL PATH (നടന്ന വഴി)</span>
        <div className="trail-action-row">
          <span className="gps-val">{trailLength} പോയിന്റുകൾ</span>
          {trailLength > 0 && (
            <button className="btn-clear-trail" onClick={onClearTrail} title="Clear recorded trail">
              Clear Trail 🗑️
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GPSInfo;
