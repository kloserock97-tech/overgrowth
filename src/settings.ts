/* Defaults, presets, and the address bar.
 *
 * Every setting that changes the picture is a plain number, string or switch here, so a look can travel: the panel
 * writes the ones that differ from the defaults into the URL hash, and opening that link reproduces the slab exactly.
 * Short keys keep the link readable. */

export const DEFAULTS = {
  growth: 0,
  play: true,
  duration: 14,
  loop: true,
  paused: false,
  speed: 1,
  seed: 1,

  ice: true,
  moss: true,
  flowers: true,
  drops: true,
  pollen: true,
  labels: true,
  pollenCount: 52,

  pile: 1,
  strandPx: 3.6,
  breeze: 1,
  sheen: 0.5,
  rootColor: "#192d12",
  tipColor: "#3f5f27",
  tipColor2: "#738b40",
  dryColor: "#958e52",

  glassColor: "#d6e4e3",
  roughness: 0.34,
  frost: 1,
  leaves: 1,
  shadow: 0.3,

  sunElevation: 68,
  sunAzimuth: 234,
  sunPower: 2.35,
  sunColor: "#fff1de",
  softness: 9,
  fillPower: 0.7,
  sky: 0.42,
  reflections: 0.42,
  exposure: 1,
  halation: 1,
  vignette: 1,
  backdrop: "#dcdfe3",

  tilt: true,
  float: true,
  azimuth: 23,
  elevation: 49,
  zoom: 0.92,
  quality: -1,
};

export type Settings = typeof DEFAULTS;

/* Looks the slab can take without touching the code. They are not modes: each one is a handful of the same sliders
   in a different place. */
export const PRESETS: Record<string, Partial<Settings>> = {
  thaw: {},
  spring: {
    play: false, growth: 0.45, sunElevation: 60, sunPower: 2.6, sunColor: "#fff6e8", leaves: 1.2, pollenCount: 70,
  },
  overgrown: {
    play: false, growth: 1, pile: 1.4, breeze: 1.5, pollenCount: 120, sheen: 0.7, tipColor2: "#86a046",
    sunElevation: 55, sunAzimuth: 220, softness: 12, elevation: 42, zoom: 0.98,
  },
  frost: {
    play: false, growth: 0.04, glassColor: "#cde0ea", frost: 1.7, leaves: 0.5, roughness: 0.26, sunColor: "#e7efff",
    sunPower: 2.1, sky: 0.5, reflections: 0.55, fillPower: 0.9, backdrop: "#d0d8e0", exposure: 0.96, breeze: 0.4,
  },
  dusk: {
    play: false, growth: 0.82, sunElevation: 17, sunAzimuth: 262, sunColor: "#ffae6e", sunPower: 3.4, softness: 14,
    fillPower: 0.22, sky: 0.2, reflections: 0.26, backdrop: "#4b4643", shadow: 0.42, exposure: 1.12, halation: 2.2,
    vignette: 2, pollenCount: 140, glassColor: "#dcd8cf", leaves: 0.6,
  },
};

const KEYS: Record<keyof Settings, string> = {
  growth: "g", play: "p", duration: "du", loop: "lo", paused: "pa", speed: "s", seed: "sd",
  ice: "i", moss: "m", flowers: "f", drops: "dr", pollen: "po", labels: "lb", pollenCount: "pn",
  pile: "pl", strandPx: "sx", breeze: "br", sheen: "sh", rootColor: "c0", tipColor: "c1", tipColor2: "c2", dryColor: "c3",
  glassColor: "gc", roughness: "ro", frost: "fr", leaves: "lv", shadow: "sw",
  sunElevation: "se", sunAzimuth: "sa", sunPower: "sp", sunColor: "sc", softness: "so", fillPower: "fp", sky: "sk",
  reflections: "rf", exposure: "ex", halation: "ha", vignette: "vg", backdrop: "bg",
  tilt: "t", float: "fl", azimuth: "az", elevation: "el", zoom: "z", quality: "q",
};

const FROM_KEY = Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [key, name])) as Record<string, keyof Settings>;

export function readUrl(): Partial<Settings> {
  const out: Record<string, unknown> = {};
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));

  for (const [key, raw] of params) {
    const name = FROM_KEY[key];
    if (name === undefined) continue;
    const fallback = DEFAULTS[name];

    if (typeof fallback === "number") { const value = Number(raw); if (Number.isFinite(value)) out[name] = value; }
    else if (typeof fallback === "boolean") out[name] = raw === "1";
    else if (/^#?[0-9a-f]{3,8}$/i.test(raw)) out[name] = raw.startsWith("#") ? raw : `#${raw}`;
  }

  return out as Partial<Settings>;
}

export function writeUrl(settings: Settings) {
  const params = new URLSearchParams();

  for (const [name, key] of Object.entries(KEYS) as [keyof Settings, string][]) {
    const value = settings[name];
    if (value === DEFAULTS[name]) continue;
    /* while the run plays, where it happens to be is not part of the look */
    if (name === "growth" && settings.play) continue;

    if (typeof value === "boolean") params.set(key, value ? "1" : "0");
    else if (typeof value === "number") params.set(key, String(Math.round(value * 1000) / 1000));
    else params.set(key, String(value).replace(/^#/, ""));
  }

  const hash = params.toString();
  history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
}
