-- Combined RAG + canonical read-tool responses must retain both ACL checks.
BEGIN;
CREATE OR REPLACE FUNCTION public.ai_validate_chat_message_access(
  p_user_id uuid,p_message_ids uuid[]
) RETURNS TABLE(message_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT m.id FROM public.ai_messages m
  JOIN public.ai_conversations conv ON conv.id=m.conversation_id
  WHERE m.id=ANY(coalesce(p_message_ids,ARRAY[]::uuid[]))
    AND cardinality(p_message_ids)<=300 AND m.role='assistant'
    AND conv.user_id=p_user_id AND conv.deleted_at IS NULL
    AND (
      m.grounding_kind='none' OR
      (m.grounding_kind='structured' AND (
        (EXISTS(SELECT 1 FROM public.ai_message_references r WHERE r.message_id=m.id)
         AND NOT EXISTS(
           SELECT 1 FROM public.ai_message_references r WHERE r.message_id=m.id
             AND NOT public.ai_user_can_access_read_reference(
               p_user_id,r.reference_type,r.project_id,r.action_id
             )
         ))
        OR (NOT EXISTS(SELECT 1 FROM public.ai_message_references r WHERE r.message_id=m.id)
            AND m.grounding_team_id IS NOT NULL
            AND public.ai_user_can_access_chat_scope(p_user_id,m.grounding_team_id,m.grounding_project_id))
      )) OR
      (m.grounding_kind='knowledge'
        AND EXISTS(SELECT 1 FROM public.ai_message_sources s WHERE s.message_id=m.id)
        AND NOT EXISTS(
          SELECT 1 FROM public.ai_message_references r WHERE r.message_id=m.id
            AND NOT public.ai_user_can_access_read_reference(
              p_user_id,r.reference_type,r.project_id,r.action_id
            )
        )
        AND NOT EXISTS(
          SELECT 1 FROM public.ai_message_sources s
          LEFT JOIN public.ai_chunks c ON c.id=s.chunk_id
          LEFT JOIN public.ai_source_documents d ON d.id=c.source_document_id
          WHERE s.message_id=m.id AND (
            c.id IS NULL OR d.id IS NULL OR c.source_document_id<>s.source_document_id
            OR c.index_version<>s.index_version OR c.index_version<>d.active_index_version
            OR c.embedding_model<>d.active_embedding_model
            OR NOT public.ai_user_can_access_source(p_user_id,d.id)
          )
        )
      )
    )
$$;
REVOKE ALL ON FUNCTION public.ai_validate_chat_message_access(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_validate_chat_message_access(uuid,uuid[]) TO service_role;
COMMIT;
