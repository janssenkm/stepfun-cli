# File Resource

Status: **Supported**. Management base (`/v1`). `purpose=storage` supports video (mp4), images (jpg/jpeg/png/webp/gif), audio (mp3/wav); ≤128 MB; ≤1000 files per account.

## Commands

```
file upload (--file <path> | --url <url>) [--purpose <purpose>]   default purpose: storage
file list [--limit <n>] [--order <asc|desc>] [--before <id>] [--after <id>]
file get <id>
file content <id> [--out <path>]      raw content (note: only file-extract purpose supports content retrieval)
file delete <id> [--yes]
```

## Examples

```bash
stepfun file upload --file image.png
stepfun file upload --url https://example.com/a.mp3
stepfun file list
stepfun file get file-abc123
stepfun file delete file-abc123 --yes
```
