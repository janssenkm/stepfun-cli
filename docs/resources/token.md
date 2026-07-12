# Token Resource

Status: **Supported**. Generation base (`/step_plan/v1`). `POST /token/count` estimates tokens for a Chat-Completion-style conversation (supports multimodal image input).

## Commands

```
token count --model <model> (--message <text> | --messages-file <path>)
           [--system <text>] [--image <path|url>]
```

## Example

```bash
stepfun token count --model step-3.7-flash --message "count these tokens"
```
