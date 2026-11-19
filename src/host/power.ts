import type { Power } from '@/src/power';

/** The Battery Status API, which TypeScript's DOM library no longer declares. */
interface BatteryManager extends EventTarget {
  charging: boolean;
}

/**
 * Calls back with this computer's power source now and after each change, from the
 * Battery Status API; `unknown` once where the browser has none, as in Firefox.
 */
export async function watchPower(onChange: (power: Power) => void): Promise<void> {
  const getBattery = (navigator as { getBattery?: () => Promise<BatteryManager> }).getBattery;
  const battery = await getBattery?.call(navigator).catch(() => undefined);
  if (!battery) return onChange('unknown');
  const report = () => onChange(battery.charging ? 'mains' : 'battery');
  battery.addEventListener('chargingchange', report);
  report();
}
