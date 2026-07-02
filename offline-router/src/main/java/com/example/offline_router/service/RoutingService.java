package com.example.offline_router.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Service class performing geographical routing logic.
 * Snaps arbitrary latitude/longitude coordinate points to the nearest road
 * vertices
 * and calculates the shortest path between them using spatial PostGIS queries
 * and pgRouting's A* (A-Star) algorithm.
 */
@Service
public class RoutingService {

    private static final Logger logger = LoggerFactory.getLogger(RoutingService.class);

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /**
     * Snap start/end coordinate points to the database road network, calculates
     * the shortest path using A* search, and packages results into a response
     * payload.
     *
     * @param startLng Start longitude.
     * @param startLat Start latitude.
     * @param endLng   End longitude.
     * @param endLat   End latitude.
     * @returns Map containing snapped node data and a list of GeoJSON path
     *          segments.
     * @throws IllegalArgumentException If snapping fails or start and end nodes are
     *                                  identical.
     * @throws IllegalStateException    If database node entries lack proper
     *                                  identifiers.
     */
    public Map<String, Object> getAStarRoute(double startLng, double startLat, double endLng, double endLat) {

        // 1. Automatically snap arbitrary coordinates to the nearest road vertex
        Map<String, Object> startSnap = getSnappedData(startLng, startLat);
        Map<String, Object> endSnap = getSnappedData(endLng, endLat);

        if (startSnap == null || endSnap == null) {
            throw new IllegalArgumentException(
                    String.format("Could not snap coordinates to the road network: Start(%.6f, %.6f), End(%.6f, %.6f)",
                            startLng, startLat, endLng, endLat));
        }

        Object startVertexObj = startSnap.get("vertex_id");
        Object endVertexObj = endSnap.get("vertex_id");

        Object startEdgeObj = startSnap.get("edge_id");
        Object endEdgeObj = endSnap.get("edge_id");

        if (startVertexObj == null || endVertexObj == null || startEdgeObj == null || endEdgeObj == null) {
            throw new IllegalStateException("Database returned invalid vertex data.");
        }

        Long startNode = ((Number) startVertexObj).longValue();
        Long endNode = ((Number) endVertexObj).longValue();
        Long startEdge = ((Number) startEdgeObj).longValue();
        Long endEdge = ((Number) endEdgeObj).longValue();

        // 1.5. If both points are on the exact same road segment, don't use A*!
        // Just extract the exact substring of the geometry between the two points.
        if (startEdge.equals(endEdge)) {
            Double startFrac = ((Number) startSnap.get("fraction")).doubleValue();
            Double endFrac = ((Number) endSnap.get("fraction")).doubleValue();
            
            String substringSql = """
                    SELECT ST_AsGeoJSON(ST_LineSubstring(geom, least(?, ?), greatest(?, ?))) as geojson
                    FROM "PanIndiaRoad"
                    WHERE gid = ?
                    """;
            List<String> geoJsonRoute = jdbcTemplate.query(substringSql, (rs, rowNum) -> rs.getString("geojson"),
                    startFrac, endFrac, startFrac, endFrac, startEdge);

            Map<String, Object> response = new HashMap<>();
            response.put("start_snapped", startSnap);
            response.put("end_snapped", endSnap);
            response.put("route", geoJsonRoute);
            return response;
        }

        // Prevent calculating routing when both coordinates fall onto the same road intersection node
        if (startNode.equals(endNode)) {
            throw new IllegalArgumentException(
                    String.format(
                            "Start and End coordinates snapped to the same intersection node %d. Choose points further apart, or on the same edge.",
                            startNode));
        }

        // 2. Query pgr_aStar shortest path algorithm and retrieve geometries as GeoJSON format
        // cost/reverse_cost/x1/y1/x2/y2 are computed on-the-fly from geom
        String sql = """
                SELECT ST_AsGeoJSON(r.geom) as geojson
                FROM pgr_aStar(
                    'SELECT gid as id, source, target,
                            ST_Length(geom::geography) as cost,
                            ST_Length(geom::geography) as reverse_cost,
                            ST_X(ST_StartPoint(geom)) as x1,
                            ST_Y(ST_StartPoint(geom)) as y1,
                            ST_X(ST_EndPoint(geom)) as x2,
                            ST_Y(ST_EndPoint(geom)) as y2
                     FROM "PanIndiaRoad"',
                    ?::bigint, ?::bigint, directed := false
                ) AS p
                JOIN "PanIndiaRoad" r ON p.edge = r.gid
                ORDER BY p.seq
                LIMIT 10000
                """;

        logger.info("Executing pgRouting A* query between node {} and node {}", startNode, endNode);
        List<String> geoJsonRoute = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("geojson"), startNode, endNode);

