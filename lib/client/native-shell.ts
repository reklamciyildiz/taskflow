'use client';

type NativeMessageHandler = {
  postMessage(message: unknown): void;
};

type CapacitorAuthPlugin = {
  startGoogleSignIn(input: { callbackUrl: string }): Promise<void>;
};

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: Record<string, NativeMessageHandler | undefined>;
    };
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: {
        AxiomAuth?: CapacitorAuthPlugin;
        ActiprocAuth?: CapacitorAuthPlugin;
      };
    };
  }
}

export async function requestNativeGoogleSignIn(callbackUrl: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const iosHandler = window.webkit?.messageHandlers?.axiomAuth || window.webkit?.messageHandlers?.actiprocAuth;
  if (iosHandler) {
    iosHandler.postMessage({ action: 'googleSignIn', callbackUrl });
    return true;
  }

  const capacitor = window.Capacitor;
  const isAndroid = capacitor?.getPlatform?.() === 'android';
  if (isAndroid) {
    const androidAuth = capacitor.Plugins?.ActiprocAuth ?? capacitor.Plugins?.AxiomAuth;
    if (!androidAuth) {
      throw new Error('Capacitor native auth bridge is unavailable. Please restart the app.');
    }
    await androidAuth.startGoogleSignIn({ callbackUrl });
    return true;
  }

  return false;
}
