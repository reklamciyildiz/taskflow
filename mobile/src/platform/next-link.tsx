import type { AnchorHTMLAttributes, ReactNode } from 'react';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  children: ReactNode;
};

function hrefValue(href: LinkProps['href']) {
  if (typeof href === 'string') return href;
  const pathname = href.pathname ?? '/';
  const query = new URLSearchParams(href.query ?? {}).toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function Link({ href, onClick, children, ...props }: LinkProps) {
  const target = hrefValue(href);
  return (
    <a
      {...props}
      href={target}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('axiom-mobile:navigate', { detail: { path: target } }));
      }}
    >
      {children}
    </a>
  );
}
