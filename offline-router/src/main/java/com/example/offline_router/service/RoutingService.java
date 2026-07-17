package com.example.offline_router.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Service class performing geographical routing logic.
 */
@Service
public class RoutingService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /**
     * Snap start/end points to the road network and calculate shortest path.
     */
    public Map<String, Object> getAStarRoute(double startLng, double startLat, double endLng, double endLat) {

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

        if (startEdge.equals(endEdge)) {
            Double startFrac = ((Number) startSnap.get("fraction")).doubleValue();
            Double endFrac = ((Number) endSnap.get("fraction")).doubleValue();
            
            String substringSql = """
                    SELECT ST_AsGeoJSON(ST_LineSubstring(the_geom, least(?, ?), greatest(?, ?))) as geojson
                    FROM PanIndiaRoad
                    WHERE id = ?
                    """;
            List<String> geoJsonRoute = jdbcTemplate.query(substringSql, (rs, rowNum) -> rs.getString("geojson"),
                    startFrac, endFrac, startFrac, endFrac, startEdge);

            Map<String, Object> response = new HashMap<>();
            response.put("start_snapped", startSnap);
            response.put("end_snapped", endSnap);
            response.put("route", geoJsonRoute);
            return response;
        }

        if (startNode.equals(endNode)) {
            throw new IllegalArgumentException(
                    String.format(
                            "Start and End coordinates snapped to the same intersection node %d. Choose points further apart, or on the same edge.",
                            startNode));
        }

        String sql = """
                SELECT ST_AsGeoJSON(r.the_geom) as geojson
                FROM pgr_aStar(
                    'SELECT id as id, source, target,
                            ST_Length(the_geom::geography) as cost,
                            ST_Length(the_geom::geography) as reverse_cost,
                            ST_X(ST_StartPoint(the_geom)) as x1,
                            ST_Y(ST_StartPoint(the_geom)) as y1,
                            ST_X(ST_EndPoint(the_geom)) as x2,
                            ST_Y(ST_EndPoint(the_geom)) as y2
                     FROM PanIndiaRoad',
                    ?::bigint, ?::bigint, directed := false
                ) AS p
                JOIN PanIndiaRoad r ON p.edge = r.id
                ORDER BY p.seq
                LIMIT 10000
                """;

        List<String> geoJsonRoute = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("geojson"), startNode, endNode);

        Map<String, Object> response = new HashMap<>();
        response.put("start_snapped", startSnap);
        response.put("end_snapped", endSnap);
        response.put("route", geoJsonRoute);

        return response;
    }

    /**
     * Finds the nearest road vertex node to an arbitrary coordinate pair.
     */
    private Map<String, Object> getSnappedData(double lng, double lat) {
        String sql = """
                WITH closest_segment AS (
                    SELECT 
                        id, 
                        source, 
                        target, 
                        the_geom,
                        ST_ClosestPoint(the_geom, ST_SetSRID(ST_MakePoint(?, ?), 4326)) as snap_pt
                    FROM PanIndiaRoad
                    ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint(?, ?), 4326)
                    LIMIT 1
                )
                SELECT 
                    CASE 
                        WHEN ST_Distance(snap_pt, ST_StartPoint(the_geom)) < ST_Distance(snap_pt, ST_EndPoint(the_geom)) THEN source
                        ELSE target
                    END as vertex_id,
                    id as edge_id,
                    ST_LineLocatePoint(the_geom, snap_pt) as fraction,
                    ST_X(snap_pt) as snapped_lng, 
                    ST_Y(snap_pt) as snapped_lat
                FROM closest_segment
                """;

        try {
            return jdbcTemplate.queryForMap(sql, lng, lat, lng, lat);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Retrieves road geometries within the given bounding box.
     */
    public List<Map<String, Object>> getRoadsInBounds(double minLng, double minLat,
            double maxLng, double maxLat, int zoom) {

        int limit = zoom <= 8 ? 2000 : zoom <= 11 ? 5000 : 8000;

        String sql = """
                SELECT ST_AsGeoJSON(the_geom) as geojson
                FROM PanIndiaRoad
                WHERE the_geom && ST_MakeEnvelope(?, ?, ?, ?, 4326)
                LIMIT ?
                """;

        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            Map<String, Object> road = new HashMap<>();
            road.put("geojson", rs.getString("geojson"));
            road.put("name", null);
            road.put("highway", "road");
            return road;
        }, minLng, minLat, maxLng, maxLat, limit);
    }
}