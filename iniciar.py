#!/usr/bin/env python3
"""Finance OS local: Python standard library only, no external services."""
import argparse
import functools
import http.server
import json
import pathlib
import sys
import threading
import urllib.error
import urllib.request
import webbrowser

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

HOST = '127.0.0.1'
PORT = 8765
URL = f'http://{HOST}:{PORT}'
MARKER = 'finance-os-local-v1'

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.mjs': 'text/javascript; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.woff2': 'font/woff2',
        '.webmanifest': 'application/manifest+json; charset=utf-8',
        '.svg': 'image/svg+xml',
    }

    def do_GET(self):
        # Disallow access outside loopback when running locally
        if self.headers.get('Host') not in (f'{HOST}:{PORT}', f'localhost:{PORT}'):
            self.send_error(403, 'Host not allowed')
            return
        if self.path == '/__finance_os_health':
            body = json.dumps({'app': MARKER}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def list_directory(self, path):
        self.send_error(403, 'Directory listing disabled')
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description='Finance OS local')
    parser.add_argument('--no-browser', action='store_true', help='Não abrir o navegador automaticamente')
    parser.add_argument('--port', type=int, default=PORT, help=f'Porta HTTP (padrão: {PORT})')
    args = parser.parse_args()
    
    port = args.port
    app_url = f'http://{HOST}:{port}'

    root = pathlib.Path(__file__).resolve().parent / 'app'
    if not (root / 'index.html').is_file():
        print('Pasta "app" não encontrada. Extraia o pacote completo antes de iniciar.')
        return 1

    handler = functools.partial(Handler, directory=str(root))
    try:
        server = http.server.ThreadingHTTPServer((HOST, port), handler)
    except OSError:
        try:
            with urllib.request.urlopen(app_url + '/__finance_os_health', timeout=2) as response:
                running = json.load(response).get('app') == MARKER
        except (OSError, ValueError, urllib.error.URLError):
            running = False

        if running:
            print(f'Finance OS já está aberto em: {app_url}')
            if not args.no_browser:
                webbrowser.open(app_url)
            return 0

        print(f'A porta {port} está ocupada por outro programa. Feche-o e tente novamente.')
        return 1

    print('=' * 50)
    print(f'  Finance OS local ativo em: {app_url}')
    print('  Mantenha esta janela aberta enquanto estiver usando.')
    print('  Para encerrar: Ctrl+C.')
    print('  Seus dados ficam 100% seguros no seu navegador.')
    print('=' * 50)

    if not args.no_browser:
        threading.Timer(0.4, lambda: webbrowser.open(app_url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nFinance OS encerrado.')
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
