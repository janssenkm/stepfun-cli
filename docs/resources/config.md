# Config Resource

Status: **Supported**. `show`, both forms of `set`, and `export-schema` are implemented.

## Commands

| Command | Flags or arguments | Requirement |
| --- | --- | --- |
| `config show` | Global `--output` | Show effective persisted configuration with a masked API key |
| `config set <key> <value>` | Positional key/value | Current compatible form |
| `config set` | `--key <key> --value <value>` | Supported aligned form; validates through the same schema |
| `config export-schema` | `--command <path>` | Export all leaf commands or one selected command as OpenAI-compatible function tool JSON |

Supported keys are `api_key`, `base_url`, `region`, `output`, `timeout`, `default_text_model`, and `default_speech_model`. Values must be validated before an atomic write. The directory mode is `0700` and file mode is `0600`. `config show` and exported schemas must not expose credentials.

Examples:

```bash
stepfun config set region Global
stepfun config set output json
stepfun config show
stepfun config export-schema
stepfun config export-schema --command "text chat"
```

Schema export reads the live Commander command tree. Command names, descriptions, positional arguments, flags, required options, defaults, booleans, and repeatable options therefore come from the same definitions used by runtime parsing and `--help`. Unsupported commands remain present in the schema so agents can discover the full interface and receive a deterministic `UNSUPPORTED` result.
