// 天将与问卜人。轮廓要在十步外仍分得清：冠、翼、旗、壳、空骨架。
import * as THREE from '../vendor/three.module.js';
import { glyphTexture, makeLabel } from './glyphs.js';

function glowHex(hex) {
  return new THREE.Color(hex).lerp(new THREE.Color('#fff6ee'), 0.32);
}

function mats(hex) {
  const c = new THREE.Color(hex);
  const glow = glowHex(hex);
  return {
    cloth: new THREE.MeshStandardMaterial({
      color: c.clone().multiplyScalar(0.55), roughness: 0.62, metalness: 0.16,
      emissive: c, emissiveIntensity: 0.42,
    }),
    glow: new THREE.MeshStandardMaterial({
      color: glow, emissive: glow, emissiveIntensity: 1.25, roughness: 0.28, metalness: 0.35,
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1c1816, roughness: 0.78, metalness: 0.1, emissive: 0x2a221c, emissiveIntensity: 0.25 }),
    add: new THREE.MeshBasicMaterial({
      color: glow, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }),
  };
}

function put(parent, geo, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

function baseAura(g, M) {
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), M.add);
  aura.scale.set(1.05, 1.7, 0.55);
  aura.position.y = 1.25;
  aura.castShadow = false;
  g.add(aura);
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  blob.castShadow = false;
  g.add(blob);
}

function humanoid(g, M) {
  const robe = put(g, new THREE.CylinderGeometry(0.28, 0.56, 1.35, 14), M.cloth, 0, 0.78, 0);
  const sash = put(g, new THREE.TorusGeometry(0.34, 0.035, 8, 20), M.glow, 0, 0.95, 0, false);
  sash.rotation.x = Math.PI / 2;
  const head = put(g, new THREE.SphereGeometry(0.2, 16, 12), M.dark, 0, 1.66, 0);
  const core = put(g, new THREE.SphereGeometry(0.1, 10, 8), M.glow, 0, 1.05, -0.22, false);
  return { robe, head, core };
}

