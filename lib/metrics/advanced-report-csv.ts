import type { AdvancedReport } from '@/lib/metrics/advanced-reporting';

/** RFC 4180 quoting + spreadsheet formula protection, including leading whitespace. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Excel/Sheets may evaluate =,+,-,@ after whitespace; never execute user Action titles.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function row(values: Array<string | number | null | undefined>): string {
  return values.map(csvCell).join(',');
}

/** CSV deliberately contains *only* the selected user's team/scope projection. */
export function buildAdvancedReportCsv(report: AdvancedReport): string {
  const { summary: s } = report;
  const lines: string[] = [
    row(['Actiproc', 'Advanced operational reporting']),
    row(['Snapshot as of', report.windowEnd.toISOString()]),
    row(['Period start', report.windowStart.toISOString()]),
    row(['Period days', report.days]),
    row(['Methodology', 'Snapshot is current. Historical throughput uses only verified last-completion timestamps; deleted Actions and earlier reopen cycles are excluded.']),
    row([]),
    row(['Metric', 'Value']),
    row(['Actions (current)', s.total]),
    row(['Open (current)', s.open]),
    row(['Completed (current)', s.completed]),
    row(['Completion rate (current, %)', s.completionRate]),
    row(['Overdue (current, by calendar day)', s.overdue]),
    row(['Due within 7 days (current)', s.dueSoon]),
    row(['Unassigned open Actions', s.unassigned]),
    row(['No updates for 14 days', s.stale]),
    row(['Created in selected period', s.createdInPeriod]),
    row(['Verified completions in selected period', s.completedInPeriod]),
    row(['Mean time from creation to last completion (days)', s.averageCompletionDays === null ? '' : Number(s.averageCompletionDays.toFixed(2))]),
    row(['Verified completion duration sample', s.verifiedDurationSample]),
    row(['Completed Actions without verified completion date', s.missingCompletionDates]),
    row(['Actions with unresolved stage', s.unresolvedStages]),
    row([]),
    row(['Process', 'Current Actions', 'Open', 'Completed', 'Completion rate (%)', 'Overdue', 'No updates for 14 days', 'Verified completions in period']),
  ];
  for (const p of report.processRows) {
    lines.push(row([p.name, p.total, p.open, p.completed, p.completionRate, p.overdue, p.stale, p.completedInPeriod]));
  }
  lines.push(row([]), row(['Time bucket (local)', 'Created', 'Verified completed']));
  for (const bucket of report.buckets) {
    const date = bucket.start;
    const yyyy = String(date.getFullYear()).padStart(4, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    lines.push(row([yyyy + '-' + mm + '-' + dd, bucket.created, bucket.completed]));
  }
  lines.push(row([]), row(['Action ID', 'Action title', 'Overdue (days)', 'Without updates (days)', 'Due date']));
  for (const action of report.atRisk) {
    lines.push(row([action.id, action.title, action.overdueDays, action.staleDays,
      action.dueDate ? action.dueDate.toISOString() : '']));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
