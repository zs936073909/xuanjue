#!/usr/bin/env python3
"""Serve the repo so / opens the night-plate game, while /index.html remains 玄决."""
import http.server
import mimetypes
import os
import socketserver

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(ROOT)
mimetypes.add_type('font/woff2', '.woff2')
mimetypes.add_type('application/javascript', '.js')


class Handler(http.server.SimpleHTTPRequestHandler):
    def _rewrite(self):
        path = self.path.split('?', 1)[0]
        if path == '/':
            qs = ('?' + self.path.split('?', 1)[1]) if '?' in self.path else ''
            self.path = '/game/index.html' + qs

    def do_GET(self):
        self._rewrite()
        return super().do_GET()

    def do_HEAD(self):
        self._rewrite()
        return super().do_HEAD()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8765'))
    with Server(('0.0.0.0', port), Handler) as httpd:
        print(f'serving {ROOT} on 0.0.0.0:{port}', flush=True)
        httpd.serve_forever()
