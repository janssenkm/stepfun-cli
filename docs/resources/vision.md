# Vision Resource

Status: **Unsupported** as a standalone Resource. The command is registered for discovery and returns `UNSUPPORTED`. Existing image editing does not imply general vision-description support.

## Proposed `vision describe`

Candidate flags are `--image <path-or-url>`, `--file-id <id>`, and `--prompt <text>`. Exactly one image source must be supplied. `--file-id` should refer to the `file` Resource rather than silently uploading again. Text output prints the description; JSON output preserves model metadata and usage.

Implementation requires an approved StepFun vision model, endpoint, accepted image constraints, and a decision about URL inputs.
