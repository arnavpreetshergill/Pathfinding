import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Represents a point snapped to the closest node in the routing database network.
 */
export interface SnappedPoint {
  vertex_id: number;
  snapped_lng: number;
  snapped_lat: number;
}

/**
 * Structure of the API payload returned by the database routing algorithm.
 */
export interface RoutingResponse {
  start_snapped: SnappedPoint;
  end_snapped: SnappedPoint;
  route: string[]; // List of GeoJSON strings representing each segment path
}

/**
 * A single road segment returned by the roads-in-bounds API.
 */
export interface RoadSegment {
  geojson: string;   // Raw GeoJSON geometry string (LineString)
  name: string | null;
  highway: string;
}

/**
 * Service to handle communication with the backend PostGIS pgRouting service.
 */
@Injectable({
  providedIn: 'root'
})
export class RoutingService {
  constructor(private http: HttpClient) { }

  /**
   * Triggers the offline path calculation on the Spring Boot backend server.
   *
   * @param startLng Source longitude in degrees.
   * @param startLat Source latitude in degrees.
   * @param endLng Destination longitude in degrees.
   * @param endLat Destination latitude in degrees.
   * @returns Observable resolving to the RoutingResponse payload.
   */
  calculateRoute(
    startLng: number,
    startLat: number,
    endLng: number,
    endLat: number
  ): Observable<RoutingResponse> {
    const url = `${environment.apiUrl}/api/routing/calculate?startLng=${startLng}&startLat=${startLat}&endLng=${endLng}&endLat=${endLat}`;
    return this.http.get<RoutingResponse>(url);
  }

  /**
   * Fetches road segments visible in the given bounding box at the specified zoom level.
   */
  getRoadsInBounds(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number,
    zoom: number
  ): Observable<RoadSegment[]> {
    const url = `${environment.apiUrl}/api/routing/roads?minLng=${minLng}&minLat=${minLat}&maxLng=${maxLng}&maxLat=${maxLat}&zoom=${zoom}`;
    return this.http.get<RoadSegment[]>(url);
  }
}
