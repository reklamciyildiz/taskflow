# TaskFlow Copy Style Guide

This project intentionally uses consistent terms across the UI to reduce cognitive load.

## Core nouns

- **Action**: The primary unit you create, assign, track, and complete.
  - Use *Action* in headings, buttons, and toasts.
  - Avoid mixing with *Task* in the UI (keep *task* for code/model naming if needed).

- **Process**: A configurable workflow/pipeline (columns) that Actions flow through.
  - Use *Process* for the concept, *Process Center* for the management surface.
  - Avoid *Project* in the UI unless we are explicitly talking about a project entity; prefer “process (project)” only in technical contexts.

- **Board**: Kanban-style view of Actions, grouped by columns.
- **List**: Linear list view of Actions with filters/search.
- **Knowledge Hub**: The place where Learnings / notes are summarized and searchable.
- **Checklist**: The per-action actionable list (items you tick off).
- **Learnings**: Free-form notes (separate from the checklist), summarized into Knowledge Hub.

## Microcopy patterns

- **Loading**: “Loading …” (use ellipsis `…` consistently where used).
- **Empty states**: Lead with the value, then the next action.
  - Example: “No actions found. Create your first action to get started.”
- **Destructive**: Use “Delete” as verb, and confirm with clear consequences.

