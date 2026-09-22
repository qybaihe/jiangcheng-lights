import * as THREE from 'three';
import {paintedSurface} from './painted-surfaces.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const PAPER = new THREE.Color('#d6ded1');
// A finite palette translation keeps plaster/stone neutral and painted joinery
// ink-dark. It does not grade skin, lettering atlases or the whole framebuffer.
const ARCHITECTURE_PALETTE = new Map(Object.entries({
  d6ab93:'b6aca3', f3e4c1:'c8ccc0', d0dcd0:'b9c9bd', e4e3cf:'c6cec2',
  e2d9bc:'bfc8ba', c8bea2:'a9b5a9', cebc99:'b2b9ac', bbc4b3:'a8b7aa',
  c9c3a7:'adb8aa', eee8cf:'d3dbce', f3e5bd:'d3d9c8', eee3c6:'d2d9cb',
  ddd0b3:'b8c4b7', c1c5b4:'8a9f93', c5c6ac:'8b9f91', c9c7ad:'b1bdaf',
  a9aa95:'7b9486', e0d5b9:'afbbae', cbbda0:'9fad9c',
  '51766d':'3b655d', '527a77':'3c6964', '6a9381':'507b67',
  '58756b':'3e675b', a9b29a:'8ca08c', aebca0:'90a68c',
  '3e5854':'263f39', '3d5c58':'294a42', '607f7b':'456b64',
  '73918a':'618679', '4d6a66':'355951', '6d8d82':'4e7668', '8aa18a':'709078',
  '64746a':'445d52', '88aaa7':'608980', bbd0bf:'a4c2b0',
}).map(([from,to])=>[from,new THREE.Color(`#${to}`)]));
const MATERIAL_TEXTURES = [
  'map', 'lightMap', 'aoMap', 'emissiveMap', 'bumpMap', 'normalMap',
  'displacementMap', 'alphaMap',
];
const MATERIAL_VALUES = [
  'lightMapIntensity', 'emissiveIntensity', 'normalMapType',
  'displacementScale', 'displacementBias', 'wireframe', 'wireframeLinewidth', 'flatShading', 'fog',
];

function makeGradientMap() {
  const map = new THREE.DataTexture(new Uint8Array([88, 147, 209, 250]), 4, 1, THREE.RedFormat);
  map.name = 'Illustration / four light bands';
  map.minFilter = map.magFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}

function preservationReason(material, protectedMaterials) {
  if (!material?.isMeshStandardMaterial || material.isMeshPhysicalMaterial) return 'material-type';
  if (protectedMaterials.has(material)) return 'animated-window';
  if (material.userData.illustration === false || material.userData.illustration === 'preserve') return 'opt-out';
  if (material.transparent || material.opacity < 1 || material.alphaTest > 0 || material.alphaMap || material.alphaHash) return 'alpha';
  // Canvas maps in this world carry lettering, clocks and translucent foliage.
  // Loaded facade textures remain THREE.Texture even after their paint cleanup.
  if (material.map?.isCanvasTexture || material.map?.isVideoTexture) return 'lettering-or-video';
  if (material.defines && Object.keys(material.defines).some(key => key !== 'STANDARD')) return 'custom-defines';
  if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
    // The existing architecture hook only edits map_fragment, shared by Toon.
    // Unknown hooks can depend on the physical shader and must stay untouched.
    let key;
    try { key = material.customProgramCacheKey(); } catch { return 'custom-shader'; }
    if (!String(key).startsWith('illustrated-')) return 'custom-shader';
  }
  return null;
}

/**
 * Convert immutable architecture/props without mutating their source materials.
 * Call after building/batching the world. By default world.scene is visited,
 * including detached prop groups; options.roots can restrict the traversal.
 * Animated windows, alpha foliage, lettering and unknown shaders stay intact.
 * Shared textures are borrowed, never disposed. dispose() restores assignments.
 */
