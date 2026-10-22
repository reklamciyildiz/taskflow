'use client';

type NativeMessageHandler = {
  postMessage(message: unknown): void;
};

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: Record<string, NativeMessageHandler | undefined>;
    };
  }
}

export function requestNativeGoogleSignIn(callbackUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  const handler = window.webkit?.messageHandlers?.axiomAuth;
  if (!handler) return false;
  handler.postMessage({ action: 'googleSignIn', callbackUrl });
  return true;
}
