import { Injectable, OnDestroy } from '@angular/core';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { MapCoreService } from './map-core.service';
import { RoutingService, RoadSegment } from './routing.service';

/**
 * Service responsible for fetching and displaying visible road networks
 * dynamically as the user pans and zooms the map.
 */
@Injectable({
  providedIn: 'root'
})
export class RoadRendererService implements OnDestroy {
  private roadsLayerGroup: L.LayerGroup = L.layerGroup();
  private roadsFetchTimeout: any = null;
  private roadsSub: Subscription | null = null;
  
  // State indicating if roads should be currently rendered
  public renderRoads = true;

  constructor(
    private mapCore: MapCoreService,
    private routingService: RoutingService
  ) {}

  /**
   * Initializes the road rendering layer and binds it to the map.
   * Listens for map movement to trigger fetching of roads in the new viewport.
   */
  init(): void {
    const map = this.mapCore.getMap();
    if (map) {
      this.roadsLayerGroup.addTo(map);
    }

    this.mapCore.mapMoved.subscribe(() => {
      this.scheduleFetchRoads();
    });
  }

  /**
   * Cleans up pending timeouts and subscriptions.
   */
  ngOnDestroy(): void {
    if (this.roadsSub) {
      this.roadsSub.unsubscribe();
    }
    if (this.roadsFetchTimeout) {
      clearTimeout(this.roadsFetchTimeout);
    }
  }

  /**
   * Debounces the road fetch to avoid flooding the backend during rapid pan/zoom.
   */
  private scheduleFetchRoads(): void {
    if (this.roadsFetchTimeout) {
      clearTimeout(this.roadsFetchTimeout);
    }
    this.roadsFetchTimeout = setTimeout(() => {
      this.fetchRoadsInView();
    }, 350);
  }

  /**
   * Fetches and renders road segments visible in the current map viewport.
   * Only queries when renderRoads is enabled and zoom >= 6.
   */
  fetchRoadsInView(): void {
    const map = this.mapCore.getMap();
    if (!map || !this.renderRoads) {
      this.roadsLayerGroup.clearLayers();
      return;
    }

    const zoom = map.getZoom();
    if (zoom < 6) {
      this.roadsLayerGroup.clearLayers();
      return;
    }

    // Cancel any in-flight road request
    if (this.roadsSub) {
      this.roadsSub.unsubscribe();
    }

    const bounds = map.getBounds();
    this.roadsSub = this.routingService.getRoadsInBounds(
      bounds.getWest(), bounds.getSouth(),
      bounds.getEast(), bounds.getNorth(),
      zoom
    ).subscribe({
      next: (roads: RoadSegment[]) => {
        this.roadsLayerGroup.clearLayers();
        for (const road of roads) {
          try {
            const geom = JSON.parse(road.geojson);
            const style = this.getRoadStyle(road.highway);
            const layer = L.geoJSON(geom, { style });

            if (road.name) {
              layer.bindTooltip(road.name, { sticky: true, className: 'road-tooltip' });
            }

            this.roadsLayerGroup.addLayer(layer);
          } catch {
            // Silently skip malformed segments
          }
        }
      },
      error: () => {
        // Silently skip on error
      }
    });
  }

  /**
   * Toggles the rendering of roads and triggers a refetch if enabled.
   *
   * @param enabled Boolean indicating whether to show or hide the roads.
   */
  toggleRoads(enabled: boolean): void {
    this.renderRoads = enabled;
    if (this.renderRoads) {
      this.fetchRoadsInView();
    } else {
      this.roadsLayerGroup.clearLayers();
    }
  }

  /**
   * Returns Leaflet path style options keyed by OSM highway classification.
   *
   * @param highway The OSM highway classification tag (e.g. 'motorway', 'primary')
   * @returns Configuration options for rendering the line
   */
  private getRoadStyle(highway: string): L.PathOptions {
    switch (highway) {
      case 'motorway':
      case 'motorway_link':
        return { color: '#e74c3c', weight: 4, opacity: 0.9 };
      case 'trunk':
      case 'trunk_link':
        return { color: '#e67e22', weight: 3.5, opacity: 0.85 };
      case 'primary':
      case 'primary_link':
        return { color: '#f1c40f', weight: 3, opacity: 0.8 };
      case 'secondary':
      case 'secondary_link':
        return { color: '#2ecc71', weight: 2.5, opacity: 0.75 };
      case 'tertiary':
      case 'tertiary_link':
        return { color: '#3498db', weight: 2, opacity: 0.7 };
      default:
        return { color: '#95a5a6', weight: 1.5, opacity: 0.55 };
    }
  }
}
