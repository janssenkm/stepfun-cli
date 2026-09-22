# Models Resource

Status: **Supported**. Management base (`/v1`).

## Commands

```
models list                 list models available to your account
models get <id>             retrieve a single model
```

## Notes

The model set differs by region and evolves over time. StepPlan currently ships (via `GET /models`):

| Family | Models |
|---|---|
| Text | `step-5-preview`, `step-3.7-flash`, `step-3.5-flash`, `step-3.5-flash-2603` |
| TTS | `stepaudio-2.5-tts` |
| ASR | `stepaudio-2.5-asr` |
| Image | `step-image-edit-2` |

CN additionally exposes `stepaudio-2.5-realtime`, `stepaudio-2.5-chat`, `step-router-v1`. CLI defaults track the latest GA releases (`step-5-preview`, `stepaudio-2.5-tts`, `stepaudio-2.5-asr`, `step-image-edit-2`); the `step-3.7-flash` and `step-3.5-flash*` families remain opt-in via `--model`. Always treat `models list` as the source of truth.

## Example

```bash
stepfun models list
stepfun models get step-5-preview
```
