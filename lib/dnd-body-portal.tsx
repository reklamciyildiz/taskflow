'use client';

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * While dragging, mounts the row on `document.body` so @hello-pangea/dnd’s fixed-position
 * drag layer is not offset by a transformed ancestor (Radix Dialog translate centering,
 * Framer Motion layout, etc.).
 */
export function portalDndRowToBody(node: ReactNode, isDragging: boolean): ReactNode {
  if (!isDragging) return node;
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
