const KEYS = {
  SELECTED_HLB: 'hlb_selected_id',
  GPS_TRAIL: 'hlb_gps_trail',
  AUTO_FOLLOW: 'hlb_auto_follow'
};

export const saveSelectedHlb = (hlbId) => {
  localStorage.setItem(KEYS.SELECTED_HLB, hlbId);
};

export const getSelectedHlb = () => {
  return localStorage.getItem(KEYS.SELECTED_HLB) || '0572';
};

export const saveGpsTrail = (trail) => {
  localStorage.setItem(KEYS.GPS_TRAIL, JSON.stringify(trail));
};

export const getGpsTrail = () => {
  try {
    const raw = localStorage.getItem(KEYS.GPS_TRAIL);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to parse GPS trail from local storage", e);
    return [];
  }
};

export const clearGpsTrail = () => {
  localStorage.removeItem(KEYS.GPS_TRAIL);
};

export const saveAutoFollow = (follow) => {
  localStorage.setItem(KEYS.AUTO_FOLLOW, follow ? 'true' : 'false');
};

export const getAutoFollow = () => {
  return localStorage.getItem(KEYS.AUTO_FOLLOW) !== 'false'; // Defaults to true
};

export const saveHouses = (houses) => {
  localStorage.setItem('hlb_marked_houses', JSON.stringify(houses));
};

export const getSavedHouses = () => {
  try {
    const raw = localStorage.getItem('hlb_marked_houses');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to parse marked houses from local storage", e);
    return [];
  }
};
