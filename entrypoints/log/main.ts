import { LOG_PORT, type FromBackground, type LogLines, type ToBackground } from '@/src/protocol';

/** Shows what the model host has logged, and follows it. */

const output = document.querySelector<HTMLPreElement>('#log')!;

async function follow(): Promise<void> {
  const request: ToBackground = { type: 'ensure-host' };
  const answer: FromBackground = await browser.runtime.sendMessage(request);
  if (!answer.ok) {
    output.textContent = `The model host did not start: ${answer.error}`;
    return;
  }
  const port = browser.runtime.connect({ name: LOG_PORT });
  port.onMessage.addListener((message: LogLines) => {
    const atEnd = window.innerHeight + window.scrollY >= document.body.scrollHeight - 4;
    output.append(...message.lines.map((line) => `${line}\n`));
    if (atEnd) window.scrollTo(0, document.body.scrollHeight);
  });
  port.onDisconnect.addListener(() => output.append('The model host closed.\n'));
}

void follow();
