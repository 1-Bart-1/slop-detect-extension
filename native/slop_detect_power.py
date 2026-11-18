#!/usr/bin/env python3
"""Slop Detect's power helper: tells the Firefox extension whether this computer runs on mains.

A native messaging host. It sends {"mains": true} or {"mains": false} at its start and after
each change, and exits when Firefox closes its input. Linux only: it reads the power supplies
in /sys/class/power_supply, or in the directory SLOP_DETECT_POWER_SUPPLY names.
"""

import json
import os
import select
import struct
import sys
from pathlib import Path

POLL_SECONDS = 2


def read(path: Path) -> str:
    try:
        return path.read_text().strip()
    except OSError:
        return ""


def on_mains(supplies: Path) -> bool:
    """True when a mains adapter is online, or, with no adapter listed, when no battery discharges."""
    entries = sorted(supplies.iterdir()) if supplies.is_dir() else []
    adapters = [entry for entry in entries if read(entry / "type") == "Mains"]
    if adapters:
        return any(read(adapter / "online") == "1" for adapter in adapters)
    batteries = [entry for entry in entries if read(entry / "type") == "Battery"]
    return not any(read(battery / "status") == "Discharging" for battery in batteries)


def send(message: dict) -> None:
    data = json.dumps(message).encode()
    sys.stdout.buffer.write(struct.pack("=I", len(data)) + data)
    sys.stdout.buffer.flush()


def main() -> None:
    supplies = Path(os.environ.get("SLOP_DETECT_POWER_SUPPLY", "/sys/class/power_supply"))
    last = None
    while True:
        mains = on_mains(supplies)
        if mains != last:
            send({"mains": mains})
            last = mains
        readable, _, _ = select.select([sys.stdin], [], [], POLL_SECONDS)
        if readable and not os.read(sys.stdin.fileno(), 4096):
            return  # Firefox closed the port


if __name__ == "__main__":
    main()
