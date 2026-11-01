'use client';

/** Detect the injected Capacitor bridge; ordinary browsers and PWAs are not native. */
type NativeCapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};
export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const bridge = (window as Window & { Capacitor?: NativeCapacitorBridge }).Capacitor;
    return bridge?.isNativePlatform?.() === true &&
      (bridge.getPlatform?.() === 'android' || bridge.getPlatform?.() === 'ios');
  } catch { return false; }
}
