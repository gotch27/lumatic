import { Application, Sprite, Texture } from "pixi.js";

import type { AdjustmentValues } from "@/editor/domain/types";

import {
  createAdjustmentFilter,
  setFilterAdjustments,
  type AdjustmentFilter,
} from "./adjustmentShader";

function loadHtmlImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The editing preview could not be loaded."));
    image.src = source;
  });
}

export class PhotoRenderer {
  private application: Application | null = null;
  private sprite: Sprite | null = null;
  private filter: AdjustmentFilter | null = null;
  private host: HTMLElement | null = null;
  private textureCache = new Map<string, Texture>();
  private currentSource: string | null = null;
  private fitted = true;
  private resizeObserver: ResizeObserver | null = null;
  private photoRequest = 0;

  async mount(host: HTMLElement, adjustments: AdjustmentValues): Promise<void> {
    this.host = host;
    const application = new Application();
    await application.init({
      preference: "webgl",
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: host,
    });
    application.canvas.className = "photo-renderer-canvas";
    application.canvas.setAttribute("aria-label", "Edited photo preview");
    host.appendChild(application.canvas);

    this.application = application;
    this.filter = createAdjustmentFilter(adjustments);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.fitted) requestAnimationFrame(() => this.fit());
    });
    this.resizeObserver.observe(host);
  }

  async setPhoto(source: string): Promise<void> {
    if (!this.application || !this.filter) return;
    if (source === this.currentSource && this.sprite) return;
    const request = ++this.photoRequest;
    let texture = this.textureCache.get(source);
    if (!texture) {
      const image = await loadHtmlImage(source);
      texture = Texture.from(image);
      this.textureCache.set(source, texture);
    }
    if (request !== this.photoRequest || !this.application || !this.filter) return;
    this.currentSource = source;
    if (!this.sprite) {
      this.sprite = new Sprite(texture);
      this.sprite.anchor.set(0.5);
      this.sprite.filters = [this.filter];
      this.application.stage.addChild(this.sprite);
    } else {
      this.sprite.texture = texture;
    }
    this.fit();
  }

  setAdjustments(adjustments: AdjustmentValues): void {
    if (!this.filter) return;
    setFilterAdjustments(this.filter, adjustments);
  }

  fit(): void {
    if (!this.application || !this.sprite || !this.host) return;
    const availableWidth = Math.max(1, this.application.screen.width - 56);
    const availableHeight = Math.max(1, this.application.screen.height - 56);
    const scale = Math.min(
      availableWidth / this.sprite.texture.width,
      availableHeight / this.sprite.texture.height,
      1,
    );
    this.sprite.scale.set(scale);
    this.sprite.position.set(this.application.screen.width / 2, this.application.screen.height / 2);
    this.fitted = true;
  }

  actualSize(): void {
    if (!this.application || !this.sprite) return;
    this.sprite.scale.set(1);
    this.sprite.position.set(this.application.screen.width / 2, this.application.screen.height / 2);
    this.fitted = false;
  }

  zoomAt(delta: number, x: number, y: number): void {
    if (!this.sprite) return;
    const oldScale = this.sprite.scale.x;
    const nextScale = Math.min(8, Math.max(0.04, oldScale * Math.exp(-delta * 0.0015)));
    const worldX = (x - this.sprite.x) / oldScale;
    const worldY = (y - this.sprite.y) / oldScale;
    this.sprite.scale.set(nextScale);
    this.sprite.position.set(x - worldX * nextScale, y - worldY * nextScale);
    this.fitted = false;
  }

  panBy(deltaX: number, deltaY: number): void {
    if (!this.sprite) return;
    this.sprite.x += deltaX;
    this.sprite.y += deltaY;
    this.fitted = false;
  }

  getZoomPercent(): number {
    return Math.round((this.sprite?.scale.x ?? 1) * 100);
  }

  destroy(): void {
    this.photoRequest += 1;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.textureCache.forEach((texture) => texture.destroy(true));
    this.textureCache.clear();
    this.application?.destroy({ removeView: true }, { children: true });
    this.application = null;
    this.sprite = null;
    this.filter = null;
    this.host = null;
  }
}
