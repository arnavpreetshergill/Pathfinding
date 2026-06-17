/**
 * Bounding values for geographic coordinates.
 * Valid ranges: Latitude [-90, 90], Longitude [-180, 180].
 */
export const COORDINATE_BOUNDS = {
  minLat: -90,
  maxLat: 90,
  minLng: -180,
  maxLng: 180
} as const;

/**
 * Standard hex color palette for drawing route segments, markers,
 * and snapped points on the map.
 */
export const ROUTE_COLORS = {
  startRaw: '#28a745', // Green for raw start marker click
  endRaw: '#dc3545',   // Red for raw end marker click
  snapped: '#ffc107',  // Yellow for snapped road node markers
  route: '#0056b3'     // Blue for the main calculated route line
} as const;

/**
 * Validates whether a given latitude and longitude pair falls within the
 * standard coordinate boundary limits.
 *
 * @param lat Latitude in degrees.
 * @param lng Longitude in degrees.
 * @returns True if valid coordinate, false otherwise.
 */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return lat >= COORDINATE_BOUNDS.minLat && lat <= COORDINATE_BOUNDS.maxLat &&
         lng >= COORDINATE_BOUNDS.minLng && lng <= COORDINATE_BOUNDS.maxLng;
}

/**
 * Validates the structure and coordinate points of a GeoJSON Feature
 * to ensure they are mathematically sound before Leaflet attempts to draw them.
 *
 * @param feature GeoJSON Feature structure returned by the routing engine.
 * @returns True if the feature's geometry coordinates are valid, false otherwise.
 */
export function isValidGeoJSONFeature(feature: any): boolean {
  if (!feature) return false;

  // Support both standard GeoJSON Feature and raw Geometry objects (e.g. LineString)
  const geometry = feature.type === 'Feature' ? feature.geometry : feature;

  if (!geometry || !geometry.coordinates) {
    return false;
  }
  const coords = geometry.coordinates;
  const geomType = geometry.type;

  if (geomType === 'LineString' || geomType === 'MultiLineString') {
    const points = geomType === 'LineString' ? coords : coords.flat(1);
    return points.every((point: any) =>
      Array.isArray(point) && point.length >= 2 &&
      typeof point[0] === 'number' && typeof point[1] === 'number' &&
      isValidCoordinate(point[1], point[0])
    );
  }
  return true;
}
