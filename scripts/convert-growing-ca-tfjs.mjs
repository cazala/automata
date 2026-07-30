#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

async function main([inputPath, outputPath]) {
  if (!inputPath || !outputPath) {
    console.error(
      "Usage: node scripts/convert-growing-ca-tfjs.mjs <08000.json> <artifact.json>",
    );
    process.exitCode = 1;
    return;
  }
  const graphModel = JSON.parse(await readFile(inputPath, "utf8"));
  const artifact = convertGraphModel(graphModel);
  await writeFile(outputPath, `${JSON.stringify(artifact)}\n`);
  console.log(
    `Converted ${artifact.channels} channels, ${artifact.hidden} hidden units, ` +
      `${artifact.weights.inputToHidden.length + artifact.weights.hiddenBias.length +
        artifact.weights.hiddenToOutput.length + artifact.weights.outputBias.length} weights`,
  );
}

function tensorShape(tensor) {
  return (tensor.tensorShape?.dim ?? []).map(({ size }) => Number(size));
}

function tensorValues(tensor) {
  if (tensor.dtype !== "DT_FLOAT") {
    throw new TypeError(`Expected DT_FLOAT tensor, received ${tensor.dtype}`);
  }
  if (tensor.tensorContent) {
    const bytes = Buffer.from(tensor.tensorContent, "base64");
    if (bytes.byteLength % 4 !== 0) {
      throw new RangeError("Float tensor byte length is not divisible by four");
    }
    const values = new Array(bytes.byteLength / 4);
    for (let index = 0; index < values.length; index++) {
      values[index] = bytes.readFloatLE(index * 4);
    }
    return values;
  }
  return Array.from(tensor.floatVal ?? []);
}

function convertGraphModel(graphModel) {
  const nodes = graphModel?.modelTopology?.node;
  if (!Array.isArray(nodes)) {
    throw new TypeError("Expected a TensorFlow.js graph-model topology");
  }
  const tensors = nodes
    .filter((node) => node.op === "Const")
    .map((node) => node.attr?.value?.tensor)
    .filter((tensor) => tensor?.dtype === "DT_FLOAT")
    .map((tensor) => ({ shape: tensorShape(tensor), values: tensorValues(tensor) }));

  const w1 = tensors.find(({ shape }) =>
    shape.length === 4 &&
    shape[0] === 1 &&
    shape[1] === 1 &&
    shape[2] % 3 === 0 &&
    shape[3] > shape[2]
  );
  if (!w1) throw new TypeError("Could not find the 1x1 input-to-hidden kernel");
  const perception = w1.shape[2];
  const hidden = w1.shape[3];
  const channels = perception / 3;
  const w2 = tensors.find(({ shape }) =>
    shape.length === 4 &&
    shape[0] === 1 &&
    shape[1] === 1 &&
    shape[2] === hidden &&
    shape[3] === channels
  );
  const biases = tensors.filter(({ shape }) => shape.length === 1);
  const b1 = biases.find(({ shape }) => shape[0] === hidden);
  const b2 = biases.find(({ shape }) => shape[0] === channels);
  if (!w2 || !b1 || !b2) {
    throw new TypeError("Could not find all Growing-NCA pointwise weights");
  }

  const inputToHidden = new Array(hidden * perception);
  for (let h = 0; h < hidden; h++) {
    for (let input = 0; input < perception; input++) {
      inputToHidden[h * perception + input] =
        w1.values[input * hidden + h];
    }
  }
  const hiddenToOutput = new Array(channels * hidden);
  for (let channel = 0; channel < channels; channel++) {
    for (let h = 0; h < hidden; h++) {
      hiddenToOutput[channel * hidden + h] =
        w2.values[h * channels + channel];
    }
  }

  return {
    format: "@cazala/automata/growing-neural-ca",
    version: 1,
    channels,
    hidden,
    perception: ["identity", "sobel-x", "sobel-y"],
    activation: "relu",
    fireRate: 0.5,
    stepSize: 1,
    boundary: "zero",
    life: {
      channel: 3,
      threshold: 0.1,
      neighborhood: 3,
      preAndPost: true,
    },
    weights: {
      inputToHidden,
      hiddenBias: b1.values,
      hiddenToOutput,
      outputBias: b2.values,
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main(process.argv.slice(2));
}

export { convertGraphModel, main };
