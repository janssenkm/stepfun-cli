# stepfun-cli Documentation

Reference index for the `stepfun` CLI (package `@stepfun-ai/cli`). For install and quick-start, see the top-level [README](../README.md) (中文：[README-CN](../README-CN.md)).

## Overview

- [PRD.md](PRD.md) — product requirements: resources, commands, global flags, regions, exit codes, output contract, and the v1 scope boundary.
- [DESIGN.md](DESIGN.md) — architecture: the custom flag parser and command registry, the dual-base routing rule, streaming shapes, the error model, and the test plan.

## Per-resource reference

Each resource doc lists its commands, flags, base (generation vs. management), and examples. These mirror the `--help` output of the CLI.

| Resource | Doc | Commands | Base |
|---|---|---|---|
| text | [text.md](resources/text.md) | `chat`, `messages`, `responses` | gen |
| image | [image.md](resources/image.md) | `generate`, `edit` | gen |
| speech | [speech.md](resources/speech.md) | `synthesize` (TTS), `recognize` (ASR) | gen |
| token | [token.md](resources/token.md) | `count` | gen |
| models | [models.md](resources/models.md) | `list`, `get` | mgmt |
| file | [file.md](resources/file.md) | `upload`, `list`, `get`, `content`, `delete` | mgmt |
| account | [account.md](resources/account.md) | `show` | mgmt |
| auth | [auth.md](resources/auth.md) | `login`, `status`, `logout` | — |
| config | [config.md](resources/config.md) | `show`, `set` | — |

## Conventions

- **Command grammar:** `stepfun <resource> <command> [flags]`. Add `--help` to any command for full options.
- **Dual-base rule:** the same StepPlan key works on two bases per region — generation (`/step_plan/v1`, subscription-metered) and management (`/v1`, open platform). See [DESIGN.md §Dual-base rule](DESIGN.md#the-dual-base-rule).
- **Config resolution:** `flag > STEPFUN_* env > ~/.stepfun-cli/config.json > default`.
- **Exit codes:** `0` success · `1` general · `2` usage · `3` auth · `4` quota/rate-limit · `5` timeout · `6` network · `10` content-filter.
