"""Orchestration: cache -> identity fetch -> concurrent section fetches ->
merge -> mapped profile. This is the one place that knows the whole shape
of a lookup; everything it calls is independently testable on its own.
"""
from __future__ import annotations

import asyncio
import logging

from app.config import Settings
from app.linkedin.client import LinkedInClient
from app.linkedin.endpoints import SECTION_PATHS
from app.mapper.profile_mapper import MappedProfile, map_identity_payload, merge_section
from app.observability.logging import Timer

logger = logging.getLogger("service")


class ProfileService:
    def __init__(self, client: LinkedInClient, settings: Settings) -> None:
        self._client = client
        self._settings = settings

    async def fetch_and_map(self, public_id: str) -> MappedProfile:
        with Timer() as identity_timer:
            identity_payload = await self._client.fetch_identity(public_id)
        logger.info("identity_fetched", extra={"public_id": public_id, "duration_ms": identity_timer.elapsed_ms})

        mapped = map_identity_payload(identity_payload, public_id)

        if not self._settings.FETCH_OPTIONAL_SECTIONS:
            return mapped

        profile_urn = mapped.profile.public_identifier and _profile_urn_from(identity_payload, public_id)
        if not profile_urn:
            mapped.warnings.append("optional sections skipped: could not resolve profile URN")
            return mapped

        section_names = list(SECTION_PATHS.keys())
        with Timer() as sections_timer:
            results = await asyncio.gather(
                *(self._client.fetch_section(name, profile_urn) for name in section_names),
                return_exceptions=False,  # fetch_section already swallows its own errors -> None
            )
        logger.info(
            "sections_fetched",
            extra={"public_id": public_id, "duration_ms": sections_timer.elapsed_ms, "count": len(section_names)},
        )

        for name, payload in zip(section_names, results):
            mapped = merge_section(mapped, name, payload, profile_urn)

        return mapped


def _profile_urn_from(identity_payload: dict, public_id: str) -> str | None:
    from app.linkedin.graph import VoyagerGraph  # local import: avoids a cycle with mapper at module load

    graph = VoyagerGraph(identity_payload)
    for entity in graph.entities_of_type(".Profile"):
        if entity.get("publicIdentifier") == public_id:
            return entity.get("entityUrn")
    return None
