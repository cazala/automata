/**
 * View
 *
 * Tracks canvas size, camera position, and zoom. Provides a snapshot consumed
 * by the render pass (canvas size, camera, zoom). The camera is expressed in
 * world units (cells); zoom is pixels-per-cell scaling around the canvas center.
 */

export interface ViewSnapshot {
  width: number;
  height: number;
  cx: number;
  cy: number;
  zoom: number;
}

export class View {
  private width: number;
  private height: number;
  private cameraX = 0;
  private cameraY = 0;
  private zoom = 1;
  private minZoom = 0.05;
  private maxZoom = 64;

  constructor(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
  }

  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  setCamera(x: number, y: number): void {
    this.cameraX = x;
    this.cameraY = y;
  }

  getCamera(): { x: number; y: number } {
    return { x: this.cameraX, y: this.cameraY };
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(this.minZoom, Math.min(zoom, this.maxZoom));
  }

  getZoom(): number {
    return this.zoom;
  }

  setZoomLimits(minZoom: number, maxZoom: number): void {
    this.minZoom = Math.max(0.0001, minZoom);
    this.maxZoom = Math.max(this.minZoom, maxZoom);
    this.setZoom(this.zoom);
  }

  getSnapshot(): ViewSnapshot {
    return {
      width: this.width,
      height: this.height,
      cx: this.cameraX,
      cy: this.cameraY,
      zoom: this.zoom,
    };
  }
}
