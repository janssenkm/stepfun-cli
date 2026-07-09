# Models Resource

Status: **Supported**.

## `models list`

The command has no local flags and lists the built-in model catalog grouped by capability. Global `--output text` renders readable groups; `--output json` returns an object keyed by `text`, `speech`, and `image`.

The catalog is:

- Text: `step-3.5-flash`, `step-3.5-flash-2603`, `step-3.7-flash`
- Speech: `stepaudio-2.5-tts`, `stepaudio-2.5-asr`
- Image: `step-image-edit-2`

This is local discovery, not a network-backed model listing. Adding or removing a model requires synchronized code, README, PRD, design, and test changes.

