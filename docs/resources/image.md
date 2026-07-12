# Image Resource

Status: **Supported**. Generation base (`/step_plan/v1`), model `step-image-edit-2`. Images are returned base64 and saved to disk (`--out` / `--out-dir`).

## `image generate`

`POST /images/generations`

```
--prompt <text>            required (≤512 chars)
--model <model>            default: step-image-edit-2
--size <size>              1024x1024 | 768x1360 | 896x1184 | 1360x768 | 1184x896
--n <n>                    number (server currently supports 1)
--seed <n>  --steps <1-50>  --cfg-scale <1.0-10.0>
--negative-prompt <text>   (≤512 chars)
--text-mode                optimize for text rendering
--response-format <b64_json|url>   default: b64_json
--out <path> | --out-dir <dir> --out-prefix <prefix>
```

## `image edit`

`POST /images/edits` (multipart)

```
--image <path>             required (≤4096x4096)
--prompt <text>            required (≤512 chars)
--model  --seed  --steps  --cfg-scale  --negative-prompt  --text-mode
--response-format <b64_json|url>
--out <path> | --out-dir <dir> --out-prefix <prefix>
```

## Examples

```bash
stepfun image generate --prompt "a serene alpine lake at sunset" --out lake.png
stepfun image edit --image input.png --prompt "make it night time" --out night.png
```
