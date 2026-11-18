"""Tests of the power helper: python3 -m unittest discover -s native"""

import tempfile
import unittest
from pathlib import Path

from slop_detect_power import on_mains


def supplies(**entries: dict) -> Path:
    """A directory laid out as /sys/class/power_supply, with these supplies and their files."""
    root = Path(tempfile.mkdtemp())
    for name, files in entries.items():
        (root / name).mkdir()
        for file, value in files.items():
            (root / name / file).write_text(value + "\n")
    return root


class OnMains(unittest.TestCase):
    def test_an_online_adapter_is_mains(self):
        self.assertTrue(on_mains(supplies(AC={"type": "Mains", "online": "1"}, BAT0={"type": "Battery", "status": "Full"})))

    def test_an_offline_adapter_is_battery(self):
        self.assertFalse(on_mains(supplies(AC={"type": "Mains", "online": "0"}, BAT0={"type": "Battery", "status": "Discharging"})))

    def test_without_an_adapter_a_discharging_battery_is_battery(self):
        self.assertFalse(on_mains(supplies(BAT0={"type": "Battery", "status": "Discharging"})))
        self.assertTrue(on_mains(supplies(BAT0={"type": "Battery", "status": "Charging"})))

    def test_a_computer_without_power_supplies_is_on_mains(self):
        self.assertTrue(on_mains(supplies()))
        self.assertTrue(on_mains(Path("/nonexistent")))


if __name__ == "__main__":
    unittest.main()
