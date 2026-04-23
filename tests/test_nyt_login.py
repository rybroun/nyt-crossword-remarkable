import httpx
import pytest
import respx

from nyt_crossword_remarkable.services.nyt_fetcher import NytFetcher, NytLoginError


class TestNytLogin:
    @respx.mock
    @pytest.mark.asyncio
    async def test_login_success(self):
        respx.post("https://myaccount.nytimes.com/svc/ios/v2/login").mock(
            return_value=httpx.Response(200, json={
                "data": {
                    "cookies": [
                        {"name": "NYT-S", "cipheredValue": "abc123cookievalue=="},
                        {"name": "other", "cipheredValue": "ignore"},
                    ]
                }
            })
        )
        cookie = await NytFetcher.login("user@example.com", "password123")
        assert cookie == "abc123cookievalue=="

    @respx.mock
    @pytest.mark.asyncio
    async def test_login_invalid_credentials(self):
        respx.post("https://myaccount.nytimes.com/svc/ios/v2/login").mock(
            return_value=httpx.Response(403, json={"error": "invalid credentials"})
        )
        with pytest.raises(NytLoginError, match="credentials"):
            await NytFetcher.login("user@example.com", "wrongpass")

    @respx.mock
    @pytest.mark.asyncio
    async def test_login_blocked(self):
        respx.post("https://myaccount.nytimes.com/svc/ios/v2/login").mock(
            return_value=httpx.Response(429)
        )
        with pytest.raises(NytLoginError):
            await NytFetcher.login("user@example.com", "password123")

    @respx.mock
    @pytest.mark.asyncio
    async def test_login_no_cookie_in_response(self):
        respx.post("https://myaccount.nytimes.com/svc/ios/v2/login").mock(
            return_value=httpx.Response(200, json={
                "data": {"cookies": [{"name": "other", "cipheredValue": "val"}]}
            })
        )
        with pytest.raises(NytLoginError, match="NYT-S"):
            await NytFetcher.login("user@example.com", "password123")
