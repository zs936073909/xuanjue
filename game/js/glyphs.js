import * as THREE from '../vendor/three.module.js';

const texCache = new Map();

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function glyphTexture(text, color, fontPx, plate) {
  const key = text + '|' + color + '|' + fontPx + '|' + (plate ? 1 : 0);
  if (texCache.has(key)) return texCache.get(key);
  const w = text.length > 1 ? 512 : 256;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  if (plate) {
    g.fillStyle = 'rgba(16,13,11,0.78)';
    const bw = Math.min(w - 36, 72 + text.length * fontPx * 1.05);
    roundRect(g, (w - bw) / 2, h / 2 - fontPx * 0.82, bw, fontPx * 1.75, 22);
    g.fill();
  }
  g.font = `600 ${fontPx}px "XJ Serif", "Noto Serif SC", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = Math.max(4, fontPx * 0.06);
  g.strokeStyle = 'rgba(12,8,6,0.85)';
  g.strokeText(text, w / 2, h / 2 + fontPx * 0.06);
  g.shadowColor = 'rgba(0,0,0,0.65)';
  g.shadowBlur = 12;
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + fontPx * 0.06);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  texCache.set(key, tex);
  return tex;
}

export function makeLabel(text, color, width, height, fontPx, plate) {
  const mat = new THREE.SpriteMaterial({
    map: glyphTexture(text, color, fontPx || 112, plate),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(width, height, 1);
  return s;
}

export function makeGroundGlyph(text, color, size) {
  const mat = new THREE.MeshBasicMaterial({
    map: glyphTexture(text, color, 150, false),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}
