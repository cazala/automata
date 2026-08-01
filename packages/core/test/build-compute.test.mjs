import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/webgpu/build-compute.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { buildCompute } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

const descriptor = {
  channels: 1,
  params: [],
  step: "setCell(x, y, 0, sampleAt(x, y, 0));",
};

function sampleAtFrom(code) {
  return code.slice(code.indexOf("fn sampleAt"), code.indexOf("fn setCell"));
}

test("keeps zero-boundary checks out of runtime wrap/clamp sampling", () => {
  const sampleAt = sampleAtFrom(buildCompute(descriptor).code);

  assert.doesNotMatch(sampleAt, /x < 0|sim\.wrap == 2u/);
  assert.match(sampleAt, /let sx = wrapCoord/);
  assert.match(sampleAt, /let sy = wrapCoord/);
});

test("specializes zero-boundary sampling without wrap/clamp work", () => {
  const sampleAt = sampleAtFrom(
    buildCompute({ ...descriptor, boundary: "zero" }).code,
  );

  assert.match(
    sampleAt,
    /x < 0 \|\| y < 0 \|\| x >= i32\(sim\.width\) \|\| y >= i32\(sim\.height\)/,
  );
  assert.match(sampleAt, /return src\[cellBase\(x, y\) \+ c\]/);
  assert.doesNotMatch(sampleAt, /wrapCoord|sim\.wrap == 2u/);
});
