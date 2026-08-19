#!/usr/bin/env bash
# Static server for the demo UI. The browser talks to the llama server directly
# (its CORS is open), so no proxy is needed.
cd "$(dirname "$0")"
exec python3 -m http.server "${1:-8080}"
