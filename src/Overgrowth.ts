import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Garden } from "./garden/sheet";
import { plantSurface } from "./garden/surface";
import { buildSlab } from "./garden/slab";
import { buildIce } from "./garden/ice";
import { buildMoss, FUR } from "./garden/moss";
import { buildFlowers } from "./garden/flowers";
import { buildDrops, buildPollen } from "./garden/water";
import { createPost } from "./garden/post";
import type { Settings } from "./settings";

/** Quality steps, best first: the pixel ratio of the canvas and the number of layers in the pile of the moss. On
    "auto" the scene starts on a step that suits the device and only ever moves down, when frames really come late. */
export const TIERS = [
  { dpr: 2, shells: 20 }, { dpr: 1.75, shells: 16 }, { dpr: 1.5, shells: 13 }, { dpr: 1.25, shells: 10 }, { dpr: 1, shells: 8 },
] as const;
const FOV = 23;
const BASE_DISTANCE = 12.9;

type Content = {
  group: THREE.Group;
  ice: THREE.Mesh;
  moss: ReturnType<typeof buildMoss>;
  flowers: ReturnType<typeof buildFlowers>;
  drops: ReturnType<typeof buildDrops>;
  pollen: ReturnType<typeof buildPollen>;
};

/** A thick slab of frosted glass seen in three-quarter view. It starts cold: ice along one edge, frost and leaf shadows
    on bare glass. As growth goes from 0 to 1 the ice melts and leaves condensation, and from the warm corner moss
    takes the slab: cushions with a velvet pile, then flowers that stand taller than the edge. At 1 the whole solid is
    overgrown, walls included.
    This file only sets the stage (renderer, camera, light, quality, the frame); what lies on the slab lives in
    ./garden/. Nothing is downloaded: every texture and the room the glass reflects are made in code. */
