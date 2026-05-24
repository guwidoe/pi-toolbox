import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
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
  killed?: boolean;
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
  const status = `exit code ${result.code ?? "unknown"}${result.killed ? ", killed" : ""}`;
  const details = result.stderr.trim() || result.stdout.trim() || status;
  return new Error(`${prefix}: ${details}`);
}

function isWsl(): boolean {
  if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) return true;

  try {
    return /microsoft|wsl/i.test(fs.readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
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

async function execPowerShellArgs(
  pi: ExtensionAPI,
  args: string[],
  timeout: number,
): Promise<ExecResult> {
  const windowsPowerShell = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
  const candidates: Array<{ bin: string; prefix?: string[] }> = isWsl()
    ? [
        { bin: "/init", prefix: [windowsPowerShell] },
        { bin: "powershell.exe" },
        { bin: windowsPowerShell },
        { bin: "pwsh.exe" },
        { bin: "powershell" },
        { bin: "pwsh" },
      ]
    : [
        { bin: "powershell.exe" },
        { bin: "pwsh.exe" },
        { bin: "powershell" },
        { bin: "pwsh" },
      ];
  let lastError: Error | null = null;

  for (const { bin, prefix = [] } of candidates) {
    if (bin.startsWith("/mnt/") && !fs.existsSync(bin)) continue;
    if (prefix.some((entry) => entry.startsWith("/mnt/") && !fs.existsSync(entry))) continue;

    try {
      const result = (await pi.exec(bin, [...prefix, ...args], { timeout })) as ExecResult;

      const stderr = (result.stderr || "").toLowerCase();
      const stdout = (result.stdout || "").toLowerCase();
      const noOutput = stderr.trim().length === 0 && stdout.trim().length === 0;
      const notFound =
        (result.code ?? 0) !== 0 &&
        (noOutput ||
          stderr.includes("not recognized") ||
          stderr.includes("not found") ||
          stderr.includes("command not found") ||
          stderr.includes("no such file or directory") ||
          stderr.includes("enoent") ||
          stderr.includes("cannot execute binary file") ||
          stderr.includes("exec format error") ||
          stdout.includes("command not found") ||
          stdout.includes("enoent") ||
          stdout.includes("cannot execute binary file") ||
          stdout.includes("exec format error"));
      if (!notFound) return result;

      lastError = new Error(`${bin} is not available`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("No PowerShell executable found.");
}

async function execPowerShellFile(
  pi: ExtensionAPI,
  scriptPath: string,
  timeout: number,
): Promise<ExecResult> {
  return execPowerShellArgs(
    pi,
    ["-NoProfile", "-NonInteractive", "-Sta", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    timeout,
  );
}

async function captureViaWindows(pi: ExtensionAPI, outputPath: string): Promise<CaptureResult> {
  const runningInWsl = isWsl();
  const scratchDir = runningInWsl ? "/mnt/c/Temp" : os.tmpdir();
  const runId = formatTimestamp();
  let powershellOutputPath = outputPath;
  let windowsOutputPath = outputPath;
  let scriptPath = path.join(os.tmpdir(), `pi-clipboard-${runId}.ps1`);
  let errorPath = path.join(os.tmpdir(), `pi-clipboard-${runId}.error.txt`);
  let windowsScriptPath = scriptPath;
  let windowsErrorPath = errorPath;

  if (runningInWsl) {
    fs.mkdirSync(scratchDir, { recursive: true });
    powershellOutputPath = path.join(scratchDir, `pi-clipboard-${runId}.${OUTPUT_FORMAT}`);
    scriptPath = path.join(scratchDir, `pi-clipboard-${runId}.ps1`);
    errorPath = path.join(scratchDir, `pi-clipboard-${runId}.error.txt`);

    const converted = await execBash(pi, `wslpath -w ${shellQuote(powershellOutputPath)}`, 3000);
    if ((converted.code ?? 0) !== 0 || !converted.stdout.trim()) {
      throw errorFromExec("WSL path conversion failed", converted);
    }
    windowsOutputPath = converted.stdout.trim();

    const convertedScriptPath = await execBash(pi, `wslpath -w ${shellQuote(scriptPath)}`, 3000);
    if ((convertedScriptPath.code ?? 0) !== 0 || !convertedScriptPath.stdout.trim()) {
      throw errorFromExec("WSL script path conversion failed", convertedScriptPath);
    }
    windowsScriptPath = convertedScriptPath.stdout.trim();

    const convertedErrorPath = await execBash(pi, `wslpath -w ${shellQuote(errorPath)}`, 3000);
    if ((convertedErrorPath.code ?? 0) !== 0 || !convertedErrorPath.stdout.trim()) {
      throw errorFromExec("WSL error path conversion failed", convertedErrorPath);
    }
    windowsErrorPath = convertedErrorPath.stdout.trim();
  }

  const quotedPath = psQuote(windowsOutputPath);
  const quotedErrorPath = psQuote(windowsErrorPath);
  const script = `
$ErrorActionPreference = "Stop"
$errorLogPath = '${quotedErrorPath}'
function FailClipboardImageCapture([string]$message, [int]$code) {
  try {
    $parent = Split-Path -Parent $errorLogPath
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Set-Content -LiteralPath $errorLogPath -Value $message -Encoding UTF8
  } catch {}
  Write-Output ("CLIPBOARD_IMAGE_ERROR: " + $message)
  exit $code
}
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $dataObject = [System.Windows.Forms.Clipboard]::GetDataObject()
  $formats = @()
  if ($null -ne $dataObject) {
    $formats = @($dataObject.GetFormats())
  }

  $ownedStreams = New-Object System.Collections.ArrayList
  $img = $null

  if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
    $img = [System.Windows.Forms.Clipboard]::GetImage()
  }

  if ($null -eq $img -and $null -ne $dataObject -and $dataObject.GetDataPresent([System.Windows.Forms.DataFormats]::Bitmap)) {
    $bitmapData = $dataObject.GetData([System.Windows.Forms.DataFormats]::Bitmap)
    if ($bitmapData -is [System.Drawing.Image]) {
      $img = $bitmapData
    }
  }

  if ($null -eq $img -and $null -ne $dataObject) {
    foreach ($format in @("PNG", "image/png")) {
      if (-not $dataObject.GetDataPresent($format)) { continue }
      $pngData = $dataObject.GetData($format)
      $stream = $null
      if ($pngData -is [System.IO.Stream]) {
        $stream = $pngData
        if ($stream.CanSeek) { $stream.Position = 0 }
      } elseif ($pngData -is [byte[]]) {
        $stream = [System.IO.MemoryStream]::new($pngData)
        [void]$ownedStreams.Add($stream)
      }
      if ($null -ne $stream) {
        $img = [System.Drawing.Image]::FromStream($stream)
        break
      }
    }
  }

  if ($null -eq $img -and $null -ne $dataObject -and $dataObject.GetDataPresent([System.Windows.Forms.DataFormats]::FileDrop)) {
    $files = @($dataObject.GetData([System.Windows.Forms.DataFormats]::FileDrop))
    foreach ($file in $files) {
      if ($file -match '\\.(png|jpe?g|bmp|gif|tiff?)$' -and [System.IO.File]::Exists($file)) {
        $img = [System.Drawing.Image]::FromFile($file)
        break
      }
    }
  }

  if ($null -eq $img -and [System.Windows.Forms.Clipboard]::ContainsText()) {
    $text = [System.Windows.Forms.Clipboard]::GetText().Trim()
    if ($text -match '^file://') {
      try { $text = ([System.Uri]$text).LocalPath } catch {}
    }
    if ($text -match '\\.(png|jpe?g|bmp|gif|tiff?)$' -and [System.IO.File]::Exists($text)) {
      $img = [System.Drawing.Image]::FromFile($text)
    }
  }

  if ($null -eq $img) {
    FailClipboardImageCapture ("No image in Windows clipboard. Formats: " + (($formats | Select-Object -First 16) -join ", ")) 2
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

  $parent = Split-Path -Parent '${quotedPath}'
  if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  $img.Save('${quotedPath}', [System.Drawing.Imaging.ImageFormat]::Png)
  $img.Dispose()
  foreach ($stream in $ownedStreams) { $stream.Dispose() }
  Write-Output "image/png"
} catch {
  $message = $_.Exception.GetType().FullName + ": " + $_.Exception.Message
  if ($formats -and $formats.Count -gt 0) {
    $message = $message + " Formats: " + (($formats | Select-Object -First 16) -join ", ")
  }
  FailClipboardImageCapture $message 1
}
`;

  fs.writeFileSync(scriptPath, script, "utf8");
  try {
    const result = await execPowerShellFile(pi, windowsScriptPath, 12000);
    if ((result.code ?? 0) !== 0) {
      const errorLog = fs.existsSync(errorPath) ? fs.readFileSync(errorPath, "utf8").trim() : "";
      const enrichedResult = errorLog
        ? { ...result, stderr: result.stderr || errorLog }
        : {
            ...result,
            stderr:
              result.stderr ||
              `exit code ${result.code ?? "unknown"}; no PowerShell output captured; script=${windowsScriptPath}; errorLog=${windowsErrorPath}`,
          };
      throw errorFromExec("Windows clipboard capture failed", enrichedResult);
    }
    if (runningInWsl) {
      fs.copyFileSync(powershellOutputPath, outputPath);
    }
  } finally {
    for (const cleanupPath of [scriptPath, errorPath, runningInWsl ? powershellOutputPath : undefined]) {
      if (!cleanupPath) continue;
      try {
        fs.unlinkSync(cleanupPath);
      } catch {
        // Ignore cleanup errors.
      }
    }
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
    if (isWsl()) {
      const windows = await attempt("windows-wsl", () => captureViaWindows(pi, outputPath));
      if (windows) return { ...windows, backend: "windows-wsl" };
    }

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
