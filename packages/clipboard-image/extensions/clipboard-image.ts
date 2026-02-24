import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import os from "node:os";
import path from "node:path";

const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];
const BMP_IMAGE_TYPES = [
  "image/bmp",
  "image/x-bmp",
  "image/x-ms-bmp",
  "image/x-ms-bitmap",
];
const MAX_DIMENSION = 2000;
const OUTPUT_FORMAT = "png";
const STATUS_KEY = "clipboard-image";

type ExecResult = {
  code?: number;
  stdout: string;
  stderr: string;
};

type CaptureResult = {
  outputPath: string;
  inputType: string;
  backend: string;
};

function pickImageType(types: string[]): string | null {
  for (const type of SUPPORTED_IMAGE_TYPES) {
    if (types.includes(type)) return type;
  }
  for (const type of BMP_IMAGE_TYPES) {
    if (types.includes(type)) return type;
  }
  return types.find((type) => type.startsWith("image/")) ?? null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function psQuote(value: string): string {
  return value.replace(/'/g, "''");
}

function formatTimestamp(): string {
  const now = new Date();
  const pad = (num: number) => num.toString().padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` +
    `-${Math.random().toString(16).slice(2, 8)}`
  );
}

function createOutputPath(): string {
  return path.join(os.tmpdir(), `pi-clipboard-${formatTimestamp()}.${OUTPUT_FORMAT}`);
}

function parseTypes(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function errorFromExec(prefix: string, result: ExecResult): Error {
  const details = result.stderr.trim() || result.stdout.trim() || "unknown error";
  return new Error(`${prefix}: ${details}`);
}

async function execBash(pi: ExtensionAPI, command: string, timeout: number): Promise<ExecResult> {
  return pi.exec("bash", ["-lc", `set -o pipefail; ${command}`], { timeout }) as Promise<ExecResult>;
}

async function captureViaWayland(pi: ExtensionAPI, outputPath: string): Promise<CaptureResult> {
  const listResult = await execBash(pi, "wl-paste --list-types", 3000);
  if ((listResult.code ?? 0) !== 0) {
    throw errorFromExec("wl-paste --list-types failed", listResult);
  }

  const types = parseTypes(listResult.stdout);
  const imageType = pickImageType(types);
  if (!imageType) {
    throw new Error(`No image in clipboard (types: ${types.slice(0, 8).join(", ") || "none"}).`);
  }

  const capture = [
    `wl-paste --type ${shellQuote(imageType)}`,
    `convert - -resize '${MAX_DIMENSION}x${MAX_DIMENSION}>' -strip ${OUTPUT_FORMAT}:${shellQuote(outputPath)}`,
  ].join(" | ");

  const result = await execBash(pi, capture, 10000);
  if ((result.code ?? 0) !== 0) {
    throw errorFromExec("Wayland clipboard capture failed", result);
  }

  return { outputPath, inputType: imageType, backend: "wayland" };
}

async function captureViaX11(pi: ExtensionAPI, outputPath: string): Promise<CaptureResult> {
  const listResult = await execBash(pi, "xclip -selection clipboard -t TARGETS -o", 3000);
  if ((listResult.code ?? 0) !== 0) {
    throw errorFromExec("xclip TARGETS query failed", listResult);
  }

  const types = parseTypes(listResult.stdout);
  const imageType = pickImageType(types);
  if (!imageType) {
    throw new Error(`No image in clipboard (types: ${types.slice(0, 8).join(", ") || "none"}).`);
  }

  const capture = [
    `xclip -selection clipboard -t ${shellQuote(imageType)} -o`,
    `convert - -resize '${MAX_DIMENSION}x${MAX_DIMENSION}>' -strip ${OUTPUT_FORMAT}:${shellQuote(outputPath)}`,
  ].join(" | ");

  const result = await execBash(pi, capture, 10000);
  if ((result.code ?? 0) !== 0) {
    throw errorFromExec("X11 clipboard capture failed", result);
  }

  return { outputPath, inputType: imageType, backend: "x11" };
}

async function captureViaMacOS(pi: ExtensionAPI, outputPath: string): Promise<CaptureResult> {
  const capture = `pngpaste ${shellQuote(outputPath)} && (sips -Z ${MAX_DIMENSION} ${shellQuote(outputPath)} >/dev/null 2>&1 || true)`;
  const result = await execBash(pi, capture, 10000);
  if ((result.code ?? 0) !== 0) {
    throw errorFromExec("macOS clipboard capture failed (requires pngpaste)", result);
  }

  return { outputPath, inputType: "image/png", backend: "macos" };
}

async function execPowerShell(
  pi: ExtensionAPI,
  command: string,
  timeout: number,
): Promise<ExecResult> {
  const candidates = ["powershell", "pwsh"];
  let lastError: Error | null = null;

  for (const bin of candidates) {
    try {
      const result = (await pi.exec(
        bin,
        ["-NoProfile", "-NonInteractive", "-Sta", "-Command", command],
        { timeout },
      )) as ExecResult;

      const stderr = (result.stderr || "").toLowerCase();
      const notFound =
        (result.code ?? 0) !== 0 &&
        (stderr.includes("not recognized") || stderr.includes("not found"));
      if (!notFound) return result;

      lastError = new Error(`${bin} is not available`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("No PowerShell executable found.");
}

async function captureViaWindows(pi: ExtensionAPI, outputPath: string): Promise<CaptureResult> {
  const quotedPath = psQuote(outputPath);
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) {
  Write-Error "No image in clipboard."
  exit 2
}

$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -eq $img) {
  Write-Error "No image in clipboard."
  exit 2
}

$max = ${MAX_DIMENSION}
if ($img.Width -gt $max -or $img.Height -gt $max) {
  $scale = [Math]::Min($max / [double]$img.Width, $max / [double]$img.Height)
  $newWidth = [Math]::Max(1, [int]([Math]::Round($img.Width * $scale)))
  $newHeight = [Math]::Max(1, [int]([Math]::Round($img.Height * $scale)))

  $resized = New-Object System.Drawing.Bitmap($newWidth, $newHeight)
  $graphics = [System.Drawing.Graphics]::FromImage($resized)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($img, 0, 0, $newWidth, $newHeight)
  $graphics.Dispose()
  $img.Dispose()
  $img = $resized
}

$img.Save('${quotedPath}', [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
Write-Output "image/png"
`;

  const result = await execPowerShell(pi, script, 12000);
  if ((result.code ?? 0) !== 0) {
    throw errorFromExec("Windows clipboard capture failed", result);
  }

  return { outputPath, inputType: "image/png", backend: "windows" };
}

async function writeClipboardImage(pi: ExtensionAPI): Promise<CaptureResult> {
  const outputPath = createOutputPath();
  const attempts: string[] = [];

  async function attempt(name: string, fn: () => Promise<CaptureResult>): Promise<CaptureResult | null> {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push(`${name}: ${message}`);
      return null;
    }
  }

  const platform = process.platform;

  if (platform === "win32") {
    const result = await attempt("windows", () => captureViaWindows(pi, outputPath));
    if (result) return result;
  } else if (platform === "darwin") {
    const result = await attempt("macos", () => captureViaMacOS(pi, outputPath));
    if (result) return result;
  } else {
    const wayland = await attempt("wayland", () => captureViaWayland(pi, outputPath));
    if (wayland) return wayland;

    const x11 = await attempt("x11", () => captureViaX11(pi, outputPath));
    if (x11) return x11;
  }

  throw new Error(
    "Clipboard image capture failed. Tried backends:\n" +
      attempts.map((entry) => `- ${entry}`).join("\n"),
  );
}

function appendToEditor(ctx: ExtensionContext, ref: string): void {
  const current = ctx.ui.getEditorText();
  const separator = current && !current.endsWith(" ") && !current.endsWith("\n") ? " " : "";
  ctx.ui.setEditorText(`${current}${separator}${ref}`);
}

async function pasteImage(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  ctx.ui.setStatus(STATUS_KEY, "Reading clipboard image…");

  try {
    const { outputPath, inputType, backend } = await writeClipboardImage(pi);
    appendToEditor(ctx, `@${outputPath}`);

    ctx.ui.setStatus(STATUS_KEY, `Pasted (${inputType} → ${OUTPUT_FORMAT}, ${backend}).`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clipboard capture failed.";
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.notify(message, "warning");
  }
}

export default function (pi: ExtensionAPI) {
  // Alt+V — paste clipboard image and append @file to prompt.
  pi.registerShortcut("alt+v", {
    description: "Paste clipboard image",
    handler: async (ctx) => pasteImage(pi, ctx),
  });

  pi.registerCommand("paste-image", {
    description: "Paste clipboard image into prompt",
    handler: async (_args, ctx) => pasteImage(pi, ctx),
  });
}
