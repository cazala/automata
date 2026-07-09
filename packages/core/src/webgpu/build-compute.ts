/**
 * Compute shader builder
 *
 * Templates an AutomatonDescriptor into a full WGSL compute shader. The static
 * scaffolding provides the cell grid bindings (ping-pong src/dst storage buffers),
 * the shared Sim uniform, a generated Params uniform, optional read-only storage
 * buffers, and a small helper library. The automaton only supplies the per-cell
 * `step` body (and optional `globals`).
 *
 * Helpers available inside `step` (with `x`, `y` = i32 cell coords in scope):
 *   sampleAt(x, y, c) -> f32   read channel c of a cell from `src` (wrap/clamp per grid)
 *   setCell(x, y, c, v)        write channel c of a cell into `dst`
 *   cellBase(x, y) -> i32      flat base index of a cell
 *   rand01(seed: u32) -> f32   hash-based uniform random in [0,1]
 *   params.<name>              generated scalar params
 *   sim.width/height/channels/wrap/currentRow/frame/seed
 */

import type { AutomatonDescriptor, ParamSpec } from "../automaton";

export const SIM_STRUCT = /* wgsl */ `
struct Sim {
  width: u32,
  height: u32,
  channels: u32,
  wrap: u32,
  currentRow: u32,
  frame: u32,
  seed: u32,
  _pad0: u32,
};`;

export const SIM_UNIFORM_SIZE = 32; // 8 * u32

export interface BuiltCompute {
  code: string;
  /** Byte size of the Params uniform buffer (padded to 16), or 0 if no params. */
  paramsSize: number;
  /** Binding index for the params uniform (if any). */
  paramsBinding: number;
  /** Storage buffer name -> binding index. */
  storageBindings: Record<string, number>;
}

function buildParamsStruct(params: ParamSpec[]): { wgsl: string; size: number } {
  if (params.length === 0) return { wgsl: "", size: 0 };
  const lines = params.map((p) => `  ${p.name}: ${p.type},`);
  // Pad to a multiple of 4 scalars (16 bytes) for std140.
  const pad = (4 - (params.length % 4)) % 4;
  for (let i = 0; i < pad; i++) lines.push(`  _pad${i}: u32,`);
  const size = (params.length + pad) * 4;
  return { wgsl: `struct Params {\n${lines.join("\n")}\n};`, size };
}

export function buildCompute(desc: AutomatonDescriptor): BuiltCompute {
  const { wgsl: paramsStruct, size: paramsSize } = buildParamsStruct(desc.params);

  let binding = 3;
  const paramsBinding = paramsSize > 0 ? binding++ : -1;

  const storageBindings: Record<string, number> = {};
  const storageDecls: string[] = [];
  for (const s of desc.storages ?? []) {
    const b = binding++;
    storageBindings[s.name] = b;
    storageDecls.push(
      `@group(0) @binding(${b}) var<storage, read> ${s.name}: array<f32>;`
    );
  }

  const paramsDecl =
    paramsSize > 0
      ? `@group(0) @binding(${paramsBinding}) var<uniform> params: Params;`
      : "";

  const code = /* wgsl */ `
${SIM_STRUCT}
${paramsStruct}

@group(0) @binding(0) var<uniform> sim: Sim;
@group(0) @binding(1) var<storage, read> src: array<f32>;
@group(0) @binding(2) var<storage, read_write> dst: array<f32>;
${paramsDecl}
${storageDecls.join("\n")}

fn cellBase(x: i32, y: i32) -> i32 {
  return (y * i32(sim.width) + x) * i32(sim.channels);
}

fn wrapCoord(v: i32, n: i32) -> i32 {
  if (sim.wrap == 1u) {
    return ((v % n) + n) % n;
  }
  return clamp(v, 0, n - 1);
}

fn sampleAt(x: i32, y: i32, c: i32) -> f32 {
  let sx = wrapCoord(x, i32(sim.width));
  let sy = wrapCoord(y, i32(sim.height));
  return src[cellBase(sx, sy) + c];
}

fn setCell(x: i32, y: i32, c: i32, v: f32) {
  dst[cellBase(x, y) + c] = v;
}

fn hashU32(value: u32) -> u32 {
  var s = value;
  s = s ^ (s >> 16u);
  s = s * 0x7feb352du;
  s = s ^ (s >> 15u);
  s = s * 0x846ca68bu;
  s = s ^ (s >> 16u);
  return s;
}

fn rand01(seed: u32) -> f32 {
  return f32(hashU32(seed)) / 4294967295.0;
}

${desc.globals ?? ""}

@compute @workgroup_size(8, 8, 1)
fn step(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= sim.width || gid.y >= sim.height) {
    return;
  }
  let x = i32(gid.x);
  let y = i32(gid.y);
${desc.step}
}
`;

  return { code, paramsSize, paramsBinding, storageBindings };
}

/** Pack scalar param values into an ArrayBuffer matching the generated Params struct. */
export function packParams(
  params: ParamSpec[],
  values: Record<string, number>
): ArrayBuffer {
  if (params.length === 0) return new ArrayBuffer(0);
  const pad = (4 - (params.length % 4)) % 4;
  const size = (params.length + pad) * 4;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  params.forEach((p, i) => {
    const off = i * 4;
    const v = values[p.name] ?? p.default;
    if (p.type === "f32") view.setFloat32(off, v, true);
    else if (p.type === "u32") view.setUint32(off, v >>> 0, true);
    else view.setInt32(off, v | 0, true);
  });
  return buf;
}
