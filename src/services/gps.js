/**
 * Service to manage real-time Geolocation tracking using device hardware
 */
export const startTracking = (onLocationUpdate, onError) => {
  if (!navigator.geolocation) {
    onError(new Error("Geolocation is not supported by your browser."));
    return null;
  }

  const options = {
    enableHighAccuracy: true, // Force device to use GPS hardware rather than network triangulation
    timeout: 10000,           // Time limit to obtain location (10s)
    maximumAge: 0             // Do not use cached location data
  };

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy, heading, speed, altitude } = position.coords;
      onLocationUpdate({
        latitude,
        longitude,
        accuracy, // in meters
        heading,
        speed,
        altitude,
        timestamp: position.timestamp
      });
    },
    (error) => {
      let errorMessage = "Unknown GPS Error";
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = "Location permission denied. Please enable GPS and allow location access in your browser settings.";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = "GPS signal lost or location services turned off on this device.";
          break;
        case error.TIMEOUT:
          errorMessage = "GPS location request timed out. Retrying to lock GPS signal...";
          break;
      }
      onError(new Error(errorMessage));
    },
    options
  );

  return watchId;
};

export const stopTracking = (watchId) => {
  if (watchId !== null && watchId !== undefined) {
    navigator.geolocation.clearWatch(watchId);
  }
};
