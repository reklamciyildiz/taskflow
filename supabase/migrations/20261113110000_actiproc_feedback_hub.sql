-- Actiproc community feedback v1. Apply to staging and validate before Production.
-- Additive only: no pre-existing tables or rows are modified.
BEGIN;

CREATE TABLE IF NOT EXISTS public.feedback_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  title varchar(140) NOT NULL CHECK (length(btrim(title)) BETWEEN 8 AND 140),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 20 AND 4000),
  category text NOT NULL CHECK (category IN ('feature','improvement','integration')),
  area text NOT NULL DEFAULT 'general' CHECK (area IN ('general','process','notes','planner','ai','mobile','billing','collaboration')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','planned','building','shipped','declined')),
  moderation text NOT NULL DEFAULT 'pending' CHECK (moderation IN ('pending','approved','rejected')),
  merged_into_id uuid REFERENCES public.feedback_posts(id) ON DELETE SET NULL,
  vote_count integer NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  comment_count integer NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);
CREATE INDEX IF NOT EXISTS feedback_posts_live_idx ON public.feedback_posts(moderation, status, created_at DESC) WHERE merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS feedback_posts_author_idx ON public.feedback_posts(author_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.feedback_votes (
  post_id uuid NOT NULL REFERENCES public.feedback_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id,user_id)
);
CREATE INDEX IF NOT EXISTS feedback_votes_user_idx ON public.feedback_votes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.feedback_posts(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 2 AND 1200),
  moderation text NOT NULL DEFAULT 'pending' CHECK (moderation IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_comments_post_idx ON public.feedback_comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS feedback_comments_pending_idx ON public.feedback_comments(created_at) WHERE moderation='pending';

CREATE TABLE IF NOT EXISTS public.feedback_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.feedback_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false,
  UNIQUE(post_id,user_id,status)
);
CREATE INDEX IF NOT EXISTS feedback_updates_user_idx ON public.feedback_updates(user_id, is_read, created_at DESC);

-- Service-role-only tables: no RLS policy grants access to untrusted clients.
ALTER TABLE public.feedback_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_posts, public.feedback_votes, public.feedback_comments, public.feedback_updates FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.feedback_posts, public.feedback_votes, public.feedback_comments, public.feedback_updates TO service_role;

-- Per-author serialization prevents concurrent bursts from bypassing limits.
CREATE OR REPLACE FUNCTION public.feedback_guard_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_user uuid;
  v_limit integer;
  v_table text;
  v_count integer;
BEGIN
  v_user := NEW.author_user_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'FEEDBACK_AUTHOR_REQUIRED' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || TG_TABLE_NAME, 0));
  IF TG_TABLE_NAME='feedback_posts' THEN
    IF NEW.organization_id IS DISTINCT FROM (SELECT organization_id FROM public.users WHERE id=v_user) THEN
      RAISE EXCEPTION 'FEEDBACK_ORGANIZATION_MISMATCH' USING ERRCODE='23514';
    END IF;
    SELECT COUNT(*) INTO v_count FROM public.feedback_posts
      WHERE author_user_id=v_user AND created_at > now()-interval '24 hours';
    v_limit := 5;
  ELSE
    SELECT COUNT(*) INTO v_count FROM public.feedback_comments
      WHERE author_user_id=v_user AND created_at > now()-interval '24 hours';
    v_limit := 20;
  END IF;
  IF v_count >= v_limit THEN RAISE EXCEPTION 'FEEDBACK_RATE_LIMIT' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS feedback_posts_submission_guard ON public.feedback_posts;
CREATE TRIGGER feedback_posts_submission_guard BEFORE INSERT ON public.feedback_posts
FOR EACH ROW EXECUTE FUNCTION public.feedback_guard_submission();
DROP TRIGGER IF EXISTS feedback_comments_submission_guard ON public.feedback_comments;
CREATE TRIGGER feedback_comments_submission_guard BEFORE INSERT ON public.feedback_comments
FOR EACH ROW EXECUTE FUNCTION public.feedback_guard_submission();

