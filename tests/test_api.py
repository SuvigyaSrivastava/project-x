import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.linkedin.errors import AuthExpiredError, PrivateProfileError, ProfileNotFoundError, UpstreamRateLimitedError
from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


class FakeLinkedInClient:
    """Stands in for app.linkedin.client.LinkedInClient in API tests --
    only the two methods ProfileService actually calls.
    """

    def __init__(self, identity_payload: dict, section_error: Exception | None = None):
        self._identity_payload = identity_payload
        self._section_error = section_error
        self.identity_calls = 0

    async def fetch_identity(self, public_id: str) -> dict:
        self.identity_calls += 1
        return self._identity_payload

    async def fetch_section(self, name: str, profile_urn: str) -> dict | None:
        if self._section_error is not None and name == "certifications":
            return None  # simulates fetch_section's own error-swallowing behaviour
        return {}  # a validly-shaped, empty section response


@pytest.fixture
def api_client():
    fake = FakeLinkedInClient(_load("identity_full.json"))
    with TestClient(app) as client:
        client.app.state.credentials_configured = True
        client.app.state.linkedin_client = fake
        client.app.state.cache._store.clear()  # isolate tests from each other
        yield client, fake


def test_health_reports_configured_state(api_client):
    client, _ = api_client
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["credentials_configured"] is True


def test_successful_profile_lookup(api_client):
    client, fake = api_client
    resp = client.get("/v1/profile", params={"url": "https://www.linkedin.com/in/jane-doe/"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["public_identifier"] == "jane-doe"
    assert body["data"]["first_name"] == "Jane"
    assert len(body["data"]["experience"]) == 2
    assert body["cached"] is False
    assert "x-request-id" in resp.headers


def test_second_request_is_served_from_cache(api_client):
    client, fake = api_client
    r1 = client.get("/v1/profile", params={"url": "jane-doe"})
    r2 = client.get("/v1/profile", params={"url": "jane-doe"})
    assert r1.json()["cached"] is False
    assert r2.json()["cached"] is True
    assert fake.identity_calls == 1  # second request never hit the fake LinkedIn client


def test_invalid_url_returns_400(api_client):
    client, _ = api_client
    resp = client.get("/v1/profile", params={"url": "https://twitter.com/jane-doe"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_URL"


@pytest.mark.parametrize(
    "exc,expected_status,expected_code",
    [
        (ProfileNotFoundError("nope"), 404, "PROFILE_NOT_FOUND"),
        (PrivateProfileError("private"), 403, "PROFILE_PRIVATE"),
        (AuthExpiredError("stale"), 502, "AUTH_EXPIRED"),
        (UpstreamRateLimitedError("slow down"), 429, "UPSTREAM_RATE_LIMITED"),
    ],
)
def test_typed_linkedin_errors_map_to_the_right_http_response(exc, expected_status, expected_code):
    class RaisingClient:
        async def fetch_identity(self, public_id: str):
            raise exc

        async def fetch_section(self, name: str, profile_urn: str):
            return None

    with TestClient(app) as client:
        client.app.state.credentials_configured = True
        client.app.state.linkedin_client = RaisingClient()
        client.app.state.cache._store.clear()
        resp = client.get("/v1/profile", params={"url": "jane-doe"})

    assert resp.status_code == expected_status
    body = resp.json()
    assert body["error"]["code"] == expected_code
    assert "request_id" in body["error"]


def test_service_unavailable_when_no_credentials_configured():
    with TestClient(app) as client:
        client.app.state.credentials_configured = False
        client.app.state.linkedin_client = None
        resp = client.get("/v1/profile", params={"url": "jane-doe"})
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "NOT_CONFIGURED"


def test_api_key_gate(monkeypatch, api_client):
    client, _ = api_client
    client.app.state.settings.API_KEY = "s3cret"
    try:
        resp = client.get("/v1/profile", params={"url": "jane-doe"})
        assert resp.status_code == 401

        resp_ok = client.get("/v1/profile", params={"url": "jane-doe"}, headers={"X-API-Key": "s3cret"})
        assert resp_ok.status_code == 200
    finally:
        client.app.state.settings.API_KEY = None
