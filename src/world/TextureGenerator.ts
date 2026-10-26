import * as THREE from 'three';

export class TextureGenerator {
  private maxAnisotropy: number;
  private textures: THREE.Texture[] = [];

  constructor(renderer: THREE.WebGLRenderer) {
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  private registerTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = this.maxAnisotropy;
    tex.needsUpdate = true;
    this.textures.push(tex);
    return tex;
  }

  public createWoodFloorTexture(repeatX = 4, repeatY = 4): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#3b291c';
    ctx.fillRect(0, 0, 512, 512);

    const plankCount = 8;
    const plankHeight = 512 / plankCount;

    for (let i = 0; i < plankCount; i++) {
      const y = i * plankHeight;
      const shade = (i % 3) * 6 - 6;
      ctx.fillStyle = `rgb(${59 + shade}, ${41 + shade}, ${28 + shade})`;
      ctx.fillRect(0, y, 512, plankHeight - 2);

      // Wood grain lines
      ctx.strokeStyle = 'rgba(20, 12, 6, 0.35)';
      ctx.lineWidth = 1.5;
      for (let g = 0; g < 14; g++) {
        ctx.beginPath();
        const gy = y + 4 + (g / 14) * (plankHeight - 8);
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(170, gy + Math.sin(g + i) * 4, 340, gy - Math.cos(g) * 4, 512, gy);
        ctx.stroke();
      }

      // Plank seam
      ctx.fillStyle = '#140d07';
      ctx.fillRect(0, y + plankHeight - 2, 512, 2);
      const jointX = ((i * 173 + 90) % 420) + 40;
      ctx.fillRect(jointX, y, 2, plankHeight);
    }

    // Dusty grime patches
    for (let d = 0; d < 90; d++) {
      const x = (d * 73) % 512;
      const y = (d * 139) % 512;
      const r = 10 + (d % 28);
      const grad = ctx.createRadialGradient(x, y, 1, x, y, r);
      grad.addColorStop(0, 'rgba(15, 12, 10, 0.25)');
      grad.addColorStop(1, 'rgba(15, 12, 10, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    return this.registerTexture(canvas, repeatX, repeatY);
  }

  public createWallpaperTexture(repeatX = 4, repeatY = 1.5): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#423e37';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle vintage vertical stripes
    ctx.fillStyle = 'rgba(50, 46, 38, 0.55)';
    for (let x = 0; x < 512; x += 32) {
      ctx.fillRect(x, 0, 12, 512);
    }

    // Damp water stains near bottom and top
    const bottomGrad = ctx.createLinearGradient(0, 360, 0, 512);
    bottomGrad.addColorStop(0, 'rgba(18, 16, 13, 0)');
    bottomGrad.addColorStop(1, 'rgba(14, 12, 10, 0.72)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, 360, 512, 152);

    const topGrad = ctx.createLinearGradient(0, 0, 0, 110);
    topGrad.addColorStop(0, 'rgba(14, 12, 10, 0.6)');
    topGrad.addColorStop(1, 'rgba(18, 16, 13, 0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, 512, 110);

    // Peeling & mold spots
    for (let i = 0; i < 65; i++) {
      const x = (i * 97) % 512;
      const y = (i * 163) % 512;
      const rad = 12 + (i % 35);
      const g = ctx.createRadialGradient(x, y, 2, x, y, rad);
      g.addColorStop(0, 'rgba(22, 20, 16, 0.42)');
      g.addColorStop(1, 'rgba(22, 20, 16, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    return this.registerTexture(canvas, repeatX, repeatY);
  }

  public createTileTexture(repeatX = 4, repeatY = 4): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#535c5d';
    ctx.fillRect(0, 0, 512, 512);

    const grid = 8;
    const size = 512 / grid;

    for (let gx = 0; gx < grid; gx++) {
      for (let gy = 0; gy < grid; gy++) {
        const delta = ((gx * 7 + gy * 13) % 5) * 4 - 8;
        ctx.fillStyle = `rgb(${80 + delta}, ${89 + delta}, ${90 + delta})`;
        ctx.fillRect(gx * size + 2, gy * size + 2, size - 4, size - 4);

        // Chipped tile crack on occasional tiles
        if ((gx + gy * 3) % 7 === 0) {
          ctx.strokeStyle = 'rgba(20, 24, 24, 0.65)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(gx * size + 6, gy * size + 8);
          ctx.lineTo(gx * size + size * 0.5, gy * size + size * 0.6);
          ctx.lineTo(gx * size + size - 8, gy * size + size - 10);
          ctx.stroke();
        }
      }
    }

    return this.registerTexture(canvas, repeatX, repeatY);
  }

  public createConcreteTexture(repeatX = 4, repeatY = 4): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#292b2e';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 400; i++) {
      const x = (i * 53) % 512;
      const y = (i * 89) % 512;
      const s = 4 + (i % 18);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(16, 17, 19, 0.3)' : 'rgba(58, 60, 64, 0.2)';
      ctx.fillRect(x, y, s, s);
    }

    return this.registerTexture(canvas, repeatX, repeatY);
  }

  public createRugTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#4a1f1d';
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = '#735838';
    ctx.lineWidth = 14;
    ctx.strokeRect(24, 24, 464, 464);

    ctx.strokeStyle = '#2b1210';
    ctx.lineWidth = 6;
    ctx.strokeRect(48, 48, 416, 416);

    // Center medallion
    ctx.fillStyle = '#331614';
    ctx.beginPath();
    ctx.arc(256, 256, 95, 0, Math.PI * 2);
    ctx.fill();

    // Dust wear
    for (let i = 0; i < 120; i++) {
      const x = (i * 67) % 512;
      const y = (i * 113) % 512;
      ctx.fillStyle = 'rgba(20, 18, 16, 0.25)';
      ctx.fillRect(x, y, 18, 18);
    }

    return this.registerTexture(canvas, 1, 1);
  }

