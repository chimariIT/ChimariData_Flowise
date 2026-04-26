"""
API tests for auth provider readiness responses.
"""

import json

import pytest

from src.api.auth_routes import get_auth_providers, get_auth_provider_diagnostics


def _parse_response_body(response) -> dict:
    return json.loads(response.body.decode("utf-8"))


@pytest.mark.asyncio
async def test_auth_providers_reports_missing_google_config(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("VITE_GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("VITE_GOOGLE_CLIENT_SECRET", raising=False)

    response = await get_auth_providers()
    payload = _parse_response_body(response)

    google = next(p for p in payload["providers"] if p["id"] == "google")
    assert google["enabled"] is False
    assert google["authUrl"] is None
    assert "GOOGLE_CLIENT_ID" in google["missingConfig"]
    assert "GOOGLE_CLIENT_SECRET" in google["missingConfig"]
    assert isinstance(google.get("setupHint"), str)


@pytest.mark.asyncio
async def test_auth_provider_diagnostics_counts_ready_providers(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-client-secret")

    response = await get_auth_provider_diagnostics()
    payload = _parse_response_body(response)

    assert payload["success"] is True
    assert payload["readyProviderCount"] >= 1
    assert "google" in payload["readyProviders"]
