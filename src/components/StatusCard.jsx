import React from 'react';

const StatusCard = ({ isInside, distance, selectedHlb, hasLocation, onNavigateToBlock }) => {
  if (!hasLocation) {
    return (
      <div className="status-card-floating warning-pulse">
        <div className="status-header">
          <div className="status-indicator-dot warning"></div>
          <h3>GPS സെർച്ച് ചെയ്യുന്നു...</h3>
        </div>
        <p className="status-sub">Searching for GPS coordinates...</p>
        <p className="status-desc text-yellow">
          ദയവായി ഫോണിലെ ലൊക്കേഷൻ (GPS) ഓൺ ആണെന്ന് ഉറപ്പുവരുത്തുക.
        </p>
      </div>
    );
  }

  // Format distance
  const formattedDistance = distance !== null ? Math.round(distance) : null;

  return (
    <div className={`status-card-floating ${isInside ? 'inside-glow' : 'outside-glow'}`}>
      <div className="status-header">
        <div className={`status-indicator-dot ${isInside ? 'success' : 'danger'}`}></div>
        <h3>
          {isInside 
            ? `🟢 HLB ${selectedHlb}-ൽ ആണ്` 
            : `🔴 HLB ${selectedHlb}-ന് പുറത്താണ്`
          }
        </h3>
      </div>

      <div className="translation-row">
        <p className="status-malayalam">
          {isInside 
            ? `നിങ്ങൾ നിശ്ചിത സെൻസസ് ബ്ലോക്കിനുള്ളിലാണ്.` 
            : `മുന്നറിയിപ്പ്: നിങ്ങൾ നിശ്ചിത അതിർത്തിക്ക് പുറത്താണ്!`
          }
        </p>
        <p className="status-english">
          {isInside 
            ? `Inside HLB ${selectedHlb}` 
            : `Outside Selected HLB ${selectedHlb}`
          }
        </p>
      </div>

      {formattedDistance !== null && (
        <div className="distance-badge-container">
          {isInside ? (
            <span className="distance-badge inside">
              അതിർത്തിയിൽ സുരക്ഷിതമാണ് (Inside Boundary)
            </span>
          ) : (
            <div className="outside-navigation-row">
              <span className="distance-badge outside">
                ⚠️ അതിർത്തിയിൽ നിന്നും {formattedDistance} മീറ്റർ അകലെയാണ് ({formattedDistance}m away)
              </span>
              <button 
                className="btn-navigate-block"
                onClick={onNavigateToBlock}
              >
                🧭 ബ്ലോക്കിലേക്ക് വഴി കാണിക്കുക (Directions to Block)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StatusCard;