  public createTVStaticTexture(): { texture: THREE.CanvasTexture; update: () => void } {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(128, 96);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(tex);

    const update = () => {
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.floor(Math.random() * 195) + 20;
        data[i] = v * 0.85;
        data[i + 1] = v * 0.92;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      // Scan bar
      ctx.fillStyle = 'rgba(20, 25, 30, 0.45)';
      const barY = Math.floor((performance.now() * 0.08) % 96);
      ctx.fillRect(0, barY, 128, 10);
      tex.needsUpdate = true;
    };

    update();
    return { texture: tex, update };
  }

  /**
   * Generates the charred, fibrous, sinewy organic skin texture and bump map
   * matching The Watcher concept sheet (dark obsidian #0a0a0d, charcoal #1c1d22,
   * and deep dried-blood brown #2b1a1a crevices).
   */
  public createWatcherSkinTextures(): {
    map: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
  } {
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = 512;
    colorCanvas.height = 512;
    const cCtx = colorCanvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 512;
    bumpCanvas.height = 512;
    const bCtx = bumpCanvas.getContext('2d')!;

    // Base obsidian charcoal tone
    cCtx.fillStyle = '#0c0c0f';
    cCtx.fillRect(0, 0, 512, 512);

    bCtx.fillStyle = '#404040';
    bCtx.fillRect(0, 0, 512, 512);

    // Vertical sinewy muscle fibers and gnarled bark-like ridges
    for (let i = 0; i < 320; i++) {
      const x = (i * 37) % 512;
      const y = (i * 71) % 512;
      const len = 45 + (i % 95);
      const sway = ((i % 7) - 3) * 6;

      cCtx.strokeStyle =
        i % 5 === 0
          ? 'rgba(46, 24, 24, 0.55)' // subtle warm dark-crimson undertone
          : i % 2 === 0
            ? 'rgba(28, 29, 34, 0.65)'
            : 'rgba(6, 6, 8, 0.85)';
      cCtx.lineWidth = 1.2 + (i % 3) * 0.9;
      cCtx.beginPath();
      cCtx.moveTo(x, y);
      cCtx.bezierCurveTo(
        x + sway,
        y + len * 0.33,
        x - sway,
        y + len * 0.66,
        x + sway * 0.5,
        y + len
      );
      cCtx.stroke();

      bCtx.strokeStyle = i % 2 === 0 ? 'rgba(210, 210, 210, 0.5)' : 'rgba(20, 20, 20, 0.6)';
      bCtx.lineWidth = 1.5 + (i % 3);
      bCtx.beginPath();
      bCtx.moveTo(x, y);
      bCtx.bezierCurveTo(
        x + sway,
        y + len * 0.33,
        x - sway,
        y + len * 0.66,
        x + sway * 0.5,
        y + len
      );
      bCtx.stroke();
    }

    // Porous scarred pockmarks
    for (let p = 0; p < 180; p++) {
      const px = (p * 83) % 512;
      const py = (p * 127) % 512;
      const r = 2 + (p % 6);
      cCtx.fillStyle = 'rgba(5, 5, 7, 0.7)';
      cCtx.beginPath();
      cCtx.arc(px, py, r, 0, Math.PI * 2);
      cCtx.fill();

      bCtx.fillStyle = 'rgba(10, 10, 10, 0.8)';
      bCtx.beginPath();
      bCtx.arc(px, py, r, 0, Math.PI * 2);
      bCtx.fill();
    }

    const map = this.registerTexture(colorCanvas, 2, 2);
    const bumpMap = new THREE.CanvasTexture(bumpCanvas);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(2, 2);
    bumpMap.needsUpdate = true;
    this.textures.push(bumpMap);

    return { map, bumpMap };
  }

