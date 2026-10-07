'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { noteApi } from '@/lib/api';
import { KNOWLEDGE_SOURCES_CHANGED_EVENT } from '@/lib/knowledge-events';
import {
  buildKnowledgeRetrieval,
  knowledgeMapsFromContext,
} from '@/lib/knowledge-retrieval';
import type { Note, Project, Task, Team } from '@/lib/types';

interface UseKnowledgeRetrievalInput {
  tasks: Task[];
  projects: Project[];
  teams: Team[];
  teamId: string | null;
}

export function useKnowledgeRetrieval({
  tasks,
  projects,
  teams,
  teamId,
}: UseKnowledgeRetrievalInput) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(Boolean(teamId));
  const [notesError, setNotesError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadNotes = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!teamId) {
      setNotes([]);
      setNotesLoading(false);
      setNotesError(null);
      return;
    }

    setNotesLoading(true);
    setNotesError(null);
    const result = await noteApi.getForKnowledge(teamId);
    if (requestId !== requestRef.current) return;
    if (!result.success || !result.data) {
      setNotes([]);
      setNotesError(result.error || 'Could not load notes.');
      setNotesLoading(false);
      return;
    }
    setNotes(result.data);
    setNotesLoading(false);
  }, [teamId]);

  useEffect(() => {
    void loadNotes();
    return () => {
      requestRef.current += 1;
    };
  }, [loadNotes]);

  useEffect(() => {
    if (!teamId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onSourcesChanged = (event: Event) => {
      const changedTeamId = (event as CustomEvent<{ teamId?: string | null }>).detail?.teamId;
      if (changedTeamId && changedTeamId !== teamId) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadNotes(), 600);
    };
    window.addEventListener(KNOWLEDGE_SOURCES_CHANGED_EVENT, onSourcesChanged);
    return () => {
      window.removeEventListener(KNOWLEDGE_SOURCES_CHANGED_EVENT, onSourcesChanged);
      if (timer) clearTimeout(timer);
    };
  }, [loadNotes, teamId]);

  const maps = useMemo(
    () => knowledgeMapsFromContext(projects, teams),
    [projects, teams],
  );
  const retrieval = useMemo(
    () => buildKnowledgeRetrieval(tasks, notes, maps),
    [maps, notes, tasks],
  );

  return {
    ...retrieval,
    notesLoading,
    notesError,
    retryNotes: loadNotes,
  };
}
