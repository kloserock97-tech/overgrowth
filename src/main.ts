import GUI, { stageSize } from "./panel/panel.js";
import { Overgrowth, TIERS } from "./Overgrowth";
import { DEFAULTS, PRESETS, readUrl, writeUrl, type Settings } from "./settings";
import "./style.css";

/* Overgrowth — a slab of frosted glass that thaws and grows over with moss.
 *
 * One number drives the whole scene: growth, from 0 to 1. Every part of the garden is a pure function of it (the ice
 * sinks back into the glass, the moss rises from under it, stems rise and corollas open), so growth can play, loop,
 * run backwards or be dragged by hand, and the picture is always the same for the same value. */

const fromUrl = readUrl();
const settings: Settings = { ...DEFAULTS, ...fromUrl };
/* with reduced motion the slab starts still and half grown; the panel can still play it */
if (!location.hash && matchMedia("(prefers-reduced-motion: reduce)").matches) Object.assign(settings, { play: false, growth: 0.7, paused: true });

const canvas = document.getElementById("stage") as HTMLCanvasElement;
let view: Overgrowth;

try {
  view = new Overgrowth(canvas, settings.seed);
} catch (error) {
  document.getElementById("fallback")!.hidden = false;
  throw error;
}

function resize() { const { width, height } = stageSize(); view.resize(width, height); }
addEventListener("resize", resize);
addEventListener("pointermove", (event) => view.setPointer(event.clientX / innerWidth * 2 - 1, event.clientY / stageSize().height * 2 - 1));
document.documentElement.addEventListener("pointerleave", () => view.setPointer(0, 0));

/* ── the run ──────────────────────────────────────────────────────────────────────────────────────────────────────
   Grow over `duration` seconds, hold the full slab, rewind it (the moss sinks back, the ice comes back) and start again.
   Rewinding instead of cutting to 0 keeps the loop continuous. */

type Phase = "grow" | "top" | "rewind" | "bottom";
let phase: Phase = "grow";
let phaseTime = 0;
const HOLD_TOP = 2.5, HOLD_BOTTOM = 1;

function advance(dt: number) {
  if (!settings.play || settings.paused) return;
  phaseTime += dt;
  if (phase === "grow") {
    settings.growth = Math.min(1, settings.growth + dt / settings.duration);
    if (settings.growth >= 1) { phase = "top"; phaseTime = 0; }
  } else if (phase === "top") {
    if (settings.loop && phaseTime > HOLD_TOP) { phase = "rewind"; phaseTime = 0; }
  } else if (phase === "rewind") {
    settings.growth = Math.max(0, settings.growth - dt / Math.max(1.5, settings.duration * 0.22));
    if (settings.growth <= 0) { phase = "bottom"; phaseTime = 0; }
  } else if (phaseTime > HOLD_BOTTOM) { phase = "grow"; phaseTime = 0; }
}

function replay() {
  settings.growth = 0; settings.play = true; settings.paused = false; phase = "grow"; phaseTime = 0;
  gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  writeUrl(settings);
}

/* ── the panel ──────────────────────────────────────────────────────────────────────────────────────────────────────
   In the order you would reach for it: where the run is, what is on the slab, what the moss looks like, the glass,
   the light, the camera and the quality. */

const gui = new GUI({ title: "Overgrowth", repo: "https://github.com/kloserock97-tech/overgrowth", onReset: () => load(DEFAULTS) });
const apply = () => { view.apply(settings); syncPage(); writeUrl(settings); };
const holdStill = () => { settings.play = false; gui.controllersRecursive().forEach((controller) => controller.updateDisplay()); };

const run = gui.addFolder("Growth");
run.add(settings, "growth", 0, 1, 0.001).name("growth").onChange(() => { holdStill(); phase = "grow"; writeUrl(settings); }).listen();
run.add(settings, "play").name("grow by itself").onChange(() => { if (settings.play && settings.growth >= 1) settings.growth = 0; phase = "grow"; writeUrl(settings); }).listen();
run.add(settings, "duration", 3, 60, 0.5).name("one run, s").onChange(apply);
run.add(settings, "loop").name("loop (hold, rewind)").onChange(apply);
run.add(settings, "paused").name("freeze time").onChange(apply).listen();
run.add(settings, "speed", 0, 3, 0.01).name("breeze & float speed").onChange(apply);

const parts = gui.addFolder("On the slab");
parts.add(settings, "ice").name("ice").onChange(apply);
parts.add(settings, "moss").name("moss").onChange(apply);
parts.add(settings, "flowers").name("flowers").onChange(apply);
parts.add(settings, "drops").name("drops & dew").onChange(apply);
parts.add(settings, "pollen").name("pollen").onChange(apply);
parts.add(settings, "pollenCount", 0, 160, 1).name("pollen specks").onChange(apply);
parts.add(settings, "labels").name("COLD / WARM / QUIET / ALIVE").onChange(apply);

const moss = gui.addFolder("Moss");
moss.add(settings, "pile", 0.3, 2.5, 0.01).name("pile length").onChange(apply);
moss.add(settings, "strandPx", 2, 10, 0.1).name("strand cell, px").onChange(apply);
moss.add(settings, "breeze", 0, 4, 0.01).name("breeze").onChange(apply);
moss.add(settings, "sheen", 0, 2, 0.01).name("velvet sheen").onChange(apply);
moss.addColor(settings, "rootColor").name("root").onChange(apply);
moss.addColor(settings, "tipColor").name("tip").onChange(apply);
moss.addColor(settings, "tipColor2").name("tip, bright").onChange(apply);
moss.addColor(settings, "dryColor").name("dry strands").onChange(apply);

