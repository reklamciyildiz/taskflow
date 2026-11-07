/**
 * User-facing, non-secret diagnostics for AI's public rollout gates.
 * A 503 does not indicate that conversation data was deleted.
 */
export function aiAvailabilityMessage(code: string, status=503): string {
  switch (code) {
    case 'FEATURE_DISABLED':
      return 'Actiproc AI is disabled in this deployment. An administrator must enable AI chat.';
    case 'PUBLIC_ROLLOUT_NOT_READY':
      return 'Actiproc AI is paused by its public rollout safety checks. An administrator must verify provider admission and atomic quotas, and disable AI write/mutation flags for public use.';
    case 'PUBLIC_RATE_GUARD_NOT_READY':
      return 'Actiproc AI cannot verify its database rate-limit protection right now. An administrator must check the public guard in Supabase.';
    case 'BETA_ACCESS_REQUIRED':
      return 'This workspace is not approved for the current AI beta.';
    case 'FORBIDDEN':
      return 'This account does not have access to the requested AI workspace.';
    default:
      return status === 503
        ? 'Actiproc AI is temporarily unavailable. Your existing conversation history has not been deleted by this error.'
        : 'Conversation history could not be loaded. Please retry.';
  }
}
