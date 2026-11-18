import type { Power } from '@/src/power';

/** The native messaging host that reads the power source in Firefox: `native/` in the repo. */
export const POWER_HELPER = 'slop_detect_power';

/** What the power helper sends, once at its start and after each change. */
interface HelperMessage {
  mains: boolean;
}

/** The Battery Status API, which TypeScript's DOM library no longer declares. */
interface BatteryManager extends EventTarget {
  charging: boolean;
}

/**
 * Calls back with this computer's power source now and after each change: through the
 * power helper in Firefox, whose extension pages have no Battery Status API, and through
 * that API elsewhere.
 */
export function watchPower(onChange: (power: Power) => void): void {
  if (import.meta.env.FIREFOX) watchHelper(onChange);
  else void watchBattery(onChange);
}

function watchHelper(onChange: (power: Power) => void): void {
  const helper = browser.runtime.connectNative(POWER_HELPER);
  helper.onMessage.addListener((message: HelperMessage) => onChange(message.mains ? 'mains' : 'battery'));
  // Also where the helper is not installed.
  helper.onDisconnect.addListener(() => onChange('unknown'));
}

async function watchBattery(onChange: (power: Power) => void): Promise<void> {
  const getBattery = (navigator as { getBattery?: () => Promise<BatteryManager> }).getBattery;
  const battery = await getBattery?.call(navigator).catch(() => undefined);
  if (!battery) return onChange('unknown');
  const report = () => onChange(battery.charging ? 'mains' : 'battery');
  battery.addEventListener('chargingchange', report);
  report();
}
