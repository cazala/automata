import assert from "node:assert/strict";
import test from "node:test";
import {
  GrowingNeural,
  GROWING_NEURAL_CA_FORMAT,
  GROWING_NEURAL_CA_VERSION,
} from "../dist/index.js";

function createWeights(channels = 4, hidden = 3, offset = 0) {
  const perception = channels * 3;
  return {
    channels,
    hidden,
    inputToHidden: Array.from(
      { length: hidden * perception },
      (_, index) => offset + index / 100,
    ),
    hiddenBias: Array.from(
      { length: hidden },
      (_, index) => offset + 0.25 + index / 100,
    ),
    hiddenToOutput: Array.from(
      { length: channels * hidden },
      (_, index) => offset - index / 100,
    ),
    outputBias: Array.from(
      { length: channels },
      (_, index) => offset - 0.25 - index / 100,
    ),
  };
}

function assertWeightValues(actual, expected) {
  assert.equal(actual.channels, expected.channels);
  assert.equal(actual.hidden, expected.hidden);
  for (const name of [
    "inputToHidden",
    "hiddenBias",
    "hiddenToOutput",
    "outputBias",
  ]) {
    assert.deepEqual(
      Array.from(actual[name]),
      Array.from(Float32Array.from(expected[name])),
    );
  }
}

test("builds the exact two-phase Growing-NCA substrate", () => {
  const neural = new GrowingNeural({
    channels: 16,
    hidden: 128,
    fireRate: 0.5,
  });
  const descriptor = neural.build();

  assert.equal(descriptor.channels, 16);
  assert.equal(descriptor.boundary, "zero");
  assert.equal(descriptor.render.colorMode, 3);
  assert.deepEqual(descriptor.scratch, [
    { name: "preLife", valuesPerCell: 1 },
  ]);
  assert.equal(descriptor.phases.length, 1);
  assert.equal(descriptor.phases[0].name, "post-life-mask");
  assert.match(descriptor.step, /var perception: array<f32, 48>/);
  assert.match(descriptor.step, /for \(var h: i32 = 0; h < 128/);
  assert.match(descriptor.step, /hidden = max\(hidden, 0\.0\)/);
  assert.match(descriptor.phases[0].step, /preLife\[cell\] > 0\.5/);
});

test("uses the reference center seed and zero-output initialization", () => {
  const neural = new GrowingNeural({ channels: 16, hidden: 128 });
  const seed = neural.seed(5, 5, { mode: "center" });
  const center = (2 * 5 + 2) * 16;

  assert.deepEqual(Array.from(seed.slice(center, center + 3)), [0, 0, 0]);
  assert.deepEqual(
    Array.from(seed.slice(center + 3, center + 16)),
    new Array(13).fill(1),
  );
  assert.equal(
    seed.reduce((sum, value) => sum + value, 0),
    13,
  );
  assert.ok(
    neural.getWeights().hiddenToOutput.every((value) => value === 0),
  );
});

test("round-trips a JSON-safe artifact and injected weights", () => {
  const weights = createWeights();
  const original = new GrowingNeural({
    weights,
    fireRate: 0.65,
    stepSize: 0.8,
    aliveThreshold: 0.2,
  });
  const artifact = JSON.parse(JSON.stringify(original.getArtifact()));

  assert.equal(artifact.format, GROWING_NEURAL_CA_FORMAT);
  assert.equal(artifact.version, GROWING_NEURAL_CA_VERSION);
  const restored = GrowingNeural.fromArtifact(artifact);
  assertWeightValues(restored.getWeights(), weights);
  assert.equal(restored.getFireRate(), 0.65);
  assert.equal(restored.getStepSize(), 0.8);
  assert.equal(restored.getAliveThreshold(), 0.2);
});

test("updates same-shape weights atomically without a rebuild", () => {
  const neural = new GrowingNeural({ channels: 4, hidden: 3 });
  const updates = [];
  let rebuilds = 0;
  neural.attach(
    () => {},
    () => {
      rebuilds += 1;
    },
    (name, data) => {
      updates.push({ name, data: data.slice() });
    },
  );
  const weights = createWeights(4, 3, 0.5);

  neural.setWeights(weights);
  assert.equal(rebuilds, 0);
  assert.deepEqual(
    updates.map(({ name }) => name),
    ["weights1", "bias1", "weights2", "bias2"],
  );
  assertWeightValues(neural.getWeights(), weights);

  const baseline = neural.getWeights();
  assert.throws(
    () =>
      neural.setWeights({
        ...weights,
        inputToHidden: weights.inputToHidden.slice(1),
      }),
    /inputToHidden has length 35; expected 36/,
  );
  assertWeightValues(neural.getWeights(), baseline);
});

test("rejects artifacts with incompatible behavioral semantics", () => {
  const artifact = new GrowingNeural({
    channels: 4,
    hidden: 3,
  }).getArtifact();
  assert.throws(
    () =>
      GrowingNeural.fromArtifact({
        ...artifact,
        activation: "tanh",
      }),
    /semantics do not match/,
  );
  assert.throws(
    () =>
      GrowingNeural.fromArtifact({
        ...artifact,
        perception: ["identity", "sobel-y", "sobel-x"],
      }),
    /perception does not match/,
  );
});
