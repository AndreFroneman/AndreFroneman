"""Accepts gzip-compressed request bodies on ingestion endpoints (edge nodes on satellite
links compress uploads). Decompression is bounded to prevent decompression bombs."""
from __future__ import annotations

import zlib

MAX_COMPRESSED = 20 * 1024 * 1024
MAX_DECOMPRESSED = 100 * 1024 * 1024


class GzipIngestMiddleware:
    def __init__(self, app, prefix: str = "/v1/ingest/"):
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith(self.prefix):
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers") or [])
        if headers.get(b"content-encoding", b"").lower() != b"gzip":
            return await self.app(scope, receive, send)
        body = bytearray()
        more = True
        while more:
            msg = await receive()
            body += msg.get("body", b"")
            more = msg.get("more_body", False)
            if len(body) > MAX_COMPRESSED:
                return await _reject(send, 413, b'{"detail":"compressed body too large"}')
        d = zlib.decompressobj(16 + zlib.MAX_WBITS)
        try:
            raw = d.decompress(bytes(body), MAX_DECOMPRESSED + 1)
        except zlib.error:
            return await _reject(send, 400, b'{"detail":"invalid gzip body"}')
        if len(raw) > MAX_DECOMPRESSED or d.unconsumed_tail:
            return await _reject(send, 413, b'{"detail":"decompressed body too large"}')
        new_headers = [(k, v) for k, v in scope["headers"] if k not in (b"content-encoding", b"content-length")]
        new_headers.append((b"content-length", str(len(raw)).encode()))
        scope = {**scope, "headers": new_headers}
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": raw, "more_body": False}
            return await receive()

        return await self.app(scope, replay, send)


async def _reject(send, status: int, body: bytes):
    await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json")]})
    await send({"type": "http.response.body", "body": body})