  /**
   * Loads the pendant emblem and slices it into 5 interlocking polygon shards
   * that assemble the complete symbol when united on the Front Door.
   */
  public createPendantShardTextures(): {
    doorShardTextures: THREE.CanvasTexture[];
    pickupShardTextures: THREE.CanvasTexture[];
    socketGuideTexture: THREE.CanvasTexture;
  } {
    const size = 256;
    const centroids: Array<[number, number]> = [
      [0.25, 0.26],
      [0.25, 0.74],
      [0.5, 0.5],
      [0.75, 0.25],
      [0.75, 0.74],
    ];

    const doorCanvases: HTMLCanvasElement[] = [];
    const doorShardTextures: THREE.CanvasTexture[] = [];
    const pickupCanvases: HTMLCanvasElement[] = [];
    const pickupShardTextures: THREE.CanvasTexture[] = [];

    for (let i = 0; i < 5; i++) {
      const dCanvas = document.createElement('canvas');
      dCanvas.width = size;
      dCanvas.height = size;
      doorCanvases.push(dCanvas);
      const dTex = new THREE.CanvasTexture(dCanvas);
      dTex.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(dTex);
      doorShardTextures.push(dTex);

      const pCanvas = document.createElement('canvas');
      pCanvas.width = size;
      pCanvas.height = size;
      pickupCanvases.push(pCanvas);
      const pTex = new THREE.CanvasTexture(pCanvas);
      pTex.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(pTex);
      pickupShardTextures.push(pTex);
    }

    const guideCanvas = document.createElement('canvas');
    guideCanvas.width = size;
    guideCanvas.height = size;
    const socketGuideTexture = new THREE.CanvasTexture(guideCanvas);
    socketGuideTexture.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(socketGuideTexture);

    const drawShardsFromSource = (source: CanvasImageSource) => {
      // 1. Draw recessed socket guide with fracture lines for the Front Door
      const gCtx = guideCanvas.getContext('2d')!;
      gCtx.clearRect(0, 0, size, size);
      gCtx.save();
      gCtx.globalAlpha = 0.22;
      gCtx.drawImage(source, 0, 0, size, size);
      gCtx.restore();

      gCtx.strokeStyle = 'rgba(255, 140, 40, 0.38)';
      gCtx.lineWidth = 2;
      PENDANT_SHARD_POLYGONS.forEach((poly) => {
        gCtx.beginPath();
        poly.forEach(([px, py], idx) => {
          if (idx === 0) gCtx.moveTo(px * size, py * size);
          else gCtx.lineTo(px * size, py * size);
        });
        gCtx.closePath();
        gCtx.stroke();
      });
      socketGuideTexture.needsUpdate = true;

      // 2. Draw each of the 5 shards
      PENDANT_SHARD_POLYGONS.forEach((poly, i) => {
        // A. Door assembly shard (in exact original coordinates so all 5 unite seamlessly)
        const dCtx = doorCanvases[i].getContext('2d')!;
        dCtx.clearRect(0, 0, size, size);
        dCtx.save();
        dCtx.beginPath();
        poly.forEach(([px, py], idx) => {
          if (idx === 0) dCtx.moveTo(px * size, py * size);
          else dCtx.lineTo(px * size, py * size);
        });
        dCtx.closePath();
        dCtx.clip();
        dCtx.drawImage(source, 0, 0, size, size);
        dCtx.restore();
        doorShardTextures[i].needsUpdate = true;

        // B. Pickup shard (centered around shard centroid so it spins cleanly in 3D rooms)
        const pCtx = pickupCanvases[i].getContext('2d')!;
        pCtx.clearRect(0, 0, size, size);
        const [cx, cy] = centroids[i];
        const offsetX = (0.5 - cx) * size * 0.65;
        const offsetY = (0.5 - cy) * size * 0.65;

        pCtx.save();
        pCtx.translate(offsetX, offsetY);
        pCtx.beginPath();
        poly.forEach(([px, py], idx) => {
          if (idx === 0) pCtx.moveTo(px * size, py * size);
          else pCtx.lineTo(px * size, py * size);
        });
        pCtx.closePath();
        pCtx.clip();
        pCtx.drawImage(source, 0, 0, size, size);
        pCtx.restore();
        pickupShardTextures[i].needsUpdate = true;
      });
    };

    // Load the pendant emblem asset.
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      drawShardsFromSource(img);
    };
    img.src = '/assets/pendant/pendant-emblem.png';

