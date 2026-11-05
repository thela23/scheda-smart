"""Shared validation, credentials, and output helpers for GPT Image scripts."""

from __future__ import annotations

import argparse
import base64
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Iterable

MODEL = "gpt-image-2"
FORMATS = ("png", "jpeg", "webp")
QUALITIES = ("low", "medium", "high", "auto")
FORMAT_SUFFIXES = {"png": ".png", "jpeg": ".jpg", "webp": ".webp"}
MAX_PROMPT_CHARS = 32_000


def credential_path() -> Path:
    """Return a user-owned config path that never sits inside the skill."""
    if os.name == "nt":
        root = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        root = Path.home() / "Library" / "Application Support"
    else:
        root = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return root / "gpt-image" / "api-key"


def read_api_key(path: Path | None = None) -> str:
    """Resolve the key from the process environment, then user config."""
    environment_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if environment_key:
        return environment_key

    config_path = path or credential_path()
    try:
        configured_key = config_path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        configured_key = ""
    except OSError as error:
        raise ValueError(f"Could not read API key config at {config_path}: {error}") from error

    if configured_key:
        return configured_key
    raise ValueError(
        "OPENAI_API_KEY is not configured. Export it in your runtime or run "
        f"uv run {Path(__file__).with_name('configure.py')}"
    )


def validate_size(value: str) -> str:
    """Validate current gpt-image-2 arbitrary-resolution constraints."""
    normalized = value.strip().lower()
    if normalized == "auto":
        return normalized

    match = re.fullmatch(r"(\d+)x(\d+)", normalized)
    if not match:
        raise ValueError("--size must be 'auto' or WIDTHxHEIGHT, for example 1024x1536.")

    width, height = (int(part) for part in match.groups())
    errors: list[str] = []
    if width == 0 or height == 0:
        errors.append("both dimensions must be greater than zero")
    if width % 16 or height % 16:
        errors.append("both dimensions must be multiples of 16")
    if max(width, height) > 3840:
        errors.append("the longest edge must be 3840 px or less")
    if min(width, height) and max(width, height) / min(width, height) > 3:
        errors.append("the aspect ratio must not exceed 3:1")

    pixels = width * height
    if pixels < 655_360 or pixels > 8_294_400:
        errors.append("total pixels must be between 655,360 and 8,294,400")
    if errors:
        raise ValueError(f"Invalid --size {value!r}: " + "; ".join(errors) + ".")
    if pixels > 3_686_400:
        print("Warning: resolutions above 2560x1440 are experimental.", file=sys.stderr)
    return f"{width}x{height}"


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    prompt = parser.add_mutually_exclusive_group(required=True)
    prompt.add_argument("--prompt", help="Prompt text")
    prompt.add_argument("--prompt-file", type=Path, help="UTF-8 file containing the prompt")
    parser.add_argument("--output", type=Path, help="Output path (default: output.<format>)")
    parser.add_argument("--size", default="1024x1024", help="WIDTHxHEIGHT or auto")
    parser.add_argument("--quality", choices=QUALITIES, default="medium")
    parser.add_argument("--output-format", choices=FORMATS, default="png")
    parser.add_argument("--output-compression", type=int, metavar="0-100")
    parser.add_argument("--n", type=int, choices=range(1, 11), default=1)
    parser.add_argument("--force", action="store_true", help="Replace existing output files")


def prompt_text(args: argparse.Namespace) -> str:
    if args.prompt_file:
        try:
            value = args.prompt_file.read_text(encoding="utf-8")
        except OSError as error:
            raise ValueError(f"Could not read prompt file {args.prompt_file}: {error}") from error
    else:
        value = args.prompt
    value = value.strip()
    if not value:
        raise ValueError("The prompt cannot be empty.")
    if len(value) > MAX_PROMPT_CHARS:
        raise ValueError(f"The prompt exceeds the {MAX_PROMPT_CHARS:,}-character API limit.")
    return value


def request_options(args: argparse.Namespace) -> dict[str, object]:
    size = validate_size(args.size)
    if args.output_compression is not None:
        if args.output_format == "png":
            raise ValueError("--output-compression is only valid with jpeg or webp.")
        if not 0 <= args.output_compression <= 100:
            raise ValueError("--output-compression must be between 0 and 100.")

    options: dict[str, object] = {
        "model": MODEL,
        "prompt": prompt_text(args),
        "size": size,
        "quality": args.quality,
        "output_format": args.output_format,
        "n": args.n,
    }
    if args.output_compression is not None:
        options["output_compression"] = args.output_compression
    return options


def output_paths(args: argparse.Namespace) -> list[Path]:
    suffix = FORMAT_SUFFIXES[args.output_format]
    requested = args.output or Path(f"output{suffix}")
    if requested.suffix:
        accepted = {suffix}
        if args.output_format == "jpeg":
            accepted.add(".jpeg")
        if requested.suffix.lower() not in accepted:
            raise ValueError(
                f"Output extension {requested.suffix!r} does not match --output-format {args.output_format}."
            )
    else:
        requested = requested.with_suffix(suffix)

    paths = (
        [requested]
        if args.n == 1
        else [requested.with_name(f"{requested.stem}_{index}{requested.suffix}") for index in range(1, args.n + 1)]
    )
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and not args.force:
            raise ValueError(f"Refusing to replace {path}. Choose another --output or add --force.")
    for parent in {path.parent for path in paths}:
        try:
            with tempfile.NamedTemporaryFile(dir=parent):
                pass
        except OSError as error:
            raise ValueError(f"Output directory is not writable: {parent}") from error
    return paths


def save_images(items: Iterable[object], paths: list[Path]) -> None:
    items = list(items)
    if len(items) != len(paths):
        raise ValueError(f"The API returned {len(items)} image(s); expected {len(paths)}.")

    for item, path in zip(items, paths, strict=True):
        encoded = getattr(item, "b64_json", None)
        if not encoded:
            raise ValueError("The API response did not contain image data.")
        try:
            image_bytes = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError) as error:
            raise ValueError("The API returned invalid base64 image data.") from error

        descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
        try:
            with os.fdopen(descriptor, "wb") as output:
                output.write(image_bytes)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary_name, path)
        except BaseException:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass
            raise
        print(f"Saved {path}")


def fail(error: Exception) -> int:
    print(f"Error: {error}", file=sys.stderr)
    return 2
