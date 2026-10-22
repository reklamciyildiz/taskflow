import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('mobile/src/App.tsx');
const runtime = read('mobile/src/PlannerRuntimeAdapter.tsx');
const middleware = read('middleware.ts');
const projects = read('app/api/projects/route.ts');
const project = read('app/api/projects/[id]/route.ts');
const projectMembers = read('app/api/projects/[id]/members/route.ts');
const tasks = read('app/api/tasks/[id]/route.ts');

for (const component of ['DashboardV2', 'TaskBoard', 'ActionPanel']) {
  assert.match(app, new RegExp(`import \\{ ${component} \\} from '../../components/`));
}
assert.doesNotMatch(app, /AxiomWorkspaceDashboard|AxiomProcessView|AxiomActionView/);
assert.match(runtime, /TaskRuntimeProvider/);
assert.match(runtime, /authenticatedRequest<any>\(`\/api\/tasks\/\$\{encodeURIComponent\(id\)\}`/);

for (const source of [projects, project, projectMembers]) {
  assert.match(source, /requireAuthedUser\(request\)/);
  assert.doesNotMatch(source, /getServerSession/);
}
assert.match(middleware, /pathname === '\/api\/projects'/);
assert.match(middleware, /projects\\\/\[\^\/\]\+\\\/members/);
assert.match(middleware, /tasks\\\/\[\^\/\]\+\\\/properties/);

assert.match(tasks, /actor\.organization_id !== \(originalTask as any\)\.organization_id/);
assert.match(tasks, /projectDb\.getVisibleForUser/);
assert.match(tasks, /Checklist items require unique stable IDs/);
assert.match(tasks, /syncChecklistScheduleCommands/);

console.log('Mobile shared workspace UI, bearer guard, ACL and stable Checklist persistence contracts passed.');
