#!/usr/bin/env python3
"""
Claude Desktop Patcher

Patches the Claude Desktop Electron app to redirect API calls to your local Bedrock proxy.

This script:
1. Backs up the original app.asar
2. Extracts the asar archive
3. Finds and replaces api.anthropic.com with your proxy URL
4. Repacks the asar
5. Optionally disables auto-updates

Usage:
    # Patch to use local proxy on port 8080
    python patch_claude_desktop.py

    # Patch with custom proxy URL
    python patch_claude_desktop.py --proxy-url http://localhost:9000

    # Restore original
    python patch_claude_desktop.py --restore

Requirements:
    - Node.js and npm (for asar tool)
    - Run: npm install -g @electron/asar
"""

import os
import sys
import shutil
import subprocess
import argparse
import platform
import re
from pathlib import Path


def get_claude_paths():
    """Get Claude Desktop paths based on OS."""
    system = platform.system()

    if system == "Darwin":  # macOS
        return {
            "app_path": Path("/Applications/Claude.app"),
            "asar_path": Path("/Applications/Claude.app/Contents/Resources/app.asar"),
            "resources_path": Path("/Applications/Claude.app/Contents/Resources"),
            "info_plist": Path("/Applications/Claude.app/Contents/Info.plist"),
        }
    elif system == "Windows":
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        return {
            "app_path": Path(local_app_data) / "Programs" / "Claude",
            "asar_path": Path(local_app_data) / "Programs" / "Claude" / "resources" / "app.asar",
            "resources_path": Path(local_app_data) / "Programs" / "Claude" / "resources",
            "info_plist": None,
        }
    elif system == "Linux":
        # Try common Linux locations
        possible_paths = [
            Path("/usr/lib/claude-desktop"),
            Path("/opt/Claude"),
            Path.home() / ".local" / "share" / "claude-desktop",
        ]
        for p in possible_paths:
            if p.exists():
                return {
                    "app_path": p,
                    "asar_path": p / "app.asar",
                    "resources_path": p,
                    "info_plist": None,
                }
        # Default to first option
        return {
            "app_path": possible_paths[0],
            "asar_path": possible_paths[0] / "app.asar",
            "resources_path": possible_paths[0],
            "info_plist": None,
        }
    else:
        raise RuntimeError(f"Unsupported OS: {system}")