export function configureIllustratedMaterials(world, options = {}) {
  const roots = options.roots ?? [world.scene ?? world.static ?? world];
  if (!Array.isArray(roots) || roots.some(root => !root?.traverse)) {
    throw new TypeError('configureIllustratedMaterials requires a World/Object3D or options.roots array.');
  }
  const settings = {
    colorLift: THREE.MathUtils.clamp(options.colorLift ?? 0.015, 0, 0.25),
    textureContrast: THREE.MathUtils.clamp(options.textureContrast ?? 0.86, 0, 1),
    normalStrength: THREE.MathUtils.clamp(options.normalStrength ?? 0.18, 0, 1),
    aoStrength: THREE.MathUtils.clamp(options.aoStrength ?? 0.35, 0, 1),
  };
  const protectedMaterials = new Set([...(world.windowMats ?? []), ...(options.preserveMaterials ?? [])]);
  const replacements = new Map(), skipped = new Map(), assignments = [], seen = new Set();
  let gradientMap = null;

  function convert(source) {
    if (replacements.has(source)) return replacements.get(source);
    if (skipped.has(source)) return source;
    const reason = preservationReason(source, protectedMaterials);
    if (reason) { skipped.set(source, reason); return source; }

    const toon = new THREE.MeshToonMaterial();
    // Base Material.copy preserves alpha, vertexColors, sidedness, clipping,
    // stencil, shadowSide and depth flags without copying STANDARD defines.
    THREE.Material.prototype.copy.call(toon, source);
    toon.color.copy(source.color);
    const architecturalColor=ARCHITECTURE_PALETTE.get(source.color.getHexString());
    if(architecturalColor)toon.color.copy(architecturalColor);
    toon.emissive.copy(source.emissive);
    for (const key of MATERIAL_TEXTURES) toon[key] = source[key] ?? null;
    for (const key of MATERIAL_VALUES) if (source[key] !== undefined) toon[key] = source[key];
    toon.normalScale.copy(source.normalScale).multiplyScalar(settings.normalStrength);
    toon.bumpScale = source.bumpScale * settings.normalStrength;
    toon.aoMapIntensity = source.aoMapIntensity * settings.aoStrength;
    if(source.userData.surface){toon.map=paintedSurface(source.userData.surface,source.map);toon.normalMap=null;toon.bumpMap=null;toon.aoMap=null;}
    toon.gradientMap = gradientMap ??= makeGradientMap();
    // A small cool paper lift replaces the old creamy highlight wash.
    const luma = toon.color.r * 0.2126 + toon.color.g * 0.7152 + toon.color.b * 0.0722;
    toon.color.lerp(PAPER, settings.colorLift * THREE.MathUtils.smoothstep(luma, 0.035, 0.38));
    toon.name = source.name ? `${source.name} / illustrated` : 'Illustrated architecture';
    toon.userData.illustratedSource = source.uuid;

    // Only repetitive PBR surfaces get reduced texture contrast. Facades and
    // their painted signs keep their full map, UVs and original cleanup hook.
    const textureContrast = !source.userData.surface&&(source.normalMap || source.roughnessMap) ? settings.textureContrast : 1;
    const previousHook = source.onBeforeCompile;
    const previousKey = source.customProgramCacheKey();
    toon.onBeforeCompile = (shader, renderer) => {
      previousHook.call(toon, shader, renderer);
      if (textureContrast < 1) {
        const mapChunk = THREE.ShaderChunk.map_fragment.replace(
          'diffuseColor *= sampledDiffuseColor;',
          `sampledDiffuseColor.rgb = mix(vec3(0.62), sampledDiffuseColor.rgb, ${textureContrast.toFixed(4)});\n\tdiffuseColor *= sampledDiffuseColor;`,
        );
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', mapChunk);
      }
    };
    toon.customProgramCacheKey = () => `illustration-toon-v1:${previousKey}:${textureContrast.toFixed(4)}`;
    replacements.set(source, toon);
    return toon;
  }

  for (const root of roots) root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || seen.has(mesh) || mesh.userData.illustration === false) return;
    seen.add(mesh);
    const before = mesh.material;
    const after = Array.isArray(before) ? before.map(convert) : convert(before);
    const changed = Array.isArray(before) ? before.some((material, i) => material !== after[i]) : before !== after;
    if (!changed) return;
    mesh.material = after;
    assignments.push({ mesh, before, after });
  });

  const preservedReasons = {};
  for (const reason of skipped.values()) preservedReasons[reason] = (preservedReasons[reason] ?? 0) + 1;
  let disposed = false;
  return {
    convertedMaterials: replacements.size,
    convertedMeshes: assignments.length,
    preservedMaterials: skipped.size,
    preservedReasons,
    replacements,
    gradientMap,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { mesh, before, after } of assignments) if (mesh.material === after) mesh.material = before;
      for (const material of replacements.values()) material.dispose();
      gradientMap?.dispose();
    },
  };
}

