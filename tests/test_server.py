from unittest.mock import patch

import pytest
from typer.testing import CliRunner

from nyt_crossword_remarkable.cli import app

runner = CliRunner()


def test_serve_command_exists():
    result = runner.invoke(app, ["serve", "--help"])
    assert result.exit_code == 0
    assert "host" in result.stdout.lower()
    assert "port" in result.stdout.lower()
