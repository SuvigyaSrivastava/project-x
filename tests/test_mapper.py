import json
from pathlib import Path

import pytest

from app.linkedin.errors import UpstreamSchemaChangedError
from app.linkedin.graph import VoyagerGraph
from app.mapper.profile_mapper import map_identity_payload, resolve_identity

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def test_full_profile_maps_every_section():
    mapped = map_identity_payload(_load("identity_full.json"), "jane-doe")
    p = mapped.profile

    assert p.first_name == "Jane"
    assert p.last_name == "Doe"
    assert p.headline == "Staff Software Engineer at Example Corp"
    assert p.location == "Bengaluru, Karnataka, India"
    assert "distributed systems" in p.about.lower()

    assert p.image is not None
    assert p.image.url.endswith("400x400.jpg")  # largest artifact chosen
    assert len(p.image.sizes) == 2

    assert len(p.experience) == 2
    current = [e for e in p.experience if e.date_range.is_current]
    assert len(current) == 1
    assert current[0].title == "Staff Software Engineer"

    assert len(p.education) == 1
    assert p.education[0].school_name == "Indian Institute of Technology"

    assert {s.name for s in p.skills} == {"Distributed Systems", "Python"}
    assert len(p.certifications) == 1
    assert len(p.languages) == 1
    assert mapped.warnings == []


def test_missing_optional_sections_degrade_gracefully():
    mapped = map_identity_payload(_load("identity_minimal.json"), "minimal-mo")
    p = mapped.profile

    assert p.first_name == "Minimal"
    assert p.headline is None
    assert p.about is None
    assert p.experience == []
    assert p.education == []
    assert p.skills == []
    # No exception raised, and no warning for sections that are simply
    # absent from a minimal identity response.
    assert mapped.warnings == []


def test_identity_mismatch_is_rejected_not_silently_returned():
    payload = _load("identity_wrong_person.json")
    with pytest.raises(UpstreamSchemaChangedError, match="jane-doe"):
        map_identity_payload(payload, "jane-doe")


def test_no_profile_entity_at_all_raises():
    with pytest.raises(UpstreamSchemaChangedError):
        map_identity_payload({"data": {}, "included": []}, "jane-doe")


def test_records_owned_by_a_different_profile_urn_are_dropped():
    payload = _load("identity_with_foreign_position.json")
    mapped = map_identity_payload(payload, "carlos-rivera")

    titles = [e.title for e in mapped.profile.experience]
    assert "Product Manager" in titles
    assert "Should Not Appear" not in titles
    assert any("dropped a position entity" in w for w in mapped.warnings)


def test_resolve_identity_prefers_exact_match_when_multiple_profiles_present():
    # Simulates a graph that also includes "people also viewed" profiles --
    # the resolver must pick the one matching the requested identifier, not
    # just the first Profile-typed entity in the array.
    payload = {
        "data": {},
        "included": [
            {
                "$type": "com.linkedin.voyager.dash.identity.profile.Profile",
                "entityUrn": "urn:li:fsd_profile:decoy",
                "publicIdentifier": "someone-else",
            },
            {
                "$type": "com.linkedin.voyager.dash.identity.profile.Profile",
                "entityUrn": "urn:li:fsd_profile:target",
                "publicIdentifier": "jane-doe",
            },
        ],
    }
    graph = VoyagerGraph(payload)
    entity, urn = resolve_identity(graph, "jane-doe")
    assert urn == "urn:li:fsd_profile:target"
