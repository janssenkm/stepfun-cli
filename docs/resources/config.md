# Config Resource

Status: **Supported**.

## Commands

```
config show                                   resolved configuration + config path
config set --key <key> --value <value>        set a value
```

Valid keys: `apiKey`, `region`, `genBaseUrl`, `apiBaseUrl`, `output`, `timeout`, `defaultTextModel`, `defaultSpeechTtsModel`, `defaultSpeechAsrModel`, `defaultImageModel`.

Explicit `--output` and `STEPFUN_OUTPUT` values must be `text` or `json`;
unsupported values are usage errors (exit code 2). When neither is set, output
defaults to JSON for non-TTY stdout and text for an interactive terminal.

## Example

```bash
stepfun config show
stepfun config set --key region --value StepPlan-CN
stepfun config set --key output --value json
```
