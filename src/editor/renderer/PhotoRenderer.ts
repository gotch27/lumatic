import { Application, Graphics, RenderTexture, Sprite, Texture } from "pixi.js";

import {
  geometryPointToSource,
  getOrientedDimensions,
  sourcePointToGeometry,
} from "@/editor/domain/geometry";
import type { GeometryValues, PhotoEditState } from "@/editor/domain/types";

import {
  createAdjustmentFilter,
  destroyAdjustmentFilter,
  setFilterClippingOverlays,
  setFilterEditState,
  setFilterImageSprite,
  setFilterImageSize,
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

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class PhotoRenderer {
  private application: Application | null = null;
  private sprite: Sprite | null = null;
  private cropMask: Graphics | null = null;
  private filter: AdjustmentFilter | null = null;
  private analysisFilter: AdjustmentFilter | null = null;
  private analysisSprite: Sprite | null = null;
  private analysisTarget: RenderTexture | null = null;
  private host: HTMLElement | null = null;
  private textureCache = new Map<string, Texture>();
  private currentSource: string | null = null;
  private fitted = true;
  private resizeObserver: ResizeObserver | null = null;
  private photoRequest = 0;
  private onTransform: (() => void) | null = null;
  private geometry: GeometryValues | null = null;
  private editState: PhotoEditState | null = null;
  private geometryEditing = false;
  private viewScale = 1;
  private anchorX = 0;
  private anchorY = 0;

  async mount(host: HTMLElement, editState: PhotoEditState, onTransform?: () => void): Promise<void> {
    this.host = host;
    this.geometry = editState.geometry;
    this.editState = editState;
    this.onTransform = onTransform ?? null;
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
    this.filter = createAdjustmentFilter(editState);
    this.cropMask = new Graphics();
    application.stage.addChild(this.cropMask);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.fitted) requestAnimationFrame(() => this.fit());
      else {
        this.updateTransform();
        this.onTransform?.();
      }
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
      this.application.stage.addChildAt(this.sprite, 0);
      setFilterImageSprite(this.filter, this.sprite);
    } else {
      this.sprite.texture = texture;
    }
    setFilterImageSize(this.filter, texture.width, texture.height);
    if (this.analysisSprite && this.analysisFilter) {
      this.analysisSprite.texture = texture;
      setFilterImageSize(this.analysisFilter, texture.width, texture.height);
    }
    this.fit();
  }

  setEditState(editState: PhotoEditState): void {
    if (!this.filter) return;
    this.geometry = editState.geometry;
    this.editState = editState;
    setFilterEditState(this.filter, editState);
    if (this.fitted) this.fit();
    else {
      this.updateTransform();
      this.onTransform?.();
    }
  }

  setClippingOverlays(showShadowClipping: boolean, showHighlightClipping: boolean): void {
    if (!this.filter) return;
    setFilterClippingOverlays(this.filter, showShadowClipping, showHighlightClipping);
  }

  sampleFinalPixels(maximumEdge = 256) {
    if (!this.application || !this.sprite || !this.editState || !this.geometry) return null;
    if (!this.analysisSprite || !this.analysisFilter) {
      this.analysisFilter = createAdjustmentFilter(this.editState);
      this.analysisSprite = new Sprite(this.sprite.texture);
      this.analysisSprite.anchor.set(0.5);
      this.analysisSprite.filters = [this.analysisFilter];
      setFilterImageSprite(this.analysisFilter, this.analysisSprite);
      setFilterImageSize(this.analysisFilter, this.sprite.texture.width, this.sprite.texture.height);
    }

    this.analysisSprite.texture = this.sprite.texture;
    setFilterEditState(this.analysisFilter, this.editState);
    setFilterClippingOverlays(this.analysisFilter, false, false);

    const dimensions = getOrientedDimensions(
      this.sprite.texture.width,
      this.sprite.texture.height,
      this.geometry.rotation,
    );
    const crop = this.geometry.crop;
    const croppedWidth = Math.max(1, dimensions.width * crop.width);
    const croppedHeight = Math.max(1, dimensions.height * crop.height);
    const scaleToSample = maximumEdge / Math.max(croppedWidth, croppedHeight);
    const width = Math.max(1, Math.round(croppedWidth * scaleToSample));
    const height = Math.max(1, Math.round(croppedHeight * scaleToSample));
    const scale = Math.min(width / croppedWidth, height / croppedHeight);
    const cropCenterX = crop.x + crop.width / 2;
    const cropCenterY = crop.y + crop.height / 2;
    const quarterOdd = this.geometry.rotation === 90 || this.geometry.rotation === 270;
    const sourceFlipX = quarterOdd ? this.geometry.flipVertical : this.geometry.flipHorizontal;
    const sourceFlipY = quarterOdd ? this.geometry.flipHorizontal : this.geometry.flipVertical;
    this.analysisSprite.position.set(
      width / 2 + (0.5 - cropCenterX) * dimensions.width * scale,
      height / 2 + (0.5 - cropCenterY) * dimensions.height * scale,
    );
    this.analysisSprite.rotation = (this.geometry.rotation + this.geometry.straighten) * Math.PI / 180;
    this.analysisSprite.scale.set(scale * (sourceFlipX ? -1 : 1), scale * (sourceFlipY ? -1 : 1));

    if (!this.analysisTarget) {
      this.analysisTarget = RenderTexture.create({ width, height, resolution: 1, dynamic: true });
    } else {
      this.analysisTarget.resize(width, height, 1);
    }
    this.application.renderer.render({
      container: this.analysisSprite,
      target: this.analysisTarget,
      clear: true,
      clearColor: [0, 0, 0, 0],
    });
    return this.application.renderer.extract.pixels(this.analysisTarget);
  }

  setGeometryEditing(editing: boolean): void {
    if (this.geometryEditing === editing) return;
    this.geometryEditing = editing;
    this.fit();
  }

  private orientedDimensions() {
    if (!this.sprite || !this.geometry) return { width: 1, height: 1 };
    return getOrientedDimensions(this.sprite.texture.width, this.sprite.texture.height, this.geometry.rotation);
  }

  private viewRect() {
    if (!this.geometry || this.geometryEditing) return { x: 0, y: 0, width: 1, height: 1 };
    return this.geometry.crop;
  }

  private updateTransform(): void {
    if (!this.sprite || !this.geometry) return;
    const view = this.viewRect();
    const viewCenter = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    const imageCenter = this.geometryToScreen(0.5, 0.5, viewCenter);
    if (!imageCenter) return;
    const quarterOdd = this.geometry.rotation === 90 || this.geometry.rotation === 270;
    const sourceFlipX = quarterOdd ? this.geometry.flipVertical : this.geometry.flipHorizontal;
    const sourceFlipY = quarterOdd ? this.geometry.flipHorizontal : this.geometry.flipVertical;
    this.sprite.position.set(imageCenter.x, imageCenter.y);
    this.sprite.rotation = (this.geometry.rotation + this.geometry.straighten) * Math.PI / 180;
    this.sprite.scale.set(
      this.viewScale * (sourceFlipX ? -1 : 1),
      this.viewScale * (sourceFlipY ? -1 : 1),
    );

    this.cropMask?.clear();
    if (!this.geometryEditing && this.cropMask) {
      const crop = this.getCropScreenRect();
      this.cropMask.rect(crop.x, crop.y, crop.width, crop.height).fill(0xffffff);
      this.sprite.mask = this.cropMask;
    } else {
      this.sprite.mask = null;
    }
  }

  fit(): void {
    if (!this.application || !this.sprite || !this.host || !this.geometry) return;
    const dimensions = this.orientedDimensions();
    const view = this.viewRect();
    const availableWidth = Math.max(1, this.application.screen.width - 56);
    const availableHeight = Math.max(1, this.application.screen.height - 56);
    this.viewScale = Math.min(
      availableWidth / (dimensions.width * view.width),
      availableHeight / (dimensions.height * view.height),
      1,
    );
    this.anchorX = this.application.screen.width / 2;
    this.anchorY = this.application.screen.height / 2;
    this.fitted = true;
    this.updateTransform();
    this.onTransform?.();
  }

  actualSize(): void {
    if (!this.application || !this.sprite) return;
    this.viewScale = 1;
    this.anchorX = this.application.screen.width / 2;
    this.anchorY = this.application.screen.height / 2;
    this.fitted = false;
    this.updateTransform();
    this.onTransform?.();
  }

  zoomAt(delta: number, x: number, y: number): void {
    if (!this.sprite || !this.geometry) return;
    const geometryPoint = this.screenToGeometry(x, y);
    if (!geometryPoint) return;
    const nextScale = Math.min(8, Math.max(0.04, this.viewScale * Math.exp(-delta * 0.0015)));
    const dimensions = this.orientedDimensions();
    const view = this.viewRect();
    const viewCenter = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    this.viewScale = nextScale;
    this.anchorX = x - (geometryPoint.x - viewCenter.x) * dimensions.width * nextScale;
    this.anchorY = y - (geometryPoint.y - viewCenter.y) * dimensions.height * nextScale;
    this.fitted = false;
    this.updateTransform();
    this.onTransform?.();
  }

  panBy(deltaX: number, deltaY: number): void {
    if (!this.sprite) return;
    this.anchorX += deltaX;
    this.anchorY += deltaY;
    this.fitted = false;
    this.updateTransform();
    this.onTransform?.();
  }

  getZoomPercent(): number {
    return Math.round(this.viewScale * 100);
  }

  geometryToScreen(x: number, y: number, viewCenterOverride?: { x: number; y: number }) {
    if (!this.sprite || !this.geometry) return null;
    const dimensions = this.orientedDimensions();
    const view = this.viewRect();
    const viewCenter = viewCenterOverride ?? { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    return {
      x: this.anchorX + (x - viewCenter.x) * dimensions.width * this.viewScale,
      y: this.anchorY + (y - viewCenter.y) * dimensions.height * this.viewScale,
    };
  }

  screenToGeometry(x: number, y: number) {
    if (!this.sprite || !this.geometry) return null;
    const dimensions = this.orientedDimensions();
    const view = this.viewRect();
    const viewCenter = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    return {
      x: (x - this.anchorX) / (dimensions.width * this.viewScale) + viewCenter.x,
      y: (y - this.anchorY) / (dimensions.height * this.viewScale) + viewCenter.y,
    };
  }

  imageToScreen(x: number, y: number): { x: number; y: number } | null {
    if (!this.sprite || !this.geometry) return null;
    const geometryPoint = sourcePointToGeometry(
      { x, y },
      this.geometry,
      this.sprite.texture.width,
      this.sprite.texture.height,
    );
    return this.geometryToScreen(geometryPoint.x, geometryPoint.y);
  }

  screenToImage(x: number, y: number): { x: number; y: number } | null {
    if (!this.sprite || !this.geometry) return null;
    const geometryPoint = this.screenToGeometry(x, y);
    if (!geometryPoint) return null;
    return geometryPointToSource(
      geometryPoint,
      this.geometry,
      this.sprite.texture.width,
      this.sprite.texture.height,
    );
  }

  getCropScreenRect(): ScreenRect {
    if (!this.geometry) return { x: 0, y: 0, width: 0, height: 0 };
    const start = this.geometryToScreen(this.geometry.crop.x, this.geometry.crop.y);
    const end = this.geometryToScreen(
      this.geometry.crop.x + this.geometry.crop.width,
      this.geometry.crop.y + this.geometry.crop.height,
    );
    if (!start || !end) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
  }

  destroy(): void {
    this.photoRequest += 1;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.analysisSprite) this.analysisSprite.filters = [];
    if (this.analysisFilter) destroyAdjustmentFilter(this.analysisFilter);
    this.analysisTarget?.destroy(true);
    this.analysisSprite?.destroy();
    this.analysisFilter = null;
    this.analysisTarget = null;
    this.analysisSprite = null;
    this.textureCache.forEach((texture) => texture.destroy(true));
    this.textureCache.clear();
    if (this.sprite) {
      this.sprite.mask = null;
      this.sprite.filters = [];
    }
    this.cropMask?.destroy();
    if (this.filter) destroyAdjustmentFilter(this.filter);
    this.application?.destroy({ removeView: true }, { children: true });
    this.application = null;
    this.sprite = null;
    this.cropMask = null;
    this.filter = null;
    this.host = null;
    this.geometry = null;
    this.editState = null;
    this.onTransform = null;
  }
}
