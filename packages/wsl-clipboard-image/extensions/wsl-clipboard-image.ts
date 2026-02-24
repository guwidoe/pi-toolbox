import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

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
const OUTPUT_PATH_PREFIX = "/tmp/pi-clipboard-";

function pickWslgImageType(types: string[]): string | null {
  for (const type of SUPPORTED_IMAGE_TYPES) {
    if (types.includes(type)) return type;
  }
  for (const type of BMP_IMAGE_TYPES) {
    if (types.includes(type)) return type;
  }
  return types.find((type) => type.startsWith("image/")) ?? null;
}

async function writeClipboardImage(
  pi: ExtensionAPI,
  outputPath: string,
): Promise<[string, string]> {
  const convertOptions = `-resize '${MAX_DIMENSION}x${MAX_DIMENSION}>' -strip`;
  const listResult = await pi.exec(
    "bash",
    ["-lc", "set -o pipefail; wl-paste --list-types"],
    { timeout: 3000 },
  );

  const listTypes = listResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const imageType = pickWslgImageType(listTypes);
  if (!imageType) {
    throw new Error(
      `No image in clipboard (types: ${listTypes.slice(0, 6).join(", ") || "none"}).`,
    );
  }

  const output = `${outputPath}.${OUTPUT_FORMAT}`;
  const capture = `set -o pipefail; wl-paste --type ${imageType} | convert - ${convertOptions} ${OUTPUT_FORMAT}:${output}`;
  const result = await pi.exec("bash", ["-lc", capture], { timeout: 8000 });

  if ((result.code ?? 0) !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(`Capture failed${stderr ? `: ${stderr}` : "."}`);
  }

  return [output, imageType];
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

function appendToEditor(ctx: ExtensionContext, ref: string): void {
  const current = ctx.ui.getEditorText();
  const separator = current && !current.endsWith(" ") && !current.endsWith("\n") ? " " : "";
  ctx.ui.setEditorText(`${current}${separator}${ref}`);
}

async function pasteImage(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  ctx.ui.setStatus("wsl-clipboard-image", "Reading clipboard…");

  try {
    const outputBase = `${OUTPUT_PATH_PREFIX}${formatTimestamp()}`;
    const [outputPath, inputType] = await writeClipboardImage(pi, outputBase);

    appendToEditor(ctx, `@${outputPath}`);

    ctx.ui.setStatus(
      "wsl-clipboard-image",
      `Pasted (${inputType} → ${OUTPUT_FORMAT}).`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clipboard capture failed.";
    ctx.ui.setStatus("wsl-clipboard-image", undefined);
    ctx.ui.notify(message, "warning");
  }
}

export default function (pi: ExtensionAPI) {
  // Alt+V — paste WSLg clipboard image, append to prompt
  // (Ctrl+V and Ctrl+Shift+ combos are captured by VS Code terminal)
  pi.registerShortcut("alt+v", {
    description: "Paste clipboard image (WSLg)",
    handler: async (ctx) => pasteImage(pi, ctx),
  });

  // Keep command for discoverability
  pi.registerCommand("paste-image", {
    description: "Paste WSLg clipboard image into prompt",
    handler: async (_args, ctx) => pasteImage(pi, ctx),
  });
}
