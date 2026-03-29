#!/usr/bin/env python3
"""Dev server with Cache-Control: no-store so module changes reload instantly."""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def log_message(self, *args):
        pass  # suppress request logs

http.server.test(HandlerClass=NoCacheHandler, port=PORT, bind='')
