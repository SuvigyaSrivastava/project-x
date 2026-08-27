"""Voyager endpoint shapes, kept in one place and versioned so a LinkedIn
change means editing a constant here plus adding a fixture, not hunting
through client code under pressure.

IDENTITY_PATH / IDENTITY_DECORATION_ID: verified live 2026-08-27 against a
real authenticated session -- a direct GET returned 200 with the expected
`{data, included}` Voyager envelope and resolved the correct member URN.
This confirms the classic Voyager identity endpoint still answers direct,
server-to-server calls even though LinkedIn's own web client no longer
calls it during a normal browser page load (that page is now server-
rendered client-side -- see README).

SECTION_PATHS: two of the five (`profilePositions`, `profileEducations`)
were live-probed on 2026-08-27, in isolation (not paired with an identity
call, on a known-good session) and BOTH came back identically: `302`
redirecting to the exact same URL requested, with a `Clear-Site-Data:
"storage"` response header. That header only does anything when a real
browser processes the response -- our probes were a scripted client, so it
had no effect on the browser session, and a repeat check confirmed the
browser session was unaffected. Net read: this whole `identity/dash/
profile<Section>` family looks retired/moved while the parent `identity/
dash/profiles` endpoint is still live. The other three (`profileSkills`,
`profileCertifications`, `profileLanguages`) weren't individually probed,
but given 2/2 identical results in the same resource family, treat them as
very likely dead too until proven otherwise -- not confirmed, but no
longer a blind guess either. FETCH_OPTIONAL_SECTIONS now defaults to False
in app/config.py as a direct consequence: calling a confirmed-dead path on
every request just burns call budget and latency for nothing.
"""
from __future__ import annotations

VOYAGER_BASE = "https://www.linkedin.com/voyager/api"

# Bump this when LinkedIn rotates the decoration and you've re-verified
# against a fresh capture. Keeping it as one named constant (rather than
# inlined in the request call) is the whole point -- a schema-drift fix is
# a one-line diff plus a new fixture, not a client rewrite.
IDENTITY_DECORATION_ID = "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-100"  # verified live 2026-08-27

IDENTITY_PATH = f"{VOYAGER_BASE}/identity/dash/profiles"  # verified live 2026-08-27

# Optional per-section fallbacks. FETCH_OPTIONAL_SECTIONS now defaults to
# False in app/config.py -- see module docstring. Left wired up (rather
# than deleted) because the *identity* endpoint's own decoration may still
# cover some of this data, and because a real replacement path for these
# sections may exist and just hasn't been found yet.
SECTION_PATHS = {
    "positions": f"{VOYAGER_BASE}/identity/dash/profilePositions",  # CONFIRMED DEAD 2026-08-27: 302 self-redirect
    "educations": f"{VOYAGER_BASE}/identity/dash/profileEducations",  # CONFIRMED DEAD 2026-08-27: 302 self-redirect
    "skills": f"{VOYAGER_BASE}/identity/dash/profileSkills",  # TODO: verify -- likely dead too, see module docstring
    "certifications": f"{VOYAGER_BASE}/identity/dash/profileCertifications",  # TODO: verify -- likely dead too, see module docstring
    "languages": f"{VOYAGER_BASE}/identity/dash/profileLanguages",  # TODO: verify -- likely dead too, see module docstring
}

# Contact info sits behind a separate, more sensitive endpoint. Modeled but
# never called unless an operator explicitly opts in -- it's the most
# personal part of the profile and isn't required by the brief.
CONTACT_INFO_PATH_TEMPLATE = f"{VOYAGER_BASE}/identity/profiles/{{public_id}}/profileContactInfo"  # TODO: verify
