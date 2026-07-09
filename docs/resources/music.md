# Music Resource

Status: **Unsupported**. Commands are registered for discovery and return `UNSUPPORTED`; they never authenticate or call an API.

## Proposed commands

`music generate` creates a song from lyrics and style controls. Candidate inputs include `--model`, lyrics or prompt fields, title, style, duration and instrumental controls. Output-related candidates are `--format`, `--stream`, and `--out`. The reference-only `--output-format` name is reserved and must be mapped to a real StepFun API field before exposure.

`music cover` creates a cover from reference audio. Candidate flags include the input audio, model, vocal/style controls, `--format`, `--sample-rate`, `--bitrate`, `--channel`, `--stream`, and `--out`.

Both commands must write one artifact only when `--out` is provided, otherwise return metadata according to global `--output`. Binary audio must never be embedded in diagnostics or dry-run output.
