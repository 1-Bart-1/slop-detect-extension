import { connectHost, post } from '@/src/ports';
import { CONTROL_PORT, type Control, type HostState, type StateMessage } from '@/src/protocol';

/**
 * Connects a page of the extension to the model host. `onState` gets the host's state now
 * and after each change, and an error state if the host does not start; the returned
 * function sends the host a command.
 */
export function controlHost(onState: (state: HostState) => void): (command: Control) => void {
  const port = connectHost<StateMessage>(CONTROL_PORT, (message) => onState(message.state)).catch((error) => {
    onState({ phase: 'error', message: `the model host did not start: ${error}` });
    return null;
  });
  return (command) => void port.then((open) => open && post<Control>(open, command));
}
