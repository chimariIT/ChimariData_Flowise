import { JourneyTemplateStep } from '@shared/journey-templates';

type ExecutionStatus =
  | 'idle'
  | 'initializing'
  | 'executing_step'
  | 'awaiting_feedback'
  | 'resolving_feedback'
  | 'completed'
  | 'error';

export interface JourneyExecutionState {
  projectId: string;
  status: ExecutionStatus;
  currentStepId?: string;
  awaitingCheckpointId?: string;
  awaitingSince?: number;
  completedSteps: string[];
  totalSteps: number;
  lastError?: string;
  lastUpdated: number;
  lastActivity?: Date;
  startTime?: Date;
  endTime?: Date;
}

interface MachineOptions {
  defaultTimeoutMs?: number;
  onStateChange?: (projectId: string, state: JourneyExecutionState) => void;
  persistState?: (projectId: string, state: JourneyExecutionState) => Promise<void>;
  restoreState?: (projectId: string) => Promise<JourneyExecutionState | null>;
}

interface SyncInput {
  completedSteps: string[];
  totalSteps: number;
}

export class JourneyExecutionMachine {
  private readonly states = new Map<string, JourneyExecutionState>();
  private readonly defaultTimeoutMs: number;
  private readonly onStateChange?: MachineOptions['onStateChange'];
  private readonly persistState?: MachineOptions['persistState'];
  private readonly restoreState?: MachineOptions['restoreState'];

  constructor(options: MachineOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10 * 60 * 1000; // 10 minutes by default
    this.onStateChange = options.onStateChange;
    this.persistState = options.persistState;
    this.restoreState = options.restoreState;
  }

  /**
   * Ensure state exists for the project, restoring from persistence when available.
   */
  async syncFromJourney(projectId: string, input: SyncInput): Promise<JourneyExecutionState> {
    let state = this.states.get(projectId);

    if (!state && this.restoreState) {
      const persisted = await this.restoreState(projectId);
      if (persisted) {
        state = { ...persisted, completedSteps: [...persisted.completedSteps] };
        this.states.set(projectId, state);
      }
    }

    if (!state) {
      state = {
        projectId,
        status: 'idle',
        completedSteps: [...input.completedSteps],
        totalSteps: input.totalSteps,
        lastUpdated: Date.now(),
      };
      this.states.set(projectId, state);
      this.emitStateChange(projectId, state);
      return state;
    }

    state.completedSteps = [...new Set(input.completedSteps)];
    state.totalSteps = input.totalSteps;
    state.lastUpdated = Date.now();
    this.emitStateChange(projectId, state);
    return state;
  }

  /**
   * Decide whether the next step can execute and mark the state as executing when appropriate.
   */
  requestNextStep(
    projectId: string,
    steps: JourneyTemplateStep[],
    completedSteps: string[]
  ): JourneyTemplateStep | null {
    const state = this.states.get(projectId);
    if (!state) {
      throw new Error(`JourneyExecutionMachine: state not initialized for project ${projectId}`);
    }

    state.completedSteps = [...new Set(completedSteps)];
    state.totalSteps = steps.length;

    if (state.status === 'awaiting_feedback') {
      return null;
    }

    if (state.status === 'executing_step') {
      return null;
    }

    if (state.status === 'error') {
      return null;
    }

    const nextStep = steps.find((step) => !state.completedSteps.includes(step.id));

    if (!nextStep) {
      state.status = 'completed';
      state.currentStepId = undefined;
      state.lastUpdated = Date.now();
      this.persistAndEmit(projectId, state);
      return null;
    }

    state.status = state.status === 'initializing' ? 'initializing' : 'executing_step';
    state.currentStepId = nextStep.id;
    state.lastUpdated = Date.now();
    this.persistAndEmit(projectId, state);
    return nextStep;
  }

  /**
   * Mark a project as actively executing a step.
   */
  startStep(projectId: string, stepId: string): void {
    const state = this.requireState(projectId);
    state.status = 'executing_step';
    state.currentStepId = stepId;
    state.lastUpdated = Date.now();
    this.persistAndEmit(projectId, state);
  }

  /**
   * Mark the project as awaiting user feedback for the given checkpoint.
   */
  markAwaitingFeedback(projectId: string, checkpointId: string): void {
    const state = this.requireState(projectId);
    state.status = 'awaiting_feedback';
    state.awaitingCheckpointId = checkpointId;
    state.awaitingSince = Date.now();
    state.lastUpdated = Date.now();
    this.persistAndEmit(projectId, state);
  }