def check_prerequisites():
    """Check that required tools are installed."""
    # Check for asar
    try:
        result = subprocess.run(
            ["npx", "@electron/asar", "--version"],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            print("Installing @electron/asar...")
            subprocess.run(["npm", "install", "-g", "@electron/asar"], check=True)
    except FileNotFoundError:
        print("ERROR: Node.js/npm not found. Please install Node.js first.")
        print("  macOS: brew install node")
        print("  Windows: https://nodejs.org/")
        print("  Linux: sudo apt install nodejs npm")
        sys.exit(1)


def backup_asar(asar_path: Path) -> Path:
    """Create a backup of the original app.asar."""
    backup_path = asar_path.with_suffix(".asar.backup")

    if not backup_path.exists():
        print(f"Creating backup: {backup_path}")
        shutil.copy2(asar_path, backup_path)
    else:
        print(f"Backup already exists: {backup_path}")

    return backup_path


def extract_asar(asar_path: Path, extract_dir: Path):
    """Extract the asar archive."""
    print(f"Extracting {asar_path} to {extract_dir}...")

    if extract_dir.exists():
        shutil.rmtree(extract_dir)

    subprocess.run(
        ["npx", "@electron/asar", "extract", str(asar_path), str(extract_dir)],
        check=True
    )


def pack_asar(extract_dir: Path, asar_path: Path):
    """Repack the asar archive."""
    print(f"Repacking {extract_dir} to {asar_path}...")

    subprocess.run(
        ["npx", "@electron/asar", "pack", str(extract_dir), str(asar_path)],
        check=True
    )


def find_and_replace_api_url(extract_dir: Path, proxy_url: str) -> int:
    """Find and replace api.anthropic.com with the proxy URL."""

    # URLs to replace
    replacements = [
        ("https://api.anthropic.com", proxy_url),
        ("api.anthropic.com", proxy_url.replace("http://", "").replace("https://", "")),
    ]

    # File extensions to search
    extensions = [".js", ".json", ".html", ".ts", ".mjs", ".cjs"]

    files_modified = 0

    for file_path in extract_dir.rglob("*"):
        if not file_path.is_file():
            continue

        if file_path.suffix not in extensions:
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            original_content = content

            for old, new in replacements:
                if old in content:
                    content = content.replace(old, new)

            if content != original_content:
                file_path.write_text(content, encoding="utf-8")
                files_modified += 1
                print(f"  Modified: {file_path.relative_to(extract_dir)}")

        except Exception:
            # Skip binary files or files with encoding issues
            pass

    return files_modified


def disable_auto_update(extract_dir: Path):
    """Attempt to disable auto-updates by modifying update-related code."""

    # Common patterns for auto-update
    update_patterns = [
        (r'autoUpdater\.checkForUpdates\(\)', 'console.log("Updates disabled")'),
        (r'autoUpdater\.checkForUpdatesAndNotify\(\)', 'console.log("Updates disabled")'),
        (r'"autoUpdate":\s*true', '"autoUpdate": false'),
    ]

    for file_path in extract_dir.rglob("*.js"):
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            original_content = content

            for pattern, replacement in update_patterns:
                content = re.sub(pattern, replacement, content)

            if content != original_content:
                file_path.write_text(content, encoding="utf-8")
                print(f"  Disabled updates in: {file_path.relative_to(extract_dir)}")

        except Exception:
            pass


def remove_integrity_checks(info_plist: Path):
    """Remove ASAR integrity checks from Info.plist (macOS only)."""
    if info_plist is None or not info_plist.exists():
        return

    try:
        # Read the plist
        result = subprocess.run(
            ["plutil", "-convert", "xml1", "-o", "-", str(info_plist)],
            capture_output=True,
            text=True
        )

        if "ElectronAsarIntegrity" in result.stdout:
            print("  Removing ASAR integrity check from Info.plist...")
            subprocess.run(
                ["plutil", "-remove", "ElectronAsarIntegrity", str(info_plist)],
                capture_output=True
            )
    except Exception as e:
        print(f"  Warning: Could not modify Info.plist: {e}")


def restore_backup(paths: dict):
    """Restore the original app.asar from backup."""
    backup_path = paths["asar_path"].with_suffix(".asar.backup")

    if not backup_path.exists():
        print("ERROR: No backup found. Cannot restore.")
        sys.exit(1)

    print(f"Restoring from backup: {backup_path}")
    shutil.copy2(backup_path, paths["asar_path"])
    print("Restored successfully!")


def print_banner():
    """Print a fancy banner."""
    print("""
╔═══════════════════════════════════════════════════════════════════╗
║               Claude Desktop → Bedrock Patcher                    ║
╠═══════════════════════════════════════════════════════════════════╣
║  Redirects Claude Desktop API calls to your local Bedrock proxy   ║
╚═══════════════════════════════════════════════════════════════════╝
""")


def main():
    parser = argparse.ArgumentParser(
        description="Patch Claude Desktop to use a local Bedrock proxy"
    )
    parser.add_argument(
        "--proxy-url",
        default="http://localhost:8080",
        help="URL of your Bedrock proxy (default: http://localhost:8080)"
    )
    parser.add_argument(
        "--restore",
        action="store_true",
        help="Restore the original unpatched app"
    )
    parser.add_argument(
        "--disable-updates",
        action="store_true",
        default=True,
        help="Disable auto-updates (default: True)"
    )
    parser.add_argument(
        "--keep-extracted",
        action="store_true",
        help="Keep the extracted files for inspection"
    )

    args = parser.parse_args()

    print_banner()

    # Get paths
    paths = get_claude_paths()

    print(f"OS: {platform.system()}")
    print(f"Claude Desktop path: {paths['app_path']}")
    print(f"ASAR path: {paths['asar_path']}")
    print()

    # Check Claude Desktop exists
    if not paths["asar_path"].exists():
        print(f"ERROR: Claude Desktop not found at {paths['asar_path']}")
        print("Make sure Claude Desktop is installed.")
        sys.exit(1)

    # Restore mode
    if args.restore:
        restore_backup(paths)
        return

    # Check prerequisites
    check_prerequisites()

    # Close Claude Desktop if running
    print("Please close Claude Desktop before patching!")
    input("Press Enter when Claude Desktop is closed...")
    print()

    # Create backup
    backup_path = backup_asar(paths["asar_path"])

    # Extract
    extract_dir = paths["resources_path"] / "app_extracted"
    extract_asar(paths["asar_path"], extract_dir)

    # Find and replace API URL
    print(f"\nPatching API URL to: {args.proxy_url}")
    files_modified = find_and_replace_api_url(extract_dir, args.proxy_url)

    if files_modified == 0:
        print("\nWARNING: No files were modified!")
        print("The API URL might be obfuscated or in a different format.")
        print("You may need to manually inspect the extracted files.")
    else:
        print(f"\nModified {files_modified} file(s)")

    # Disable auto-updates
    if args.disable_updates:
        print("\nDisabling auto-updates...")
        disable_auto_update(extract_dir)

    # Remove integrity checks (macOS)
    if paths["info_plist"]:
        remove_integrity_checks(paths["info_plist"])

    # Repack
    print()
    pack_asar(extract_dir, paths["asar_path"])

    # Cleanup
    if not args.keep_extracted:
        print("Cleaning up extracted files...")
        shutil.rmtree(extract_dir)
    else:
        print(f"Extracted files kept at: {extract_dir}")

    print(f"""
╔═══════════════════════════════════════════════════════════════════╗
║                        Patching Complete!                         ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  1. Start your Bedrock proxy:                                     ║
║     python bedrock_proxy.py                                       ║
║                                                                   ║
║  2. Launch Claude Desktop                                         ║
║                                                                   ║
║  3. If it doesn't work, check:                                    ║
║     - Proxy is running on {args.proxy_url:<28} ║
║     - AWS credentials are configured                              ║
║     - You have Bedrock model access                               ║
║                                                                   ║
║  To restore original: python {sys.argv[0]} --restore     ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
""")


if __name__ == "__main__":
    main()
