import { connectHost } from '@/src/ports';
import { LOG_PORT, type LogLines } from '@/src/protocol';

/** Shows what the model host has logged, and follows it. */

const output = document.querySelector<HTMLPreElement>('#log')!;

function append({ lines }: LogLines): void {
  const atEnd = window.innerHeight + window.scrollY >= document.body.scrollHeight - 4;
  output.append(...lines.map((line) => `${line}\n`));
  if (atEnd) window.scrollTo(0, document.body.scrollHeight);
}

connectHost(LOG_PORT, append).then(
  (port) => port.onDisconnect.addListener(() => output.append('The model host closed.\n')),
  (error) => (output.textContent = `The model host did not start: ${error}`),
);