const outlineVertex = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const outlineFragment = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 texelSize;
uniform vec3 inkColor;
uniform float hasDepth;
uniform float cameraNear;
uniform float cameraFar;
uniform float perspectiveCamera;
uniform float thickness;
uniform float strength;
uniform float colorStrength;
uniform float depthThreshold;
uniform float colorThreshold;
uniform vec2 distanceFade;
varying vec2 vUv;

float viewDistance(float depth) {
  if (perspectiveCamera > 0.5) {
    return cameraNear * cameraFar / max(cameraFar - depth * (cameraFar - cameraNear), 0.00001);
  }
  return mix(cameraNear, cameraFar, depth);
}
vec3 edgeColor(vec2 uv) {
  vec3 color = max(texture2D(tDiffuse, uv).rgb, vec3(0.0));
  // Detection only: compress HDR highlights without altering the final image.
  return color / (vec3(1.0) + color);
}
float coherentContrast(vec3 closeDelta, vec3 wideDelta) {
  float closeLength = length(closeDelta), wideLength = length(wideDelta);
  float alignment = max(dot(closeDelta, wideDelta) / max(closeLength * wideLength, 0.00001), 0.0);
  return min(closeLength, wideLength) * alignment;
}
void main() {
  vec4 original = texture2D(tDiffuse, vUv);
  if (hasDepth < 0.5 || strength <= 0.0) {
    gl_FragColor = original;
    return;
  }
  vec2 dx = vec2(texelSize.x * thickness, 0.0);
  vec2 dy = vec2(0.0, texelSize.y * thickness);
  // Nearest-filtered depth needs an integer radius: a half-pixel radius can
  // sample [-1, +2] instead of a symmetric pair and invent a ground edge.
  float depthRadius = max(floor(thickness + 0.5), 1.0);
  vec2 depthDx = vec2(texelSize.x * depthRadius, 0.0);
  vec2 depthDy = vec2(0.0, texelSize.y * depthRadius);
  float center = texture2D(tDepth, vUv).x;
  if (center >= 0.999999) {
    gl_FragColor = original;
    return;
  }
  float left = texture2D(tDepth, vUv - depthDx).x;
  float right = texture2D(tDepth, vUv + depthDx).x;
  float down = texture2D(tDepth, vUv - depthDy).x;
  float up = texture2D(tDepth, vUv + depthDy).x;

  // Raw projected depth is affine across a plane. Subtracting the opposing
  // slope avoids drawing paving gradients or the triangles of a flat wall.
  // Only the foreground side receives ink, keeping silhouettes about 1 px.
  float edgeX = max(max(left - center, right - center), 0.0) - min(abs(left - center), abs(right - center));
  float edgeY = max(max(down - center, up - center), 0.0) - min(abs(down - center), abs(up - center));
  float distance = viewDistance(center);
  float depthScale = (cameraFar - cameraNear) / max(distance, 0.0001);
  if (perspectiveCamera > 0.5) depthScale = (cameraFar - cameraNear) * distance / (cameraFar * cameraNear);
  float depthEdge = smoothstep(depthThreshold, depthThreshold * 2.5, max(edgeX, edgeY) * depthScale);

  // Strong, coherent paint/shadow boundaries get a much lighter inner line.
  // A second radius rejects isolated texel noise; no normal/triangle pass.
  vec3 closeX = edgeColor(vUv + dx) - edgeColor(vUv - dx);
  vec3 closeY = edgeColor(vUv + dy) - edgeColor(vUv - dy);
  vec3 wideX = edgeColor(vUv + dx * 2.0) - edgeColor(vUv - dx * 2.0);
  vec3 wideY = edgeColor(vUv + dy * 2.0) - edgeColor(vUv - dy * 2.0);
  float contrast = max(coherentContrast(closeX, wideX), coherentContrast(closeY, wideY));
  float colorEdge = smoothstep(colorThreshold, colorThreshold * 1.6, contrast) * colorStrength;
  float fade = 1.0 - smoothstep(distanceFade.x, distanceFade.y, distance);
  float ink = clamp(max(depthEdge, colorEdge) * strength * fade, 0.0, 1.0);
  gl_FragColor = vec4(mix(original.rgb, min(original.rgb, inkColor), ink), original.a);
}
`;

/**
 * One fullscreen pass; no scene rerender, normal buffer or mesh wireframes.
 * Put immediately after RenderPass and before OutputPass. The composer's two
 * ping-pong targets must have independent DepthTextures (normal depth, not log
 * or reversed depth). Without a depth texture this pass safely copies color.
 * thickness is in render-target pixels; depth sampling rounds to an integer.
 * Set it to the DPR for approximately one CSS pixel.
 */
export class IllustrationOutlinePass extends Pass {
  constructor(camera, options = {}) {
    super();
    this.camera = camera;
    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: null },
      hasDepth: { value: 0 },
      texelSize: { value: new THREE.Vector2(1, 1) },
      inkColor: { value: new THREE.Color(options.color ?? '#253d38') },
      cameraNear: { value: camera?.near ?? 0.3 },
      cameraFar: { value: camera?.far ?? 380 },
      perspectiveCamera: { value: camera?.isOrthographicCamera ? 0 : 1 },
      thickness: { value: THREE.MathUtils.clamp(options.thickness ?? 1, 0.5, 3) },
      strength: { value: THREE.MathUtils.clamp(options.strength ?? 0.78, 0, 1) },
      colorStrength: { value: THREE.MathUtils.clamp(options.colorStrength ?? 0.2, 0, 1) },
      depthThreshold: { value: Math.max(options.depthThreshold ?? 0.008, 0.0001) },
      colorThreshold: { value: Math.max(options.colorThreshold ?? 0.22, 0.001) },
      distanceFade: { value: new THREE.Vector2(options.fadeStart ?? 100, options.fadeEnd ?? 240) },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'IllustrationOutlinePass', uniforms: this.uniforms,
      vertexShader: outlineVertex, fragmentShader: outlineFragment,
      depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
    });
    this._quad = new FullScreenQuad(this.material);
  }

  setSize(width, height) {
    this.uniforms.texelSize.value.set(1 / Math.max(width, 1), 1 / Math.max(height, 1));
  }

  render(renderer, writeBuffer, readBuffer) {
    const uniforms = this.uniforms;
    uniforms.tDiffuse.value = readBuffer.texture;
    uniforms.tDepth.value = readBuffer.depthTexture ?? null;
    uniforms.hasDepth.value = readBuffer.depthTexture ? 1 : 0;
    if (this.camera) {
      uniforms.cameraNear.value = this.camera.near;
      uniforms.cameraFar.value = this.camera.far;
      uniforms.perspectiveCamera.value = this.camera.isOrthographicCamera ? 0 : 1;
    }
    this.setSize(readBuffer.width, readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    this._quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this._quad.dispose();
  }
}
