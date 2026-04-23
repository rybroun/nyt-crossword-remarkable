"""CLI interface for nyt-crossword-remarkable."""

import asyncio
from datetime import date, datetime
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from nyt_crossword_remarkable.config import (
    Config,
    load_config,
    save_config,
    DEFAULT_CONFIG_PATH,
    DEFAULT_CACHE_DIR,
    DEFAULT_HISTORY_PATH,
)
from nyt_crossword_remarkable.services.history import FetchRecord, History
from nyt_crossword_remarkable.services.nyt_fetcher import NytFetcher
from nyt_crossword_remarkable.services.orchestrator import Orchestrator
from nyt_crossword_remarkable.services.remarkable import RemarkableUploader, RmapiNotFoundError

app = typer.Typer(
    name="nyt-crossword-remarkable",
    help="Deliver the daily NYT crossword to your reMarkable tablet.",
)
console = Console()


def _run_fetch(puzzle_date: date, config: Config) -> FetchRecord:
    """Run the fetch-and-upload pipeline synchronously (wraps async)."""
    orchestrator = Orchestrator(
        nyt_cookie=config.nyt.cookie,
        remarkable_folder=config.remarkable.folder,
        file_pattern=config.remarkable.file_pattern,
        cache_dir=DEFAULT_CACHE_DIR,
        history_path=DEFAULT_HISTORY_PATH,
    )
    return asyncio.run(orchestrator.fetch_and_upload(puzzle_date))


def _check_nyt(cookie: str) -> bool:
    fetcher = NytFetcher(cookie=cookie)
    return asyncio.run(fetcher.check_cookie())


def _check_remarkable() -> bool:
    uploader = RemarkableUploader()
    return uploader.check_connection()


@app.command()
def fetch(
    date_str: Optional[str] = typer.Option(
        None, "--date", "-d", help="Puzzle date (YYYY-MM-DD). Defaults to today."
    ),
) -> None:
    """Fetch a crossword and upload it to your reMarkable."""
    config = load_config()

    if not config.nyt.cookie:
        console.print("[red]No NYT cookie configured.[/red] Run: nyt-crossword-remarkable set-cookie <value>")
        raise typer.Exit(code=1)

    puzzle_date = date.fromisoformat(date_str) if date_str else date.today()
    console.print(f"Fetching crossword for [bold]{puzzle_date.isoformat()}[/bold]...")

    record = _run_fetch(puzzle_date, config)

    if record.status == "success":
        console.print(f"[green]Success![/green] Uploaded to {config.remarkable.folder}")
    else:
        console.print(f"[red]Failed:[/red] {record.error}")
        raise typer.Exit(code=1)


@app.command()
def status() -> None:
    """Check connection status for NYT and reMarkable."""
    config = load_config()

    table = Table(title="Connection Status")
    table.add_column("Service", style="bold")
    table.add_column("Status")
    table.add_column("Details")

    # NYT
    if not config.nyt.cookie:
        table.add_row("NYT", "[yellow]Not Configured[/yellow]", "Run: set-cookie <value>")
    else:
        nyt_ok = _check_nyt(config.nyt.cookie)
        if nyt_ok:
            age = ""
            if config.nyt.cookie_set_at:
                days = (datetime.now() - config.nyt.cookie_set_at).days
                age = f" (set {days} days ago)"
            table.add_row("NYT", "[green]Connected[/green]", f"Cookie valid{age}")
        else:
            table.add_row("NYT", "[red]Expired[/red]", "Run: set-cookie <new-value>")

    # reMarkable
    try:
        uploader = RemarkableUploader(folder=config.remarkable.folder)
        uploader.check_rmapi()
        rm_ok = _check_remarkable()
        if rm_ok:
            table.add_row("reMarkable", "[green]Connected[/green]", f"Folder: {config.remarkable.folder}")
        else:
            table.add_row("reMarkable", "[red]Disconnected[/red]", "Check rmapi auth")
    except RmapiNotFoundError:
        table.add_row("reMarkable", "[yellow]Not Installed[/yellow]", "Install rmapi first")

    console.print(table)


@app.command(name="set-cookie")
def set_cookie(
    cookie: str = typer.Argument(help="Your NYT-S cookie value"),
) -> None:
    """Save your NYT authentication cookie."""
    config = load_config()
    # Strip "NYT-S=" prefix if the user included it
    cookie = cookie.removeprefix("NYT-S=").strip()
    config.nyt.cookie = cookie
    config.nyt.cookie_set_at = datetime.now()
    save_config(config)
    console.print("[green]Cookie saved.[/green]")


@app.command()
def history(
    limit: int = typer.Option(10, "--limit", "-n", help="Number of records to show"),
) -> None:
    """Show recent fetch history."""
    hist = History(path=DEFAULT_HISTORY_PATH)
    records = hist.recent(limit)

    if not records:
        console.print("No fetch history yet.")
        return

    table = Table(title="Fetch History")
    table.add_column("Puzzle Date")
    table.add_column("Fetched At")
    table.add_column("Status")
    table.add_column("Error")

    for r in records:
        status_str = "[green]success[/green]" if r.status == "success" else f"[red]{r.status}[/red]"
        table.add_row(
            r.puzzle_date.isoformat(),
            r.fetched_at.strftime("%Y-%m-%d %H:%M"),
            status_str,
            r.error or "",
        )

    console.print(table)


@app.command()
def serve(
    host: str = typer.Option("0.0.0.0", "--host", "-h", help="Bind address"),
    port: int = typer.Option(8080, "--port", "-p", help="Bind port"),
) -> None:
    """Start the web server and scheduler."""
    import uvicorn
    from nyt_crossword_remarkable.server import create_app

    console.print(f"Starting server at [bold]http://{host}:{port}[/bold]")
    server_app = create_app()
    uvicorn.run(server_app, host=host, port=port)


@app.command(name="install-rmapi")
def install_rmapi_cmd() -> None:
    """Download and install the rmapi binary."""
    from nyt_crossword_remarkable.services.rmapi_installer import install, is_installed

    if is_installed():
        console.print("[green]rmapi is already installed.[/green]")
        return

    console.print("Downloading rmapi...")
    try:
        path = install()
        console.print(f"[green]rmapi installed at {path}[/green]")
    except Exception as e:
        console.print(f"[red]Failed to install rmapi:[/red] {e}")
        raise typer.Exit(code=1)
