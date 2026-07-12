# Config Resource

Status: **Supported**.

## Commands

```
config show                                   resolved configuration + config path
config set --key <key> --value <value>        set a value
```

Valid keys: `apiKey`, `region`, `genBaseUrl`, `apiBaseUrl`, `output`, `timeout`, `defaultTextModel`, `defaultSpeechTtsModel`, `defaultSpeechAsrModel`, `defaultImageModel`.

## Example

```bash
stepfun config show
stepfun config set --key region --value StepPlan-CN
stepfun config set --key output --value json
```
