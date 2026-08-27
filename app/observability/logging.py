"""Structured JSON logging with request correlation.

Every log line is one JSON object with a stable set of top-level keys
(timestamp, level, logger, message, request_id, plus whatever's passed via
`extra`). That's what makes logs actually queryable once they leave this
process, instead of grep-able-at-best text.
"""
from __future__ import annotations

import contextvars
import json
import logging
import sys
import time

request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

_RESERVED = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message", "taskName",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": round(record.created, 3),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_ctx.get(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str, service_name: str) -> None:
    root = logging.getLogger()
    root.setLevel(level)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.handlers = [handler]
    logging.getLogger(service_name)


class Timer:
    """`with Timer() as t: ...` then `t.elapsed_ms` -- used to log LinkedIn
    round-trip time and total request latency without littering call sites
    with time.monotonic() pairs.
    """

    def __enter__(self) -> "Timer":
        self._start = time.monotonic()
        return self

    def __exit__(self, *exc: object) -> None:
        self.elapsed_ms = round((time.monotonic() - self._start) * 1000, 1)
