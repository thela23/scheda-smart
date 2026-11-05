#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["openai==2.52.0"]
# ///
"""Generate one or more images with OpenAI gpt-image-2."""

from __future__ import annotations

import argparse

from _common import add_common_arguments, fail, output_paths, read_api_key, request_options, save_images


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    args = parser.parse_args()

    try:
        options = request_options(args)
        paths = output_paths(args)
        api_key = read_api_key()
    except (OSError, ValueError) as error:
        return fail(error)

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key, max_retries=0, timeout=300.0)
        result = client.images.generate(**options)
        save_images(result.data, paths)
    except Exception as error:
        return fail(error)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