const glass = gui.addFolder("Glass");
glass.addColor(settings, "glassColor").name("tint").onChange(apply);
glass.add(settings, "roughness", 0.05, 0.9, 0.01).name("matting").onChange(apply);
glass.add(settings, "frost", 0, 2, 0.01).name("frost").onChange(apply);
glass.add(settings, "leaves", 0, 2, 0.01).name("leaf shadows").onChange(apply);
glass.add(settings, "shadow", 0, 0.8, 0.01).name("floor shadow").onChange(apply);

const light = gui.addFolder("Light");
light.add(settings, "sunElevation", 5, 89, 0.5).name("sun height, °").onChange(apply);
light.add(settings, "sunAzimuth", 0, 360, 1).name("sun direction, °").onChange(apply);
light.add(settings, "sunPower", 0, 6, 0.05).name("sun power").onChange(apply);
light.addColor(settings, "sunColor").name("sun").onChange(apply);
light.add(settings, "softness", 1, 20, 0.5).name("shadow softness").onChange(apply);
light.add(settings, "fillPower", 0, 2, 0.01).name("fill light").onChange(apply);
light.add(settings, "sky", 0, 1.5, 0.01).name("sky light").onChange(apply);
light.add(settings, "reflections", 0, 1.5, 0.01).name("room reflections").onChange(apply);
light.add(settings, "exposure", 0.4, 2.2, 0.01).name("exposure").onChange(apply);
light.add(settings, "halation", 0, 4, 0.01).name("halation").onChange(apply);
light.add(settings, "vignette", 0, 4, 0.01).name("vignette").onChange(apply);
light.addColor(settings, "backdrop").name("studio").onChange(apply);

const camera = gui.addFolder("View");
camera.add(settings, "tilt").name("lean to the pointer").onChange(apply);
camera.add(settings, "float").name("float").onChange(apply);
camera.add(settings, "azimuth", -60, 80, 0.5).name("camera around, °").onChange(apply);
camera.add(settings, "elevation", 12, 88, 0.5).name("camera height, °").onChange(apply);
camera.add(settings, "zoom", 0.6, 1.8, 0.01).name("zoom").onChange(apply);
const steps: Record<string, number> = { auto: -1 };
TIERS.forEach((step, i) => { steps[`${i} · DPR ${step.dpr}, ${step.shells} layers`] = i; });
camera.add(settings, "quality", steps).name("quality").onChange(() => { view.setQuality(settings.quality); writeUrl(settings); });

const actions = {
  preset: "thaw",
  replay,
  reseed: () => { settings.seed = 1 + Math.floor(Math.random() * 99999); view.reseed(settings.seed); writeUrl(settings); },
  copyLink: async () => {
    writeUrl(settings);
    try { await navigator.clipboard.writeText(location.href); toast("Link copied"); }
    catch { toast("Copy failed, the address bar has it"); }
  },
  copySettings: async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(settings, null, 2)); toast("Settings copied"); }
    catch { toast("Copy failed"); }
  },
};

gui.add(actions, "preset", Object.keys(PRESETS)).name("preset").onChange((key: string) => load({ ...DEFAULTS, ...PRESETS[key] }));
gui.add(actions, "replay").name("grow again from zero");
gui.add(actions, "reseed").name("new seeds");
gui.add(actions, "copyLink").name("copy link to this look");
gui.add(actions, "copySettings").name("copy settings as JSON");

function load(next: Settings) {
  const seedChanged = next.seed !== settings.seed;
  Object.assign(settings, next);
  phase = "grow"; phaseTime = 0;
  if (seedChanged) view.reseed(settings.seed);
  view.setQuality(settings.quality);
  gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  apply();
}

/* The studio backdrop is CSS behind a transparent canvas: one colour, from which the gradients are mixed. On a dark
   studio the text turns light. */
function syncPage() {
  const root = document.documentElement;
  const hex = settings.backdrop.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  root.style.setProperty("--studio", settings.backdrop);
  root.style.setProperty("--lift", String(luminance > 0.5 ? 1 : 0.35));
  document.body.classList.toggle("is-dark", luminance <= 0.5);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", settings.backdrop);
}

/* ── toast, stats, keys ─────────────────────────────────────────────────────────────────────────────────────────── */

const note = document.createElement("p");
note.className = "toast";
document.body.appendChild(note);
let noteTimer = 0;

function toast(text: string) {
  note.textContent = text;
  note.classList.add("is-on");
  clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => note.classList.remove("is-on"), 1600);
}

const stats = document.createElement("p");
stats.className = "stats";
document.body.appendChild(stats);

addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === "h" || event.key === "H") gui.show(gui._hidden);
  if (event.key === "r" || event.key === "R") replay();
  if (event.code === "Space") {
    event.preventDefault();
    settings.paused = !settings.paused;
    writeUrl(settings);
  }
});

/* ── the loop ──────────────────────────────────────────────────────────────────────────────────────────────────── */

let last = performance.now();
let time = 0;
let frames = 0;
let fpsAt = last;

function tick(now: number) {
  requestAnimationFrame(tick);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!settings.paused) time += dt * settings.speed;
  advance(dt);
  view.render(settings.growth, time, dt);

  frames++;
  if (now - fpsAt > 500) {
    const fps = Math.round((frames * 1000) / (now - fpsAt));
    stats.textContent = `${fps} fps · step ${view.quality} · DPR ${view.pixelRatio} · ${view.shells} layers · growth ${Math.round(settings.growth * 100)} %`;
    frames = 0;
    fpsAt = now;
  }
}

/* A handle for the console: poke at the slab without digging through the bundle. */
Object.assign(globalThis, { overgrowth: { settings, view, gui, load, replay, DEFAULTS, PRESETS } });

resize();
view.setQuality(settings.quality);
apply();
requestAnimationFrame(tick);
