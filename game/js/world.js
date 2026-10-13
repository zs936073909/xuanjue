// 夜盘场景：石坛、十二宫、天将、问卜人。画面语言跟玄决一致——墨、纸、朱砂。
import * as THREE from '../vendor/three.module.js';
import { WX, WX_COLOR } from './rules.js';
import { makeLabel, makeGroundGlyph } from './glyphs.js';
import { buildGeneral, buildWanderer } from './figures.js';

export { THREE };
export const DISK_R = 16.2;
export const PALACE_R = 12.35;

const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const SX = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

export function palacePosition(i, radius = PALACE_R) {
  const a = i * Math.PI / 6;
  return new THREE.Vector3(Math.sin(a) * radius, 0, -Math.cos(a) * radius);
}

export { makeLabel };

function glowHex(hex) {
  return new THREE.Color(hex).lerp(new THREE.Color('#fff4ea'), 0.28);
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x100e0c, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x181410, 0.0105);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 420);
  camera.position.set(0, 12, 20);

  const skyUniforms = { uTime: { value: 0 }, uNight: { value: 1 } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      glslVersion: THREE.GLSL1,
      uniforms: skyUniforms,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vP;
        uniform float uTime;
        uniform float uNight;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vP);
          vec3 zenith = mix(vec3(0.11, 0.075, 0.07), vec3(0.035, 0.04, 0.07), uNight);
          vec3 horizon = mix(vec3(0.34, 0.18, 0.11), vec3(0.11, 0.1, 0.13), uNight);
          vec3 col = mix(horizon, zenith, smoothstep(-0.05, 0.55, d.y));
          vec2 sp = d.xz / max(0.2, d.y + 0.45);
          float s = hash(floor(sp * 86.0));
          float star = smoothstep(0.993, 1.0, s) * smoothstep(0.08, 0.45, d.y) * uNight;
          col += star * 0.9;
          vec3 moonDir = normalize(vec3(-0.38, 0.64, -0.25));
          float md = dot(d, moonDir);
          float moon = smoothstep(0.9984, 0.9995, md);
          float glow = pow(max(md, 0.0), 26.0) * 0.42;
          vec3 moonCol = mix(vec3(0.92, 0.58, 0.32), vec3(0.9, 0.91, 0.95), uNight);
          col += moonCol * (moon * 1.5 + glow);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  scene.add(sky);

  const seaUniforms = { uTime: { value: 0 } };
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(42, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      glslVersion: THREE.GLSL1,
      uniforms: seaUniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p);
          float wave = sin(r * 48.0 - uTime * 0.35) * 0.5 + 0.5;
          float a = smoothstep(0.5, 0.18, r);
          vec3 col = mix(vec3(0.05, 0.04, 0.035), vec3(0.14, 0.1, 0.08), wave * 0.35);
          float streak = smoothstep(0.018, 0.0, abs(p.x * 0.25 + 0.04)) * smoothstep(0.46, 0.12, r);
          col += vec3(0.55, 0.4, 0.3) * streak * 0.28;
          gl_FragColor = vec4(col, a * 0.92);
        }
      `,
    })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.7;
  scene.add(sea);

  const hemi = new THREE.HemisphereLight(0x8a7564, 0x221c18, 1.05);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x4a3c34, 0.62);
  scene.add(amb);
  const moon = new THREE.DirectionalLight(0xe6d8c6, 3.8);
  moon.position.set(-10, 22, -8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.near = 4;
  moon.shadow.camera.far = 70;
  moon.shadow.camera.left = -22;
  moon.shadow.camera.right = 22;
  moon.shadow.camera.top = 22;
  moon.shadow.camera.bottom = -22;
  moon.shadow.bias = -0.0006;
  scene.add(moon);
  const rim = new THREE.DirectionalLight(0x9eb4c8, 1.35);
  rim.position.set(14, 10, 12);
  scene.add(rim);
  const sealLight = new THREE.PointLight(0xe08968, 28, 16, 2);
  sealLight.position.set(0, 1.6, 0);
  scene.add(sealLight);

  const playerLight = new THREE.PointLight(0xd4d4d4, 22, 10, 2);
  scene.add(playerLight);
  const gateLight = new THREE.PointLight(0xe8956f, 36, 16, 2);
  scene.add(gateLight);

  const dustN = 220;
  const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * DISK_R;
    dustPos[i * 3] = Math.cos(ang) * rad;
    dustPos[i * 3 + 1] = 0.3 + Math.random() * 3.2;
    dustPos[i * 3 + 2] = Math.sin(ang) * rad;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xd8c4b0, size: 0.055, transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false,
  }));
  scene.add(dust);

  const sparks = [];
  const sparkGeo = new THREE.SphereGeometry(0.06, 6, 5);
  for (let i = 0; i < 64; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, toneMapped: false }));
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, life: 0, age: 0, v: new THREE.Vector3() });
  }
  const waves = [];

  function burst(pos, color, n = 12) {
    let left = n;
    for (const s of sparks) {
      if (left <= 0) break;
      if (s.life > s.age) continue;
      s.mesh.visible = true;
      s.mesh.material.color.set(color);
      s.mesh.material.opacity = 1;
      s.mesh.position.copy(pos);
      s.v.set((Math.random() - 0.5) * 4.2, 0.6 + Math.random() * 2.4, (Math.random() - 0.5) * 4.2);
      s.life = 0.35 + Math.random() * 0.35;
      s.age = 0;
      left--;
    }
  }

  function shockwave(pos, color) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.24, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.06, pos.z);
    scene.add(mesh);
    waves.push({ mesh, age: 0 });
  }

  function updateFx(dt) {
    for (const s of sparks) {
      if (s.age >= s.life) { s.mesh.visible = false; continue; }
      s.age += dt;
      s.v.y -= dt * 3.2;
      s.mesh.position.addScaledVector(s.v, dt);
      s.mesh.material.opacity = 1 - s.age / s.life;
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.age += dt;
      const k = w.age / 0.5;
      w.mesh.scale.setScalar(1 + k * 7);
      w.mesh.material.opacity = 0.85 * (1 - k);
      if (k >= 1) {
        scene.remove(w.mesh);
        w.mesh.geometry.dispose();
        w.mesh.material.dispose();
        waves.splice(i, 1);
      }
    }
  }

  const guideDots = [];
  const guideGeo = new THREE.SphereGeometry(0.055, 8, 6);
  const guideMat = new THREE.MeshBasicMaterial({ color: 0xe7b08a, transparent: true, opacity: 0.9, toneMapped: false });
  for (let i = 0; i < 9; i++) {
    const dot = new THREE.Mesh(guideGeo, guideMat);
    dot.visible = false;
    scene.add(dot);
    guideDots.push(dot);
  }
  const guide = {
    set(from, to, visible, t) {
      for (let i = 0; i < guideDots.length; i++) {
        const dot = guideDots[i];
        dot.visible = !!visible;
        if (!visible) continue;
        const k = (i + 1) / (guideDots.length + 1);
        dot.position.lerpVectors(from, to, k);
        dot.position.y = 0.16 + Math.sin(k * Math.PI) * 0.42 + Math.sin((t || 0) * 3 + i) * 0.04;
        const s = 0.7 + Math.sin((t || 0) * 4 + i * 0.6) * 0.25;
        dot.scale.setScalar(s);
      }
    },
  };

  return {
    renderer, scene, camera, skyUniforms, seaUniforms, dust, moon, playerLight, gateLight, guide,
    burst, shockwave, updateFx,
  };
}

function stoneMat(color, rough = 0.9) {
  return new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: 0.08, emissive: 0x1a1210, emissiveIntensity: 0.12,
  });
}

function mesh(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function createPlayer(stage) {
  const wanderer = buildWanderer();
  stage.scene.add(wanderer.group);
  return wanderer;
}

export function createPedestals(stage) {
  const group = new THREE.Group();
  group.visible = false;
  stage.scene.add(group);
  const dirs = {
    水: new THREE.Vector3(0, 0, -1),
    木: new THREE.Vector3(1, 0, 0),
    火: new THREE.Vector3(0, 0, 1),
    金: new THREE.Vector3(-1, 0, 0),
    土: new THREE.Vector3(0, 0, 0),
  };
  const items = WX.map((wx) => {
    const color = glowHex(WX_COLOR[wx]);
    const stone = new THREE.Mesh(
      wx === '土' ? new THREE.CylinderGeometry(0.42, 0.48, 0.12, 18) : new THREE.CylinderGeometry(0.34, 0.4, 0.28, 14),
      new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 0.8, emissive: color, emissiveIntensity: 0.2 })
    );
    stone.castShadow = true;
    const mark = makeLabel(wx, '#fff8f2', 0.55, 0.55, 160, false);
    mark.position.y = wx === '土' ? 0.28 : 0.42;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.08, 1.6, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    beam.position.y = 1.0;
    const holder = new THREE.Group();
    holder.add(stone, mark, beam);
    group.add(holder);
    return { wx, holder, stone, beam, dir: dirs[wx], color };
  });
  return {
    group,
    items,
    place(center) {
      for (const it of items) {
        const p = center.clone().addScaledVector(it.dir, it.wx === '土' ? 0 : 1.62);
        it.holder.position.set(p.x, 0, p.z);
        it.world = p;
      }
    },
    setLift(v) {
      group.visible = v > 0.02;
      for (const it of items) {
        const h = it.wx === '土' ? 0.02 : -0.35 + v * 0.42;
        it.stone.position.y = h;
        it.beam.position.y = h + 1.05;
      }
    },
    highlight(wx) {
      for (const it of items) {
        const on = it.wx === wx;
        it.stone.material.emissiveIntensity = on ? 0.95 : 0.16;
        it.beam.material.opacity = on ? 0.55 : 0;
        it.holder.scale.setScalar(on ? 1.08 : 1);
      }
    },
  };
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (m.map && !m.map.userData.shared) m.map.dispose();
      m.dispose();
    });
  });
}

export function buildPlate(stage, cast) {
  const ke = cast.ke;
  const group = new THREE.Group();
  stage.scene.add(group);

  const disk = new THREE.Mesh(new THREE.CylinderGeometry(DISK_R, DISK_R * 0.9, 0.72, 72), stoneMat(0x4a4038, 0.9));
  disk.position.y = -0.36;
  disk.receiveShadow = true;
  group.add(disk);

  const court = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 0.08, 40), stoneMat(0x2a241f, 0.8));
  court.position.y = 0.04;
  court.receiveShadow = true;
  group.add(court);

  const courtRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.15, 0.035, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xd97757, toneMapped: false })
  );
  courtRing.rotation.x = Math.PI / 2;
  courtRing.position.y = 0.09;
  group.add(courtRing);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(DISK_R - 0.15, 0.055, 8, 80),
    new THREE.MeshStandardMaterial({ color: 0x8a6248, roughness: 0.42, metalness: 0.62, emissive: 0x5a3224, emissiveIntensity: 0.35 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.06;
  group.add(rim);

  const seal = makeGroundGlyph(cast.baZi.day.gan, '#e7b49a', 1.15);
  seal.position.y = 0.1;
  group.add(seal);
  const sealSub = makeLabel(cast.baZi.day.gz + '日', '#cbb8a8', 1.8, 0.7, 92, false);
  sealSub.position.y = 0.85;
  group.add(sealSub);

  const BAGUA = ['坎', '艮', '艮', '震', '巽', '巽', '离', '坤', '坤', '兑', '乾', '乾'];
  cast.ke.lessons.forEach((lesson, i) => {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const stele = new THREE.Group();
    stele.position.set(Math.sin(a) * 2.55, 0, -Math.cos(a) * 2.55);
    stele.add(mesh(new THREE.BoxGeometry(0.42, 0.72, 0.08), stoneMat(0x3a322c, 0.75), 0, 0.42, 0));
    const mark = makeLabel(ZHI[lesson.up] + lesson.upTJ, '#f0e2d4', 1.15, 0.42, 72, true);
    mark.position.y = 0.95;
    stele.add(mark);
    const role = makeLabel(['一', '二', '三', '四'][i], '#e7b49a', 0.36, 0.36, 120, false);
    role.position.y = 1.28;
    stele.add(role);
    group.add(stele);
  });

  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const inner = 4.5;
    const outer = DISK_R - 0.7;
    const len = outer - inner;
    const mid = (inner + outer) / 2;
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, len), new THREE.MeshBasicMaterial({ color: 0x6a4636 }));
    groove.position.set(Math.sin(a) * mid, 0.02, -Math.cos(a) * mid);
    groove.rotation.y = a;
    group.add(groove);
  }

  const decorRing = new THREE.Mesh(
    new THREE.TorusGeometry(PALACE_R, 0.025, 6, 80),
    new THREE.MeshBasicMaterial({ color: 0xc9a86a, transparent: true, opacity: 0.55, toneMapped: false })
  );
  decorRing.rotation.x = Math.PI / 2;
  decorRing.position.y = 3.15;
  group.add(decorRing);

  const palaces = [];
  for (let i = 0; i < 12; i++) {
    const pos = palacePosition(i);
    const skyIdx = ke.tianPan[i];
    const tj = ke.tjByShen[skyIdx];
    const hex = WX_COLOR[cast.tjWX[tj]] || '#d4d4d4';
    const holder = new THREE.Group();
    holder.position.copy(pos);
    group.add(holder);

    const outward = pos.clone().normalize();
    const lateral = new THREE.Vector3(-outward.z, 0, outward.x);
    const dais = mesh(new THREE.CylinderGeometry(1.28, 1.4, 0.16, 20), stoneMat(0x3d352e, 0.82), 0, 0.08, 0);
    dais.receiveShadow = true;
    holder.add(dais);
    [-0.72, 0.72].forEach((side) => {
      const pillar = mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.05, 8), stoneMat(0x3a332c, 0.8), lateral.x * side + outward.x * 0.85, 1.18, lateral.z * side + outward.z * 0.85);
      holder.add(pillar);
    });
    const lintel = mesh(new THREE.BoxGeometry(1.7, 0.12, 0.28), stoneMat(0x51463c, 0.7), outward.x * 0.85, 2.2, outward.z * 0.85);
    lintel.rotation.y = -i * Math.PI / 6;
    holder.add(lintel);
    const lantern = mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: glowHex(hex), toneMapped: false }), outward.x * 0.85, 2.38, outward.z * 0.85, false);
    lantern.castShadow = false;
    holder.add(lantern);
    const bagua = makeLabel(BAGUA[i], '#cbb8a4', 0.55, 0.55, 140, false);
    bagua.position.set(outward.x * 2.3, 0.55, outward.z * 2.3);
    holder.add(bagua);

    const inlay = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.9, 28),
      new THREE.MeshBasicMaterial({ color: glowHex(hex), transparent: true, opacity: 0.8, side: THREE.DoubleSide, toneMapped: false })
    );
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.y = 0.025;
    holder.add(inlay);

    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.38, 18), new THREE.MeshBasicMaterial({ color: 0x161311, transparent: true, opacity: 0.55 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.03;
    holder.add(pad);
    const ground = makeGroundGlyph(ZHI[i], '#f0e6d8', 0.62);
    ground.position.y = 0.045;
    holder.add(ground);

    const sky = makeLabel(ZHI[skyIdx], '#f0d7b0', 0.7, 0.7, 150, false);
    sky.position.y = 3.15;
    holder.add(sky);

    const general = buildGeneral(tj, hex);
    general.userData.phase = i * 0.7;
    holder.add(general);
    general.lookAt(0, 0.8, 0);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.14, 7.2, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xe08968, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    beacon.position.y = 3.7;
    beacon.visible = false;
    holder.add(beacon);

    const leiBeam = beacon.clone();
    leiBeam.material = beacon.material.clone();
    leiBeam.material.color.set(0xd9d3c7);
    leiBeam.scale.set(0.55, 1, 0.55);
    leiBeam.visible = false;
    holder.add(leiBeam);

    const danger = new THREE.Mesh(
      new THREE.RingGeometry(2.55, 2.72, 40),
      new THREE.MeshBasicMaterial({ color: 0xc45048, transparent: true, opacity: 0.0, side: THREE.DoubleSide, toneMapped: false })
    );
    danger.rotation.x = -Math.PI / 2;
    danger.position.y = 0.04;
    holder.add(danger);

    const objective = new THREE.Mesh(
      new THREE.RingGeometry(2.15, 2.32, 40),
      new THREE.MeshBasicMaterial({ color: 0xe08968, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false })
    );
    objective.rotation.x = -Math.PI / 2;
    objective.position.y = 0.05;
    holder.add(objective);

    if (ke.kongWang.includes(skyIdx)) {
      const mist = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xc8beb2, transparent: true, opacity: 0.09, depthWrite: false, toneMapped: false })
      );
      mist.position.y = 1.2;
      holder.add(mist);
      general.traverse((o) => {
        if (o.material && o.material.transparent !== undefined && !o.material.wireframe) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = Math.min(o.material.opacity ?? 1, 0.55);
        }
      });
    }

    const tags = [];
    if (ke.shenSha.yima === ZHI[i]) tags.push('驿马');
    if (ke.shenSha.taohua === ZHI[i]) tags.push('桃花');
    if (ke.shenSha.huagai === ZHI[i]) tags.push('华盖');

    palaces.push({
      i, pos, zhi: ZHI[i], sx: SX[i], sky: ZHI[skyIdx], skyIdx, tj,
      tjWX: cast.tjWX[tj], ji: cast.tjJI[tj], kong: ke.kongWang.includes(skyIdx),
      tags, holder, general, beacon, leiBeam, danger, objective, inlay,
    });
  }

  return {
    group, disk, palaces, decorRing,
    dispose() {
      stage.scene.remove(group);
      disposeTree(group);
    },
  };
}

export function makeWisp(wx) {
  const color = glowHex(WX_COLOR[wx] || '#fff');
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 12, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  const label = makeLabel(wx, '#fffaf4', 0.62, 0.62, 160, false);
  label.position.y = 0.55;
  g.add(core, halo, label);
  g.userData.halo = halo;
  return g;
}
