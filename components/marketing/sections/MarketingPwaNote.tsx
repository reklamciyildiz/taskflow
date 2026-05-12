'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Smartphone, Download, Loader2 } from 'lucide-react';
import { MarketingReveal } from '../primitives/MarketingReveal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ensureServiceWorkerReady } from '@/components/push/push-client';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function MarketingPwaNote() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [installReady, setInstallReady] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructionsStandalone, setInstructionsStandalone] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setInstallReady(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  const openInstallInstructions = useCallback((standalone: boolean) => {
    setInstructionsStandalone(standalone);
    setInstructionsOpen(true);
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (isStandaloneDisplay()) {
      openInstallInstructions(true);
      return;
    }

    void ensureServiceWorkerReady();

    const promptEvent = deferredPrompt.current;
    if (promptEvent) {
      setInstallBusy(true);
      try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } catch {
        openInstallInstructions(false);
      } finally {
        deferredPrompt.current = null;
        setInstallReady(false);
        setInstallBusy(false);
      }
      return;
    }

    openInstallInstructions(false);
  }, [openInstallInstructions]);

  return (
    <section
      className="border-t border-white/[0.04] bg-[#050505] px-4 py-16 sm:px-6"
      aria-labelledby="marketing-pwa-heading"
    >
      <MarketingReveal className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/25 p-6 ring-1 ring-white/[0.04]">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-zinc-950/80 text-emerald-400 shadow-inner">
                <Smartphone className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p
                  id="marketing-pwa-heading"
                  className="text-sm font-semibold tracking-tight text-zinc-100"
                >
                  PWA & portability
                </p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                  Installable on any device for a native-like experience — lightweight, fast, and always
                  within reach.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleInstallClick}
              disabled={installBusy}
              aria-busy={installBusy}
              aria-haspopup="dialog"
              aria-expanded={instructionsOpen}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-200 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505] disabled:pointer-events-none disabled:opacity-60"
            >
              {installBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              {installReady ? 'Install app' : 'How to install'}
            </button>
          </div>
        </div>
      </MarketingReveal>

      <Dialog
        open={instructionsOpen}
        onOpenChange={(open) => {
          setInstructionsOpen(open);
          if (!open) setInstructionsStandalone(false);
        }}
      >
        <DialogContent className="max-w-md border-white/[0.08] bg-zinc-950 text-zinc-50 shadow-xl ring-1 ring-white/[0.06] sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg text-zinc-50">
              {instructionsStandalone ? 'Already installed' : 'Install Axiom'}
            </DialogTitle>
            <DialogDescription className="text-left text-sm text-zinc-400">
              {instructionsStandalone ? (
                <>
                  This window is already running as an installed or standalone experience. Use your
                  home screen or app launcher to open Axiom next time.
                </>
              ) : (
                <>
                  Progressive Web Apps install from the browser. Use the steps for your device if no install
                  prompt appeared (common on Safari and some desktop browsers).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {!instructionsStandalone && (
            <>
              <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-zinc-300">
                <li>
                  <span className="font-medium text-zinc-200">Chrome / Edge (desktop):</span> look for the
                  install icon in the address bar, or open the menu (⋮) → <em>Install Axiom…</em> /{' '}
                  <em>Apps</em> → <em>Install this site as an app</em>.
                </li>
                <li>
                  <span className="font-medium text-zinc-200">Android (Chrome):</span> menu (⋮) →{' '}
                  <em>Add to Home screen</em> or <em>Install app</em>.
                </li>
                <li>
                  <span className="font-medium text-zinc-200">iPhone / iPad (Safari):</span> Share button →{' '}
                  <em>Add to Home Screen</em>.
                </li>
              </ul>
              <p className="text-xs leading-relaxed text-zinc-500">
                Install requires a secure origin (HTTPS in production). You are already using the same app in
                the browser; installing pins it for quicker access and a more app-like window.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
