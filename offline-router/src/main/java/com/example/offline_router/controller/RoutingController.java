package com.example.offline_router.controller;

import com.example.offline_router.service.RoutingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Rest Controller providing API endpoints for routing calculations.
 */
@RestController
@RequestMapping("/api/routing")
@CrossOrigin(origins = "*") // Allow requests from loopback client on different port configurations
public class RoutingController {

    @Autowired
    private RoutingService routingService;

    /**
     * Calculates the shortest path between start and end coordinates.
     */
    @GetMapping("/calculate")
    public ResponseEntity<?> calculateRoute(
            @RequestParam double startLng,
            @RequestParam double startLat,
            @RequestParam double endLng,
            @RequestParam double endLat) {

        // Validate coordinate bounds
        if (!isValidCoordinate(startLat, startLng) || !isValidCoordinate(endLat, endLng)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body("Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.");
        }

        // Validate for NaN inputs
        if (Double.isNaN(startLng) || Double.isNaN(startLat) || Double.isNaN(endLng) || Double.isNaN(endLat)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body("Coordinates cannot be NaN.");
        }

        // Validate for infinite bounds
        if (Double.isInfinite(startLng) || Double.isInfinite(startLat) || Double.isInfinite(endLng)
                || Double.isInfinite(endLat)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body("Coordinates cannot be infinite.");
        }

        try {
            Map<String, Object> routeData = routingService.getAStarRoute(startLng, startLat, endLng, endLat);

            Object route = routeData.get("route");
            if (route == null || ((java.util.List<?>) route).isEmpty()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body("No offline path could be found between these snapped points.");
            }

            return ResponseEntity.ok(routeData);

        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Routing engine error: " + e.getMessage());
        }
    }

    /**
     * Checks if coordinates fall within geographical limits.
     */
    private boolean isValidCoordinate(double lat, double lng) {
        return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }

    /**
     * Returns road geometries visible in the requested map viewport.
     */
    @GetMapping("/roads")
    public ResponseEntity<?> getRoadsInBounds(
            @RequestParam double minLng,
            @RequestParam double minLat,
            @RequestParam double maxLng,
            @RequestParam double maxLat,
            @RequestParam int zoom) {

        if (!isValidCoordinate(minLat, minLng) || !isValidCoordinate(maxLat, maxLng)) {
            return ResponseEntity.badRequest().body("Invalid bounding box coordinates.");
        }

        if (Double.isNaN(minLng) || Double.isNaN(minLat) || Double.isNaN(maxLng) || Double.isNaN(maxLat)) {
            return ResponseEntity.badRequest().body("Coordinates cannot be NaN.");
        }

        try {
            List<Map<String, Object>> roads = routingService.getRoadsInBounds(
                    minLng, minLat, maxLng, maxLat, zoom);
            return ResponseEntity.ok(roads);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Road query error: " + e.getMessage());
        }
    }
}