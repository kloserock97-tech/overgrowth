export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** smoothstep with the range first: 0 below a, 1 above b */
export const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
