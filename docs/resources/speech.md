# Speech Resource

Status: **Partial**. `synthesize`, its `generate` alias, and `recognize` are supported. `voices` is registered but unsupported.

## Commands and flags

| Command | Flags |
| --- | --- |
| `speech synthesize` | `--text`, `--text-file` (unsupported), `--voice`, `--model`, `--speed`, `--volume`, `--pitch` (unsupported), `--format`, `--sample-rate`, `--bitrate` (unsupported), `--channels` (unsupported), `--language` (unsupported), `--subtitles` (unsupported), repeatable `--pronunciation` (unsupported), `--out`, `--stream` (unsupported) |
| `speech generate` | Supported alias of `synthesize`; identical flags and behavior |
| `speech recognize` | `--file`, `--model`, `--language`, `--hotwords` |
| `speech voices` | Registered with `--language`; returns `UNSUPPORTED` until a voices API is approved |

`synthesize` requires an input source. `--text-file` and the other flags marked unsupported are accepted for interface discovery and return `UNSUPPORTED`; therefore `--text` is required for a successful request. The single audio destination is `--out <path>` and defaults to `output.mp3`. The command must not define local `--output`. Supported encodings are `wav`, `mp3`, `flac`, `opus`, and `pcm` when accepted by the API.

The default voice is `cixingnansheng` for China Regions and `lively-girl` for Global Regions. Recognition accepts `ogg`, `mp3`, `wav`, and `pcm`; PCM is signed 16-bit little-endian, 16 kHz, mono.

Examples:

```bash
stepfun speech synthesize --text "Hello" --out hello.mp3 --format mp3
stepfun speech synthesize --text "Hello" --out hello.wav --output json
stepfun speech recognize --file meeting.wav --language zh
```
