import React from 'react';

const LiveLocation = ({ autoFollow, setAutoFollow, onRecenter, hasLocation, gpsError }) => {
  return (
    <div className="live-location-panel">
      <div className="panel-status-row">
        <div className="gps-status-badge">
          <span className={`status-indicator ${gpsError ? 'error' : hasLocation ? 'active' : 'searching'}`}></span>
          <span className="status-text">
            {gpsError 
              ? `പിശക്: ${gpsError.message}` 
              : hasLocation 
                ? 'GPS സിഗ്നൽ ലഭ്യമാണ് (GPS Linked)' 
                : 'GPS-നായി കാത്തിരിക്കുന്നു (Locating enumerator...)'
            }
          </span>
        </div>
      </div>

      <div className="panel-actions-row">
        <button 
          className={`btn-recenter ${!hasLocation ? 'disabled' : ''}`}
          onClick={onRecenter}
          disabled={!hasLocation}
        >
          📍 Re-center Map (മാപ്പിൽ കേന്ദ്രീകരിക്കുക)
        </button>

        <label className="toggle-switch-container">
          <span className="toggle-label">Auto-Center</span>
          <div className="toggle-relative">
            <input 
              type="checkbox" 
              checked={autoFollow}
              onChange={(e) => setAutoFollow(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </div>
        </label>
      </div>

      {gpsError && (
        <div className="gps-troubleshoot-box">
          <p className="troubleshoot-title">💡 GPS ലൊക്കേഷൻ ശരിയാക്കാൻ (Troubleshooting):</p>
          <ul>
            <li>ഫോണിൽ GPS / ലൊക്കേഷൻ സർവീസ് (Location Services) ഓൺ ചെയ്യുക.</li>
            <li>ബ്രൗസർ ലൊക്കേഷൻ ആക്സസ് ചോദിക്കുമ്പോൾ 'Allow' നൽകുക.</li>
            <li>മേൽക്കൂരയുള്ള കെട്ടിടങ്ങൾക്ക് പുറത്തേക്ക് ഇറങ്ങി നിന്ന് നോക്കുക (വാനനിരീക്ഷണം).</li>
            <li>പേജ് റീഫ്രഷ് ചെയ്ത് വീണ്ടും നോക്കുക.</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default LiveLocation;
