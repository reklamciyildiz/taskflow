const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidList(name: string): string[] {
  const raw = process.env[name] ?? '';
  const values = [...new Set(raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (values.some((value) => !UUID_PATTERN.test(value))) {
    throw new Error(`Invalid ${name} configuration`);
  }
  return values;
}

/**
 * Production-safe default: beta scoping is active unless an operator
 * deliberately disables it after the controlled rollout.
 */
export function isAIBetaModeEnabled(): boolean {
  return process.env.AXIOM_AI_BETA_MODE_ENABLED !== 'false';
}

export function aiBetaOrganizationIds(): string[] {
  return uuidList('AXIOM_AI_BETA_ORGANIZATION_IDS');
}

export function aiBetaUserIds(): string[] {
  return uuidList('AXIOM_AI_BETA_USER_IDS');
}

export function isAIBetaScopeAllowed(userId: string, organizationId: string): boolean {
  if (!isAIBetaModeEnabled()) return true;
  const users = aiBetaUserIds();
  const organizations = aiBetaOrganizationIds();
  return users.includes(userId.toLowerCase()) && organizations.includes(organizationId.toLowerCase());
}
