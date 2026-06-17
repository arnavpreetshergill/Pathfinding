import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { RoutingService } from './services/routing.service';
import { MapCoreService } from './services/map-core.service';
import { RouteRendererService } from './services/route-renderer.service';
import { RoadRendererService } from './services/road-renderer.service';
import { ROUTE_COLORS, isValidCoordinate } from './utils/geo-utils';
import * as L from 'leaflet';

/**
 * Main application component representing the desktop offline routing interface.
 * Coordinates user inputs and delegates map logic to specialized modular services.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnInit, OnDestroy {
  // Coordinate states for start and end locations
  startLng: number | null = null;
  startLat: number | null = null;
  endLng: number | null = null;
  endLat: number | null = null;

  // View states
  isLoading = false;
  errorMessage: string | null = null;
  renderRoads = true;

  // Subscriptions and timeouts
  private routingSub: Subscription | null = null;
  private mapClickSub: Subscription | null = null;
  private errorTimeoutId: any = null;

  // Marker states
  private clickCount = 0;
  private startMarker: L.CircleMarker | null = null;
  private endMarker: L.CircleMarker | null = null;

  constructor(
    private routingService: RoutingService,
    private mapCore: MapCoreService,
    private routeRenderer: RouteRendererService,
    private roadRenderer: RoadRendererService
  ) { }

  /**
   * Initializes component map and road renderers, and listens for map clicks.
   */
  ngOnInit(): void {
    // Initialize the core map and background road rendering layer
    this.mapCore.initMap('map');
    this.roadRenderer.init();

    // Subscribe to map clicks for coordinate selection
    this.mapClickSub = this.mapCore.mapClicked.subscribe((latlng) => {
      this.handleMapClick(latlng.lng, latlng.lat);
    });
  }

  /**
   * Lifecycle cleanup: unsubscribes from active API calls and clears pending state.
   */
  ngOnDestroy(): void {
    if (this.routingSub) this.routingSub.unsubscribe();
    if (this.mapClickSub) this.mapClickSub.unsubscribe();
    if (this.errorTimeoutId) clearTimeout(this.errorTimeoutId);
  }

  /**
   * Displays an error alert box and sets a timer to clear the message automatically.
   *
   * @param message Description string.
   */
  private setError(message: string): void {
    this.errorMessage = message;
    if (this.errorTimeoutId) clearTimeout(this.errorTimeoutId);
    this.errorTimeoutId = setTimeout(() => {
      this.errorMessage = null;
    }, 8000);
  }

  /**
   * Explicitly closes the error display banner.
   */
  clearError(): void {
    this.errorMessage = null;
    if (this.errorTimeoutId) clearTimeout(this.errorTimeoutId);
  }

  /**
   * Handles user coordinates selection on the map container.
   * Alternates assigning values to start coordinates (click 1) and end coordinates (click 2).
   *
   * @param lng Clicked longitude.
   * @param lat Clicked latitude.
   */
  private handleMapClick(lng: number, lat: number): void {
    if (!isValidCoordinate(lat, lng)) {
      this.setError('Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.');
      return;
    }

    const fixedLng = parseFloat(lng.toFixed(6));
    const fixedLat = parseFloat(lat.toFixed(6));
    const map = this.mapCore.getMap();

    if (this.clickCount === 0) {
      // First click: Clear previous layers and establish Start Node
      this.clearMapVisuals();
      this.startLng = fixedLng;
      this.startLat = fixedLat;

      this.startMarker = this.mapCore.createVectorDot(fixedLat, fixedLng, ROUTE_COLORS.startRaw, 'Start').addTo(map);
      this.startMarker.openPopup();
      this.clickCount++;

    } else if (this.clickCount === 1) {
      // Second click: Establish End Node and hold
      this.endLng = fixedLng;
      this.endLat = fixedLat;

      this.endMarker = this.mapCore.createVectorDot(fixedLat, fixedLng, ROUTE_COLORS.endRaw, 'End').addTo(map);
      this.endMarker.openPopup();
      this.clickCount = 0;
    }
  }

  /**
   * Manually triggers calculations using values typed inside the control panel input boxes.
   */
  triggerManualRoute(): void {
    if (!this.startLng || !this.startLat || !this.endLng || !this.endLat) {
      this.setError('Please select both start and end coordinates.');
      return;
    }

    if (!isValidCoordinate(this.startLat, this.startLng) || !isValidCoordinate(this.endLat, this.endLng)) {
      this.setError('Invalid coordinates provided.');
      return;
    }

    // Refresh display markers
    const map = this.mapCore.getMap();
    if (this.startMarker) map.removeLayer(this.startMarker);
    if (this.endMarker) map.removeLayer(this.endMarker);

    this.startMarker = this.mapCore.createVectorDot(this.startLat, this.startLng, ROUTE_COLORS.startRaw, 'Start').addTo(map);
    this.endMarker = this.mapCore.createVectorDot(this.endLat, this.endLng, ROUTE_COLORS.endRaw, 'End').addTo(map);

    this.executeRoutingRequest();
  }

  /**
   * Invokes the RoutingService API logic and manages the loading/cancellation states.
   */
  private executeRoutingRequest(): void {
    this.isLoading = true;
    this.routeRenderer.clearRoute(); // Clear previous route before fetching new one

    this.routingSub = this.routingService.calculateRoute(
      this.startLng!,
      this.startLat!,
      this.endLng!,
      this.endLat!
    ).subscribe({
      next: (data) => {
        this.routeRenderer.renderRoute(data);
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        let message = 'No offline connection path could be resolved.';
        if (err.status === 0) {
          message = 'Cannot reach routing server. Ensure the backend is running.';
        } else if (typeof err.error === 'string') {
          message = err.error;
        } else if (err.error?.message) {
          message = err.error.message;
        } else if (err.message) {
          message = err.message;
        }
        this.setError(message);
      }
    });
  }

  /**
   * Cancels any ongoing routing API calculation.
   */
  cancelCalculation(): void {
    if (this.routingSub) {
      this.routingSub.unsubscribe();
      this.isLoading = false;
    }
  }

  /**
   * Resets all markers, inputs, state logs, and route layer visuals from the canvas.
   */
  clearMapVisuals(): void {
    const map = this.mapCore.getMap();
    if (this.startMarker) map.removeLayer(this.startMarker);
    if (this.endMarker) map.removeLayer(this.endMarker);
    this.routeRenderer.clearRoute();

    this.startMarker = null;
    this.endMarker = null;
    this.startLng = null;
    this.startLat = null;
    this.endLng = null;
    this.endLat = null;
    this.clickCount = 0;
  }

  /**
   * Called from the template checkbox toggle to show/hide roads.
   */
  toggleRoads(): void {
    this.roadRenderer.toggleRoads(this.renderRoads);
  }
}