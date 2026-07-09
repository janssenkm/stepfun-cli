# File Resource

Status: **Supported**. It covers upload, listing, metadata retrieval, parsed-content retrieval, and deletion.

## Commands

| Command | Flags or arguments | Requirement |
| --- | --- | --- |
| `file upload` | Exactly one of `--file <path>` or `--url <url>`; required `--purpose <purpose>` | Upload local bytes or ask the API to fetch an HTTP(S) URL |
| `file list` | No local flags | List File objects |
| `file get <file-id>` | File ID argument | Retrieve one File object |
| `file content <file-id>` | `--out <path>` | Retrieve parsed text; write it to an exact path or stdout |
| `file delete <file-id>` | `--yes` | Delete after confirmation; require `--yes` when non-interactive |

Purposes are `file-extract`, `retrieval-text`, `retrieval-image`, and `storage`. Local files are validated by purpose-specific extension and size rules. Global documentation currently guarantees `storage`; other purposes must warn in Global Regions. StepPlan usage also warns unless quiet.

`content` is parsed text retrieval, not arbitrary binary download. Dry run shows only path and size or path and error. Quiet upload prints the created file ID. API keys and file bytes must never appear in logs.

Examples:

```bash
stepfun file upload --file report.pdf --purpose file-extract
stepfun file list --output json
stepfun file get file_123
stepfun file content file_123 --out report.txt
stepfun file delete file_123 --yes --non-interactive
```

