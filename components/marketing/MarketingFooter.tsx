import Link from 'next/link';

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#050505] px-4 py-12 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 sm:flex-row">
        <p className="text-sm text-zinc-500">
          © {new Date().getFullYear()} TaskFlow.{' '}
          <span className="text-zinc-400">From chaos to clarity.</span>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
          <Link href="/auth/signin" className="text-zinc-500 transition-colors hover:text-zinc-200">
            Sign in
          </Link>
          <Link href="/auth/signup" className="text-zinc-500 transition-colors hover:text-emerald-400/90">
            Create account
          </Link>
          <Link href="/marketing#features" className="text-zinc-500 transition-colors hover:text-zinc-200">
            Features
          </Link>
        </div>
      </div>
    </footer>
  );
}
