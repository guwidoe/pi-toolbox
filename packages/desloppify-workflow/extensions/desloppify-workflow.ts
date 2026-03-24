import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const ENTRY_TYPE = "desloppify-workflow";
const STATUS_KEY = "desloppify-workflow";
const VERSION = 2;

const MODES = ["objective-only", "full"] as const;
const PHASES = [
  "preflight",
  "scan",
  "checkpoint-1",
  "subjective-review",
  "manual-review",
  "checkpoint-2",
  "batching",
  "checkpoint-3",
  "execution",
  "complete",
] as const;
const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh"] as const;
const EXECUTION_POLICIES = ["cheap", "normal"] as const;
const RESCAN_POLICIES = ["manual", "batch-boundary", "normal"] as const;
const RETRIAGE_POLICIES = ["manual", "if-invalidated", "normal"] as const;

const DEFAULT_EXECUTION_POLICY = "cheap" as const;
const DEFAULT_RESCAN_POLICY = "batch-boundary" as const;
const DEFAULT_RETRIAGE_POLICY = "if-invalidated" as const;
const DEFAULT_EXPENSIVE_PLANNING_ALLOWED = false;

type WorkflowMode = (typeof MODES)[number];
type WorkflowPhase = (typeof PHASES)[number];
type ReviewerThinking = (typeof THINKING_LEVELS)[number];
type ExecutionPolicy = (typeof EXECUTION_POLICIES)[number];
type RescanPolicy = (typeof RESCAN_POLICIES)[number];
type RetriagePolicy = (typeof RETRIAGE_POLICIES)[number];
type WorkflowAction =
  | "start"
  | "configure"
  | "set_phase"
  | "approve_plan"
  | "invalidate_plan"
  | "record_rescan"
  | "complete"
  | "clear";

type WorkflowState = {
  version: number;
  active: boolean;
  runId: string;
  cwd: string;
  targetPath: string;
  mode: WorkflowMode;
  phase: WorkflowPhase;
  startedAt: string;
  updatedAt: string;
  reviewerModel?: string;
  reviewerThinking?: ReviewerThinking;
  executionPolicy: ExecutionPolicy;
  rescanPolicy: RescanPolicy;
  retriagePolicy: RetriagePolicy;
  expensivePlanningAllowed: boolean;
  approvedPlanBaseline?: string;
  lastPlanApprovalAt?: string;
  lastRescanAt?: string;
  planInvalidationReason?: string;
  note?: string;
  completedAt?: string;
};

type LegacyWorkflowState = {
  version: 1;
  active: boolean;
  runId: string;
  cwd: string;
  targetPath: string;
  mode: WorkflowMode;
  phase: WorkflowPhase;
  startedAt: string;
  updatedAt: string;
  reviewerModel?: string;
  reviewerThinking?: ReviewerThinking;
  note?: string;
  completedAt?: string;
};

type WorkflowEntry = {
  version: number;
  action: WorkflowAction | "status";
  timestamp: string;
  note?: string;
  state: WorkflowState | null;
};

type LegacyWorkflowEntry = {
  version: 1;
  action: "start" | "configure" | "set_phase" | "complete" | "clear";
  timestamp: string;
  note?: string;
  state: LegacyWorkflowState | null;
};

type WorkflowToolArgs = {
  action: "status" | WorkflowAction;
  mode?: WorkflowMode;
  targetPath?: string;
  phase?: WorkflowPhase;
  reviewerModel?: string;
  reviewerThinking?: ReviewerThinking;
  executionPolicy?: ExecutionPolicy;
  rescanPolicy?: RescanPolicy;
  retriagePolicy?: RetriagePolicy;
  expensivePlanningAllowed?: boolean;
  approvedPlanBaseline?: string;
  planInvalidationReason?: string;
  note?: string;
};

function isMode(value: string | undefined): value is WorkflowMode {
  return !!value && (MODES as readonly string[]).includes(value);
}

function isPhase(value: string | undefined): value is WorkflowPhase {
  return !!value && (PHASES as readonly string[]).includes(value);
}

function isThinking(value: string | undefined): value is ReviewerThinking {
  return !!value && (THINKING_LEVELS as readonly string[]).includes(value);
}

function isExecutionPolicy(value: string | undefined): value is ExecutionPolicy {
  return !!value && (EXECUTION_POLICIES as readonly string[]).includes(value);
}

function isRescanPolicy(value: string | undefined): value is RescanPolicy {
  return !!value && (RESCAN_POLICIES as readonly string[]).includes(value);
}

function isRetriagePolicy(value: string | undefined): value is RetriagePolicy {
  return !!value && (RETRIAGE_POLICIES as readonly string[]).includes(value);
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return undefined;
}

function tokenizeArgs(input: string): string[] {
  const matches = input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  return (matches ?? []).map((token) => {
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1);
    }
    return token;
  });
}

