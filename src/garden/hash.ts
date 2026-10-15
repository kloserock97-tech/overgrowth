/* Hash Kit: our own integer hash, the same bits in TypeScript and in GLSL (see shelf/items/hash-kit).
   A xorshift-multiply mixer whose shifts (16/14/15) and multipliers come from our own search. Floats are taken
   from the top 24 bits, so the CPU and the shader agree exactly. Checks: hashU(1) === 1488230143. */

const SALT = 0xb31c96c9; // keeps cell (0, 0) away from the mixer's fixed point hashU(0) = 0

export function hashU(x: number): number {
  x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
  x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
  x ^= x >>> 15;
  return x >>> 0;
}
export const hash2U = (x: number, y: number): number => hashU((x + hashU((y + SALT) >>> 0)) >>> 0);
export const hash3U = (x: number, y: number, z: number): number => hashU((x + hashU((y + hashU((z + SALT) >>> 0)) >>> 0)) >>> 0);
/** 0…1 from the top 24 bits: the same number the shader gets */
export const hashUnit = (h: number): number => (h >>> 8) / 16777216;

/** The same kit for the shaders (WebGL2, GLSL ES 3.00). */
export const HASH_GLSL = /* glsl */ `
const uint HASH_SALT = 0xb31c96c9u;
uint hashU(uint x){
  x ^= x >> 16; x *= 0x3f9c86cbu;
  x ^= x >> 14; x *= 0x1ae9dacfu;
  x ^= x >> 15;
  return x;
}
uint hashU(uvec2 v){ return hashU(v.x + hashU(v.y + HASH_SALT)); }
uint hashU(uvec3 v){ return hashU(v.x + hashU(v.y + hashU(v.z + HASH_SALT))); }
float hashUnit(uint h){ return float(h >> 8) * (1.0 / 16777216.0); }
/* 0…1 for the cell a point falls into; negative coordinates are fine */
float hash2(vec2 p){ return hashUnit(hashU(uvec2(ivec2(floor(p))))); }
`;
