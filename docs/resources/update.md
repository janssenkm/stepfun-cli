# Update Resource

Status: **Supported**. `update` is a singleton Resource with no child Command.

```text
stepfun update [flags]
```

The command prints the current version and the explicit NPM command:

```bash
npm update -g @stepfun-ai/cli
```

It does not update itself, mutate the global installation, or query the registry. Previously proposed `--check` and `--registry` flags are not part of the current requirement. Optional standalone binaries direct users to release artifacts rather than NPM commands.

Global flags remain syntactically available, but `--api-key`, Region, and network settings have no effect because the command is local.
