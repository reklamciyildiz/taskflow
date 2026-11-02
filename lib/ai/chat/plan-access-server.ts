import 'server-only';
import { getOrganizationEntitlements } from '@/lib/entitlements';
import { aiAllowanceForOrganization } from './plan-policy';

/** Never take plan or seat count from the client. Failed billing lookups fail closed. */
export async function aiAllowanceForAuthenticatedOrganization(organizationId: string) {
  const ent = await getOrganizationEntitlements(organizationId);
  return aiAllowanceForOrganization(ent);
}
