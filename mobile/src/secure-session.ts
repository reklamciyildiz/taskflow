import { Capacitor, registerPlugin } from '@capacitor/core';

type SecureKey = 'refreshToken' | 'deviceId' | 'oauthVerifier' | 'oauthState';
interface SecureSessionPlugin {
  set(input: { key: SecureKey; value: string }): Promise<void>;
  get(input: { key: SecureKey }): Promise<{ value: string | null }>;
  remove(input: { key: SecureKey }): Promise<void>;
}

const NativeSecureSession = registerPlugin<SecureSessionPlugin>('SecureSession');
const volatileFallback = new Map<SecureKey, string>();

export const secureSession = {
  async set(key: SecureKey, value: string) {
    if (Capacitor.getPlatform() === 'android') return NativeSecureSession.set({ key, value });
    // Browser preview intentionally remains memory-only. iOS will use the matching Keychain plugin.
    volatileFallback.set(key, value);
  },
  async get(key: SecureKey) {
    if (Capacitor.getPlatform() === 'android') return (await NativeSecureSession.get({ key })).value;
    return volatileFallback.get(key) ?? null;
  },
  async remove(key: SecureKey) {
    if (Capacitor.getPlatform() === 'android') return NativeSecureSession.remove({ key });
    volatileFallback.delete(key);
  },
};