    return { doorShardTextures, pickupShardTextures, socketGuideTexture };
  }

  public dispose(): void {
    this.textures.forEach((t) => t.dispose());
    this.textures = [];
  }
}

export const PENDANT_SHARD_POLYGONS: Array<Array<[number, number]>> = [
  // Shard 1: Top-Left Wing
  [
    [0.0, 0.0],
    [0.5, 0.0],
    [0.44, 0.36],
    [0.34, 0.44],
    [0.0, 0.52],
  ],
  // Shard 2: Bottom-Left Wing
  [
    [0.0, 0.52],
    [0.34, 0.44],
    [0.36, 0.6],
    [0.45, 0.66],
    [0.5, 1.0],
    [0.0, 1.0],
  ],
  // Shard 3: Center Bridge Core
  [
    [0.44, 0.36],
    [0.5, 0.0],
    [0.56, 0.35],
    [0.66, 0.43],
    [0.64, 0.59],
    [0.55, 0.65],
    [0.5, 1.0],
    [0.45, 0.66],
    [0.36, 0.6],
    [0.34, 0.44],
  ],
  // Shard 4: Top-Right Wing
  [
    [0.5, 0.0],
    [1.0, 0.0],
    [1.0, 0.48],
    [0.66, 0.43],
    [0.56, 0.35],
  ],
  // Shard 5: Bottom-Right Wing
  [
    [0.66, 0.43],
    [1.0, 0.48],
    [1.0, 1.0],
    [0.5, 1.0],
    [0.55, 0.65],
    [0.64, 0.59],
  ],
];
