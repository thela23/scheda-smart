---
name: gpt-image
description: Generate, edit, mask, or composite images with OpenAI's gpt-image-2 Image API using maintained CLI scripts. Use when an API-backed image workflow is requested and the runtime has OpenAI credentials and network access.
---

# GPT Image

Use the supplied scripts instead of writing a new API client.

## Choose the operation

- No source image: run `scripts/generate.py`.
- One or more source images: run `scripts/edit.py`.
- A mask: run `scripts/edit.py` with `--mask`; the mask applies to the first image.

Read `references/prompting-guide.md` before drafting a complex prompt.

## Credentials

The skill contains no API key and must never package one.

The scripts resolve credentials in this order:

1. `OPENAI_API_KEY` supplied by the runtime.
2. The user-local file created by `scripts/configure.py` outside the skill folder.

If neither exists, stop and tell the user to configure the runtime. Never ask the user to paste a key into chat, write a `.env` inside the skill, inspect unrelated credential stores, or add a key to a package.

For an interactive local install, the user can run this themselves:

```bash
python <SKILL_DIR>/scripts/configure.py
```

For hosted shells, configuration only works when the host injects `OPENAI_API_KEY`, permits outbound API access, and can run `uv`. Uploading a ZIP or `.skill` file does not provide those capabilities.

## Generate

```bash
uv run --script <SKILL_DIR>/scripts/generate.py \
  --prompt-file /absolute/path/to/prompt.txt \
  --output /absolute/path/to/output.png \
  --size 1024x1024 \
  --quality medium
```

## Edit or composite

```bash
uv run --script <SKILL_DIR>/scripts/edit.py \
  --prompt-file /absolute/path/to/prompt.txt \
  --images /absolute/path/to/input.png \
  --output /absolute/path/to/edited.png \
  --size 1024x1024 \
  --quality medium
```

Use `--mask /absolute/path/to/mask.png` for masked edits. Pass up to 10 paths after `--images` for compositing or reference-image work.

## Relevant options

- `--prompt TEXT` or `--prompt-file PATH` (exactly one)
- `--output PATH`
- `--size auto|WIDTHxHEIGHT`
- `--quality low|medium|high|auto`
- `--output-format png|jpeg|webp`
- `--output-compression 0-100` for JPEG or WebP
- `--n 1-10`
- `--force` to replace existing outputs deliberately

Multiple outputs use `_1`, `_2`, and so on before the extension. The scripts refuse to overwrite files unless `--force` is present.

## Working rules

1. Confirm output paths before making a paid API request.
2. Prefer `--prompt-file` for long prompts so shell quoting cannot alter them.
3. For edits, state both the requested change and what must remain unchanged.
4. Use `low` for drafts, `medium` for normal work, and `high` only when detail warrants the extra cost and latency.
5. Return the saved file path after a successful run. If the command fails, report the actual error; never claim an image was created.
