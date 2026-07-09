# Image Resource

Status: **Partial**. `edit` is supported; text-to-image `generate` is registered but returns `UNSUPPORTED` until a StepFun model and endpoint are approved for this CLI.

## `image edit`

| Flag | Requirement |
| --- | --- |
| `--file <path>` | Required source image |
| `--prompt <text>` | Required edit instruction |
| `--model <model>` | Default `step-image-edit-2` |
| `--response-format <b64_json|url>` | Select API representation, not CLI presentation |
| `--seed <int>` | Optional deterministic seed |
| `--steps <int>` | Optional inference steps |
| `--cfg-scale <number>` | Optional classifier-free guidance scale |
| `--negative-prompt <text>` | Optional negative instruction |
| `--out <path>` | Registered destination contract; returns `UNSUPPORTED` until decoding and URL download are implemented |

When no `--out` is supplied, the command prints the API result according to global `--output`. Multi-image `--out-dir` and `--out-prefix` must not be exposed unless the StepFun endpoint supports multiple results.

## `image generate`

Unsupported. The command exposes `--prompt`, `--model`, `--aspect-ratio`, `--n`, `--seed`, `--width`, `--height`, `--prompt-optimizer`, `--aigc-watermark`, `--subject-ref`, `--out`, `--response-format`, `--out-dir`, and `--out-prefix` for discovery, then returns `UNSUPPORTED`. They become executable requirements only after corresponding StepFun API fields exist.
