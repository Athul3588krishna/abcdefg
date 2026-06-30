import * as turf from '@turf/turf';

export const checkGeofence = (coords, geoJson) => {
  if (!coords || !geoJson) {
    return { isInside: false, distance: null };
  }

  // Turf uses [longitude, latitude] ordering
  const pt = turf.point([coords.longitude, coords.latitude]);

  // Extract all features from the GeoJSON object
  let features = [];
  if (geoJson.type === 'FeatureCollection') {
    features = geoJson.features || [];
  } else if (geoJson.type === 'Feature') {
    features = [geoJson];
  } else {
    features = [{ type: 'Feature', geometry: geoJson, properties: {} }];
  }

  let isInside = false;
  let minDistance = null;

  for (const feature of features) {
    // Check if inside this feature
    try {
      const geometry = feature.geometry;
      if (geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) {
        if (turf.booleanPointInPolygon(pt, feature)) {
          isInside = true;
        }
      }
    } catch (err) {
      console.error("Error evaluating booleanPointInPolygon:", err);
    }

    // Calculate distance to this feature's boundary
    try {
      const geometry = feature.geometry;
      if (geometry) {
        if (geometry.type === 'Polygon') {
          const exterior = geometry.coordinates[0];
          if (exterior && exterior.length >= 2) {
            const line = turf.lineString(exterior);
            const dist = turf.pointToLineDistance(pt, line, { units: 'meters' });
            if (minDistance === null || dist < minDistance) {
              minDistance = dist;
            }
          }
        } else if (geometry.type === 'MultiPolygon') {
          for (const polygonCoords of geometry.coordinates) {
            const exterior = polygonCoords[0];
            if (exterior && exterior.length >= 2) {
              const line = turf.lineString(exterior);
              const dist = turf.pointToLineDistance(pt, line, { units: 'meters' });
              if (minDistance === null || dist < minDistance) {
                minDistance = dist;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Error calculating distance to boundary:", err);
    }
  }

  return {
    isInside,
    distance: minDistance
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
