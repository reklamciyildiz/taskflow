/** Prevents an older Planner read from replacing optimistic state while writes are in flight. */
export class PlannerMutationGuard {
  private activeMutations = 0;
  private revision = 0;

  begin(): void {
    this.activeMutations += 1;
    this.revision += 1;
  }

  finish(): boolean {
    if (this.activeMutations > 0) this.activeMutations -= 1;
    this.revision += 1;
    return this.activeMutations === 0;
  }

  snapshot(): number {
    return this.revision;
  }

  canApply(snapshot: number): boolean {
    return this.activeMutations === 0 && this.revision === snapshot;
  }

  isIdle(): boolean {
    return this.activeMutations === 0;
  }
}