        // 3. Package both snapped endpoints and list of segment strings
        Map<String, Object> response = new HashMap<>();
        response.put("start_snapped", startSnap);
        response.put("end_snapped", endSnap);
        response.put("route", geoJsonRoute);

        return response;
    }

    /**
     * Finds the nearest road vertex node to an arbitrary coordinate pair.
     * Uses PostGIS k-Nearest Neighbors distance operator (<->) which utilizes
     * the database spatial R-tree index for O(log N) lookup speeds.
     *
     * @param lng Input longitude.
     * @param lat Input latitude.
     * @returns Map containing vertex ID and physical coordinate bounds of snapped
     *          node.
     */
    private Map<String, Object> getSnappedData(double lng, double lat) {
        String sql = """
                WITH closest_segment AS (
                    SELECT 
                        gid, 
                        source, 
                        target, 
                        geom,
                        ST_ClosestPoint(geom, ST_SetSRID(ST_MakePoint(?, ?), 4326)) as snap_pt
                    FROM "PanIndiaRoad"
                    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(?, ?), 4326)
                    LIMIT 1
                )
                SELECT 
                    CASE 
                        WHEN ST_Distance(snap_pt, ST_StartPoint(geom)) < ST_Distance(snap_pt, ST_EndPoint(geom)) THEN source
                        ELSE target
                    END as vertex_id,
                    gid as edge_id,
                    ST_LineLocatePoint(geom, snap_pt) as fraction,
                    ST_X(snap_pt) as snapped_lng, 
                    ST_Y(snap_pt) as snapped_lat
                FROM closest_segment
                """;

        try {
            // We pass lng, lat twice: once for ST_ClosestPoint and once for the ORDER BY distance calculation
            return jdbcTemplate.queryForMap(sql, lng, lat, lng, lat);
        } catch (Exception e) {
            logger.error("Failed to snap coordinate node (lng={}, lat={}): {}", lng, lat, e.getMessage(), e);
            return null;
        }
    }

    /**
     * Retrieves road geometries within the given bounding box.
     * Returns each road as GeoJSON so Leaflet can render it directly.
     * No highway column filtering — returns all road segments in the viewport.
     *
     * @param minLng West boundary.
     * @param minLat South boundary.
     * @param maxLng East boundary.
     * @param maxLat North boundary.
     * @param zoom   Current map zoom level (used to cap result count).
     * @return List of maps, each with "geojson" key.
     */
    public List<Map<String, Object>> getRoadsInBounds(double minLng, double minLat,
            double maxLng, double maxLat, int zoom) {

        // Scale result limit by zoom: fewer roads at low zooms, more at high zooms
        int limit = zoom <= 8 ? 2000 : zoom <= 11 ? 5000 : 8000;

        String sql = """
                SELECT ST_AsGeoJSON(geom) as geojson
                FROM "PanIndiaRoad"
                WHERE geom && ST_MakeEnvelope(?, ?, ?, ?, 4326)
                LIMIT ?
                """;

        logger.debug("Fetching roads in bounds [{},{},{},{}] zoom={}", minLng, minLat, maxLng, maxLat, zoom);

        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            Map<String, Object> road = new HashMap<>();
            road.put("geojson", rs.getString("geojson"));
            road.put("name", null);
            road.put("highway", "road");
            return road;
        }, minLng, minLat, maxLng, maxLat, limit);
    }
}