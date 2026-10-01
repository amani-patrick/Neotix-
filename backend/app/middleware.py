"""Structured per-request logging middleware.

One JSON log line per HTTP request with method, path, status, duration_ms,
and user_id when authenticated. Never logs headers, tokens, or bodies, so
passwords and JWTs cannot leak into logs (spec section 25).
"""

import time

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response

logger = structlog.get_logger("request_logging")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next) -> Response:
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.error(
                "request_failed",
                method=request.method,
                path=request.url.path,
                status=500,
                duration_ms=round(duration_ms, 2),
                user_id=getattr(request.state, "user_id", None),
                exc_info=True,
            )
            raise
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round(duration_ms, 2),
            user_id=getattr(request.state, "user_id", None),
        )
        return response
