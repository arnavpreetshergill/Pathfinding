import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, HttpClientTestingModule, BrowserAnimationsModule],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should have null initial coordinates', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.startLng).toBeNull();
    expect(app.startLat).toBeNull();
    expect(app.endLng).toBeNull();
    expect(app.endLat).toBeNull();
  });

  it('should have loading state as false initially', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.isLoading).toBeFalse();
  });

  it('should validate coordinates correctly', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    // Access private method via any for testing
    const isValid = (app as any).isValidCoordinate(0, 0);
    expect(isValid).toBeTrue();
  });

  it('should reject invalid latitude', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const isValid = (app as any).isValidCoordinate(91, 0);
    expect(isValid).toBeFalse();
  });

  it('should reject invalid longitude', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const isValid = (app as any).isValidCoordinate(0, 181);
    expect(isValid).toBeFalse();
  });
});