const CREST = {
  贵人(g, M, anim) {
    humanoid(g, M);
    const crown = new THREE.Group();
    crown.position.y = 1.92;
    g.add(crown);
    put(crown, new THREE.BoxGeometry(0.46, 0.07, 0.1), M.glow, 0, 0, 0, false);
    [-0.16, 0, 0.16].forEach((x, i) => put(crown, new THREE.BoxGeometry(0.06, 0.28 + (i === 1 ? 0.12 : 0), 0.06), M.glow, x, 0.2, 0, false));
    const halo = put(g, new THREE.TorusGeometry(0.34, 0.028, 8, 24), M.add, 0, 1.72, 0.08, false);
    halo.rotation.y = 0.2;
    anim.halo = halo;
    put(g, new THREE.BoxGeometry(0.72, 0.08, 0.22), M.cloth, 0, 1.28, 0);
  },
  螣蛇(g, M, anim) {
    const coils = [];
    for (let i = 0; i < 6; i++) {
      const coil = put(g, new THREE.TorusGeometry(0.28 + i * 0.035, 0.045, 8, 18), M.glow, Math.sin(i) * 0.08, 0.28 + i * 0.28, 0, false);
      coil.rotation.x = Math.PI / 2.3;
      coil.rotation.z = i * 0.45;
      coils.push(coil);
    }
    const head = put(g, new THREE.SphereGeometry(0.16, 12, 10), M.dark, 0.05, 2.05, -0.05);
    head.scale.set(0.8, 1.35, 0.8);
    put(g, new THREE.ConeGeometry(0.04, 0.22, 6), M.glow, 0.05, 2.02, -0.2, false).rotation.x = Math.PI / 2;
    anim.coils = coils;
  },
  朱雀(g, M, anim) {
    humanoid(g, M);
    const wingL = put(g, new THREE.PlaneGeometry(1.15, 0.52), M.add, -0.62, 1.35, 0, false);
    wingL.rotation.z = 0.55;
    const wingR = put(g, new THREE.PlaneGeometry(1.15, 0.52), M.add, 0.62, 1.35, 0, false);
    wingR.rotation.z = -0.55;
    anim.wings = [wingL, wingR];
    const beak = put(g, new THREE.ConeGeometry(0.07, 0.32, 6), M.glow, 0, 1.66, -0.28, false);
    beak.rotation.x = Math.PI / 2;
    for (let i = -1; i <= 1; i++) {
      const tail = put(g, new THREE.ConeGeometry(0.06, 0.42, 5), M.glow, i * 0.1, 0.55, 0.28, false);
      tail.rotation.x = -0.8;
    }
  },
  六合(g, M, anim) {
    humanoid(g, M);
    const a = put(g, new THREE.TorusGeometry(0.38, 0.04, 8, 22), M.glow, -0.16, 1.15, 0.05, false);
    const b = put(g, new THREE.TorusGeometry(0.38, 0.04, 8, 22), M.glow, 0.16, 1.15, 0.05, false);
    b.rotation.y = Math.PI / 2;
    anim.rings = [a, b];
    put(g, new THREE.SphereGeometry(0.12, 10, 8), M.dark, 0.28, 1.62, 0);
  },
  勾陈(g, M) {
    humanoid(g, M);
    put(g, new THREE.BoxGeometry(0.92, 0.16, 0.32), M.cloth, 0, 1.32, 0);
    put(g, new THREE.BoxGeometry(0.36, 0.28, 0.36), M.dark, 0, 1.78, 0);
    const pole = put(g, new THREE.CylinderGeometry(0.03, 0.03, 1.7, 6), M.dark, 0.48, 1.35, 0);
    const blade = put(g, new THREE.BoxGeometry(0.08, 0.42, 0.22), M.glow, 0.48, 2.2, 0, false);
    pole.rotation.z = -0.15;
    blade.position.set(0.55, 2.15, 0);
  },
  青龙(g, M, anim) {
    const tail = new THREE.Group();
    g.add(tail);
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const r = Math.max(0.08, 0.2 - t * 0.11);
      put(tail, new THREE.SphereGeometry(r, 10, 8), i > 6 ? M.glow : M.cloth, Math.sin(t * Math.PI * 1.7) * 0.62, 0.22 + t * 2.15, Math.cos(t * Math.PI) * 0.12);
    }
    put(g, new THREE.ConeGeometry(0.06, 0.28, 5), M.glow, 0.42, 2.45, 0.05, false).rotation.z = 0.5;
    put(g, new THREE.ConeGeometry(0.06, 0.28, 5), M.glow, 0.72, 2.38, 0.05, false).rotation.z = -0.4;
    anim.tail = tail;
  },
  天空(g, M, anim) {
    const shell = put(g, new THREE.IcosahedronGeometry(0.62, 0), new THREE.MeshBasicMaterial({
      color: glowHex(M.glow.color), wireframe: true, toneMapped: false,
    }), 0, 1.25, 0, false);
    const core = put(g, new THREE.SphereGeometry(0.16, 12, 10), M.add, 0, 1.25, 0, false);
    anim.shell = shell;
    anim.core = core;
  },
  白虎(g, M) {
    humanoid(g, M);
    put(g, new THREE.ConeGeometry(0.08, 0.28, 5), M.glow, -0.12, 1.95, 0, false);
    put(g, new THREE.ConeGeometry(0.08, 0.28, 5), M.glow, 0.12, 1.95, 0, false);
    put(g, new THREE.BoxGeometry(0.22, 0.08, 0.26), M.glow, 0, 1.5, -0.2, false);
    for (let i = 0; i < 3; i++) {
      const band = put(g, new THREE.TorusGeometry(0.3 - i * 0.02, 0.025, 6, 16), M.glow, 0, 0.45 + i * 0.28, 0, false);
      band.rotation.x = Math.PI / 2;
    }
    g.rotation.x = 0.12;
  },
  太常(g, M, anim) {
    humanoid(g, M);
    put(g, new THREE.CylinderGeometry(0.028, 0.028, 2.15, 6), M.dark, 0.42, 1.55, 0);
    const banner = put(g, new THREE.PlaneGeometry(0.72, 0.95), M.add, 0.82, 2.05, 0, false);
    anim.banner = banner;
    put(g, new THREE.BoxGeometry(0.16, 0.08, 0.16), M.glow, 0.42, 2.62, 0, false);
  },
  玄武(g, M, anim) {
    const shell = put(g, new THREE.SphereGeometry(0.52, 16, 12), M.cloth, 0, 0.72, 0.05);
    shell.scale.set(1.25, 0.62, 1.15);
    const snake = put(g, new THREE.TorusGeometry(0.36, 0.045, 8, 18), M.glow, 0.1, 0.95, -0.05, false);
    snake.rotation.x = 1.1;
    anim.snake = snake;
    put(g, new THREE.SphereGeometry(0.1, 8, 6), M.glow, 0.42, 1.15, -0.2, false);
  },
  太阴(g, M, anim) {
    humanoid(g, M);
    const moon = put(g, new THREE.TorusGeometry(0.42, 0.035, 8, 28), M.glow, 0.12, 1.85, 0.05, false);
    const mask = put(g, new THREE.SphereGeometry(0.34, 14, 10), M.dark, -0.12, 1.85, 0.08, false);
    anim.moon = moon;
    void mask;
  },
  天后(g, M, anim) {
    humanoid(g, M);
    const ribs = [];
    for (let i = 0; i < 3; i++) {
      const rib = put(g, new THREE.PlaneGeometry(0.22, 1.15), M.add, -0.28 + i * 0.28, 0.85, 0.22, false);
      ribs.push(rib);
    }
    anim.ribs = ribs;
    put(g, new THREE.TorusGeometry(0.18, 0.02, 6, 16), M.glow, 0, 1.95, 0, false);
  },
};

