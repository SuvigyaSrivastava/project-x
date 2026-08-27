"""A tiny resolver for LinkedIn's normalized `{data, included}` shape.

Voyager's dash endpoints don't return a nested tree -- every entity sits
flat in an `included` array, and references between them are string URNs
in keys prefixed with `*`. A profile doesn't contain its positions; it has
a `*profilePositionGroups` URN, that collection is itself an entry in
`included`, and its `*elements` are the position URNs. This module indexes
`included` by URN once per response and lets callers walk the pointers,
rather than every extractor function re-scanning the array.
"""
from __future__ import annotations

from typing import Any, Iterator, Optional


class VoyagerGraph:
    def __init__(self, payload: dict[str, Any]) -> None:
        included = payload.get("included") or []
        self._by_urn: dict[str, dict[str, Any]] = {}
        for entity in included:
            if isinstance(entity, dict) and entity.get("entityUrn"):
                self._by_urn[entity["entityUrn"]] = entity
        self._root = payload.get("data") or {}

    @property
    def root(self) -> dict[str, Any]:
        return self._root

    def resolve(self, urn: Optional[str]) -> Optional[dict[str, Any]]:
        if not urn:
            return None
        return self._by_urn.get(urn)

    def resolve_collection(self, collection_urn: Optional[str]) -> Iterator[dict[str, Any]]:
        """A `*somethingUrn` pointing at a CollectionResponse: follow it,
        then yield each resolved element from its `*elements` list.
        """
        collection = self.resolve(collection_urn)
        if not collection:
            return
        for element_urn in collection.get("*elements") or []:
            entity = self.resolve(element_urn)
            if entity:
                yield entity

    def entities_of_type(self, type_suffix: str) -> Iterator[dict[str, Any]]:
        """Match by suffix of `$type`, e.g. '.Profile' -- LinkedIn's fully
        qualified types (com.linkedin.voyager.dash.identity.profile.Profile)
        are more stable across minor rotations than the collection URNs
        pointing at them.
        """
        for entity in self._by_urn.values():
            t = entity.get("$type", "")
            if t.endswith(type_suffix):
                yield entity
