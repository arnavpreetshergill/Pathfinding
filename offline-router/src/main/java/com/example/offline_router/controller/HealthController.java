package com.example.offline_router.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * REST controller verifying application runtime state and database connection health.
 * Used for deployment status checking and diagnostic monitoring.
 */
@RestController
@RequestMapping("/api/health")
@CrossOrigin(origins = "*") // Allow diagnostic checks from client configurations
public class HealthController {

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    /**
     * Checks if the Spring application is up and executes a dummy query
     * against the PostgreSQL database to verify connection pool health.
     *
     * @returns ResponseEntity containing status payload and appropriate HTTP code.
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "UP");
        response.put("timestamp", System.currentTimeMillis());

        try {
            if (jdbcTemplate != null) {
                // Execute basic connection test query
                jdbcTemplate.queryForObject("SELECT 1", Integer.class);
                response.put("database", "UP");
            } else {
                response.put("database", "UNAVAILABLE");
            }
        } catch (Exception e) {
            response.put("database", "DOWN");
            response.put("databaseError", e.getMessage());
            // Return 503 Service Unavailable if database connection fails
            return ResponseEntity.status(503).body(response);
        }

        return ResponseEntity.ok(response);
    }
}
