"""Extract and validate a public LinkedIn identifier from a profile URL."""
from __future__ import annotations

import re
from urllib.parse import unquote, urlparse

_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9\-_%]{3,100}$")


class InvalidUrlError(ValueError):
    pass


def extract_public_identifier(url: str) -> str:
    if not url or not isinstance(url, str):
        raise InvalidUrlError("A LinkedIn profile URL is required.")

    candidate = url.strip()

    if "/" not in candidate and "." not in candidate:
        if not _IDENTIFIER_RE.match(candidate):
            raise InvalidUrlError(f"'{candidate}' is not a valid LinkedIn identifier.")
        return unquote(candidate)

    if not candidate.startswith(("http://", "https://")):
        candidate = "https://" + candidate

    parsed = urlparse(candidate)

    if parsed.scheme not in ("http", "https"):
        raise InvalidUrlError("Only http(s) LinkedIn URLs are accepted.")
    if parsed.port is not None:
        raise InvalidUrlError("Profile URLs with an explicit port are rejected.")
    if "@" in parsed.netloc:
        raise InvalidUrlError("Profile URLs with embedded credentials are rejected.")

    host = parsed.hostname or ""
    if not (host == "linkedin.com" or host.endswith(".linkedin.com")):
        raise InvalidUrlError(f"'{host}' is not a linkedin.com host.")

    path_parts = [p for p in parsed.path.split("/") if p]
    if len(path_parts) < 2 or path_parts[0].lower() != "in":
        raise InvalidUrlError("URL does not contain an /in/<identifier> profile path.")

    identifier = unquote(path_parts[1])

    # Reject anything that decodes into path-traversal or another path
    # segment -- a defensively re-encoded identifier should look nothing
    # like this once decoded.
    if "/" in identifier or ".." in identifier or not _IDENTIFIER_RE.match(path_parts[1]):
        raise InvalidUrlError(f"'{identifier}' is not a valid public identifier.")

    return identifier
