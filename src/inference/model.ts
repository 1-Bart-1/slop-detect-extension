/** Where the model's files are, on the network and in the Cache API. */

/** The exported model directory. VITE_REPO points a build at a local export. */
export const REPO: string =
  import.meta.env.VITE_REPO ?? 'https://huggingface.co/VoightKampffLabs/voi-slop-detect-380M/resolve/main';
/** The directory of the graph and its weights, inside the model directory. */
export const GRAPH_DIR = 'onnx';
export const GRAPH_NAME = 'model_quantized.onnx';
/**
 * The name the graph file gives its weights file, which sits next to it. The model is two
 * files because the runtime parses a one-file model inside WebAssembly memory: 1 GB that
 * is never returned (RFC 015 F5). Weights passed as external data go to the GPU without
 * that copy.
 */
export const WEIGHTS_NAME = 'model_quantized.onnx_data';
/** Size of the weights file, used when the response carries no Content-Length. */
export const WEIGHTS_BYTES = 448_471_040;
/** Named after the export, so a new export does not read the files of an old one. */
export const CACHE_NAME = 'voi-slop-detect-380M-q8-opset23-batch';
