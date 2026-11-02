'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PlannerProjectionItem } from '@/lib/planner-projection';
import {
  isValidPlannerMove, plannerDragSupported, snapPlannerTime, type PlannerDropTarget,
} from '@/lib/planner-drag-reschedule';

type DragSession = {
  pointerId: number;
  item: PlannerProjectionItem;
  startX: number;
  startY: number;
  offsetMinutes: number;
  moved: boolean;
  original: PlannerDropTarget;
};

export function usePlannerTimeDrag(
  today: string,
  pxPerHour: number,
  onMove: (item: PlannerProjectionItem, target: PlannerDropTarget) => void,
) {
  const [preview, setPreview] = useState<{ itemId: string; target: PlannerDropTarget } | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const targetRef = useRef<PlannerDropTarget | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const preventClickRef = useRef<string | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const reset = useCallback(() => {
    sessionRef.current = null;
    targetRef.current = null;
    setPreview(null);
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);
  useEffect(() => () => {
    cleanupRef.current?.();
  }, []);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>, item: PlannerProjectionItem) => {
    if (event.button !== 0 || !plannerDragSupported(item.isRecurring, item.scheduleTime)) return;
    cleanupRef.current?.();
    const rect = event.currentTarget.getBoundingClientRect();
    sessionRef.current = {
      pointerId: event.pointerId,
      item,
      startX: event.clientX,
      startY: event.clientY,
      offsetMinutes: Math.max(0, Math.min(item.durationMinutes ?? 30, ((event.clientY - rect.top) / pxPerHour) * 60)),
      moved: false,
      original: { date: item.effectiveDate, time: item.scheduleTime!.slice(0, 5) },
    };
    const move = (native: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || native.pointerId !== session.pointerId) return;
      if (!session.moved && Math.hypot(native.clientX - session.startX, native.clientY - session.startY) < 9) return;
      session.moved = true;
      // Locate the day/week column beneath the pointer, even while it crosses an event block.
      const grid = document.elementFromPoint(native.clientX, native.clientY)
        ?.closest<HTMLElement>('[data-planner-grid-date]');
      const date = grid?.dataset.plannerGridDate ?? '';
      const rect = grid?.getBoundingClientRect();
      const time = rect ? snapPlannerTime(native.clientY, rect.top, pxPerHour,
        session.offsetMinutes, session.item.durationMinutes ?? 30) : '';
      const next = date && time ? { date, time } : null;
      const valid = isValidPlannerMove(next, today, session.original);
      targetRef.current = valid ? next : null;
      setPreview(valid ? { itemId: session.item.id, target: next! } : null);
    };
    const end = (native: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || native.pointerId !== session.pointerId) return;
      const target = targetRef.current;
      const moved = session.moved;
      reset();
      if (moved) {
        preventClickRef.current = session.item.id;
        // Prevent touch/pointer-derived click after an intentional drag.
        window.setTimeout(() => { if (preventClickRef.current === session.item.id) preventClickRef.current = null; }, 400);
        if (target) onMoveRef.current(session.item, target);
      }
    };
    const cancel = (native: PointerEvent) => {
      if (sessionRef.current?.pointerId === native.pointerId) reset();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    cleanupRef.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [pxPerHour, reset, today]);

  const click = useCallback((item: PlannerProjectionItem, onEdit: (item: PlannerProjectionItem) => void) => {
    if (preventClickRef.current === item.id) {
      preventClickRef.current = null;
      return;
    }
    onEdit(item);
  }, []);

  return { preview, startDrag, click };
}
