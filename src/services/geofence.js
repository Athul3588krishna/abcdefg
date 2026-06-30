import * as turf from '@turf/turf';

/**
 * Checks if a point is inside the given GeoJSON polygon and calculates the shortest distance to its boundary
 * @param {Object} coords - { latitude, longitude }
 * @param {Object} geoJsonFeature - Single GeoJSON Feature containing Polygon geometry
 * @returns {Object} - { isInside: boolean, distance: number | null }
 */
export const checkGeofence = (coords, geoJsonFeature) => {
  if (!coords || !geoJsonFeature) {
    return { isInside: false, distance: null };
  }

  // Turf uses [longitude, latitude] ordering
  const pt = turf.point([coords.longitude, coords.latitude]);

  let isInside = false;
  try {
    isInside = turf.booleanPointInPolygon(pt, geoJsonFeature);
  } catch (err) {
    console.error("Error evaluating booleanPointInPolygon:", err);
  }

  let distanceMeters = null;
  try {
    const geometry = geoJsonFeature.geometry;
    if (geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) {
      let coordinatesRing;
      if (geometry.type === 'Polygon') {
        coordinatesRing = geometry.coordinates[0]; // Exterior boundary ring
      } else {
        coordinatesRing = geometry.coordinates[0][0]; // First polygon's exterior boundary
      }

      if (coordinatesRing && coordinatesRing.length >= 2) {
        const line = turf.lineString(coordinatesRing);
        // Calculate point-to-line distance in meters
        distanceMeters = turf.pointToLineDistance(pt, line, { units: 'meters' });
      }
    }
  } catch (err) {
    console.error("Error calculating distance to boundary:", err);
  }

  return {
    isInside,
    distance: distanceMeters // Distance in meters
  };
};

/**
 * Calculates the centroid of the GeoJSON feature to center the map
 * @param {Object} geoJsonFeature 
 * @returns {Array} [lat, lng]
 */
export const getPolygonCenter = (geoJsonFeature) => {
  if (!geoJsonFeature) {
    return [9.980, 76.278]; // Default Kochi fallback
  }

  try {
    const center = turf.centroid(geoJsonFeature);
    const [lng, lat] = center.geometry.coordinates;
    return [lat, lng];
  } catch (err) {
    console.error("Error calculating polygon center centroid:", err);
    return [9.980, 76.278];
  }
};
