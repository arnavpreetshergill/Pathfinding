import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { Subject } from 'rxjs';

/**
 * Service responsible for initializing and managing the core Leaflet map instance.
 * It broadcasts map events (clicks, movements) to other components and services.
 */
@Injectable({
  providedIn: 'root'
})
export class MapCoreService {
  private map!: L.Map;
  
  // Observables for emitting map interactions to interested subscribers
  public mapClicked = new Subject<L.LatLng>();
  public mapMoved = new Subject<void>();

  /**
   * Initializes the Leaflet map container and local static tile layers.
   *
   * @param containerId The HTML element ID to bind the map to.
   */
  initMap(containerId: string): void {
    // Instantiate map centered on geographical center of India
    this.map = L.map(containerId, {
      zoomControl: true,
      maxZoom: 14,
      minZoom: 2
    }).setView([22.9734, 78.6568], 5);

    // Load local offline static JPEG tiles
    L.tileLayer('/offline-map-data/{z}/{x}/{y}.jpg', {
      attribution: 'Offline Natural Earth Map',
      maxNativeZoom: 12,
      maxZoom: 14
    }).addTo(this.map);

    // Bind coordinate click handler
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.mapClicked.next(e.latlng);
    });

    // Broadcast map movements to trigger updates (e.g. fetching new roads)
    this.map.on('moveend', () => {
      this.mapMoved.next();
    });

    // Safeguard: Invalidate map size shortly after setup to ensure container boundaries are computed correctly
    setTimeout(() => {
      this.map.invalidateSize();
      this.mapMoved.next();
    }, 200);
  }

  /**
   * Retrieves the underlying Leaflet Map instance for direct layer manipulations.
   *
   * @returns The active Leaflet map.
   */
  getMap(): L.Map {
    return this.map;
  }

  /**
   * Instantiates a circle vector overlay (dot) on the Leaflet map to represent coordinate markers.
   *
   * @param lat Marker latitude.
   * @param lng Marker longitude.
   * @param color Boundary/fill color hex value.
   * @param popupText Content of tooltip box.
   * @returns Configured Leaflet CircleMarker layer.
   */
  createVectorDot(lat: number, lng: number, color: string, popupText: string): L.CircleMarker {
    return L.circleMarker([lat, lng], {
      radius: 7,
      fillColor: color,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 1
    }).bindPopup(popupText);
  }
}
