import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { MapCoreService } from './map-core.service';
import { RoutingResponse } from './routing.service';
import { ROUTE_COLORS, isValidGeoJSONFeature } from '../utils/geo-utils';

/**
 * Service responsible for rendering the calculated shortest path onto the map.
 * Strips away any diagnostic visuals (like snapped lines and nodes) and 
 * only displays the core route to the end user.
 */
@Injectable({
  providedIn: 'root'
})
export class RouteRendererService {
  private routeLayers: L.Layer[] = [];

  constructor(private mapCore: MapCoreService) {}

  /**
   * Parses the GeoJSON paths returned from the backend and renders them as visual map layers.
   * Diagnostic visualizers (like dashed lines connecting to snapped nodes) have been removed 
   * to ensure a cleaner user experience.
   * 
   * @param data Raw JSON response from the routing engine containing snapped nodes and GeoJSON geometries.
   */
  renderRoute(data: RoutingResponse): void {
    this.clearRoute();
    const map = this.mapCore.getMap();

    if (!map || !data || !data.route) {
      return;
    }

    // Iterate over route GeoJSON segment strings and build Leaflet layers
    data.route.forEach((geoJsonString: string) => {
      try {
        const segment = JSON.parse(geoJsonString);
        if (!isValidGeoJSONFeature(segment)) {
          return;
        }

        const mapLine = L.geoJSON(segment, {
          style: {
            color: ROUTE_COLORS.route,
            weight: 6,
            opacity: 0.85
          },
          pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: 5,
              fillColor: ROUTE_COLORS.route,
              color: '#ffffff',
              weight: 2,
              opacity: 1,
              fillOpacity: 1
            });
          }
        }).addTo(map);

        this.routeLayers.push(mapLine);
      } catch (e) {
        // Silently skip malformed GeoJSON features
      }
    });

    // Automatically focus camera view to fit the route geometries bounds
    if (this.routeLayers.length > 0) {
      const trackingGroup = L.featureGroup(this.routeLayers);
      map.fitBounds(trackingGroup.getBounds().pad(0.1));
    }
  }

  /**
   * Removes all active route layers from the map canvas.
   */
  clearRoute(): void {
    const map = this.mapCore.getMap();
    if (map) {
      this.routeLayers.forEach(l => map.removeLayer(l));
    }
    this.routeLayers = [];
  }
}
