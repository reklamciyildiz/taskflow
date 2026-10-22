import { useMemo } from 'react';

function navigate(path: string) {
  window.dispatchEvent(new CustomEvent('axiom-mobile:navigate', { detail: { path } }));
}

export function useRouter() {
  return useMemo(() => ({
    push: navigate,
    replace: navigate,
    back: () => window.dispatchEvent(new CustomEvent('axiom-mobile:back', { cancelable: true })),
    refresh: () => window.dispatchEvent(new CustomEvent('axiom-mobile:refresh')),
    prefetch: async () => undefined,
    forward: () => undefined,
  }), []);
}

export function usePathname() { return window.location.pathname || '/'; }
export function useSearchParams() { return new URLSearchParams(window.location.search); }
export function redirect(path: string): never { navigate(path); throw new Error(`Redirected to ${path}`); }
