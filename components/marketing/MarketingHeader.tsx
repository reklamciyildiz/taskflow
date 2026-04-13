import Link from 'next/link';
import Image from 'next/image';
import { LayoutDashboard } from 'lucide-react';

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#050505]/85 backdrop-blur-xl supports-[backdrop-filter]:backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/marketing"
          className="group flex items-center gap-3 font-semibold tracking-tight text-zinc-100"
        >
          <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-[0_0_20px_-6px_rgba(16,185,129,0.35)] transition-shadow group-hover:border-emerald-500/30 group-hover:shadow-[0_0_28px_-4px_rgba(16,185,129,0.45)]">
            <Image
              src="/icon-192x192.png"
              alt="TaskFlow"
              width={36}
              height={36}
              sizes="36px"
              className="object-cover"
              priority
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <LayoutDashboard className="h-4 w-4 text-emerald-400" aria-hidden />
            </span>
          </span>
          <span className="text-lg tracking-tight">TaskFlow</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/marketing#features"
            className="hidden rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100 sm:inline-block"
          >
            Features
          </Link>
          <Link
            href="/auth/signin"
            className="rounded-md px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-[0_0_24px_-6px_rgba(16,185,129,0.55)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
