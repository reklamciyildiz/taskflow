'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

type DemoQuickCaptureProps = {
  onCapture: (title: string) => void;
  disabled?: boolean;
};

export function DemoQuickCapture({ onCapture, disabled }: DemoQuickCaptureProps) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);

  const submit = () => {
    const title = value.trim().slice(0, 120);
    if (!title || disabled) return;
    onCapture(title);
    setValue('');
  };

  return (
    <motion.div
      layout
      animate={{
        scale: focused ? 1.02 : 1,
        boxShadow: focused
          ? '0 0 0 1px rgba(16, 185, 129, 0.25), 0 20px 50px -12px rgba(0, 0, 0, 0.65)'
          : '0 0 0 1px rgba(255,255,255,0.06), 0 12px 40px -16px rgba(0, 0, 0, 0.5)',
      }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={cn(
        'group mx-auto max-w-2xl rounded-2xl border border-white/[0.08] bg-zinc-900/40 px-4 py-3',
        'backdrop-blur-xl supports-[backdrop-filter]:backdrop-blur-xl',
        'ring-1 ring-white/[0.04]'
      )}
    >
      <div className="flex items-center gap-3">
        <StickyNote
          className={cn(
            'h-5 w-5 shrink-0 transition-colors',
            focused ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-400'
          )}
          aria-hidden
        />
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Capture a thought… Enter to materialize (local demo)"
          maxLength={160}
          className="h-12 w-full border-0 bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500/70"
          aria-label="Demo quick capture"
        />
      </div>
    </motion.div>
  );
}
