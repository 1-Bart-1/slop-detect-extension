import { type Port, post } from '@/src/ports';
import type { LogLines } from '@/src/protocol';

/** The log the user reads on the log page. Kept in memory: lost when the host closes. */

const MAX_LINES = 2000;

const lines: string[] = [];
const readers = new Set<Port>();

export function note(line: string): void {
  const stamped = `${new Date().toLocaleTimeString('en-GB')} ${line}`;
  lines.push(stamped);
  if (lines.length > MAX_LINES) lines.shift();
  for (const reader of readers) post<LogLines>(reader, { type: 'lines', lines: [stamped] });
}

/** Sends a log page everything logged so far, and then each new line until it closes. */
export function follow(port: Port): void {
  readers.add(port);
  port.onDisconnect.addListener(() => readers.delete(port));
  post<LogLines>(port, { type: 'lines', lines });
}
