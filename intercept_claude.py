#!/usr/bin/env python3
"""
Claude Desktop Traffic Interceptor

Intercepts Claude Desktop's HTTPS traffic and redirects it to your Bedrock proxy.
Uses mitmproxy to handle SSL termination.

This approach doesn't modify Claude Desktop - it intercepts traffic at the network level.

Setup (one-time):
    1. Install mitmproxy: pip install mitmproxy
    2. Run this script once to generate certs
    3. Install the mitmproxy CA certificate:
       - macOS: security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain ~/.mitmproxy/mitmproxy-ca-cert.pem
       - Windows: certutil -addstore root %USERPROFILE%\\.mitmproxy\\mitmproxy-ca-cert.cer
       - Linux: sudo cp ~/.mitmproxy/mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/mitmproxy.crt && sudo update-ca-certificates

Usage:
    # Terminal 1: Run your Bedrock proxy
    python bedrock_proxy.py

    # Terminal 2: Run this interceptor
    python intercept_claude.py

    # Terminal 3: Launch Claude Desktop with proxy settings
    # macOS:
    HTTPS_PROXY=http://localhost:8888 /Applications/Claude.app/Contents/MacOS/Claude

    # Or set system proxy and just launch normally

Alternative - Hosts file approach (requires interceptor running on port 443):
    # Add to /etc/hosts:
    127.0.0.1 api.anthropic.com

    # Then run interceptor with sudo on port 443:
    sudo python intercept_claude.py --port 443
"""

import os
import sys
import argparse
import http.server
import socketserver
import urllib.request

try:
    from mitmproxy import http
    MITMPROXY_AVAILABLE = True
except ImportError:
    MITMPROXY_AVAILABLE = False


# Configuration
BEDROCK_PROXY_URL = os.getenv("BEDROCK_PROXY_URL", "http://localhost:8080")
INTERCEPT_HOST = "api.anthropic.com"


class AnthropicToBedrock:
    """mitmproxy addon that redirects Anthropic API calls to Bedrock proxy."""

    def __init__(self, bedrock_url: str):
        self.bedrock_url = bedrock_url.rstrip("/")
        print(f"Interceptor initialized. Redirecting {INTERCEPT_HOST} -> {self.bedrock_url}")

    def request(self, flow: http.HTTPFlow) -> None:
        """Intercept requests to api.anthropic.com."""
        if flow.request.pretty_host == INTERCEPT_HOST:
            # Log the interception
            print(f"[INTERCEPT] {flow.request.method} {flow.request.path}")

            # Rewrite the request to go to our Bedrock proxy
            # Keep the original path
            flow.request.host = self.bedrock_url.replace("http://", "").replace("https://", "").split(":")[0]

            # Extract port
            if ":" in self.bedrock_url.replace("http://", "").replace("https://", ""):
                flow.request.port = int(self.bedrock_url.split(":")[-1])
            else:
                flow.request.port = 80 if "http://" in self.bedrock_url else 443

            # Change scheme
            flow.request.scheme = "http" if "http://" in self.bedrock_url else "https"

            # Remove any headers that might cause issues
            if "host" in flow.request.headers:
                flow.request.headers["host"] = f"{flow.request.host}:{flow.request.port}"

    def response(self, flow: http.HTTPFlow) -> None:
        """Log responses."""
        if INTERCEPT_HOST in str(flow.request.headers.get("host", "")):
            print(f"[RESPONSE] {flow.response.status_code} {flow.request.path}")


def run_mitmproxy(port: int, bedrock_url: str):
    """Run mitmproxy with our addon."""
    from mitmproxy.tools.main import mitmdump

    # Create addon
    addon = AnthropicToBedrock(bedrock_url)

    # Run mitmdump
    sys.argv = [
        "mitmdump",
        "--listen-port", str(port),
        "--set", "ssl_insecure=true",
        "-s", __file__,
    ]

    # Set the addon for this run
    global ADDON_INSTANCE
    ADDON_INSTANCE = addon

    mitmdump()


# This is loaded by mitmproxy when used as a script
def load(l):
    """Called by mitmproxy when loading this script."""
    pass


addons = []


