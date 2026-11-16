/** Messages between the content scripts, the extension's pages, the model host and its worker. */

export interface Bands {
  /** Where the training target's human band ends. Not shown: human texts often score above it. */
  human_max: number;
  /** At or above this, flag the text as not human (1% false positives). Below it the badge says Human. */
  flag_min: number;
  /** At or above this the text counts as AI-generated and the badge says AI. */
  generated_min: number;
}

/** Where the model runs: the GPU through WebGPU, or the CPU through WebAssembly. */
export type Backend = 'webgpu' | 'wasm';

/** One text block of a page. The id is the sender's and comes back with the score. */
export interface Item {
  id: number;
  text: string;
}

export interface Scored {
  id: number;
  /** Tokens in the whole text, special tokens not counted. */
  tokens: number;
  /** Null when the text is under the model's minimum and the model was not run. */
  score: number | null;
}

/** What the host is doing, as the popup shows it and the content scripts act on it. */
export type HostState =
  /** The user has not agreed to the model download yet. */
  | { phase: 'no-model' }
  /** The model files are being downloaded, or read back from the cache. */
  | { phase: 'loading'; loaded: number; total: number; cached: boolean }
  | { phase: 'preparing' }
  | { phase: 'ready'; bands: Bands; backend: Backend; threads: number }
  | { phase: 'error'; message: string };

/**
 * Texts to score, from a content script to the host and from the host to its worker. A
 * cancelled text that has not run yet is dropped without an answer.
 */
export type ScoreRequest = { type: 'score'; items: Item[] } | { type: 'cancel'; ids: number[] };
export type ResultsMessage = { type: 'results'; results: Scored[] };
export type StateMessage = { type: 'state'; state: HostState };

/** Worker to host. A log message is one line of the worker's trace, for the log page. */
export type FromWorker = StateMessage | ResultsMessage | { type: 'log'; line: string };

/** Any extension context to the background service worker: start the host if it is not running. */
export type ToBackground = { type: 'ensure-host' };
export type FromBackground = { ok: true } | { ok: false; error: string };

/** The port a content script opens to the host: it sends a `ScoreRequest`. */
export const SCORE_PORT = 'score';
export type FromHost = ResultsMessage | StateMessage;

/** The port the popup and the options page open to the host: they get its state and can start the download. */
export const CONTROL_PORT = 'control';
export type Control = { type: 'download' } | { type: 'delete-model' };

/** The port the log page opens to the host: everything logged so far on connect, then each new line. */
export const LOG_PORT = 'log';
export type LogLines = { type: 'lines'; lines: string[] };
