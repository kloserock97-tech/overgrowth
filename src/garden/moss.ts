import * as THREE from "three";
import { TILE, DRAPE, seedDelay, mossAt, mossKnob, fbm } from "./surface";
import { buildSheet, RISE, type Garden } from "./sheet";
import { HASH_GLSL } from "./hash";

/** length of the pile, world units; the pile slider scales it live */
export const FUR = .05;
export const MAX_SHELLS = 22;

/** how far the pile has come at a vertex, and the sway of its tips: shared by the layers and by the hull */
const PILE_GLSL = `
  vec3 lifted(vec3 from,vec3 along,float layer){
    float pile=smoothstep(aDelay+.02,aDelay+.30,uGarden);
    vec3 p=from+along*(layer*uFur*pile);
    p.xz+=vec2(sin(uGardenTime*1.3+from.x*9.+from.z*5.),cos(uGardenTime*1.1+from.z*8.-from.x*4.))*(.008*uBreeze*layer*layer*pile);
    return p;
  }`;

/** Moss as a shell-textured pile.
    The cushion surface is drawn a dozen or two times, each copy pushed a little further out along the normal, and in
    every copy a procedural mask keeps only the cross-sections of the strands, thinner the higher the layer. There are
    no thin triangles at all, the edge of every strand is antialiased by the GPU (alpha to coverage on the multisampled
    target), and the number of layers is a quality dial that weak devices can turn down.
    Three draws: the cushion (casts the shadow), a hull at the tips, and all the layers as one instanced call. */
