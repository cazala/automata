/**
 * Render shader
 *
 * A fullscreen pass drawn directly to the swapchain. The fragment shader maps each
 * pixel to a world cell using the same camera/zoom convention as the party playground
 * ( world = camera + (pixel - resolution/2) / zoom ), reads the cell state from the
 * current grid buffer, and colorizes it. No scene ping-pong textures are needed.
 *
 * colorMode 0: single-channel binary/continuous -> mix(colorOff, colorOn, value)
 * colorMode 1: multi-channel -> channels 0..2 drive a per-channel
 *              mix(colorOff, colorOn, value), so the palette tints the field
 *              while distinct channel values still separate into hues
 * colorMode 2: raw rgb -> channels 0..2 displayed verbatim (cells carry their
 *              own palette, e.g. pokemon type colors / cyclic hue wheel)
 */

export const RENDER_UNIFORM_SIZE = 96; // see layout below (24 * f32)

export const renderWGSL = /* wgsl */ `
struct RenderU {
  resolution: vec2<f32>,
  camera: vec2<f32>,
  zoom: f32,
  gridW: f32,
  gridH: f32,
  channels: f32,
  colorMode: f32,
  showGrid: f32,
  gridThreshold: f32,
  dpr: f32,
  colorOff: vec4<f32>,
  colorOn: vec4<f32>,
  colorBg: vec4<f32>,
};

@group(0) @binding(0) var<uniform> ru: RenderU;
@group(0) @binding(1) var<storage, read> cells: array<f32>;

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var out: VOut;
  let p = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0,  1.0)
  );
  let i = vi % 4u;
  out.pos = vec4<f32>(p[i], 0.0, 1.0);
  out.uv = p[i];
  return out;
}

@fragment
fn fs(@builtin(position) fragPos: vec4<f32>) -> @location(0) vec4<f32> {
  // fragPos is in physical pixels; resolution/zoom/camera are in CSS pixels & cells.
  let world = ru.camera + (fragPos.xy / ru.dpr - ru.resolution * 0.5) / ru.zoom;
  let cx = i32(floor(world.x));
  let cy = i32(floor(world.y));
  if (cx < 0 || cy < 0 || cx >= i32(ru.gridW) || cy >= i32(ru.gridH)) {
    return ru.colorBg;
  }
  let base = (cy * i32(ru.gridW) + cx) * i32(ru.channels);

  var col: vec4<f32>;
  if (ru.colorMode < 0.5) {
    let v = clamp(cells[base], 0.0, 1.0);
    col = mix(ru.colorOff, ru.colorOn, v);
  } else {
    let ch = i32(ru.channels);
    let r = cells[base];
    let g = select(0.0, cells[base + 1], ch > 1);
    let b = select(0.0, cells[base + 2], ch > 2);
    let v = clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
    if (ru.colorMode < 1.5) {
      col = vec4<f32>(mix(ru.colorOff.rgb, ru.colorOn.rgb, v), 1.0);
    } else {
      col = vec4<f32>(v, 1.0);
    }
  }

  if (ru.showGrid > 0.5 && ru.zoom >= ru.gridThreshold) {
    let f = fract(world);
    let lw = 1.0 / ru.zoom;
    if (f.x < lw || f.y < lw) {
      col = mix(col, vec4<f32>(0.0, 0.0, 0.0, 1.0), 0.35);
    }
  }
  return col;
}
`;

export interface RenderUniformValues {
  width: number;
  height: number;
  cameraX: number;
  cameraY: number;
  zoom: number;
  gridW: number;
  gridH: number;
  channels: number;
  colorMode: number;
  showGrid: number;
  gridThreshold: number;
  dpr: number;
  colorOff: [number, number, number, number];
  colorOn: [number, number, number, number];
  colorBg: [number, number, number, number];
}

export function packRenderUniform(v: RenderUniformValues): Float32Array {
  const a = new Float32Array(24);
  a[0] = v.width;
  a[1] = v.height;
  a[2] = v.cameraX;
  a[3] = v.cameraY;
  a[4] = v.zoom;
  a[5] = v.gridW;
  a[6] = v.gridH;
  a[7] = v.channels;
  a[8] = v.colorMode;
  a[9] = v.showGrid;
  a[10] = v.gridThreshold;
  a[11] = v.dpr;
  a.set(v.colorOff, 12);
  a.set(v.colorOn, 16);
  a.set(v.colorBg, 20);
  return a;
}