  /**
   * Resolve user feedback and return the machine to the idle state (ready for the next step).
   */
  resolveFeedback(projectId: string): void {
    const state = this.requireState(projectId);
    state.status = 'idle';
    state.awaitingCheckpointId = undefined;
    state.awaitingSince = undefined;
    state.lastUpdated = Date.now();
    this.persistAndEmit(projectId, state);
  }

  /**
   * Mark the provided step as completed and update the machine status.
   */
  markStepCompleted(projectId: string, stepId: string, completedSteps: string[]): void {
    const state = this.requireState(projectId);
    state.completedSteps = [...new Set(completedSteps.concat(stepId))];
    state.currentStepId = undefined;
    state.status = state.completedSteps.length >= state.totalSteps ? 'completed' : 'idle';
    state.lastUpdated = Date.now();
    this.persistAndEmit(projectId, state);
  }

  markInitializing(projectId: string): void {
    const state = this.requireState(projectId);
    state.status = 'initializing';
    state.lastUpdated = Date.now();
    this.persistAndEmit(projectId, state);
  }

  markError(projectId: string, error: string): void {
    const state = this.requireState(projectId);
    state.status = 'error';
    state.lastError = error;
    state.lastUpdated = Date.now();
    this.persistAndEmit(projectId, state);
  }

  applyCheckpoint(projectId: string, checkpoint: { id: string; stepName: string; status: string; requiresUserInput: boolean }, totalSteps?: number): void {
    const state = this.states.get(projectId);
    if (!state) return;

    if (typeof totalSteps === 'number') {
      state.totalSteps = totalSteps;
    }

    state.lastUpdated = Date.now();

    if (checkpoint.requiresUserInput) {
      if (checkpoint.status === 'waiting_approval' || checkpoint.status === 'pending' || checkpoint.status === 'rejected') {
        state.status = 'awaiting_feedback';
        state.awaitingCheckpointId = checkpoint.id;
        state.awaitingSince = Date.now();
      } else if (checkpoint.status === 'approved') {
        state.status = 'resolving_feedback';
        state.awaitingCheckpointId = undefined;
        state.awaitingSince = undefined;
      }
    }

    if (checkpoint.status === 'completed' && state.currentStepId === checkpoint.stepName) {
      if (!state.completedSteps.includes(checkpoint.stepName)) {
        state.completedSteps.push(checkpoint.stepName);
      }
      state.currentStepId = undefined;
      state.status = state.completedSteps.length >= state.totalSteps ? 'completed' : 'idle';
    }

    if (checkpoint.status === 'rejected') {
      state.status = 'awaiting_feedback';
      state.awaitingCheckpointId = checkpoint.id;
    }

    this.persistAndEmit(projectId, state);
  }

  getState(projectId: string): JourneyExecutionState | undefined {
    const state = this.states.get(projectId);
    if (!state) return undefined;
    return { ...state, completedSteps: [...state.completedSteps] };
  }

  reset(projectId: string): void {
    this.states.delete(projectId);
  }

  /**
   * Solution A: Restore state directly from a saved state object
   * Used for crash recovery when resuming a project
   */
  async restoreFromSavedState(projectId: string, savedState: JourneyExecutionState): Promise<void> {
    // Restore the state with deep copy
    const restoredState: JourneyExecutionState = {
      ...savedState,
      completedSteps: [...(savedState.completedSteps || [])],
      // Ensure dates are proper Date objects
      lastActivity: savedState.lastActivity
        ? new Date(savedState.lastActivity as any)
        : undefined,
      startTime: savedState.startTime
        ? new Date(savedState.startTime as any)
        : undefined,
      endTime: savedState.endTime
        ? new Date(savedState.endTime as any)
        : undefined
    };

    this.states.set(projectId, restoredState);
    console.log(`🔄 [JourneyExecutionMachine] Restored state for project ${projectId}: status=${restoredState.status}`);
  }

  private requireState(projectId: string): JourneyExecutionState {
    const state = this.states.get(projectId);
    if (!state) {
      throw new Error(`JourneyExecutionMachine: state not initialized for project ${projectId}`);
    }
    return state;
  }

  private persistAndEmit(projectId: string, state: JourneyExecutionState): void {
    this.emitStateChange(projectId, state);
    if (this.persistState) {
      this.persistState(projectId, { ...state, completedSteps: [...state.completedSteps] }).catch((error) => {
        console.warn(`JourneyExecutionMachine: failed to persist state for project ${projectId}`, error);
      });
    }
  }

  private emitStateChange(projectId: string, state: JourneyExecutionState): void {
    if (this.onStateChange) {
      this.onStateChange(projectId, { ...state, completedSteps: [...state.completedSteps] });
    }
  }
}
