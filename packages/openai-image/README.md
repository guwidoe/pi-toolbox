# @guwidoe/pi-openai-image

OpenAI image-generation extension for pi.

## Features

- `openai_image` tool (`prompt`, optional `outputPath`, `size`, `model`)
- `/image` command with interactive model/size selection
- Auto-inserts generated file as `@/path/to/image.png` into the editor

## Install

```bash
pi install npm:@guwidoe/pi-openai-image
```

## Notes

- Uses `OPENAI_API_KEY` from env, or `~/.pi/agent/auth.json` (`openai.api_key`) as fallback.
- Supported models: `gpt-image-1`, `dall-e-3`.
- Supported sizes: `1024x1024`, `1024x1536`, `1536x1024`, `auto`.
