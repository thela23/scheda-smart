#!/usr/bin/env python3
"""Store or remove a user-local OpenAI API key outside the skill folder."""

from __future__ import annotations

import argparse
import getpass
import os
import tempfile

from _common import credential_path, fail


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--remove", action="store_true", help="Delete the saved user-local key")
    args = parser.parse_args()
    path = credential_path()

    try:
        if args.remove:
            path.unlink(missing_ok=True)
            print(f"Removed saved key from {path}")
            return 0

        api_key = getpass.getpass("OpenAI API key (input hidden): ").strip()
        if not api_key:
            raise ValueError("No key entered; configuration was not changed.")
        if "\n" in api_key or "\r" in api_key:
            raise ValueError("The key must be one line.")

        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(dir=path.parent)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                output.write(api_key)
                output.flush()
                os.fsync(output.fileno())
            if os.name != "nt":
                os.chmod(temporary_name, 0o600)
            os.replace(temporary_name, path)
        except BaseException:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass
            raise
        print(f"Saved the key to {path} (outside the skill bundle).")
    except (OSError, ValueError) as error:
        return fail(error)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