export function buildMoss(garden: Garden, world: THREE.Group, seed: number) {
  const uniforms = {
    uShells: { value: 16 }, uFur: { value: FUR }, uDensity: { value: 60 }, uSeed: { value: seed % 65536 },
    uRoot: { value: new THREE.Color() }, uTipA: { value: new THREE.Color() }, uTipB: { value: new THREE.Color() },
    uDry: { value: new THREE.Color() }, uSheen: { value: .5 },
  };
  const base = buildSheet(garden, {
    x0: -TILE.width / 2 - DRAPE - .1, x1: TILE.width / 2 + DRAPE + .1, z0: -TILE.depth / 2 - DRAPE - .1, z1: TILE.depth / 2 + DRAPE + .1,
    res: garden.small ? 76 : 106, mode: "grow",
    material: new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true }),
    /* the front runs over the top first and then creeps down each wall */
    sample: (x, z, anchor) => {
      const h = mossAt(x, z, anchor);
      /* shade: 0 in the creases between the knobs, 1 on their crowns, and a tall mound is lighter than the carpet
         around it; the pile reads it from the vertex colour */
      const crown = anchor.wall > 0 ? .3 + fbm(x * 7, z * 7) * .5 : mossKnob(x, z) * .5 + fbm(x * 6, z * 6) * .22 + Math.min(1, h / .3) * .28;
      return { h, delay: seedDelay(anchor.bx, anchor.bz) + Math.min(1, anchor.wall) * .07, shade: crown };
    },
    /* what shows between the strands: deep, almost black green */
    tint: (shade, out) => out.setRGB(.012 + shade * .02, .022 + shade * .045, .006 + shade * .009),
  });
  world.add(base);

  const vertexHead = `uniform float uGarden, uGardenTime, uBreeze, uShells, uFur;
attribute vec3 aRest; attribute float aDelay; attribute vec2 aGrid;
varying float vShell; varying vec2 vGrid;
${PILE_GLSL}
`;

  /* The hull: the same surface at the height of the tips, dark, drawn before the layers and without writing depth.
     It gives the pile a clean antialiased silhouette and marks all of it opaque in the alpha of the target, which the
     layers themselves cannot do (see the colour mask below). Between the strands it shows as the dark of the roots. */
  const hullMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(1.8, 2.0, 1.7), vertexColors: true, depthWrite: false });
  hullMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { uGarden: garden.growth, uGardenTime: garden.clock, uBreeze: garden.breeze });
    shader.vertexShader = (vertexHead + shader.vertexShader).replace("#include <begin_vertex>", `
      vec3 transformed=lifted(mix(aRest,position,${RISE}),normal,1.);
      vShell=1.; vGrid=aGrid;`);
  };
  const hull = new THREE.Mesh(base.geometry, hullMaterial);
  hull.frustumCulled = false; hull.renderOrder = 1;
  world.add(hull);

  const material = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, alphaToCoverage: true });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { uGarden: garden.growth, uGardenTime: garden.clock, uBreeze: garden.breeze });
    shader.vertexShader = (vertexHead + shader.vertexShader).replace("#include <begin_vertex>", `
      float layer=(float(gl_InstanceID)+1.)/uShells;
      vec3 transformed=lifted(mix(aRest,position,${RISE}),normal,layer);
      vShell=layer; vGrid=aGrid;`);
    shader.fragmentShader = `uniform float uDensity, uSeed, uSheen; uniform vec3 uRoot, uTipA, uTipB, uDry;
varying float vShell; varying vec2 vGrid;
${HASH_GLSL}
/* a random number per lattice cell; 'what' picks which property of the cell it is */
float cellRand(vec2 cell,uint lattice,uint what){ return hashUnit(hashU(uvec3(uvec2(ivec2(cell)),lattice*16u+what+uint(uSeed)*64u))); }
/* One lattice of strands: a strand to a cell, some cells empty, centres well scattered. Returns coverage and hands
   back what the colour needs: how far up its strand this layer is, a random for the hue, and whether it is a tall one. */
float strands(vec2 uv,uint lattice,out float up,out float hue,out float tall){
  vec2 cell=floor(uv);
  float h1=cellRand(cell,lattice,0u), present=step(.16,cellRand(cell,lattice,1u));
  hue=cellRand(cell,lattice,2u); tall=step(.93,cellRand(cell,lattice,3u));
  float len=mix(.36+.5*h1*h1,1.,tall);
  up=vShell/len;
  if(up>1.||present<.5) return 0.;
  vec2 jitter=(vec2(cellRand(cell,lattice,4u),cellRand(cell,lattice,5u))-.5)*.62;
  // the cross-section of a strand shrinks towards its tip
  float radius=(.34-.08*tall)*sqrt(1.-up);
  float dist=length(fract(uv)-.5-jitter);
  float soft=fwidth(dist)*1.1+1e-4;
  return 1.-smoothstep(radius-soft,radius+soft,dist);
}
${shader.fragmentShader}`
      .replace("#include <map_fragment>", `
      /* Two lattices at different scales, one turned against the other, both bent by a slow warp: rows of a single
         grid read as a rubber mat, this reads as growth. */
      vec2 warp=vec2(sin(vGrid.y*7.3+vGrid.x*2.1),cos(vGrid.x*6.1-vGrid.y*1.7))*.035;
      vec2 ga=(vGrid+warp)*uDensity;
      vec2 gb=mat2(.7986,-.6018,.6018,.7986)*(vGrid-warp*1.4)*uDensity*1.37+31.7;
      float upA,hueA,tallA,upB,hueB,tallB;
      float sa=strands(ga,0u,upA,hueA,tallA), sb=strands(gb,1u,upB,hueB,tallB);
      float strand=max(sa,sb);
      if(strand<.04) discard;
      float pick=step(sa,sb);
      float up=mix(upA,upB,pick), hue=mix(hueA,hueB,pick), tall=mix(tallA,tallB,pick);
      #include <map_fragment>`)
      .replace("#include <color_fragment>", `
      #include <color_fragment>
      // dark at the root, yellow-green at the tip: the depth of the pile comes from colour, not from shadow maps
      float crown=clamp((vColor.g-.022)/.045,0.,1.);
      float rise=pow(up,1.25);
      vec3 rootColor=uRoot*(1.+crown);
      vec3 tipColor=mix(uTipA,uTipB,hue)*(.38+.98*crown);
      // here and there a dry, ochre strand and a tall pale one
      tipColor=mix(tipColor,uDry,step(.9,hue)*.5);
      tipColor=mix(tipColor,uTipB*1.7+vec3(.11,.02,.07),tall*.6);
      diffuseColor.rgb=mix(rootColor,tipColor,rise);
      diffuseColor.a=strand;`)
      .replace("#include <opaque_fragment>", `
      // velvet: moss lights up where you look along it
      float sheen=pow(1.-abs(dot(normalize(vNormal),normalize(vViewPosition))),3.);
      outgoingLight+=tipColor*sheen*uSheen*rise;
      #include <opaque_fragment>`);
  };
  const shells = new THREE.InstancedMesh(base.geometry, material, MAX_SHELLS);
  const identity = new THREE.Matrix4();
  for (let i = 0; i < MAX_SHELLS; i++) shells.setMatrixAt(i, identity);
  shells.frustumCulled = false; shells.renderOrder = 2;
  shells.castShadow = false;
  /* shadow lookups on twenty overlapping layers are what a weak GPU cannot afford */
  shells.receiveShadow = !garden.small;
  /* Alpha to coverage takes its mask from the alpha the shader writes, and that alpha would also land in the target:
     a half-covered pixel in the middle of the moss would come out half transparent and let the page through. The hull
     has already written alpha 1 over the whole pile, so the layers leave the alpha channel alone.
     three keeps its own copy of the colour mask (all on), so it does not fight this. */
  shells.onBeforeRender = renderer => renderer.getContext().colorMask(true, true, true, false);
  shells.onAfterRender = renderer => renderer.getContext().colorMask(true, true, true, true);
  world.add(shells);

  return {
    parts: [base, hull, shells] as THREE.Object3D[],
    uniforms,
    /** how many layers to draw: the quality dial */
    setShells(count: number) { shells.count = Math.min(MAX_SHELLS, Math.max(4, Math.round(count))); uniforms.uShells.value = shells.count; },
    /** cells of the strand lattice per world unit; kept at a few device pixels a cell, so a strand never falls under a
        pixel and shimmers */
    setDensity(perUnit: number) { uniforms.uDensity.value = perUnit; },
  };
}
