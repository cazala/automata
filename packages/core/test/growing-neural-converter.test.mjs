import assert from "node:assert/strict";
import test from "node:test";
import { convertGraphModel } from "../../../scripts/convert-growing-ca-tfjs.mjs";

function tensor(shape, floatVal) {
  return {
    dtype: "DT_FLOAT",
    tensorShape: {
      dim: shape.map((size) => ({ size: String(size) })),
    },
    floatVal,
  };
}

test("converts TensorFlow pointwise kernels to output-major matrices", () => {
  const channels = 4;
  const perception = channels * 3;
  const hidden = 16;
  const w1 = Array.from(
    { length: perception * hidden },
    (_, index) => index,
  );
  const w2 = Array.from(
    { length: hidden * channels },
    (_, index) => 1000 + index,
  );
  const graph = {
    modelTopology: {
      node: [
        {
          op: "Const",
          attr: {
            value: {
              tensor: tensor([1, 1, perception, hidden], w1),
            },
          },
        },
        {
          op: "Const",
          attr: {
            value: {
              tensor: tensor([hidden], new Array(hidden).fill(2)),
            },
          },
        },
        {
          op: "Const",
          attr: {
            value: {
              tensor: tensor([1, 1, hidden, channels], w2),
            },
          },
        },
        {
          op: "Const",
          attr: {
            value: {
              tensor: tensor([channels], new Array(channels).fill(3)),
            },
          },
        },
      ],
    },
  };

  const artifact = convertGraphModel(graph);

  assert.equal(artifact.channels, channels);
  assert.equal(artifact.hidden, hidden);
  assert.equal(
    artifact.weights.inputToHidden[2 * perception + 5],
    w1[5 * hidden + 2],
  );
  assert.equal(
    artifact.weights.hiddenToOutput[3 * hidden + 7],
    w2[7 * channels + 3],
  );
  assert.deepEqual(artifact.weights.hiddenBias, new Array(hidden).fill(2));
  assert.deepEqual(artifact.weights.outputBias, new Array(channels).fill(3));
});
