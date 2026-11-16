/// <reference lib="webworker" />
import type { FromWorker } from '@/src/protocol';

/** The worker's trace: every loading and scoring step, sent to the host for the log page. */

const t0 = performance.now();
const seconds = () => `${((performance.now() - t0) / 1000).toFixed(2)}s`;

function printable(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** The colour codes ONNX Runtime wraps its warnings in. */
const COLOURS = /\x1b\[[0-9;]*m/g;

function trace(args: unknown[]): void {
  const text = args.map(printable).join(' ').replace(COLOURS, '');
  const message: FromWorker = { type: 'log', line: `${seconds()} ${text}` };
  self.postMessage(message);
}

const consoleLog = console.log.bind(console);

/** One trace line, with seconds since the worker started. */
export function log(...args: unknown[]): void {
  consoleLog(`[slop ${seconds()}]`, ...args);
  trace(args);
}

export const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

// ONNX Runtime reports its own progress and errors on the console: trace those too.
for (const level of ['log', 'info', 'warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    original(...args);
    trace([`console.${level}:`, ...args]);
  };
}

self.addEventListener('error', (event) =>
  trace(['uncaught error:', event.message, `at ${event.filename}:${event.lineno}`]),
);
self.addEventListener('unhandledrejection', (event) => trace(['unhandled rejection:', event.reason]));