export class Overgrowth {
  readonly renderer: THREE.WebGLRenderer;
  /** how long each part of the start-up took, ms */
  readonly timings: Record<string, number> = {};
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 1, 90);
  private world = new THREE.Group();
  private garden: Garden;
  private env: THREE.WebGLRenderTarget;
  private post: ReturnType<typeof createPost>;
  private slab: ReturnType<typeof buildSlab>;
  private content: Content;
  private hemi: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private look: Settings | null = null;
  private distance = BASE_DISTANCE;
  private ready = false;
  private lastShadow = -1;
  private lastGrowth = -1;
  private pointer = new THREE.Vector2();
  private tilt = new THREE.Vector2();
  private size = { width: 1, height: 1 };
  private tier: number;
  private autoTier = true;
  private pace = { last: 0, frames: 0, seen: 0, late: 0 };

  get isReady() { return this.ready; }
  /** which quality step the scene is on, 0 is the best */
  get quality() { return this.tier; }
  get pixelRatio() { return this.renderer.getPixelRatio(); }
  get shells() { return this.content.moss.uniforms.uShells.value; }

  constructor(canvas: HTMLCanvasElement, seed: number) {
    const small = matchMedia("(max-width: 700px)").matches;
    this.garden = { growth: { value: 0 }, clock: { value: 0 }, breeze: { value: 1 }, small };
    this.tier = this.startTier();

    let mark = performance.now();
    const lap = (name: string) => { const now = performance.now(); this.timings[name] = Math.round(now - mark); mark = now; };
    /* MSAA lives in the render target of the composite, so the canvas itself needs none */
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "high-performance" });
    /* The canvas is transparent: the page background shows around the slab, and the floor is only a shadow catcher. */
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    /* the tone curve is applied in the composite (post.ts), not by the renderer */
    this.renderer.toneMapping = THREE.NoToneMapping;
    lap("renderer");
    /* Glass and ice are read through what they reflect. A tiny procedural room, prefiltered once, gives them soft
       boxes to mirror; nothing is downloaded. */
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, .05);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = .42;
    room.dispose(); pmrem.dispose();
    lap("env");

    this.world.rotation.y = -.17;
    this.scene.add(this.world);
    this.hemi = new THREE.HemisphereLight("#f3f7ee", "#5c6349", .42);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight("#fff1de", 2.35);
    this.key.castShadow = true;
    this.key.shadow.mapSize.setScalar(small ? 1024 : 2048);
    Object.assign(this.key.shadow.camera, { left: -3.8, right: 3.8, top: 3.8, bottom: -3.8, near: .5, far: 16 });
    this.key.shadow.bias = -.00025;
    this.key.shadow.normalBias = .016;
    this.key.shadow.radius = 9;
    this.scene.add(this.key);
    this.fill = new THREE.DirectionalLight("#d6e4ff", .7);
    this.fill.position.set(3, 2, 4);
    this.scene.add(this.fill);

    this.slab = buildSlab(this.garden, this.scene, this.world); lap("slab");
    this.content = this.plant(seed, lap);
    this.post = createPost(this.renderer);
    this.placeCamera(23, 49, 1);
    this.applyTier();
    this.renderer.setRenderTarget(this.post.target);
    void this.renderer.compileAsync(this.scene, this.camera).catch(() => undefined).then(() => { this.ready = true; });
    this.renderer.setRenderTarget(null);
    lap("compile");
  }

  /** a phone starts on step 2, a desktop with 8+ threads on step 0, anything else on step 1 */
  private startTier() {
    return this.garden.small ? 2 : (navigator.hardwareConcurrency ?? 4) >= 8 ? 0 : 1;
  }

  /** Everything that depends on the seed: ice, moss, flowers, drops and pollen. */
  private plant(seed: number, lap: (name: string) => void = () => undefined): Content {
    plantSurface(seed);
    const group = new THREE.Group();
    this.world.add(group);
    const ice = buildIce(this.garden, group); lap("ice");
    const moss = buildMoss(this.garden, group, seed); lap("moss");
    const flowers = buildFlowers(this.garden, group); lap("flowers");
    const drops = buildDrops(this.garden, group);
    const pollen = buildPollen(this.garden, group); lap("water");
    return { group, ice, moss, flowers, drops, pollen };
  }

  /** Plants a new garden for another seed; the slab, the light and the camera stay. */
  reseed(seed: number) {
    this.world.remove(this.content.group);
    disposeTree(this.content.group);
    this.content = this.plant(seed);
    this.applyTier();
    if (this.look) this.apply(this.look);
    this.lastGrowth = -1;
  }

  /** cursor position, −1…1 on both axes; the slab leans a little towards it */
  setPointer(x: number, y: number) { this.pointer.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)); }

  resize(width: number, height: number) {
    this.size = { width: Math.max(1, width), height: Math.max(1, height) };
    if (this.look) this.placeCamera(this.look.azimuth, this.look.elevation, this.look.zoom);
    this.applyTier();
  }

  /** A long lens from the front left: the left and the near wall show the thickness, the top stays almost square,
      and tall flowers rise past the far edge. On a tall narrow screen the camera backs off until the slab fits. */
  private placeCamera(azimuthDeg: number, elevationDeg: number, zoom: number) {
    const aspect = this.size.width / this.size.height;
    this.distance = BASE_DISTANCE * Math.max(1, .86 / aspect) / zoom;
    const azimuth = THREE.MathUtils.degToRad(azimuthDeg), elevation = THREE.MathUtils.degToRad(elevationDeg);
    this.camera.position.set(-Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(this.distance);
    this.camera.lookAt(.05, -.06, .1);
  }

  /** Pins a quality step, or hands it back to the automatic choice with -1. */
  setQuality(step: number) {
    this.autoTier = step < 0;
    this.tier = this.autoTier ? this.startTier() : Math.min(TIERS.length - 1, Math.round(step));
    this.pace = { last: 0, frames: 0, seen: 0, late: 0 };
    this.applyTier();
  }

  /** everything that depends on the quality step, the size of the canvas and the distance of the camera */
  private applyTier() {
    const { width, height } = this.size, step = TIERS[this.tier];
    const dpr = Math.min(devicePixelRatio, step.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.post.resize(Math.round(width * dpr), Math.round(height * dpr));
    this.content.moss.setShells(step.shells);
    /* a cell of the strand lattice is kept at a few device pixels: finer than that a strand would fall under a pixel
       and shimmer */
    const pixelsPerUnit = height * dpr / (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    this.content.moss.setDensity(THREE.MathUtils.clamp(pixelsPerUnit / (this.look?.strandPx ?? 3.6), 12, 110));
    /* the specks already shrink with distance in the shader; this keeps them the same size for any canvas height */
    this.content.pollen.setSize(height * dpr);
  }

  /** Frames that come late for real (not a single stall) move the scene one quality step down. It never climbs back:
      the user can always pin a step on the panel. */
  private watchPace() {
    if (!this.autoTier || this.tier >= TIERS.length - 1) return;
    const now = performance.now(), dt = now - this.pace.last;
    this.pace.last = now;
    if (++this.pace.frames < 20 || dt < 4 || dt > 90) return;
    this.pace.seen++;
    if (dt > 26) this.pace.late++;
    if (this.pace.seen < 30) return;
    if (this.pace.late >= 17) { this.tier++; this.applyTier(); this.pace.frames = 8; }
    this.pace.seen = this.pace.late = 0;
  }

  /** Every setting that can change without planting the garden again. */
  apply(s: Settings) {
    this.look = s;
    const c = this.content;
    c.ice.visible = s.ice;
    c.moss.parts.forEach(part => { part.visible = s.moss; });
    c.flowers.group.visible = s.flowers;
    c.drops.mesh.visible = s.drops;
    c.pollen.points.visible = s.pollen;
    c.pollen.setCount(s.pollenCount);
    this.slab.labels.visible = s.labels;

    const m = c.moss.uniforms;
    m.uFur.value = FUR * s.pile;
    m.uRoot.value.set(s.rootColor);
    m.uTipA.value.set(s.tipColor);
    m.uTipB.value.set(s.tipColor2);
    m.uDry.value.set(s.dryColor);
    m.uSheen.value = s.sheen;
    this.garden.breeze.value = s.breeze;

    this.slab.glass.color.set(s.glassColor);
    this.slab.glass.roughness = s.roughness;
    this.slab.uniforms.uFrost.value = s.frost;
    this.slab.uniforms.uLeaves.value = s.leaves;
    this.slab.floorMaterial.opacity = s.shadow;

    const elevation = THREE.MathUtils.degToRad(s.sunElevation), azimuth = THREE.MathUtils.degToRad(s.sunAzimuth);
    this.key.position.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(7.56);
    this.key.color.set(s.sunColor);
    this.key.intensity = s.sunPower;
    this.key.shadow.radius = s.softness;
    this.fill.intensity = s.fillPower;
    this.hemi.intensity = s.sky;
    this.scene.environmentIntensity = s.reflections;

    this.post.uniforms.uExposure.value = s.exposure;
    this.post.uniforms.uHalation.value = s.halation;
    this.post.uniforms.uVignette.value = s.vignette;

    this.placeCamera(s.azimuth, s.elevation, s.zoom);
    this.applyTier();
    this.renderer.shadowMap.needsUpdate = true;
  }

  render(growth: number, time: number, dt: number) {
    if (!this.ready) return;
    this.watchPace();
    const s = this.look;
    this.garden.growth.value = growth;
    this.garden.clock.value = time;
    /* The slab hovers, so it may breathe: a slow float, and a lean towards the cursor. Both are tiny, the composition
       holds. */
    const goal = s?.tilt ? this.pointer : new THREE.Vector2();
    this.tilt.lerp(goal, 1 - Math.exp(-Math.min(.05, dt) * 3.2));
    const float = s?.float ?? true;
    this.world.position.y = float ? Math.sin(time * .9) * .022 : 0;
    this.world.rotation.x = (float ? Math.sin(time * .7 + 1.3) * .008 : 0) + this.tilt.y * .05;
    this.world.rotation.z = (float ? Math.cos(time * .6) * .008 : 0) - this.tilt.x * .05;
    this.content.flowers.update(growth, time);
    this.content.drops.update(growth);
    // Growth casts matching shadows. While it stands still, refresh only at 12 Hz for the breeze and the float.
    if (growth !== this.lastGrowth || Math.abs(time - this.lastShadow) > .083) {
      this.renderer.shadowMap.needsUpdate = true; this.lastShadow = time; this.lastGrowth = growth;
    }
    this.post.render(this.scene, this.camera);
  }

  dispose() {
    disposeTree(this.scene);
    this.scene.environment = null; this.env.dispose();
    this.key.shadow.map?.dispose(); this.post.dispose();
    this.renderer.dispose();
  }
}

function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
    if (mesh.customDepthMaterial) materials.add(mesh.customDepthMaterial);
    if (o instanceof THREE.InstancedMesh) o.dispose();
  });
  materials.forEach(m => { Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); }); m.dispose(); });
  textures.forEach(t => t.dispose()); geometries.forEach(g => g.dispose());
}
