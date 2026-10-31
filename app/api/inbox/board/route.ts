import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuthedUser, requireTeamAdminOrOrgAdmin, requireTeamScopeAccess } from '@/lib/server-authz';
import { inboxBoardTableMissing, readInboxBoard } from '@/lib/inbox-board-server';
import { validateStageConfig, StageValidationError } from '@/lib/stage-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const teamId = request.nextUrl.searchParams.get('teamId') ?? '';
    if (!UUID.test(teamId)) return NextResponse.json({ success: false, error: 'Invalid team' }, { status: 400 });
    const access = await requireTeamScopeAccess(teamId, authed);
    if (access instanceof NextResponse) return access;
    return NextResponse.json({ success: true, data: await readInboxBoard(teamId) }, { headers: noStore });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load team Inbox' }, { status: 500, headers: noStore });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authed = await requireAuthedUser(request);
    if (authed instanceof NextResponse) return authed;
    const input = await request.json().catch(() => null);
    const teamId = input?.teamId;
    if (typeof teamId !== 'string' || !UUID.test(teamId)
      || !Number.isSafeInteger(input?.expectedVersion) || input.expectedVersion < 0
      || !Array.isArray(input?.stages) || input.stages.length > 100) {
      return NextResponse.json({ success: false, error: 'Invalid Inbox configuration request' }, { status: 400 });
    }
    const access = await requireTeamAdminOrOrgAdmin(teamId, authed);
    if (access instanceof NextResponse) return access;
    // A team must belong to the currently authenticated organization.
    const organizationId = String(access.team.organization_id);
    const stages = validateStageConfig(input.stages);
    // Ownership check is enforced in SQL too. Existing stages with referenced Action
    // IDs cannot be removed. CAS rejects stale browser/mobile edits.
    if (input.expectedVersion === 0) {
      const inserted = await supabaseAdmin.from('team_inbox_boards')
        .insert({ team_id: teamId, organization_id: organizationId, stages, version: 1 })
        .select('stages,version').single();
      if (inboxBoardTableMissing(inserted.error)) {
        return NextResponse.json({ success: false, code: 'INBOX_MIGRATION_REQUIRED', error: 'Inbox database migration is not installed' }, { status: 503 });
      }
      if (inserted.error) {
        return NextResponse.json({
          success: false, code: inserted.error.code === '23514' ? 'INBOX_STAGE_CONFLICT' : 'INBOX_VERSION_CONFLICT',
          error: inserted.error.code === '23514'
            ? 'Saved Actions reference stage IDs missing from the proposed Inbox settings. No Action was changed.'
            : 'Inbox settings changed. Refresh before retrying.',
        }, { status: 409 });
      }
      return NextResponse.json({ success: true, data: { configured: true, available: true, stages: inserted.data.stages, version: Number(inserted.data.version) } }, { headers: noStore });
    }
    const updated = await supabaseAdmin.from('team_inbox_boards')
      .update({ stages, version: input.expectedVersion + 1 })
      .eq('team_id', teamId).eq('organization_id', organizationId)
      .eq('version', input.expectedVersion)
      .select('stages,version').maybeSingle();
    if (inboxBoardTableMissing(updated.error)) {
      return NextResponse.json({ success: false, code: 'INBOX_MIGRATION_REQUIRED', error: 'Inbox migration is not installed' }, { status: 503 });
    }
    if (updated.error) {
      return NextResponse.json({
        success: false, code: 'INBOX_STAGE_CONFLICT',
        error: 'Inbox configuration would orphan a saved Action or violate stage integrity. Nothing was changed.',
      }, { status: 409 });
    }
    if (!updated.data) {
      return NextResponse.json({ success: false, code: 'INBOX_VERSION_CONFLICT', error: 'Inbox stages changed on another device. Reload to retry.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: { configured: true, available: true, stages: updated.data.stages, version: Number(updated.data.version) } }, { headers: noStore });
  } catch (error) {
    if (error instanceof StageValidationError) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: false, error: 'Could not save team Inbox configuration' }, { status: 500 });
  }
}
