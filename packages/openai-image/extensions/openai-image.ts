import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

type ImageOptions = {
  prompt: string;
  size: string;
  model: string;
};

type ImageToolParams = {
  prompt: string;
  outputPath?: string;
  size?: string;
  model?: string;
};

const DEFAULT_MODEL = "gpt-image-1";
const DEFAULT_SIZE = "1024x1024";
const SUPPORTED_MODELS = ["gpt-image-1", "dall-e-3"] as const;
const SUPPORTED_SIZES = ["1024x1024", "1024x1536", "1536x1024", "auto"] as const;

function getApiKey(): string | null {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) return envKey;

  try {
    const authPath = path.join(os.homedir(), ".pi", "agent", "auth.json");
    if (!fs.existsSync(authPath)) return null;
    const data = JSON.parse(fs.readFileSync(authPath, "utf8"));
    const entry = data?.openai;
    if (entry?.type === "api_key" && typeof entry.key === "string") {
      return entry.key.trim();
    }
  } catch (_err) {
    return null;
  }

  return null;
}

function parseArgs(args: string): Partial<ImageOptions> & { prompt?: string } {
  let prompt = args.trim();
  let size: string | undefined;
  let model: string | undefined;

  const sizeMatch = prompt.match(/--size(?:=|\s+)(\S+)/i);
  if (sizeMatch) {
    size = sizeMatch[1];
    prompt = prompt.replace(sizeMatch[0], "").trim();
  }

  const modelMatch = prompt.match(/--model(?:=|\s+)(\S+)/i);
  if (modelMatch) {
    model = modelMatch[1];
    prompt = prompt.replace(modelMatch[0], "").trim();
  }

  return { prompt, size, model };
}

function normalizeOption(value: string | undefined, options: readonly string[]): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  return options.includes(normalized) ? normalized : undefined;
}

function ensurePrompt(prompt: string | undefined): string | null {
  if (!prompt) return null;
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function collectOptions(
  args: string,
  ctx: { ui: ExtensionAPI["ui"] }
): Promise<ImageOptions | null> {
  const parsed = parseArgs(args);
  let prompt = ensurePrompt(parsed.prompt);
  let size = normalizeOption(parsed.size, SUPPORTED_SIZES);
  let model = normalizeOption(parsed.model, SUPPORTED_MODELS);

  if (!prompt) {
    prompt = await ctx.ui.input("Image prompt:", "Describe the image...");
    if (!prompt) return null;
  }

  if (!model) {
    model = (await ctx.ui.select("Model:", [...SUPPORTED_MODELS])) ?? undefined;
    if (!model) return null;
  }

  if (!size) {
    size = (await ctx.ui.select("Size:", [...SUPPORTED_SIZES])) ?? undefined;
    if (!size) return null;
  }

  return {
    prompt,
    model,
    size,
  };
}

function buildPayload(options: ImageOptions) {
  const payload: Record<string, unknown> = {
    model: options.model,
    prompt: options.prompt,
    size: options.size,
    n: 1,
  };

  if (options.model === "dall-e-3") {
    payload.quality = "standard";
    payload.style = "natural";
  }

  return payload;
}

async function generateImage(apiKey: string, options: ImageOptions): Promise<Buffer> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPayload(options)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  const entry = data?.data?.[0];
  if (!entry) {
    throw new Error("OpenAI response did not include image data.");
  }

  if (entry.b64_json) {
    return Buffer.from(entry.b64_json, "base64");
  }

  if (entry.url) {
    const imageResponse = await fetch(entry.url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status}`);
    }
    const arrayBuffer = await imageResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error("OpenAI response did not include usable image data.");
}

async function writeImageFile(buffer: Buffer, outputPath?: string): Promise<string> {
  const fileName = `pi-image-${Date.now()}-${Math.random().toString(16).slice(2)}.png`;
  const resolvedPath = outputPath
    ? path.resolve(process.cwd(), outputPath)
    : path.join(os.tmpdir(), fileName);
  const finalPath = path.extname(resolvedPath) ? resolvedPath : `${resolvedPath}.png`;
  await fsp.mkdir(path.dirname(finalPath), { recursive: true });
  await fsp.writeFile(finalPath, buffer);
  return finalPath;
}

function normalizeToolOptions(params: ImageToolParams): ImageOptions {
  const model = normalizeOption(params.model, SUPPORTED_MODELS) ?? DEFAULT_MODEL;
  const size = normalizeOption(params.size, SUPPORTED_SIZES) ?? DEFAULT_SIZE;
  return { prompt: params.prompt.trim(), model, size };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "openai_image",
    label: "OpenAI Image",
    description: "Generate an image via OpenAI and save it to a file.",
    parameters: Type.Object({
      prompt: Type.String({ description: "Image prompt" }),
      outputPath: Type.Optional(Type.String({ description: "Output path for the image file" })),
      size: Type.Optional(
        Type.String({ description: "Image size (1024x1024, 1024x1536, 1536x1024, auto)" })
      ),
      model: Type.Optional(Type.String({ description: "Model (gpt-image-1 or dall-e-3)" })),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, _ctx) {
      const apiKey = getApiKey();
      if (!apiKey) {
        return {
          content: [
            { type: "text", text: "OPENAI_API_KEY is missing. Set it in your shell or auth.json." },
          ],
          details: {},
          isError: true,
        };
      }

      const options = normalizeToolOptions(params as ImageToolParams);
      if (!options.prompt) {
        return {
          content: [{ type: "text", text: "Prompt cannot be empty." }],
          details: {},
          isError: true,
        };
      }

      onUpdate?.({
        content: [
          {
            type: "text",
            text: `Generating image (${options.model}, ${options.size})...`,
          },
        ],
      });

      const buffer = await generateImage(apiKey, options);
      const outputPath = await writeImageFile(buffer, (params as ImageToolParams).outputPath);

      return {
        content: [{ type: "text", text: `Saved image to ${outputPath}` }],
        details: { outputPath },
      };
    },
  });

  pi.registerCommand("image", {
    description: "Generate an image via OpenAI and insert @file into the prompt",
    handler: async (args, ctx) => {
      const apiKey = getApiKey();
      if (!apiKey) {
        ctx.ui.notify(
          "OPENAI_API_KEY is missing. Set it in your shell or ~/.pi/agent/auth.json.",
          "warning"
        );
        return;
      }

      const options = await collectOptions(args, ctx);
      if (!options) return;

      ctx.ui.setStatus("openai-image", "Generating image...");

      try {
        const buffer = await generateImage(apiKey, options);
        const outputPath = await writeImageFile(buffer);

        const current = ctx.ui.getEditorText();
        const separator = current && !current.endsWith(" ") ? " " : "";
        ctx.ui.setEditorText(`${current}${separator}@${outputPath}`);

        ctx.ui.setStatus("openai-image", `Image saved: ${outputPath}`);
        ctx.ui.notify(`Image generated and inserted: @${outputPath}`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Image generation failed.";
        ctx.ui.setStatus("openai-image", undefined);
        ctx.ui.notify(message, "error");
      }
    },
  });
}