def create_simple_proxy(port: int, bedrock_url: str):
    """Create a simple HTTPS proxy without mitmproxy (limited functionality)."""

    class ProxyHandler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            self.proxy_request()

        def do_GET(self):
            self.proxy_request()

        def proxy_request(self):
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else None

            # Forward to Bedrock proxy
            target_url = f"{bedrock_url}{self.path}"

            try:
                req = urllib.request.Request(
                    target_url,
                    data=body,
                    headers={k: v for k, v in self.headers.items() if k.lower() not in ['host', 'content-length']},
                    method=self.command
                )

                with urllib.request.urlopen(req) as response:
                    self.send_response(response.status)
                    for header, value in response.headers.items():
                        if header.lower() not in ['transfer-encoding', 'content-encoding']:
                            self.send_header(header, value)
                    self.end_headers()
                    self.wfile.write(response.read())

            except Exception as e:
                self.send_error(502, f"Proxy Error: {e}")

        def log_message(self, format, *args):
            print(f"[PROXY] {args[0]}")

    with socketserver.TCPServer(("", port), ProxyHandler) as httpd:
        print(f"Simple proxy running on port {port}")
        print(f"Forwarding to: {bedrock_url}")
        httpd.serve_forever()


def print_setup_instructions():
    """Print setup instructions."""
    print("""
╔═══════════════════════════════════════════════════════════════════╗
║           Claude Desktop Traffic Interceptor Setup                ║
╠═══════════════════════════════════════════════════════════════════╣

OPTION 1: Using mitmproxy (Recommended)
───────────────────────────────────────

1. Install mitmproxy:
   pip install mitmproxy

2. Run mitmproxy once to generate certificates:
   mitmproxy
   (Then press 'q' to quit)

3. Install the CA certificate:

   macOS:
   ───────
   sudo security add-trusted-cert -d -r trustRoot \\
       -k /Library/Keychains/System.keychain \\
       ~/.mitmproxy/mitmproxy-ca-cert.pem

   Windows (run as Administrator):
   ────────────────────────────────
   certutil -addstore root %USERPROFILE%\\.mitmproxy\\mitmproxy-ca-cert.cer

   Linux:
   ──────
   sudo cp ~/.mitmproxy/mitmproxy-ca-cert.pem \\
       /usr/local/share/ca-certificates/mitmproxy.crt
   sudo update-ca-certificates

4. Run the interceptor:
   python intercept_claude.py

5. Launch Claude Desktop with proxy:

   macOS:
   ───────
   HTTPS_PROXY=http://localhost:8888 \\
       /Applications/Claude.app/Contents/MacOS/Claude

   Windows:
   ─────────
   set HTTPS_PROXY=http://localhost:8888
   "C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Claude\\Claude.exe"

═══════════════════════════════════════════════════════════════════

OPTION 2: Hosts File + Port 443 (Requires root/admin)
─────────────────────────────────────────────────────

1. Add to /etc/hosts (or C:\\Windows\\System32\\drivers\\etc\\hosts):
   127.0.0.1 api.anthropic.com

2. Run interceptor on port 443 with HTTPS:
   sudo python intercept_claude.py --port 443 --https

3. Launch Claude Desktop normally

═══════════════════════════════════════════════════════════════════

OPTION 3: Patch the App (No proxy needed at runtime)
────────────────────────────────────────────────────

See: python patch_claude_desktop.py --help

╚═══════════════════════════════════════════════════════════════════╝
""")


def main():
    parser = argparse.ArgumentParser(
        description="Intercept Claude Desktop traffic and redirect to Bedrock proxy"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8888,
        help="Port to listen on (default: 8888)"
    )
    parser.add_argument(
        "--bedrock-url",
        default=BEDROCK_PROXY_URL,
        help=f"Bedrock proxy URL (default: {BEDROCK_PROXY_URL})"
    )
    parser.add_argument(
        "--setup",
        action="store_true",
        help="Show setup instructions"
    )
    parser.add_argument(
        "--simple",
        action="store_true",
        help="Use simple proxy instead of mitmproxy (limited)"
    )

    args = parser.parse_args()

    if args.setup:
        print_setup_instructions()
        return

    print(f"""
╔═══════════════════════════════════════════════════════════════════╗
║               Claude Desktop Traffic Interceptor                  ║
╠═══════════════════════════════════════════════════════════════════╣
║  Listening on:     http://localhost:{args.port:<29} ║
║  Forwarding to:    {args.bedrock_url:<44} ║
║  Intercepting:     {INTERCEPT_HOST:<44} ║
╠═══════════════════════════════════════════════════════════════════╣
║  Launch Claude Desktop with:                                      ║
║  HTTPS_PROXY=http://localhost:{args.port} claude-desktop            ║
╚═══════════════════════════════════════════════════════════════════╝
""")

    if args.simple or not MITMPROXY_AVAILABLE:
        if not MITMPROXY_AVAILABLE:
            print("mitmproxy not installed. Using simple proxy (limited functionality).")
            print("Install mitmproxy for full HTTPS support: pip install mitmproxy")
        create_simple_proxy(args.port, args.bedrock_url)
    else:
        run_mitmproxy(args.port, args.bedrock_url)


if __name__ == "__main__":
    main()
