import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Component, OverlayHandle, TUI } from "@mariozechner/pi-tui";

const STATUS_KEY = "prompt-timer";
const ENTRY_TYPE = "prompt-timer";

type UiMode = "off" | "status" | "overlay";

type TimerEntry = {
  startedAt: string;
  endedAt: string;
  durationMs: number;
};

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function fit(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width === 1) return "…";
  return `${text.slice(0, width - 1)}…`;
}

function parseUiMode(modeFlag: unknown, enabled: boolean): UiMode {
  if (!enabled) return "off";
  const raw = String(modeFlag ?? "overlay").trim().toLowerCase();
  if (raw === "status") return "status";
  if (raw === "off" || raw === "none" || raw === "false") return "off";
  return "overlay";
}

function getBranchTimerEntries(ctx: ExtensionContext): TimerEntry[] {
  return ctx.sessionManager
    .getBranch()
    .filter((e) => e.type === "custom" && "customType" in e && e.customType === ENTRY_TYPE)
    .map((e) => ("data" in e ? (e.data as TimerEntry) : undefined))
    .filter((d): d is TimerEntry => typeof d?.durationMs === "number");
}

export default function (pi: ExtensionAPI) {
  pi.registerFlag("prompt-timer-ui", {
    description: "Enable prompt timer UI",
    type: "boolean",
    default: true,
  });

  pi.registerFlag("prompt-timer-ui-mode", {
    description: "Prompt timer UI mode: overlay (default) or status",
    type: "string",
    default: "overlay",
  });

  pi.registerFlag("prompt-timer-persist", {
    description: "Persist prompt timing as custom session entries",
    type: "boolean",
    default: true,
  });

  let startTime: number | null = null;
  let lastDurationMs: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  let uiMode: UiMode = "overlay";
  let persistEnabled = true;

  let overlayHandle: OverlayHandle | null = null;
  let overlayTui: TUI | null = null;
  let overlayOpening = false;

  function clearIntervalTimer(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function clearStatus(ctx: ExtensionContext): void {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  function renderRunningStatus(ctx: ExtensionContext): void {
    if (uiMode !== "status" || !startTime) return;
    ctx.ui.setStatus(STATUS_KEY, `⏱ ${formatDuration(Date.now() - startTime)}`);
  }

  function renderFinalStatus(ctx: ExtensionContext): void {
    if (uiMode !== "status") return;
    if (lastDurationMs == null) {
      clearStatus(ctx);
      return;
    }
    ctx.ui.setStatus(STATUS_KEY, `⏱ last ${formatDuration(lastDurationMs)}`);
  }

  function closeOverlay(): void {
    if (overlayHandle) {
      overlayHandle.hide();
      overlayHandle = null;
    }
    overlayTui = null;
    overlayOpening = false;
  }

  function requestOverlayRender(): void {
    overlayTui?.requestRender();
  }

  function ensureOverlay(ctx: ExtensionContext): void {
    if (!ctx.hasUI || uiMode !== "overlay" || overlayHandle || overlayOpening) return;

    overlayOpening = true;

    void ctx.ui
      .custom<void>(
        (tui, _theme, _keybindings, _done) => {
          overlayTui = tui;

          const component: Component & { dispose?(): void } = {
            render(width: number): string[] {
              const running = startTime != null;
              const nowMs = running && startTime != null ? Date.now() - startTime : 0;
              const line1 = running ? `⏱ ${formatDuration(nowMs)} running` : "⏱ idle";
              const line2 = lastDurationMs != null ? `last ${formatDuration(lastDurationMs)}` : "last —";
              const line3 = running ? "working…" : "ready";

              return [fit(line1, width), fit(line2, width), fit(line3, width)];
            },
            invalidate(): void {},
            dispose(): void {
              overlayTui = null;
              overlayHandle = null;
              overlayOpening = false;
            },
          };

          return component;
        },
        {
          overlay: true,
          overlayOptions: {
            anchor: "top-right",
            width: 20,
            margin: { top: 1, right: 1 },
            nonCapturing: true,
            visible: (termWidth) => termWidth >= 70,
          },
          onHandle: (handle) => {
            overlayHandle = handle;
            overlayOpening = false;
          },
        },
      )
      .catch(() => {
        overlayTui = null;
        overlayHandle = null;
        overlayOpening = false;
      });
  }

  function persistTurn(startedAtMs: number, endedAtMs: number): void {
    if (!persistEnabled) return;
    const entry: TimerEntry = {
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: Math.max(0, endedAtMs - startedAtMs),
    };
    pi.appendEntry(ENTRY_TYPE, entry);
  }

  function refreshUi(ctx: ExtensionContext): void {
    if (uiMode === "overlay") {
      ensureOverlay(ctx);
      requestOverlayRender();
      return;
    }

    if (uiMode === "status") {
      if (startTime) renderRunningStatus(ctx);
      else renderFinalStatus(ctx);
      return;
    }

    clearStatus(ctx);
    closeOverlay();
  }

  pi.registerCommand("prompt-timer-stats", {
    description: "Show aggregate prompt timer stats for this branch",
    handler: async (_args, ctx) => {
      const entries = getBranchTimerEntries(ctx);

      if (entries.length === 0) {
        ctx.ui.notify("No prompt timer entries in this branch yet.", "info");
        return;
      }

      const totalMs = entries.reduce((acc, e) => acc + e.durationMs, 0);
      const avgMs = Math.round(totalMs / entries.length);
      const lastMs = entries[entries.length - 1]!.durationMs;

      ctx.ui.notify(
        `Timer stats: ${entries.length} runs, total ${formatDuration(totalMs)}, avg ${formatDuration(avgMs)}, last ${formatDuration(lastMs)}.`,
        "info",
      );
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const uiEnabled = pi.getFlag("prompt-timer-ui") !== false;
    uiMode = parseUiMode(pi.getFlag("prompt-timer-ui-mode"), uiEnabled);
    persistEnabled = pi.getFlag("prompt-timer-persist") !== false;

    const entries = getBranchTimerEntries(ctx);
    lastDurationMs = entries.length > 0 ? entries[entries.length - 1]!.durationMs : null;

    if (uiMode !== "overlay") closeOverlay();
    if (uiMode !== "status") clearStatus(ctx);

    refreshUi(ctx);
  });

  pi.on("agent_start", async (_event, ctx) => {
    clearIntervalTimer();

    startTime = Date.now();
    refreshUi(ctx);

    timer = setInterval(() => {
      if (uiMode === "overlay") {
        requestOverlayRender();
      } else if (uiMode === "status") {
        renderRunningStatus(ctx);
      }
    }, 1000);
  });

  pi.on("agent_end", async (_event, ctx) => {
    clearIntervalTimer();

    if (!startTime) {
      refreshUi(ctx);
      return;
    }

    const endedAt = Date.now();
    const durationMs = Math.max(0, endedAt - startTime);

    persistTurn(startTime, endedAt);
    lastDurationMs = durationMs;
    startTime = null;

    refreshUi(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearIntervalTimer();
    clearStatus(ctx);
    closeOverlay();
    startTime = null;
  });
}
