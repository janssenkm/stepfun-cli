# Models Resource

Status: **Supported**. Management base (`/v1`).

## Commands

```
models list                 list models available to your account
models get <id>             retrieve a single model
```

## Notes

The model set differs by region and evolves over time. StepPlan-Global currently exposes (via `GET /models`) the `step-3.x-flash` text models plus `stepaudio-2.5-tts`, `stepaudio-2.5-asr`, `step-image-edit-2`; StepPlan-CN adds `stepaudio-2.5-realtime`, `stepaudio-2.5-chat`, `step-router-v1`. Always treat `models list` as the source of truth.

## Example

```bash
stepfun models list
stepfun models get step-3.7-flash
```
