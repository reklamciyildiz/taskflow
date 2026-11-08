import { z } from 'zod';

/**
 * Customer policy is evaluated against the canonical database-backed user from
 * requireAuthedUser, never an organizationId/role supplied in request JSON.
 * These commands deliberately receive an organization-scoped repository so the
 * policy can be integration-tested without Production credentials.
 */
export type CustomerActor = {
  id?: string | null;
  organization_id?: string | null;
  role?: string | null;
} | null | undefined;

export type CustomerRecord = {
  id: string;
  organization_id: string;
  [key: string]: unknown;
};

export type CustomerFields = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};
export type CustomerUpdates = Partial<CustomerFields>;

export type CustomerRepository = {
  getByOrganization(organizationId: string): Promise<CustomerRecord[]>;
  getById(id: string, organizationId: string): Promise<CustomerRecord | null>;
  create(fields: CustomerFields & { organization_id: string }): Promise<CustomerRecord>;
  update(id: string, organizationId: string, updates: CustomerUpdates): Promise<CustomerRecord | null>;
  delete(id: string, organizationId: string): Promise<boolean>;
  getTaskStats(id: string, organizationId: string): Promise<{ total: number; completed: number }>;
};

export type CustomerResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 401 | 403 | 404; error: string };

const invalid = <T>(): CustomerResult<T> => ({ ok: false, status: 400, error: 'Invalid customer data' });
const notFound = <T>(): CustomerResult<T> => ({ ok: false, status: 404, error: 'Customer not found' });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isCustomerId = (value: unknown): value is string =>
  typeof value === 'string' && uuid.test(value);

const optionalText = (limit: number) => z.string().trim().max(limit).nullable().optional();
const fieldsSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: optionalText(255),
  phone: optionalText(50),
  address: optionalText(5_000),
  notes: optionalText(20_000),
}).strict();
const patchSchema = fieldsSchema.partial().refine(value => Object.keys(value).length > 0);

function normalizeText(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function access(actor: CustomerActor, write: boolean): CustomerResult<string> {
  // A canonical users row is the membership authority in the current
  // single-organization model; JWT claims alone are insufficient.
  if (!actor?.id || !actor.organization_id) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!isCustomerId(actor.organization_id) ||
      !['owner', 'admin', 'member', 'viewer'].includes(String(actor.role))) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  if (write && actor.role !== 'owner' && actor.role !== 'admin') {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true, value: actor.organization_id };
}

export async function listCustomers(
  actor: CustomerActor,
  repository: CustomerRepository,
): Promise<CustomerResult<Array<CustomerRecord & { taskStats: { total: number; completed: number } }>>> {
  const scope = access(actor, false);
  if (scope.ok === false) return scope;
  const organizationId = scope.value;
  const rows = await repository.getByOrganization(organizationId);
  // Defense-in-depth: a repository regression must not serialize foreign rows.
  const own = rows.filter(row => row.organization_id === organizationId);
  return { ok: true, value: await Promise.all(own.map(async row => ({
    ...row, taskStats: await repository.getTaskStats(row.id, organizationId),
  }))) };
}

export async function readCustomer(
  actor: CustomerActor, id: string, repository: CustomerRepository,
): Promise<CustomerResult<CustomerRecord & { taskStats: { total: number; completed: number } }>> {
  const scope = access(actor, false);
  if (scope.ok === false) return scope;
  if (!isCustomerId(id)) return notFound();
  const customer = await repository.getById(id, scope.value);
  if (!customer || customer.organization_id !== scope.value) return notFound();
  return { ok: true, value: {
    ...customer, taskStats: await repository.getTaskStats(id, scope.value),
  } };
}

export async function createCustomer(
  actor: CustomerActor, raw: unknown, repository: CustomerRepository,
): Promise<CustomerResult<CustomerRecord>> {
  const scope = access(actor, true);
  if (scope.ok === false) return scope;
  const parsed = fieldsSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  const input = parsed.data;
  const customer = await repository.create({
    name: input.name,
    email: normalizeText(input.email),
    phone: normalizeText(input.phone),
    address: normalizeText(input.address),
    notes: normalizeText(input.notes),
    organization_id: scope.value,
  });
  // Never return an out-of-tenant record even if the repository misbehaves.
  if (customer.organization_id !== scope.value) return notFound();
  return { ok: true, value: customer };
}

export async function updateCustomer(
  actor: CustomerActor, id: string, raw: unknown, repository: CustomerRepository,
): Promise<CustomerResult<CustomerRecord>> {
  const scope = access(actor, true);
  if (scope.ok === false) return scope;
  if (!isCustomerId(id)) return notFound();
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  const input = parsed.data;
  const updates: CustomerUpdates = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.email !== undefined) updates.email = normalizeText(input.email);
  if (input.phone !== undefined) updates.phone = normalizeText(input.phone);
  if (input.address !== undefined) updates.address = normalizeText(input.address);
  if (input.notes !== undefined) updates.notes = normalizeText(input.notes);
  // One SQL UPDATE scoped by both ID and organization; no check-then-write race.
  const customer = await repository.update(id, scope.value, updates);
  if (!customer || customer.organization_id !== scope.value) return notFound();
  return { ok: true, value: customer };
}

export async function deleteCustomer(
  actor: CustomerActor, id: string, repository: CustomerRepository,
): Promise<CustomerResult<true>> {
  const scope = access(actor, true);
  if (scope.ok === false) return scope;
  if (!isCustomerId(id)) return notFound();
  // One SQL DELETE scoped by ID + organization. Missing and foreign IDs have
  // the same response, and a successful delete must affect an actual row.
  if (!(await repository.delete(id, scope.value))) return notFound();
  return { ok: true, value: true };
}
