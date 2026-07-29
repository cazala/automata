import assert from "node:assert/strict";
import test from "node:test";
import { Neural } from "../dist/index.js";

function createWeights(channels = 2, hidden = 3, offset = 0) {
  const perception = channels * 4;
  return {
    channels,
    hidden,
    inputToHidden: Array.from(
      { length: hidden * perception },
      (_, index) => offset + index / 100,
    ),
    hiddenBias: Array.from(
      { length: hidden },
      (_, index) => offset + .25 + index / 100,
    ),
    hiddenToOutput: Array.from(
      { length: channels * hidden },
      (_, index) => offset - index / 100,
    ),
    outputBias: Array.from(
      { length: channels },
      (_, index) => offset - .25 - index / 100,
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

test("constructor derives network shape from injected weights", () => {
  const weights = createWeights();
  const neural = new Neural({ mode: "network", weights });

  assert.equal(neural.getChannels(), 2);
  assert.equal(neural.getHidden(), 3);
  assertWeightValues(neural.getNetworkWeights(), weights);

  const storages = Object.fromEntries(
    neural.build().storages.map(({ name, data }) => [name, data]),
  );
  assert.deepEqual(
    Array.from(storages.weights1),
    Array.from(Float32Array.from(weights.inputToHidden)),
  );
  assert.deepEqual(
    Array.from(storages.bias1),
    Array.from(Float32Array.from(weights.hiddenBias)),
  );
  assert.deepEqual(
    Array.from(storages.weights2),
    Array.from(Float32Array.from(weights.hiddenToOutput)),
  );
  assert.deepEqual(
    Array.from(storages.bias2),
    Array.from(Float32Array.from(weights.outputBias)),
  );
});

test("setter copies values and emits same-shape storage updates without rebuild", () => {
  const neural = new Neural({ mode: "network", channels: 2, hidden: 3 });
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
  const weights = createWeights(2, 3, .5);

  neural.setNetworkWeights(weights);
  assert.equal(rebuilds, 0);
  assert.deepEqual(
    updates.map(({ name }) => name),
    ["weights1", "bias1", "weights2", "bias2"],
  );
  assertWeightValues(neural.getNetworkWeights(), weights);

  weights.inputToHidden[0] = 999;
  const firstSnapshot = neural.getNetworkWeights();
  assert.notEqual(firstSnapshot.inputToHidden[0], 999);
  firstSnapshot.inputToHidden[0] = 777;
  assert.notEqual(neural.getNetworkWeights().inputToHidden[0], 777);
});

test("setter validates atomically against shape, length, and f32 values", () => {
  const neural = new Neural({ mode: "network", channels: 2, hidden: 3 });
  const valid = createWeights();
  neural.setNetworkWeights(valid);
  const baseline = neural.getNetworkWeights();

  assert.throws(
    () => neural.setNetworkWeights({ ...valid, channels: 3 }),
    /target 3 channels/,
  );
  assert.throws(
    () =>
      neural.setNetworkWeights({
        ...valid,
        inputToHidden: valid.inputToHidden.slice(1),
      }),
    /inputToHidden has length 23; expected 24/,
  );
  assert.throws(
    () =>
      neural.setNetworkWeights({
        ...valid,
        hiddenBias: [0, Number.NaN, 0],
      }),
    /hiddenBias\[1\] must be finite/,
  );
  assert.throws(
    () =>
      neural.setNetworkWeights({
        ...valid,
        outputBias: [0, 1e40],
      }),
    /outputBias\[1\] is outside the f32 range/,
  );
  assertWeightValues(neural.getNetworkWeights(), baseline);
});