CREATE OR REPLACE FUNCTION public.feedback_update_counters()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_post uuid;
BEGIN
  IF TG_TABLE_NAME='feedback_votes' THEN
    v_post := CASE WHEN TG_OP='DELETE' THEN OLD.post_id ELSE NEW.post_id END;
    UPDATE public.feedback_posts SET vote_count=(
      SELECT count(*) FROM public.feedback_votes WHERE post_id=v_post
    ) WHERE id=v_post;
    IF TG_OP='UPDATE' AND NEW.post_id<>OLD.post_id THEN
      UPDATE public.feedback_posts SET vote_count=(
        SELECT count(*) FROM public.feedback_votes WHERE post_id=OLD.post_id
      ) WHERE id=OLD.post_id;
    END IF;
  ELSE
    v_post := CASE WHEN TG_OP='DELETE' THEN OLD.post_id ELSE NEW.post_id END;
    UPDATE public.feedback_posts SET comment_count=(
      SELECT count(*) FROM public.feedback_comments WHERE post_id=v_post AND moderation='approved'
    ) WHERE id=v_post;
    IF TG_OP='UPDATE' AND NEW.post_id<>OLD.post_id THEN
      UPDATE public.feedback_posts SET comment_count=(
        SELECT count(*) FROM public.feedback_comments WHERE post_id=OLD.post_id AND moderation='approved'
      ) WHERE id=OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS feedback_votes_counter ON public.feedback_votes;
CREATE TRIGGER feedback_votes_counter AFTER INSERT OR DELETE OR UPDATE OF post_id ON public.feedback_votes
FOR EACH ROW EXECUTE FUNCTION public.feedback_update_counters();
DROP TRIGGER IF EXISTS feedback_comments_counter ON public.feedback_comments;
CREATE TRIGGER feedback_comments_counter AFTER INSERT OR DELETE OR UPDATE OF post_id,moderation ON public.feedback_comments
FOR EACH ROW EXECUTE FUNCTION public.feedback_update_counters();

-- Status changes create one update per author or supporting voter. No user email is exposed.
CREATE OR REPLACE FUNCTION public.feedback_post_status_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS feedback_post_timestamp ON public.feedback_posts;
CREATE TRIGGER feedback_post_timestamp BEFORE UPDATE OF title,description,category,area,status,moderation,merged_into_id ON public.feedback_posts
FOR EACH ROW EXECUTE FUNCTION public.feedback_post_status_update();

CREATE OR REPLACE FUNCTION public.feedback_notify_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.moderation='approved' AND NEW.merged_into_id IS NULL
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.moderation IS DISTINCT FROM NEW.moderation) THEN
    INSERT INTO public.feedback_updates(post_id,user_id,status)
      SELECT NEW.id, recipient_id, NEW.status
      FROM (
        SELECT NEW.author_user_id AS recipient_id
        UNION SELECT user_id FROM public.feedback_votes WHERE post_id=NEW.id
      ) supporters
      WHERE recipient_id IS NOT NULL
      ON CONFLICT (post_id,user_id,status) DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS feedback_post_notify_status ON public.feedback_posts;
CREATE TRIGGER feedback_post_notify_status AFTER UPDATE OF status,moderation ON public.feedback_posts
FOR EACH ROW EXECUTE FUNCTION public.feedback_notify_status();

-- Merge within a single transaction. Invocation is restricted to the backend's service role;
-- route-level platform-staff authorization is mandatory.
CREATE OR REPLACE FUNCTION public.feedback_merge_posts(p_source uuid,p_target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_source public.feedback_posts%ROWTYPE;
  v_target public.feedback_posts%ROWTYPE;
BEGIN
  IF p_source=p_target THEN RAISE EXCEPTION 'FEEDBACK_INVALID_MERGE'; END IF;
  PERFORM id FROM public.feedback_posts WHERE id IN (p_source,p_target) ORDER BY id FOR UPDATE;
  SELECT * INTO v_source FROM public.feedback_posts WHERE id=p_source;
  SELECT * INTO v_target FROM public.feedback_posts WHERE id=p_target;
  IF v_source.id IS NULL OR v_target.id IS NULL OR v_source.merged_into_id IS NOT NULL
     OR v_target.merged_into_id IS NOT NULL OR v_target.moderation<>'approved' THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID_MERGE';
  END IF;
  INSERT INTO public.feedback_votes(post_id,user_id)
    SELECT p_target,user_id FROM public.feedback_votes WHERE post_id=p_source
    ON CONFLICT DO NOTHING;
  DELETE FROM public.feedback_votes WHERE post_id=p_source;
  UPDATE public.feedback_comments SET post_id=p_target WHERE post_id=p_source;
  UPDATE public.feedback_posts SET merged_into_id=p_target,moderation='rejected' WHERE id=p_source;
END $$;
REVOKE ALL ON FUNCTION public.feedback_merge_posts(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_merge_posts(uuid,uuid) TO service_role;
COMMIT;
