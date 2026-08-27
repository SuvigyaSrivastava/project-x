"""Voyager's normalized graph -> our ProfileResponse schema.

Pure functions only: no I/O, no network, nothing here reaches out to
LinkedIn. That's what makes this module trivially unit-testable against
fixtures and safe to refactor when a shape changes.

The one thing this mapper does that most reference implementations skip:
it verifies ownership, not just presence. Getting *a* JSON body back from
LinkedIn isn't the same as getting *this member's* data back -- so every
extractor here checks that a record's owning-profile reference (when the
payload carries one) matches the profile URN resolved from the identity
call, and drops (with a warning) anything that doesn't. A profile-level
mismatch at the root is a harder failure: it means the response doesn't
even claim to be about the member we asked for, which is a stronger signal
that the request/response shape has drifted, so it's raised rather than
silently dropped.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.linkedin.errors import UpstreamSchemaChangedError
from app.linkedin.graph import VoyagerGraph
from app.models.schema import (
    Certification,
    DateRange,
    Education,
    Experience,
    Language,
    ProfileImage,
    ProfileResponse,
    Skill,
)


@dataclass
class MappedProfile:
    profile: ProfileResponse
    warnings: list[str] = field(default_factory=list)


def _text(value: Any) -> Optional[str]:
    if isinstance(value, str):
        return value or None
    if isinstance(value, dict):
        return value.get("text") or None
    return None


def _date_to_str(d: Optional[dict[str, Any]]) -> Optional[str]:
    if not isinstance(d, dict):
        return None
    year, month = d.get("year"), d.get("month")
    if not year:
        return None
    return f"{year}-{month:02d}" if month else str(year)


def resolve_identity(graph: VoyagerGraph, expected_public_id: str) -> tuple[dict[str, Any], str]:
    """Find the root Profile entity and verify it's actually the member
    that was requested. Raises UpstreamSchemaChangedError if there's no
    Profile entity at all, or if the one present doesn't match --
    returning wrong-person data silently is worse than a loud 502.
    """
    candidates = list(graph.entities_of_type(".Profile"))
    if not candidates:
        raise UpstreamSchemaChangedError(
            "No Profile entity found in LinkedIn's response -- the decoration "
            "shape has likely changed. See app/linkedin/endpoints.py."
        )

    # Prefer an exact publicIdentifier match if more than one Profile-typed
    # entity is present (LinkedIn's graph can include related profiles,
    # e.g. "people also viewed", alongside the one that was requested).
    exact = [c for c in candidates if c.get("publicIdentifier") == expected_public_id]
    profile_entity = exact[0] if exact else candidates[0]

    returned_id = profile_entity.get("publicIdentifier")
    if returned_id != expected_public_id:
        raise UpstreamSchemaChangedError(
            f"Requested public identifier '{expected_public_id}' but the "
            f"response's root profile identifies as '{returned_id}'. "
            "Refusing to return data that doesn't match what was asked for."
        )

    profile_urn = profile_entity.get("entityUrn", "")
    return profile_entity, profile_urn


def _owned_by(entity: dict[str, Any], profile_urn: str) -> bool:
    """True if the entity carries an owning-profile reference AND it
    matches. If the entity carries no such reference at all (some section
    shapes don't echo it per-element), this returns True -- absence isn't
    treated as a mismatch, only an actual differing URN is.
    """
    owner = entity.get("*profile") or entity.get("profileUrn") or entity.get("*profileUrn")
    if owner is None:
        return True
    return owner == profile_urn


def extract_basics(profile_entity: dict[str, Any], graph: VoyagerGraph) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    image = None
    pic = profile_entity.get("profilePicture") or {}
    root_url = pic.get("rootUrl")
    artifacts = pic.get("artifacts") or []
    if root_url and artifacts:
        sizes = [{"width": a.get("width"), "url": root_url + a.get("fileIdentifyingUrlPathSegment", "")} for a in artifacts]
        largest = max(sizes, key=lambda s: s.get("width") or 0, default=None)
        image = ProfileImage(url=largest["url"] if largest else None, sizes=sizes)
    elif pic:
        warnings.append("profile_picture: expected rootUrl/artifacts shape not found")

    return {
        "first_name": profile_entity.get("firstName"),
        "last_name": profile_entity.get("lastName"),
        "headline": _text(profile_entity.get("headline")),
        "location": _text(profile_entity.get("locationName") or profile_entity.get("geoLocationName")),
        "about": _text(profile_entity.get("summary")),
        "image": image,
    }, warnings


def extract_experience(graph: VoyagerGraph, profile_urn: str) -> tuple[list[Experience], list[str]]:
    warnings: list[str] = []
    out: list[Experience] = []
    for entity in graph.entities_of_type(".Position"):
        if not _owned_by(entity, profile_urn):
            warnings.append(f"experience: dropped a position entity not owned by {profile_urn}")
            continue
        start = _date_to_str(entity.get("dateRange", {}).get("start") if isinstance(entity.get("dateRange"), dict) else None)
        end_present = bool(entity.get("dateRange", {}).get("current")) if isinstance(entity.get("dateRange"), dict) else None
        end = None if end_present else _date_to_str(entity.get("dateRange", {}).get("end") if isinstance(entity.get("dateRange"), dict) else None)
        out.append(
            Experience(
                title=_text(entity.get("title")),
                company_name=_text(entity.get("companyName")),
                location=_text(entity.get("locationName")),
                description=_text(entity.get("description")),
                date_range=DateRange(start=start, end=end, is_current=end_present),
            )
        )
    return out, warnings


def extract_education(graph: VoyagerGraph, profile_urn: str) -> tuple[list[Education], list[str]]:
    warnings: list[str] = []
    out: list[Education] = []
    for entity in graph.entities_of_type(".Education"):
        if not _owned_by(entity, profile_urn):
            warnings.append(f"education: dropped an entry not owned by {profile_urn}")
            continue
        start_year = (entity.get("dateRange", {}) or {}).get("start", {}).get("year")
        end_year = (entity.get("dateRange", {}) or {}).get("end", {}).get("year")
        out.append(
            Education(
                school_name=_text(entity.get("schoolName")),
                degree=_text(entity.get("degreeName")),
                field_of_study=_text(entity.get("fieldOfStudy")),
                start_year=start_year,
                end_year=end_year,
            )
        )
    return out, warnings


def extract_skills(graph: VoyagerGraph, profile_urn: str) -> tuple[list[Skill], list[str]]:
    out: list[Skill] = []
    for entity in graph.entities_of_type(".Skill"):
        name = _text(entity.get("name"))
        if not name:
            continue
        out.append(Skill(name=name, endorsement_count=entity.get("endorsementCount")))
    return out, []


def extract_certifications(graph: VoyagerGraph, profile_urn: str) -> tuple[list[Certification], list[str]]:
    out: list[Certification] = []
    for entity in graph.entities_of_type(".Certification"):
        out.append(
            Certification(
                name=_text(entity.get("name")),
                authority=_text(entity.get("authority")),
                issue_date=_date_to_str(entity.get("issueDate") if isinstance(entity.get("issueDate"), dict) else None),
                expiration_date=_date_to_str(entity.get("expirationDate") if isinstance(entity.get("expirationDate"), dict) else None),
                credential_url=entity.get("credentialUrl") or entity.get("url"),
            )
        )
    return out, []


def extract_languages(graph: VoyagerGraph, profile_urn: str) -> tuple[list[Language], list[str]]:
    out: list[Language] = []
    for entity in graph.entities_of_type(".Language"):
        name = _text(entity.get("name"))
        if not name:
            continue
        out.append(Language(name=name, proficiency=_text(entity.get("proficiency"))))
    return out, []


def map_identity_payload(payload: dict[str, Any], expected_public_id: str) -> MappedProfile:
    """Map JUST the identity response. Section payloads are merged in
    separately via merge_section (they arrive from separate, concurrent
    calls -- see app/service.py) so a slow or failed section never blocks
    the fields that were already available.
    """
    graph = VoyagerGraph(payload)
    profile_entity, profile_urn = resolve_identity(graph, expected_public_id)
    basics, warnings = extract_basics(profile_entity, graph)

    # The identity decoration typically embeds experience/education/skills
    # collections directly -- pull whatever's present here too, so a
    # deployment running with FETCH_OPTIONAL_SECTIONS=False still gets a
    # useful response from the one call it makes.
    experience, w1 = extract_experience(graph, profile_urn)
    education, w2 = extract_education(graph, profile_urn)
    skills, w3 = extract_skills(graph, profile_urn)
    certifications, w4 = extract_certifications(graph, profile_urn)
    languages, w5 = extract_languages(graph, profile_urn)

    profile = ProfileResponse(
        public_identifier=expected_public_id,
        profile_url=f"https://www.linkedin.com/in/{expected_public_id}/",
        experience=experience,
        education=education,
        skills=skills,
        certifications=certifications,
        languages=languages,
        **basics,
    )
    return MappedProfile(profile=profile, warnings=[*warnings, *w1, *w2, *w3, *w4, *w5])


def merge_section(mapped: MappedProfile, section_name: str, payload: Optional[dict[str, Any]], profile_urn: str) -> MappedProfile:
    """Fold one additional section response into an already-mapped
    profile. Only ADDS data (extends lists) -- never overwrites fields the
    identity call already populated, and never fails the whole profile if
    this one section is missing or malformed.
    """
    if payload is None:
        mapped.warnings.append(f"{section_name}: unavailable (fetch failed or was skipped)")
        return mapped

    graph = VoyagerGraph(payload)
    extractors = {
        "positions": lambda: extract_experience(graph, profile_urn),
        "educations": lambda: extract_education(graph, profile_urn),
        "skills": lambda: extract_skills(graph, profile_urn),
        "certifications": lambda: extract_certifications(graph, profile_urn),
        "languages": lambda: extract_languages(graph, profile_urn),
    }
    extractor = extractors.get(section_name)
    if extractor is None:
        return mapped

    items, warnings = extractor()
    mapped.warnings.extend(warnings)
    if not items:
        return mapped

    target_list = {
        "positions": mapped.profile.experience,
        "educations": mapped.profile.education,
        "skills": mapped.profile.skills,
        "certifications": mapped.profile.certifications,
        "languages": mapped.profile.languages,
    }[section_name]

    existing_keys = {repr(x) for x in target_list}
    for item in items:
        if repr(item) not in existing_keys:
            target_list.append(item)
    return mapped
