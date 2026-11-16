import type { Browser } from 'wxt/browser';
import type { FromBackground, ToBackground } from './protocol';

export type Port = Browser.runtime.Port;

/** `port.postMessage`, with the message checked against the type the port carries. */
export const post = <Message>(port: Port, message: Message) => port.postMessage(message);

/** Opens a port to the model host, starting the host first if it is not running. */
export async function connectHost<Incoming>(name: string, onMessage: (message: Incoming) => void): Promise<Port> {
  const request: ToBackground = { type: 'ensure-host' };
  const answer: FromBackground = await browser.runtime.sendMessage(request);
  if (!answer.ok) throw new Error(answer.error);
  const port = browser.runtime.connect({ name });
  port.onMessage.addListener(onMessage);
  return port;
}
