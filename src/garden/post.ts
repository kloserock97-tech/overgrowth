import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { HASH_GLSL } from "./hash";

/** The scene is drawn into a multisampled half-float target and then composited: a little halation on the brightest
    highlights, a vignette, our own tone curve and grain. Four samples: the pile of the moss is antialiased by alpha to
    coverage, and with two samples that gives only three levels of edge. */
export function createPost(renderer: THREE.WebGLRenderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples: 4 });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: target.texture }, uPixel: { value: new THREE.Vector2() },
      uExposure: { value: 1 }, uHalation: { value: 1 }, uVignette: { value: 1 },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }",
    fragmentShader: `
      uniform sampler2D tScene; uniform vec2 uPixel; uniform float uExposure, uHalation, uVignette; varying vec2 vUv;
      ${HASH_GLSL}
      /* Our studio curve: x/(x+k) rolls the highlights off, the power gives the shadows a toe and the gain lifts the
         top back to white. One line per channel, so saturated colours drift a little towards white as they brighten,
         the way film does. */
      vec3 studioCurve(vec3 x){ return min(vec3(1.), 1.07*pow(x/(x+.18), vec3(2.2))); }
      void main(){
        vec4 texel=texture2D(tScene,vUv);
        vec3 c=texel.rgb;
        // Highlight-only halation, not a screen-wide blur over the moss.
        vec3 halo=vec3(0.);
        for(int i=0;i<8;i++){
          float a=float(i)*.785398;
          vec3 s=texture2D(tScene,vUv+vec2(cos(a),sin(a))*uPixel*3.).rgb;
          halo+=max(s-vec3(1.5),vec3(0.));
        }
        c+=halo*.012*uHalation;
        c*=1.-.075*uVignette*dot((vUv-.5)*1.4,(vUv-.5)*1.4);
        /* The target is premultiplied (edge pixels of the slab are colour × coverage). The curve is not linear, so it
           has to see the straight colour; otherwise every silhouette gets a pale fringe. */
        float coverage=texel.a;
        vec3 straight=coverage>.001?c/coverage:vec3(0.);
        gl_FragColor=vec4(studioCurve(max(straight*uExposure,vec3(0.))),1.);
        #include <colorspace_fragment>
        float grain=hash2(gl_FragCoord.xy)-.5;
        gl_FragColor.rgb+=grain*.003;
        gl_FragColor=vec4(gl_FragColor.rgb*coverage,coverage);
      }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const quad = new FullScreenQuad(material);
  return {
    target,
    uniforms: material.uniforms as { uExposure: { value: number }; uHalation: { value: number }; uVignette: { value: number } },
    resize(widthPx: number, heightPx: number) {
      target.setSize(widthPx, heightPx);
      material.uniforms.uPixel.value.set(1 / widthPx, 1 / heightPx);
    },
    render(scene: THREE.Scene, camera: THREE.Camera) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      quad.render(renderer);
    },
    dispose() { target.dispose(); quad.dispose(); material.dispose(); },
  };
}
