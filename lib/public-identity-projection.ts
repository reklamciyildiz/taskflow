/**
 * Public, explicit API projections. Service-role user/organization rows can
 * contain credential hashes, billing IDs or other server-only metadata.
 * Never serialize them wholesale into a NextResponse.
 */
export function publicUserRow(user: any) {
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    avatar_url: user.avatar_url ?? null,
    organization_id: user.organization_id ?? null,
    role: user.role ?? null,
    is_online: user.is_online === true,
    created_at: user.created_at ?? null,
  };
}

export function publicOrganizationRow(organization: any) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug ?? null,
    created_at: organization.created_at ?? null,
  };
}
