from nyt_crossword_remarkable.services.fetch_state import FetchProgress, FetchPhase, fetch_state


def test_initial_state():
    state = FetchProgress()
    assert state.phase == FetchPhase.IDLE
    assert state.progress == 0
    assert state.log == []


def test_update_phase():
    state = FetchProgress()
    state.set_phase(FetchPhase.DOWNLOAD, 0)
    assert state.phase == FetchPhase.DOWNLOAD
    assert state.progress == 0


def test_add_log():
    state = FetchProgress()
    state.add_log("Starting download")
    assert len(state.log) == 1
    assert state.log[0]["msg"] == "Starting download"


def test_complete():
    state = FetchProgress()
    state.set_phase(FetchPhase.DOWNLOAD, 50)
    state.complete()
    assert state.phase == FetchPhase.DONE
    assert state.progress == 100


def test_reset():
    state = FetchProgress()
    state.set_phase(FetchPhase.UPLOAD, 80)
    state.add_log("uploading")
    state.reset()
    assert state.phase == FetchPhase.IDLE
    assert state.progress == 0
    assert state.log == []


def test_to_dict():
    state = FetchProgress()
    state.set_phase(FetchPhase.DOWNLOAD, 50)
    state.add_log("HTTP 200", kind="ok")
    d = state.to_dict()
    assert d["phase"] == "download"
    assert d["progress"] == 50
    assert len(d["log"]) == 1
    assert d["log"][0]["kind"] == "ok"


def test_global_fetch_state():
    fetch_state.reset()
    assert fetch_state.phase == FetchPhase.IDLE
    fetch_state.set_phase(FetchPhase.UPLOAD, 75)
    assert fetch_state.phase == FetchPhase.UPLOAD
    fetch_state.reset()