export function buildGeneral(name, hex) {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  outer.add(g);
  const M = mats(hex);
  const anim = {};
  baseAura(g, M);
  (CREST[name] || CREST.贵人)(g, M, anim);

  const plate = makeLabel(name, '#f7f1e8', 2.05, 0.78, 108, true);
  plate.position.y = name === '青龙' || name === '太常' ? 3.15 : 2.85;
  outer.add(plate);

  outer.userData.tick = (t) => {
    if (anim.coils) anim.coils.forEach((c, i) => { c.rotation.z = t * (0.45 + i * 0.08); });
    if (anim.wings) {
      anim.wings[0].rotation.z = 0.5 + Math.sin(t * 4.2) * 0.28;
      anim.wings[1].rotation.z = -0.5 - Math.sin(t * 4.2) * 0.28;
    }
    if (anim.rings) {
      anim.rings[0].rotation.z = t * 0.6;
      anim.rings[1].rotation.x = t * 0.6;
    }
    if (anim.tail) anim.tail.rotation.y = Math.sin(t * 1.1) * 0.22;
    if (anim.banner) anim.banner.rotation.y = Math.sin(t * 1.2) * 0.32;
    if (anim.ribs) anim.ribs.forEach((r, i) => { r.rotation.y = Math.sin(t * 1.5 + i) * 0.4; });
    if (anim.shell) anim.shell.rotation.y = t * 0.35;
    if (anim.core) anim.core.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
    if (anim.snake) anim.snake.rotation.z = t * 0.5;
    if (anim.halo) anim.halo.rotation.z = t * 0.4;
    if (anim.moon) anim.moon.rotation.z = Math.sin(t * 0.8) * 0.15;
    const bow = outer.userData.bow || 0;
    g.rotation.x = (name === '白虎' ? 0.12 : 0) + bow * 0.5;
    g.position.y = Math.sin(t * 1.2 + (outer.userData.phase || 0)) * 0.04 - bow * 0.2;
  };
  return outer;
}

export function buildWanderer() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x3a2a22, roughness: 0.7, metalness: 0.08, emissive: 0x7a4030, emissiveIntensity: 0.35,
  });
  const robe = put(g, new THREE.CylinderGeometry(0.16, 0.36, 0.86, 14), cloth, 0, 0.5, 0);
  const hood = put(g, new THREE.SphereGeometry(0.16, 14, 12), new THREE.MeshStandardMaterial({ color: 0x241c18, roughness: 0.8 }), 0, 1.05, 0.02);
  hood.scale.set(1, 1.15, 1);
  const face = put(g, new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd2b49c, roughness: 0.65 }), 0, 1.0, -0.08);
  const hem = put(g, new THREE.TorusGeometry(0.3, 0.018, 6, 24), new THREE.MeshBasicMaterial({ color: 0xe08968, toneMapped: false }), 0, 0.12, 0, false);
  hem.rotation.x = Math.PI / 2;
  const aura = put(g, new THREE.TorusGeometry(0.5, 0.016, 6, 32), new THREE.MeshBasicMaterial({ color: 0xd4d4d4, toneMapped: false }), 0, 0.04, 0, false);
  aura.rotation.x = Math.PI / 2;
  const sleeveL = put(g, new THREE.CylinderGeometry(0.05, 0.08, 0.32, 8), cloth, -0.22, 0.72, -0.05);
  sleeveL.rotation.z = 0.5;
  const sleeveR = put(g, new THREE.CylinderGeometry(0.05, 0.08, 0.32, 8), cloth, 0.22, 0.72, -0.05);
  sleeveR.rotation.z = -0.5;
  const seal = makeLabel('问', '#f3d7c8', 0.5, 0.5, 170, false);
  seal.position.y = 1.48;
  g.add(seal);
  return {
    group: g,
    aura,
    sleeves: [sleeveL, sleeveR],
    robe,
    setSeal(ch) {
      seal.material.map = glyphTexture(ch, '#f3d7c8', 170, false);
      seal.material.needsUpdate = true;
    },
    setColor(hex) { aura.material.color.set(glowHex(hex)); },
    tick(t, moving) {
      const swing = moving ? Math.sin(t * 9) * 0.35 : 0;
      sleeveL.rotation.x = swing;
      sleeveR.rotation.x = -swing;
      robe.position.y = 0.5 + (moving ? Math.abs(Math.sin(t * 9)) * 0.02 : 0);
    },
  };
}
