import { connectHost, post } from '@/src/ports';
import type { Verdict } from '@/src/power';
import { CONTROL_PORT, type Control, type HostState, type StateMessage, type VerdictMessage } from '@/src/protocol';

/**
 * Connects a page of the extension to the model host. `onState` gets the host's state now
 * and after each change, and an error state if the host does not start; `onVerdict` gets
 * whether texts may be scored the same way. The returned function sends the host a command.
 */
export function controlHost(
  onState: (state: HostState) => void,
  onVerdict: (verdict: Verdict) => void = () => undefined,
): (command: Control) => void {
  const onMessage = (message: StateMessage | VerdictMessage) =>
    message.type === 'state' ? onState(message.state) : onVerdict(message.verdict);
  const port = connectHost(CONTROL_PORT, onMessage).catch((error) => {
    onState({ phase: 'error', message: `the model host did not start: ${error}` });
    return null;
  });
  return (command) => void port.then((open) => open && post<Control>(open, command));
}
