# Video Resource

Status: **Unsupported**. Commands are registered for discovery and return `UNSUPPORTED`; they never authenticate or call an API.

## Proposed command surface

| Command | Candidate flags | Required behavior |
| --- | --- | --- |
| `video generate` | `--model`, `--prompt`, `--first-frame`, `--last-frame`, `--subject-image`, `--callback-url`, `--download`, `--no-wait`, `--async`, `--poll-interval` | Submit a task, optionally poll, and optionally download the result |
| `video task get` | `--task-id` | Return task state and artifact identifiers |
| `video download` | `--file-id`, `--out` | Download exactly one completed artifact |

The eventual implementation must validate mutually dependent frame inputs, keep task identifiers visible in JSON, use `--out` for an exact destination, and never overload global `--output`. Callback delivery and polling need separate timeout semantics before implementation.
