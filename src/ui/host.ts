import {
  CONTROL_PORT,
  type Control,
  type FromBackground,
  type HostState,
  type StateMessage,
  type ToBackground,
} from '@/src/protocol';

/**
 * Connects a page of the extension to the model host, starting the host if it is not
 * running. `onState` gets the host's state now and after each change; the returned
 * function sends the host a command.
 */
export async function connectHost(onState: (state: HostState) => void): Promise<(message: Control) => void> {
  const request: ToBackground = { type: 'ensure-host' };
  const answer: FromBackground = await browser.runtime.sendMessage(request);
  if (!answer.ok) throw new Error(answer.error);
  const port = browser.runtime.connect({ name: CONTROL_PORT });
  port.onMessage.addListener((message: StateMessage) => onState(message.state));
  return (message) => port.postMessage(message);
}
