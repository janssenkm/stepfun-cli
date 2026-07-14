# Text Resource

Status: **Supported**. Three chat APIs, all on the generation base (`/step_plan/v1`).

## `text chat` — OpenAI Completions

`POST /chat/completions`

```
--model <model>            default: step-3.7-flash
--message <text>           repeatable; optional "role:" prefix (user:hi)
--messages-file <path>     JSON messages array (- for stdin)
--system <text>            system prompt
--image/--video/--audio    multimodal attachments (repeatable)
--max-tokens <n>  --temperature <n>  --top-p <n>  --n <n>
--stop <seq>  --frequency-penalty <n>
--response-format <text|json_object>
--reasoning-effort <low|medium|high>
--reasoning-format <general|deepseek-style>
--tool <json|path>         function tool (repeatable)
--stream                   stream tokens live
--show-reasoning           print reasoning to stderr
```

## `text messages` — Anthropic Messages

`POST /messages` (Anthropic-compatible; use `step-3.7-flash`)

```
--model <model>            default: step-3.7-flash
--message <text>           repeatable; optional "role:" prefix
--messages-file <path>
--system <text>
--max-tokens <n>           required by API (default 1024)
--temperature  --top-p  --top-k
--stop-sequence <seq>      repeatable
--effort <low|medium|high> → output_config.effort
--tool <json|path>         Anthropic tool definition (repeatable)
--stream
--show-reasoning           print thinking/reasoning blocks to stderr
```

## `text responses` — OpenAI Responses

`POST /responses` (only `step-3.7-flash`)

```
--input <text>             plain-text single turn
--message <text>           alternative to --input (repeatable)
--messages-file <path>
--instructions <text>      top-level system instructions
--effort <low|medium|high> → reasoning.effort
--max-output-tokens <n>  --temperature <n>  --top-p <n>
--tool <json|path>  --tool-choice <str>
--json-schema <path>       JSON Schema file → structured output
--stream
--show-reasoning
```

## Examples

```bash
stepfun text chat --model step-3.7-flash --message "Hello" --stream
stepfun text chat --model step-3.7-flash --message "describe this" --image photo.jpg
stepfun text messages --model step-3.7-flash --message "hi" --max-tokens 256
stepfun text responses --input "write a haiku" --effort high --stream
```

For all three APIs, a streaming command succeeds only after the protocol's
completion marker is received (`[DONE]`, `message_stop`, or
`response.completed`). A stream that closes early exits with an error instead
of returning partial output as a successful result. With `--show-reasoning`,
reasoning is written to stderr once, while generated content remains on stdout.
