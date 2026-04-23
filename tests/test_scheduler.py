from datetime import date
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from nyt_crossword_remarkable.services.scheduler import build_cron_trigger, scheduled_fetch
from nyt_crossword_remarkable.config import ScheduleConfig


def test_build_cron_trigger_all_days():
    config = ScheduleConfig(
        days=["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        time="22:00",
        timezone="America/New_York",
    )
    trigger = build_cron_trigger(config)
    assert trigger.hour == 22
    assert trigger.minute == 0
    assert trigger.day_of_week == "mon,tue,wed,thu,fri,sat,sun"


def test_build_cron_trigger_weekends():
    config = ScheduleConfig(
        days=["sat", "sun"],
        time="09:30",
        timezone="US/Eastern",
    )
    trigger = build_cron_trigger(config)
    assert trigger.hour == 9
    assert trigger.minute == 30
    assert trigger.day_of_week == "sat,sun"


def test_build_cron_trigger_timezone():
    config = ScheduleConfig(
        days=["mon"],
        time="22:00",
        timezone="America/Chicago",
    )
    trigger = build_cron_trigger(config)
    assert str(trigger.timezone) == "America/Chicago"
