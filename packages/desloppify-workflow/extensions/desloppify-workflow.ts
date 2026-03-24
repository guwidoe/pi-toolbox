import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const ENTRY_TYPE = "desloppify-workflow";
const STATUS_KEY = "desloppify-workflow";
const VERSION = 1;

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

type WorkflowMode = (typeof MODES)[number];
type WorkflowPhase = (typeof PHASES)[number];
type ReviewerThinking = (typeof THINKING_LEVELS)[number];
type WorkflowAction = "start" | "configure" | "set_phase" | "complete" | "clear";

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
  note?: string;
  completedAt?: string;
};

type WorkflowEntry = {
  version: number;
  action: WorkflowAction;
  timestamp: string;
  note?: string;
  state: WorkflowState | null;
};

type WorkflowToolArgs = {
  action: "status" | WorkflowAction;
  mode?: WorkflowMode;
  targetPath?: string;
  phase?: WorkflowPhase;
  reviewerModel?: string;
  reviewerThinking?: ReviewerThinking;
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
    `desloppify workflow`,
    `- active: ${state.active ? "yes" : "no"}`,
    `- mode: ${formatMode(state.mode)}`,
    `- phase: ${state.phase}`,
    `- target path: ${state.targetPath}`,
    `- reviewer: ${formatReviewer(state)}`,
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
  return `🧽 ${mode} · ${state.phase}`;
}

function normalizePath(path: string | undefined): string {
  const trimmed = path?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : ".";
}

function readWorkflowState(ctx: ExtensionContext): WorkflowState | null {
  const entry = ctx.sessionManager
    .getBranch()
    .filter((item) => item.type === "custom" && "customType" in item && item.customType === ENTRY_TYPE)
    .map((item) => ("data" in item ? (item.data as WorkflowEntry | undefined) : undefined))
    .filter((item): item is WorkflowEntry => !!item && item.version === VERSION)
    .pop();

  return entry?.state ?? null;
}

function setStatus(ctx: ExtensionContext, state: WorkflowState | null): void {
  if (!ctx.hasUI) return;
  if (!state || !state.active || state.phase === "complete") {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", formatStatusLine(state)));
}

function buildPhaseInstructions(state: WorkflowState): string[] {
  switch (state.phase) {
    case "preflight":
      return [
        "Gather and confirm mode, target path, and reviewer settings before the scan starts.",
        "For full workflow mode, ensure reviewer model/thinking are explicitly configured before subjective review begins.",
      ];
    case "scan":
      return [
        "Figure out likely scan-noise directories before the first scan and exclude obvious junk first.",
        "Ensure .desloppify/ is ignored in git.",
        state.mode === "full"
          ? "Run the initial full-profile scan. Remember that `desloppify scan --profile full` does not inline reviewer agents; subjective review is a separate later step."
          : "Run only the objective scan path and do not start reviewer agents.",
        "When the scan is complete, stop at checkpoint-1 and report back.",
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
        "After batching, stop at checkpoint-3 and report back.",
      ];
    case "checkpoint-3":
      return [
        "Report the proposed implementation batches, their order, size/risk, and dependencies.",
        "Wait for user approval before starting execution.",
      ];
    case "execution":
      return [
        "Execute batches one by one using the desloppify queue.",
        "Commit every completed logical slice before resolving it — at least one commit per execution item or coherent batch slice.",
        "After each commit, record it with `desloppify plan commit-log record`.",
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
    `- run id: ${state.runId}`,
    "",
    "Global workflow rules:",
    "- Use the `desloppify_workflow` tool to keep mode, reviewer settings, phase, and completion state current.",
    "- Do not skip required user checkpoints.",
    "- Do not use wontfix/permanent skip to hide inconvenient real work.",
    "- In execution, commit every completed logical slice before resolve.",
    "- When the run is finished, mark it complete so these injected instructions stop.",
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
    reviewerModel: args.reviewerModel?.trim() || undefined,
    reviewerThinking: isThinking(args.reviewerThinking) ? args.reviewerThinking : undefined,
    note: args.note?.trim() || undefined,
    completedAt: phase === "complete" ? now : undefined,
  };
}

function configureState(existing: WorkflowState, args: WorkflowToolArgs): WorkflowState {
  return {
    ...existing,
    updatedAt: new Date().toISOString(),
    targetPath: args.targetPath ? normalizePath(args.targetPath) : existing.targetPath,
    mode: isMode(args.mode) ? args.mode : existing.mode,
    reviewerModel:
      args.reviewerModel !== undefined ? args.reviewerModel.trim() || undefined : existing.reviewerModel,
    reviewerThinking:
      args.reviewerThinking !== undefined
        ? isThinking(args.reviewerThinking)
          ? args.reviewerThinking
          : undefined
        : existing.reviewerThinking,
    note: args.note !== undefined ? args.note.trim() || undefined : existing.note,
  };
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
      note: note?.trim() || existing.note,
    };
  }

  return {
    ...existing,
    active: true,
    phase,
    updatedAt: now,
    note: note?.trim() || existing.note,
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
  const action = (positional.shift() ?? "status") as WorkflowToolArgs["action"];

  const parsed: WorkflowToolArgs = {
    action,
    mode: values.mode as WorkflowMode | undefined,
    targetPath: values.target ?? values.targetPath,
    phase: values.phase as WorkflowPhase | undefined,
    reviewerModel: values.reviewerModel ?? values.model,
    reviewerThinking: values.reviewerThinking as ReviewerThinking | undefined,
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

  if (action === "phase" || action === "set_phase") {
    parsed.action = "set_phase";
    if (!parsed.phase && positional[0] && isPhase(positional[0])) parsed.phase = positional.shift() as WorkflowPhase;
  }

  if (action === "configure") {
    // already parsed from key=value
  }

  if ((action === "complete" || action === "clear" || action === "status") && !parsed.note && positional.length > 0) {
    parsed.note = positional.join(" ");
  }

  return parsed;
}

function getCommandUsage(): string {
  return [
    "Usage:",
    "/desloppify-workflow status",
    "/desloppify-workflow start mode=<objective-only|full> target=. reviewerModel=<model> reviewerThinking=<minimal|low|medium|high|xhigh>",
    "/desloppify-workflow configure reviewerModel=<model> reviewerThinking=<level>",
    "/desloppify-workflow phase <phase>",
    "/desloppify-workflow complete note=\"done\"",
    "/desloppify-workflow clear",
  ].join("\n");
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
        if (!["status", "start", "configure", "set_phase", "complete", "clear"].includes(parsed.action)) {
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
    description: "Track and update active desloppify workflow state so phase rules persist across compactions.",
    promptSnippet: "Track the active desloppify workflow mode, reviewer settings, phase, and completion state.",
    promptGuidelines: [
      "When running a supervised desloppify workflow, use this tool to start the run, store reviewer settings, update the current phase, and mark the run complete.",
      "Keep the current phase accurate so per-turn workflow instructions stay correct after compactions.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("status"),
        Type.Literal("start"),
        Type.Literal("configure"),
        Type.Literal("set_phase"),
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

  pi.on("before_agent_start", async (event, ctx) => {
    if (!state || !state.active || state.phase === "complete") return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildInjectedPrompt(state)}`,
    };
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    state = null;
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