function parseKeyValueArgs(input: string): { positional: string[]; values: Record<string, string> } {
  const tokens = tokenizeArgs(input.trim());
  const positional: string[] = [];
  const values: Record<string, string> = {};

  for (const token of tokens) {
    const eq = token.indexOf("=");
    if (eq <= 0) {
      positional.push(token);
      continue;
    }
    const key = token.slice(0, eq).trim();
    const value = token.slice(eq + 1).trim();
    if (key) values[key] = value;
  }

  return { positional, values };
}

function generateRunId(): string {
  return `dslop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatMode(mode: WorkflowMode): string {
  return mode === "objective-only" ? "objective-only scan" : "full workflow";
}

function formatReviewer(state: WorkflowState): string {
  if (state.mode !== "full") return "n/a";
  if (!state.reviewerModel) return "not configured";
  return state.reviewerThinking ? `${state.reviewerModel} (${state.reviewerThinking})` : state.reviewerModel;
}

function formatStateSummary(state: WorkflowState | null): string {
  if (!state) return "No desloppify workflow state recorded for this branch.";

  const lines = [
    "desloppify workflow",
    `- active: ${state.active ? "yes" : "no"}`,
    `- mode: ${formatMode(state.mode)}`,
    `- phase: ${state.phase}`,
    `- target path: ${state.targetPath}`,
    `- reviewer: ${formatReviewer(state)}`,
    `- execution policy: ${state.executionPolicy}`,
    `- rescan policy: ${state.rescanPolicy}`,
    `- retriage policy: ${state.retriagePolicy}`,
    `- expensive planning allowed: ${state.expensivePlanningAllowed ? "yes" : "no"}`,
    `- approved plan baseline: ${state.approvedPlanBaseline ?? "not recorded"}`,
    `- plan invalidation: ${state.planInvalidationReason ?? "not invalidated"}`,
    `- last plan approval: ${state.lastPlanApprovalAt ?? "not recorded"}`,
    `- last rescan: ${state.lastRescanAt ?? "not recorded"}`,
    `- run id: ${state.runId}`,
    `- started: ${state.startedAt}`,
    `- updated: ${state.updatedAt}`,
  ];

  if (state.completedAt) lines.push(`- completed: ${state.completedAt}`);
  if (state.note) lines.push(`- note: ${state.note}`);

  return lines.join("\n");
}

function formatStatusLine(state: WorkflowState): string {
  const mode = state.mode === "full" ? "full" : "obj";
  return `🧽 ${mode} · ${state.phase} · ${state.executionPolicy}`;
}

function normalizePath(path: string | undefined): string {
  const trimmed = path?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : ".";
}

function sanitizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function migrateLegacyState(state: LegacyWorkflowState): WorkflowState {
  return {
    ...state,
    version: VERSION,
    executionPolicy: DEFAULT_EXECUTION_POLICY,
    rescanPolicy: DEFAULT_RESCAN_POLICY,
    retriagePolicy: DEFAULT_RETRIAGE_POLICY,
    expensivePlanningAllowed: DEFAULT_EXPENSIVE_PLANNING_ALLOWED,
    approvedPlanBaseline: undefined,
    lastPlanApprovalAt: undefined,
    lastRescanAt: state.phase === "scan" || state.phase === "checkpoint-1" ? state.updatedAt : undefined,
    planInvalidationReason: undefined,
  };
}

function readWorkflowState(ctx: ExtensionContext): WorkflowState | null {
  const entry = ctx.sessionManager
    .getBranch()
    .filter((item) => item.type === "custom" && "customType" in item && item.customType === ENTRY_TYPE)
    .map((item) => ("data" in item ? (item.data as WorkflowEntry | LegacyWorkflowEntry | undefined) : undefined))
    .filter((item): item is WorkflowEntry | LegacyWorkflowEntry => !!item)
    .pop();

  const state = entry?.state;
  if (!state) return null;
  if (state.version === VERSION) return state as WorkflowState;
  if (state.version === 1) return migrateLegacyState(state as LegacyWorkflowState);
  return null;
}

function setStatus(ctx: ExtensionContext, state: WorkflowState | null): void {
  if (!ctx.hasUI) return;
  if (!state || !state.active || state.phase === "complete") {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", formatStatusLine(state)));
}

function getRescanPolicyGuidance(state: WorkflowState): string[] {
  switch (state.rescanPolicy) {
    case "manual":
      return [
        "Do not run another desloppify scan unless the user explicitly approves it for this session.",
        "Do not treat small cleanup progress as automatic justification for a rescan.",
      ];
    case "batch-boundary":
      return [
        "Do not do eager rescans after small cleanup slices.",
        "Only rescan at a meaningful batch boundary, when the queue is blocked, after a materially large subsystem shift, or when the user explicitly asks for it.",
      ];
    case "normal":
      return ["Rescans are allowed when they are genuinely useful, but still avoid pointless churn."];
  }
}

function getRetriagePolicyGuidance(state: WorkflowState): string[] {
  switch (state.retriagePolicy) {
    case "manual":
      return [
        "Do not run replanning/retriage unless the user explicitly approves it.",
        "Presume the current approved cluster plan remains valid until the user says otherwise.",
      ];
    case "if-invalidated":
      return [
        "Do not re-triage just because a few issues changed after a small fix slice.",
        state.planInvalidationReason
          ? `The approved plan has been marked invalid for this reason: ${state.planInvalidationReason}`
          : "The approved plan baseline should remain authoritative unless it is explicitly invalidated or a genuinely new issue family appears.",
      ];
    case "normal":
      return ["Retriage is allowed when needed, but avoid churn that does not unlock real execution value."];
  }
}

function getExecutionPolicyGuidance(state: WorkflowState): string[] {
  switch (state.executionPolicy) {
    case "cheap":
      return [
        "Stay in cheap execution mode: prefer direct local edits plus only the minimal local validation needed.",
        "Do not spawn expensive planning loops, reviewer loops, or broad replanning just to feel current.",
      ];
    case "normal":
      return ["Normal execution mode: use judgment, but still avoid unnecessary planning churn."];
  }
}

function buildPhaseInstructions(state: WorkflowState): string[] {
  switch (state.phase) {
    case "preflight":
      return [
        "Gather and confirm mode, target path, reviewer settings, and planning-cost policy before the scan starts.",
        "For full workflow mode, ensure reviewer model/thinking are explicitly configured before subjective review begins.",
      ];
    case "scan":
      return [
        "Figure out likely scan-noise directories before the first scan and exclude obvious junk first.",
        "Ensure .desloppify/ is ignored in git.",
        state.mode === "full"
          ? "Run the initial full-profile scan. Remember that `desloppify scan --profile full` does not inline reviewer agents; subjective review is a separate later step."
          : "Run only the objective scan path and do not start reviewer agents.",
        "When the scan is complete, record the rescan timestamp via `desloppify_workflow` if needed, then stop at checkpoint-1 and report back.",
      ];
    case "checkpoint-1":
      return [
        "Report scan mode, path, exclusions, scores, queue themes, and whether subjective review is still pending.",
        state.mode === "full"
          ? "Be explicit that the initial full-profile scan may be complete even if the separate subjective review phase has not run yet."
          : "After reporting, wait for user approval before continuing to manual review/disposition.",
        state.mode === "full"
          ? "After approval, the next step is the subjective review phase before final disposition work."
          : "After approval, the next step is manual review/disposition.",
      ];
    case "subjective-review":
      return [
        "Run the separate desloppify subjective review phase now.",
        state.reviewerModel
          ? `Use reviewer model ${state.reviewerModel}${state.reviewerThinking ? ` with ${state.reviewerThinking} thinking` : ""}.`
          : "Reviewer model is not configured yet — ask the user and store it before continuing.",
        "Import the review results, then move into manual-review.",
      ];
    case "manual-review":
      return [
        "Review findings conservatively and separate real issues from true false positives and genuine non-issues.",
        "Only mark permanent skips/wontfix for true non-issues or accepted debt — not for inconvenient real work.",
        "After this pass, stop at checkpoint-2 and report back.",
      ];
    case "checkpoint-2":
      return [
        "Report how many issues stayed open, how many were false positive, and how many were marked wontfix/permanent skip.",
        "Then propose batching/clustering the actionable remainder and wait for user approval.",
      ];
    case "batching":
      return [
        "Turn the remaining real issues into coherent implementation batches/clusters.",
        "Prefer coherent refactor themes or subsystem slices over noisy raw issue ordering.",
        "When the user approves a batch plan, store its baseline summary in `desloppify_workflow` so execution can rely on it later.",
        "After batching, stop at checkpoint-3 and report back.",
      ];
    case "checkpoint-3":
      return [
        "Report the proposed implementation batches, their order, size/risk, and dependencies.",
        "Wait for user approval before starting execution, then record the approved plan baseline in `desloppify_workflow`.",
      ];
    case "execution":
      return [
        "Execute batches one by one using the existing approved plan baseline; do not re-plan just because minor cleanup changes the queue a bit.",
        "Commit every completed logical slice before resolving it — at least one commit per execution item or coherent batch slice.",
        "After each commit, record it with `desloppify plan commit-log record`.",
        "Every time you report execution progress, include an explicit queue-progress summary in the form `resolved X/Y issues` for the active queued issue set; if you do not already know X and Y, compute them from the current desloppify artifacts before reporting.",
        "Only rescan or retriage if the stored policy allows it or the user explicitly approves it.",
        "Mark the workflow complete when the run is genuinely finished so these injected rules stop.",
      ];
    case "complete":
      return ["The run is complete; no further workflow injection should be active."];
  }
}

function buildInjectedPrompt(state: WorkflowState): string {
  const lines = [
    "[desloppify workflow coordinator]",
    "A supervised desloppify run is active for this session.",
    "Treat this workflow state as authoritative across compactions.",
    "",
    "Current workflow state:",
    `- mode: ${formatMode(state.mode)}`,
    `- phase: ${state.phase}`,
    `- target path: ${state.targetPath}`,
    `- reviewer model: ${state.reviewerModel ?? "not configured"}`,
    `- reviewer thinking: ${state.reviewerThinking ?? "not configured"}`,
    `- execution policy: ${state.executionPolicy}`,
    `- rescan policy: ${state.rescanPolicy}`,
    `- retriage policy: ${state.retriagePolicy}`,
    `- expensive planning allowed: ${state.expensivePlanningAllowed ? "yes" : "no"}`,
    `- approved plan baseline: ${state.approvedPlanBaseline ?? "not recorded"}`,
    `- plan invalidation reason: ${state.planInvalidationReason ?? "not invalidated"}`,
    `- last plan approval: ${state.lastPlanApprovalAt ?? "not recorded"}`,
    `- last rescan: ${state.lastRescanAt ?? "not recorded"}`,
    `- run id: ${state.runId}`,
    "",
    "Global workflow rules:",
    "- Use the `desloppify_workflow` tool to keep mode, reviewer settings, phase, plan baseline, policy state, and completion state current.",
    "- Do not skip required user checkpoints.",
    "- Do not use wontfix/permanent skip to hide inconvenient real work.",
    "- Treat the approved plan baseline as still valid unless it is explicitly invalidated.",
    "- Do not interpret small queue changes after a small fix slice as automatic justification for rescan or retriage.",
    "- In execution, commit every completed logical slice before resolve.",
    "- When the run is finished, mark it complete so these injected instructions stop.",
    "",
    "Cost-control policy:",
    ...getExecutionPolicyGuidance(state).map((line) => `- ${line}`),
    ...getRescanPolicyGuidance(state).map((line) => `- ${line}`),
    ...getRetriagePolicyGuidance(state).map((line) => `- ${line}`),
    state.expensivePlanningAllowed
      ? "- Expensive planning is explicitly allowed right now, but still use it only when it unlocks real value."
      : "- Expensive runner-backed planning is NOT approved right now. Do not run `desloppify plan triage --run-stages`, `--runner ...`, or similar costly review/planning loops unless the user explicitly approves and the workflow state is updated.",
    "",
    "Phase instructions:",
    ...buildPhaseInstructions(state).map((line) => `- ${line}`),
  ];

  return lines.join("\n");
}

function persistSnapshot(pi: ExtensionAPI, action: WorkflowAction, state: WorkflowState | null, note?: string): void {
  const entry: WorkflowEntry = {
    version: VERSION,
    action,
    timestamp: new Date().toISOString(),
    note,
    state,
  };
  pi.appendEntry(ENTRY_TYPE, entry);
}

function updateRuntimeState(ctx: ExtensionContext, state: WorkflowState | null): void {
  setStatus(ctx, state);
}

function requireActiveState(state: WorkflowState | null): WorkflowState {
  if (!state || !state.active || state.phase === "complete") {
    throw new Error("No active desloppify workflow run. Start one first.");
  }
  return state;
}

function startState(ctx: ExtensionContext, args: WorkflowToolArgs): WorkflowState {
  if (!isMode(args.mode)) {
    throw new Error(`start requires mode=${MODES.join("|")}`);
  }

  const now = new Date().toISOString();
  const phase = isPhase(args.phase) ? args.phase : "scan";

  return {
    version: VERSION,
    active: phase !== "complete",
    runId: generateRunId(),
    cwd: ctx.cwd,
    targetPath: normalizePath(args.targetPath),
    mode: args.mode,
    phase,
    startedAt: now,
    updatedAt: now,
    reviewerModel: sanitizeText(args.reviewerModel),
    reviewerThinking: isThinking(args.reviewerThinking) ? args.reviewerThinking : undefined,
    executionPolicy: isExecutionPolicy(args.executionPolicy) ? args.executionPolicy : DEFAULT_EXECUTION_POLICY,
    rescanPolicy: isRescanPolicy(args.rescanPolicy) ? args.rescanPolicy : DEFAULT_RESCAN_POLICY,
    retriagePolicy: isRetriagePolicy(args.retriagePolicy) ? args.retriagePolicy : DEFAULT_RETRIAGE_POLICY,
    expensivePlanningAllowed:
      typeof args.expensivePlanningAllowed === "boolean"
        ? args.expensivePlanningAllowed
        : DEFAULT_EXPENSIVE_PLANNING_ALLOWED,
    approvedPlanBaseline: sanitizeText(args.approvedPlanBaseline),
    lastPlanApprovalAt: sanitizeText(args.approvedPlanBaseline) ? now : undefined,
    lastRescanAt: undefined,
    planInvalidationReason: sanitizeText(args.planInvalidationReason),
    note: sanitizeText(args.note),
    completedAt: phase === "complete" ? now : undefined,
  };
}

function configureState(existing: WorkflowState, args: WorkflowToolArgs): WorkflowState {
  const next: WorkflowState = {
    ...existing,
    updatedAt: new Date().toISOString(),
    targetPath: args.targetPath ? normalizePath(args.targetPath) : existing.targetPath,
    mode: isMode(args.mode) ? args.mode : existing.mode,
    reviewerModel: args.reviewerModel !== undefined ? sanitizeText(args.reviewerModel) : existing.reviewerModel,
    reviewerThinking:
      args.reviewerThinking !== undefined
        ? isThinking(args.reviewerThinking)
          ? args.reviewerThinking
          : undefined
        : existing.reviewerThinking,
    executionPolicy:
      args.executionPolicy !== undefined && isExecutionPolicy(args.executionPolicy)
        ? args.executionPolicy
        : existing.executionPolicy,
    rescanPolicy:
      args.rescanPolicy !== undefined && isRescanPolicy(args.rescanPolicy)
        ? args.rescanPolicy
        : existing.rescanPolicy,
    retriagePolicy:
      args.retriagePolicy !== undefined && isRetriagePolicy(args.retriagePolicy)
        ? args.retriagePolicy
        : existing.retriagePolicy,
    expensivePlanningAllowed:
      typeof args.expensivePlanningAllowed === "boolean"
        ? args.expensivePlanningAllowed
        : existing.expensivePlanningAllowed,
    approvedPlanBaseline:
      args.approvedPlanBaseline !== undefined ? sanitizeText(args.approvedPlanBaseline) : existing.approvedPlanBaseline,
    planInvalidationReason:
      args.planInvalidationReason !== undefined
        ? sanitizeText(args.planInvalidationReason)
        : existing.planInvalidationReason,
    note: args.note !== undefined ? sanitizeText(args.note) : existing.note,
  };

  if (args.approvedPlanBaseline !== undefined && next.approvedPlanBaseline) {
    next.lastPlanApprovalAt = next.updatedAt;
  }

  return next;
}

function setPhaseState(existing: WorkflowState, phase: WorkflowPhase, note?: string): WorkflowState {
  const now = new Date().toISOString();
  if (phase === "complete") {
    return {
      ...existing,
      active: false,
      phase,
      updatedAt: now,
      completedAt: now,
      note: sanitizeText(note) ?? existing.note,
    };
  }

  return {
    ...existing,
    active: true,
    phase,
    updatedAt: now,
    note: sanitizeText(note) ?? existing.note,
  };
}

function approvePlanState(existing: WorkflowState, args: WorkflowToolArgs): WorkflowState {
  const now = new Date().toISOString();
  const approvedPlanBaseline = sanitizeText(args.approvedPlanBaseline) ?? existing.approvedPlanBaseline;
  if (!approvedPlanBaseline) {
    throw new Error("approve_plan requires approvedPlanBaseline=<summary> when no baseline is stored yet");
  }

  return {
    ...existing,
    updatedAt: now,
    approvedPlanBaseline,
    lastPlanApprovalAt: now,
    planInvalidationReason: undefined,
    note: sanitizeText(args.note) ?? existing.note,
  };
}

function invalidatePlanState(existing: WorkflowState, args: WorkflowToolArgs): WorkflowState {
  const reason = sanitizeText(args.planInvalidationReason) ?? sanitizeText(args.note);
  if (!reason) {
    throw new Error("invalidate_plan requires planInvalidationReason=<reason> or note=<reason>");
  }

  return {
    ...existing,
    updatedAt: new Date().toISOString(),
    planInvalidationReason: reason,
    note: sanitizeText(args.note) ?? existing.note,
  };
}

function recordRescanState(existing: WorkflowState, args: WorkflowToolArgs): WorkflowState {
  return {
    ...existing,
    updatedAt: new Date().toISOString(),
    lastRescanAt: new Date().toISOString(),
    note: sanitizeText(args.note) ?? existing.note,
  };
}

function completeState(existing: WorkflowState, note?: string): WorkflowState {
  return setPhaseState(existing, "complete", note);
}

function applyAction(pi: ExtensionAPI, ctx: ExtensionContext, currentState: WorkflowState | null, args: WorkflowToolArgs): WorkflowState | null {
  switch (args.action) {
    case "status":
      return currentState;
    case "start": {
      const next = startState(ctx, args);
      persistSnapshot(pi, "start", next, args.note);
      updateRuntimeState(ctx, next);
      return next;
    }
    case "configure": {
      const active = requireActiveState(currentState);
      const next = configureState(active, args);
      persistSnapshot(pi, "configure", next, args.note);
      updateRuntimeState(ctx, next);
      return next;
    }
    case "set_phase": {
      const active = requireActiveState(currentState);
      if (!isPhase(args.phase)) {
        throw new Error(`set_phase requires phase=${PHASES.join("|")}`);
      }
      const next = setPhaseState(active, args.phase, args.note);
      persistSnapshot(pi, args.phase === "complete" ? "complete" : "set_phase", next, args.note);
      updateRuntimeState(ctx, next);
      return next;
    }
    case "approve_plan": {
      const active = requireActiveState(currentState);
      const next = approvePlanState(active, args);
      persistSnapshot(pi, "approve_plan", next, args.note);
      updateRuntimeState(ctx, next);
      return next;
    }
    case "invalidate_plan": {
      const active = requireActiveState(currentState);
      const next = invalidatePlanState(active, args);
      persistSnapshot(pi, "invalidate_plan", next, args.note);
      updateRuntimeState(ctx, next);
      return next;
    }
    case "record_rescan": {
      const active = requireActiveState(currentState);
      const next = recordRescanState(active, args);
      persistSnapshot(pi, "record_rescan", next, args.note);
      updateRuntimeState(ctx, next);
      return next;
    }
    case "complete": {
      const active = requireActiveState(currentState);
      const next = completeState(active, args.note);
      persistSnapshot(pi, "complete", next, args.note);
      updateRuntimeState(ctx, next);
      return next;
    }
    case "clear": {
      persistSnapshot(pi, "clear", null, args.note);
      updateRuntimeState(ctx, null);
      return null;
    }
  }
}

function buildToolResultText(action: WorkflowToolArgs["action"], state: WorkflowState | null): string {
  const prefix = action === "status" ? "Current" : "Updated";
  return `${prefix} desloppify workflow state:\n\n${formatStateSummary(state)}`;
}

function parseCommandArgs(args: string): WorkflowToolArgs {
  const { positional, values } = parseKeyValueArgs(args);
  let actionToken = positional.shift() ?? "status";

  if (actionToken === "phase") actionToken = "set_phase";
  if (actionToken === "approve-plan") actionToken = "approve_plan";
  if (actionToken === "invalidate-plan") actionToken = "invalidate_plan";
  if (actionToken === "record-rescan") actionToken = "record_rescan";

  const action = actionToken as WorkflowToolArgs["action"];

  const parsed: WorkflowToolArgs = {
    action,
    mode: values.mode as WorkflowMode | undefined,
    targetPath: values.target ?? values.targetPath,
    phase: values.phase as WorkflowPhase | undefined,
    reviewerModel: values.reviewerModel ?? values.model,
    reviewerThinking: values.reviewerThinking as ReviewerThinking | undefined,
    executionPolicy: values.executionPolicy as ExecutionPolicy | undefined,
    rescanPolicy: values.rescanPolicy as RescanPolicy | undefined,
    retriagePolicy: values.retriagePolicy as RetriagePolicy | undefined,
    expensivePlanningAllowed: parseBoolean(values.expensivePlanningAllowed),
    approvedPlanBaseline: values.approvedPlanBaseline ?? values.baseline,
    planInvalidationReason: values.planInvalidationReason ?? values.reason,
    note: values.note,
  };

  if (action === "start") {
    if (!parsed.mode && positional[0] && isMode(positional[0])) parsed.mode = positional.shift() as WorkflowMode;
    if (!parsed.targetPath && positional[0]) parsed.targetPath = positional.shift();
    if (!parsed.reviewerModel && positional[0]) parsed.reviewerModel = positional.shift();
    if (!parsed.reviewerThinking && positional[0] && isThinking(positional[0])) {
      parsed.reviewerThinking = positional.shift() as ReviewerThinking;
    }
  }

  if (action === "set_phase" && !parsed.phase && positional[0] && isPhase(positional[0])) {
    parsed.phase = positional.shift() as WorkflowPhase;
  }

  if (action === "approve_plan" && !parsed.approvedPlanBaseline && positional.length > 0) {
    parsed.approvedPlanBaseline = positional.join(" ");
  }

  if (action === "invalidate_plan" && !parsed.planInvalidationReason && positional.length > 0) {
    parsed.planInvalidationReason = positional.join(" ");
  }

  if (["complete", "clear", "status", "record_rescan"].includes(action) && !parsed.note && positional.length > 0) {
    parsed.note = positional.join(" ");
  }

  return parsed;
}

function getCommandUsage(): string {
  return [
    "Usage:",
    "/desloppify-workflow status",
    "/desloppify-workflow start mode=<objective-only|full> target=. reviewerModel=<model> reviewerThinking=<minimal|low|medium|high|xhigh> executionPolicy=<cheap|normal> rescanPolicy=<manual|batch-boundary|normal> retriagePolicy=<manual|if-invalidated|normal> expensivePlanningAllowed=<true|false>",
    "/desloppify-workflow configure executionPolicy=<cheap|normal> rescanPolicy=<manual|batch-boundary|normal> retriagePolicy=<manual|if-invalidated|normal> expensivePlanningAllowed=<true|false>",
    "/desloppify-workflow phase <phase>",
    "/desloppify-workflow approve-plan baseline=\"cluster plan summary\"",
    "/desloppify-workflow invalidate-plan reason=\"why the baseline is no longer valid\"",
    "/desloppify-workflow record-rescan note=\"why this rescan happened\"",
    "/desloppify-workflow complete note=\"done\"",
    "/desloppify-workflow clear",
  ].join("\n");
}

function isDesloppifyCommand(command: string): boolean {
  return /\bdesloppify\b/.test(command);
}

function isHelpishDesloppifyCommand(command: string): boolean {
  return /\b--help\b/.test(command) || /\bhelp\b/.test(command);
}

function isStagePromptCommand(command: string): boolean {
  return /\b--stage-prompt\b/.test(command);
}

function isDesloppifyScanCommand(command: string): boolean {
  return /\bdesloppify\b[\s\S]*\bscan\b/.test(command);
}

function isDesloppifyPlanTriageCommand(command: string): boolean {
  return /\bdesloppify\b[\s\S]*\bplan\b[\s\S]*\btriage\b/.test(command);
}

function isExpensiveRunnerPlanningCommand(command: string): boolean {
  return isDesloppifyCommand(command) && (/\b--run-stages\b/.test(command) || /\b--runner\b/.test(command));
}

function getScanBlockReason(state: WorkflowState): string | null {
  if (state.phase === "scan") return null;
  if (state.rescanPolicy === "normal") return null;
  if (state.rescanPolicy === "manual") {
    return [
      "Blocked by desloppify workflow policy: rescans are manual-only right now.",
      "Do not rescan after small cleanup slices without explicit user approval.",
      "If a rescan is approved, update the workflow state and move the phase back to scan first.",
    ].join(" ");
  }

  return [
    "Blocked by desloppify workflow policy: no eager rescans during execution.",
    "Rescan only at a meaningful batch boundary, when the queue is blocked, after a material subsystem shift, or when the user explicitly approves it.",
    "If a rescan is approved, update the workflow state and move the phase back to scan first.",
  ].join(" ");
}

function getRetriageBlockReason(state: WorkflowState): string | null {
  if (state.retriagePolicy === "normal") return null;
  if (state.phase !== "execution") return null;
  if (state.retriagePolicy === "manual") {
    return [
      "Blocked by desloppify workflow policy: replanning/retriage requires explicit user approval during execution.",
      "Use the current approved plan baseline and continue with the next concrete fix slice instead.",
    ].join(" ");
  }
  if (state.planInvalidationReason) return null;
  return [
    "Blocked by desloppify workflow policy: the approved plan baseline has not been invalidated.",
    "Do not re-triage just because a few queue items shifted after a small fix slice.",
    "Continue execution, or explicitly invalidate the stored plan baseline first if it is truly no longer usable.",
  ].join(" ");
}

function maybeNotifyBlocked(ctx: ExtensionContext, reason: string): void {
  if (ctx.hasUI) ctx.ui.notify(reason, "warning");
}

function maybeRecordRescan(pi: ExtensionAPI, ctx: ExtensionContext, currentState: WorkflowState | null): WorkflowState | null {
  if (!currentState || !currentState.active || currentState.phase === "complete") return currentState;
  const next = {
    ...currentState,
    updatedAt: new Date().toISOString(),
    lastRescanAt: new Date().toISOString(),
  };
  persistSnapshot(pi, "record_rescan", next, "auto-recorded after successful desloppify scan");
  updateRuntimeState(ctx, next);
  return next;
}

export default function desloppifyWorkflow(pi: ExtensionAPI): void {
  let state: WorkflowState | null = null;

  function rehydrate(ctx: ExtensionContext): void {
    state = readWorkflowState(ctx);
    updateRuntimeState(ctx, state);
  }

  pi.registerCommand("desloppify-workflow", {
    description: "Manage persistent desloppify workflow state",
    handler: async (args, ctx: ExtensionCommandContext) => {
      try {
        const parsed = parseCommandArgs(args);
        if (
          ![
            "status",
            "start",
            "configure",
            "set_phase",
            "approve_plan",
            "invalidate_plan",
            "record_rescan",
            "complete",
            "clear",
          ].includes(parsed.action)
        ) {
          ctx.ui.notify(getCommandUsage(), "error");
          return;
        }
        state = applyAction(pi, ctx, state, parsed);
        ctx.ui.notify(buildToolResultText(parsed.action, state), "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerTool({
    name: "desloppify_workflow",
    label: "Desloppify Workflow",
    description:
      "Track and update active desloppify workflow state so phase rules, cost-control policy, and approved-plan guardrails persist across compactions.",
    promptSnippet:
      "Track the active desloppify workflow mode, reviewer settings, phase, approved plan baseline, and cost-control policy.",
    promptGuidelines: [
      "When running a supervised desloppify workflow, use this tool to start the run, store reviewer settings, update the current phase, record the approved plan baseline, and mark the run complete.",
      "Keep the current phase and cost-control policy accurate so per-turn workflow instructions stay correct after compactions.",
      "If the user wants cheap execution mode, keep expensive planning disabled and avoid eager rescans or retriage until explicitly approved.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("status"),
        Type.Literal("start"),
        Type.Literal("configure"),
        Type.Literal("set_phase"),
        Type.Literal("approve_plan"),
        Type.Literal("invalidate_plan"),
        Type.Literal("record_rescan"),
        Type.Literal("complete"),
        Type.Literal("clear"),
      ]),
      mode: Type.Optional(Type.Union([Type.Literal("objective-only"), Type.Literal("full")])),
      targetPath: Type.Optional(Type.String()),
      phase: Type.Optional(
        Type.Union(PHASES.map((phase) => Type.Literal(phase)) as [ReturnType<typeof Type.Literal>, ...ReturnType<typeof Type.Literal>[]]),
      ),
      reviewerModel: Type.Optional(Type.String()),
      reviewerThinking: Type.Optional(
        Type.Union(
          THINKING_LEVELS.map((level) => Type.Literal(level)) as [ReturnType<typeof Type.Literal>, ...ReturnType<typeof Type.Literal>[]],
        ),
      ),
      executionPolicy: Type.Optional(
        Type.Union(
          EXECUTION_POLICIES.map((policy) => Type.Literal(policy)) as [ReturnType<typeof Type.Literal>, ...ReturnType<typeof Type.Literal>[]],
        ),
      ),
      rescanPolicy: Type.Optional(
        Type.Union(
          RESCAN_POLICIES.map((policy) => Type.Literal(policy)) as [ReturnType<typeof Type.Literal>, ...ReturnType<typeof Type.Literal>[]],
        ),
      ),
      retriagePolicy: Type.Optional(
        Type.Union(
          RETRIAGE_POLICIES.map((policy) => Type.Literal(policy)) as [ReturnType<typeof Type.Literal>, ...ReturnType<typeof Type.Literal>[]],
        ),
      ),
      expensivePlanningAllowed: Type.Optional(Type.Boolean()),
      approvedPlanBaseline: Type.Optional(Type.String()),
      planInvalidationReason: Type.Optional(Type.String()),
      note: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, args, _signal, _onUpdate, ctx) {
      state = applyAction(pi, ctx, state, args as WorkflowToolArgs);
      return {
        content: [{ type: "text", text: buildToolResultText(args.action as WorkflowToolArgs["action"], state) }],
        details: { state },
      };
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    rehydrate(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    rehydrate(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    rehydrate(ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    rehydrate(ctx);
  });

  pi.on("before_agent_start", async (event) => {
    if (!state || !state.active || state.phase === "complete") return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildInjectedPrompt(state)}`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!state || !state.active || state.phase === "complete") return;
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");
    if (!isDesloppifyCommand(command) || isHelpishDesloppifyCommand(command) || isStagePromptCommand(command)) {
      return;
    }

    if (!state.expensivePlanningAllowed && isExpensiveRunnerPlanningCommand(command)) {
      const reason =
        "Blocked by desloppify workflow policy: expensive runner-backed planning is not approved. Do not use `desloppify ... --run-stages` or `--runner ...` unless the user explicitly approves it and the workflow state is updated.";
      maybeNotifyBlocked(ctx, reason);
      return { block: true, reason };
    }

    if (isDesloppifyScanCommand(command)) {
      const reason = getScanBlockReason(state);
      if (reason) {
        maybeNotifyBlocked(ctx, reason);
        return { block: true, reason };
      }
    }

    if (isDesloppifyPlanTriageCommand(command)) {
      const reason = getRetriageBlockReason(state);
      if (reason) {
        maybeNotifyBlocked(ctx, reason);
        return { block: true, reason };
      }
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!state || !state.active || state.phase === "complete") return;
    if (event.toolName !== "bash" || event.isError) return;

    const command = String(event.input.command ?? "");
    if (isDesloppifyScanCommand(command)) {
      state = maybeRecordRescan(pi, ctx, state);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    state = null;
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
