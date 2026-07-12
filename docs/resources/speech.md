# Speech Resource

Status: **Supported**. Generation base (`/step_plan/v1`). TTS models: `stepaudio-2.5-tts` (default), `step-tts-2` (public only, not in StepPlan). ASR: `stepaudio-2.5-asr`.

System voices (valid for both TTS models): `elegantgentle-female`, `lively-girl`, `livelybreezy-female`, `magnetic-voiced-male`, `soft-spoken-gentleman`, `vibrant-youth`, `zixinnansheng`.

## `speech synthesize`

`POST /audio/speech` → audio bytes (saved via `--out`, or raw to stdout).

```
--model <model>            default: stepaudio-2.5-tts
--text <text>              ≤1000 chars
--text-file <path>         - for stdin
--voice <id>               default: lively-girl
--format <fmt>             wav | mp3 | flac | opus | pcm (default mp3)
--speed <0.5-2.0>  --volume <0.1-2.0>
--sample-rate <8000|16000|22050|24000|48000>
--pronunciation <from/to>  repeatable
--instruction <text>       stepaudio-2.5-tts global instruction (≤200 chars)
--voice-label <k:v>        lang|emotion|style : value (step-tts-2 only)
--markdown-filter
--stream                   stream via SSE (speech.audio.delta)
--out <path>
```

## `speech recognize`

`POST /audio/asr/sse` → transcript over SSE.

```
--file <path>              required (mp3, wav, ogg, or pcm)
--model <model>            default: stepaudio-2.5-asr
--language <code>          e.g. zh, en
--hotwords <word>          repeatable
--enable-itn               ITN text normalization
--enable-timestamp         word timestamps
--format-type <ogg|mp3|wav|pcm>   auto-detected from --file
--rate <hz> --bits <n> --channel <n>   required for pcm
```

## Examples

```bash
stepfun speech synthesize --text "你好，阶跃" --out out.mp3
stepfun speech synthesize --text "streaming" --stream --out out.mp3
stepfun speech recognize --file recording.mp3 --language zh
```
