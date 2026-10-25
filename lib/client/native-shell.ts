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
      getPlatform?: () => string;
      Plugins?: {
        AxiomAuth?: CapacitorAuthPlugin;
      };
    };
  }
}

export async function requestNativeGoogleSignIn(callbackUrl: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const iosHandler = window.webkit?.messageHandlers?.axiomAuth;
  if (iosHandler) {
    iosHandler.postMessage({ action: 'googleSignIn', callbackUrl });
    return true;
  }

  const capacitor = window.Capacitor;
  const androidAuth = capacitor?.getPlatform?.() === 'android'
    ? capacitor.Plugins?.AxiomAuth
    : undefined;
  if (!androidAuth) return false;
  await androidAuth.startGoogleSignIn({ callbackUrl });
  return true;
}
