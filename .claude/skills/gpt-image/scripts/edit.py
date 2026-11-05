#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["openai==2.52.0"]
# ///
"""Edit or composite images with OpenAI gpt-image-2."""

from __future__ import annotations

import argparse
from contextlib import ExitStack
from pathlib import Path

from _common import add_common_arguments, fail, output_paths, read_api_key, request_options, save_images


def existing_file(value: str) -> Path:
    path = Path(value)
    if not path.is_file():
        raise argparse.ArgumentTypeError(f"File not found: {path}")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", nargs="+", required=True, type=existing_file, help="1-10 input images")
    parser.add_argument("--mask", type=existing_file, help="Optional PNG mask applied to the first image")
    add_common_arguments(parser)
    args = parser.parse_args()

    if len(args.images) > 10:
        parser.error("--images accepts at most 10 files")

    try:
        options = request_options(args)
        paths = output_paths(args)
        api_key = read_api_key()
    except (OSError, ValueError) as error:
        return fail(error)

    try:
        from openai import OpenAI

        with ExitStack() as stack:
            options["image"] = [stack.enter_context(path.open("rb")) for path in args.images]
            if args.mask:
                options["mask"] = stack.enter_context(args.mask.open("rb"))
            client = OpenAI(api_key=api_key, max_retries=0, timeout=300.0)
            result = client.images.edit(**options)
        save_images(result.data, paths)
    except Exception as error:
        return fail(error)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
