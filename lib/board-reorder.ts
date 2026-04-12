import type { DropResult } from '@hello-pangea/dnd';
import type { Task, TaskStatus } from '@/lib/types';
import { resolveTaskBoardColumnId, type ProjectColumnConfig } from '@/lib/types';

/** Order tasks the same way the board renders a column (for DnD index ↔ data consistency). */
export function orderedColumnTasks(
  tasks: Task[],
  columnId: string,
  boardColumns: ProjectColumnConfig[]
): Task[] {
  return tasks
    .filter((t) => resolveTaskBoardColumnId(t.status, boardColumns) === columnId)
    .sort((a, b) => {
      const d = a.boardPosition - b.boardPosition;
      if (d !== 0) return d;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
}

/**
 * Computes minimal task patches after a board drop. Returns null if nothing to persist.
 */
export function computeBoardDropPatches(
  tasks: Task[],
  boardColumns: ProjectColumnConfig[],
  result: DropResult
): { id: string; changes: Partial<Task> }[] | null {
  const { destination, source, draggableId } = result;
  if (!destination) return null;
  if (destination.droppableId === source.droppableId && destination.index === source.index) {
    return null;
  }

  const sourceCol = source.droppableId;
  const destCol = destination.droppableId;
  const sourceOrdered = orderedColumnTasks(tasks, sourceCol, boardColumns);
  const destOrdered = orderedColumnTasks(tasks, destCol, boardColumns);

  const dragged = sourceOrdered.find((t) => t.id === draggableId);
  if (!dragged) return null;

  const patches: { id: string; changes: Partial<Task> }[] = [];

  if (sourceCol === destCol) {
    const without = sourceOrdered.filter((t) => t.id !== draggableId);
    const reordered = [...without];
    reordered.splice(destination.index, 0, dragged);
    reordered.forEach((t, i) => {
      if (t.boardPosition !== i) {
        patches.push({ id: t.id, changes: { boardPosition: i } });
      }
    });
    return patches.length ? patches : null;
  }

  const newSource = sourceOrdered.filter((t) => t.id !== draggableId);
  const newDest = destOrdered.filter((t) => t.id !== draggableId);
  newDest.splice(destination.index, 0, dragged);

  newSource.forEach((t, i) => {
    if (t.boardPosition !== i) {
      patches.push({ id: t.id, changes: { boardPosition: i } });
    }
  });

  newDest.forEach((t, i) => {
    const statusChanged = t.id === draggableId && t.status !== destCol;
    if (t.boardPosition !== i || statusChanged) {
      const changes: Partial<Task> = { boardPosition: i };
      if (statusChanged) {
        changes.status = destCol as TaskStatus;
      }
      patches.push({ id: t.id, changes });
    }
  });

  return patches.length ? patches : null;
}
