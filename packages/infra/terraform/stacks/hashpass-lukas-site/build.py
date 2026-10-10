#!/usr/bin/env python3
"""Recover only the original public Lukas landing page from its pinned source."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

SOURCE_COMMIT = "1133ab564f9e8a589bc49f02c3c95b67f177b096"
STACK = Path(__file__).resolve().parent
REPO = STACK.parents[4]
SOURCE_PATHS = [
    "app/lukas.tsx", "components/lukas", "components/ThemeAndLanguageSwitcher.tsx",
    "hooks/useTheme.ts", "hooks/useIsMobile.ts", "hooks/useLanguageStore.ts",
    "providers/ThemeProvider.tsx", "providers/LanguageProvider.tsx", "types/theme.ts",
    "lib/theme.ts", "i18n", "assets", "package.json", "app.json", "tsconfig.json",
    "node_modules",
]
SITE_URL = "https://lukas.hashpass.tech"
PAGE_TITLE = "LUKAS | Stable value for LatAm payments"
PAGE_DESCRIPTION = (
    "LUKAS is the stable meme coin pegged 1:1 to the LatAm peso index, "
    "designed for real payments across Latin America."
)
SOCIAL_IMAGE = f"{SITE_URL}/lukas-social-card.png"


def _attr(value):
    return html.escape(value, quote=True)


def _upsert(html_text, pattern, tag):
    if re.search(pattern, html_text, flags=re.IGNORECASE):
        return re.sub(pattern, tag, html_text, count=1, flags=re.IGNORECASE)
    return html_text.replace("</head>", f"{tag}</head>", 1)


def _patch_seo(html_text, *, noindex=False):
    robots = "noindex, nofollow, noarchive" if noindex else (
        "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
    )
    tags = [
        f"<title>{_attr(PAGE_TITLE if not noindex else 'LUKAS | Page not found')}</title>",
        f'<meta name="description" content="{_attr(PAGE_DESCRIPTION)}"/>',
        f'<meta name="robots" content="{_attr(robots)}"/>',
        f'<meta name="googlebot" content="{_attr(robots)}"/>',
        f'<meta name="theme-color" content="#050816"/>',
        '<meta property="og:type" content="website"/>',
        '<meta property="og:site_name" content="LUKAS"/>',
        f'<meta property="og:title" content="{_attr(PAGE_TITLE)}"/>',
        f'<meta property="og:description" content="{_attr(PAGE_DESCRIPTION)}"/>',
        f'<meta property="og:url" content="{_attr(SITE_URL + ("/404" if noindex else "/lukas"))}"/>',
        f'<meta property="og:image" content="{_attr(SOCIAL_IMAGE)}"/>',
        f'<meta property="og:image:secure_url" content="{_attr(SOCIAL_IMAGE)}"/>',
        '<meta property="og:image:type" content="image/png"/>',
        '<meta property="og:image:width" content="1200"/>',
        '<meta property="og:image:height" content="630"/>',
        '<meta property="og:image:alt" content="LUKAS stable value for LatAm payments"/>',
        '<meta name="twitter:card" content="summary_large_image"/>',
        f'<meta name="twitter:title" content="{_attr(PAGE_TITLE)}"/>',
        f'<meta name="twitter:description" content="{_attr(PAGE_DESCRIPTION)}"/>',
        f'<meta name="twitter:image" content="{_attr(SOCIAL_IMAGE)}"/>',
        '<meta name="twitter:image:alt" content="LUKAS stable value for LatAm payments"/>',
        '<link rel="canonical" href="https://lukas.hashpass.tech/lukas"/>',
        '<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>',
        '<link rel="alternate icon" type="image/png" sizes="32x32" href="/favicon-32.png"/>',
        '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>',
    ]
    for tag in tags:
        if tag.startswith("<title"):
            html_text = _upsert(html_text, r"<title[^>]*>.*?</title>", tag)
        elif 'name="description"' in tag:
            html_text = _upsert(html_text, r'<meta\s+name=["\']description["\'][^>]*>', tag)
        elif 'name="robots"' in tag:
            html_text = _upsert(html_text, r'<meta\s+name=["\']robots["\'][^>]*>', tag)
        elif 'name="googlebot"' in tag:
            html_text = _upsert(html_text, r'<meta\s+name=["\']googlebot["\'][^>]*>', tag)
        elif 'name="theme-color"' in tag:
            html_text = _upsert(html_text, r'<meta\s+name=["\']theme-color["\'][^>]*>', tag)
        elif 'rel="canonical"' in tag:
            html_text = _upsert(html_text, r'<link\s+rel=["\']canonical["\'][^>]*>', tag)
        elif 'rel="icon"' in tag and 'alternate' not in tag:
            html_text = _upsert(html_text, r'<link\s+rel=["\']icon["\'][^>]*>', tag)
        elif 'rel="alternate icon"' in tag:
            html_text = _upsert(html_text, r'<link\s+rel=["\']alternate\s+icon["\'][^>]*>', tag)
        elif 'rel="apple-touch-icon"' in tag:
            html_text = _upsert(html_text, r'<link\s+rel=["\']apple-touch-icon["\'][^>]*>', tag)
        else:
            match = re.search(r'(?:property|name)="([^"]+)"', tag)
            if match:
                attribute = "property" if tag.find("property=") != -1 else "name"
                key = re.escape(match.group(1))
                html_text = _upsert(
                    html_text,
                    rf'<meta\s+{attribute}=["\']{key}["\'][^>]*>',
                    tag,
                )
    return html_text


def build(output):
    expected = "v" + (REPO / ".nvmrc").read_text().strip()
    package_version = json.loads((REPO / "package.json").read_text())["version"]
    release_version = os.environ.get("LUKAS_RELEASE_VERSION", package_version).lstrip("v")
    if release_version != package_version:
        raise SystemExit(
            f"Lukas release version {release_version} does not match package.json {package_version}"
        )
    actual = subprocess.check_output(["node", "--version"], text=True).strip()
    if actual != expected:
        raise SystemExit(f"Use the repository Node runtime: {expected}; found {actual}")
    if output.exists():
        raise SystemExit("Output already exists; choose a fresh directory.")
    with tempfile.TemporaryDirectory(prefix="hashpass-lukas-build-") as tmp:
        source = Path(tmp)
        # This historical commit includes its original dependencies. Restoring
        # those exact bytes avoids resolving newer versions of the legacy app.
        archive = subprocess.Popen(
            ["git", "archive", SOURCE_COMMIT, *SOURCE_PATHS], cwd=REPO,
            stdout=subprocess.PIPE,
        )
        try:
            subprocess.run(["tar", "-x", "-C", tmp], stdin=archive.stdout, check=True)
        finally:
            archive.stdout.close()
        if archive.wait() != 0:
            raise SystemExit("Could not extract the pinned Lukas source.")
        (source / "app/_layout.tsx").write_text("""import 'react-native-reanimated';
import React from 'react';
import { Stack } from 'expo-router';
import { ThemeProvider } from '../providers/ThemeProvider';
import { LanguageProvider } from '../providers/LanguageProvider';
import { useThemeProvider } from '../hooks/useTheme';
export default function Layout() {
  const theme = useThemeProvider();
  return <ThemeProvider value={theme}><LanguageProvider><Stack screenOptions={{headerShown:false}} /></LanguageProvider></ThemeProvider>;
}
""")
        (source / "app/index.tsx").write_text("""import React from 'react';
import { Redirect } from 'expo-router';
export default function Index() { return <Redirect href='/lukas' />; }
""")
        (source / "app.config.js").write_text(
            "module.exports = ({config}) => ({...config, web: {...config.web, output: 'static'}});\n"
        )
        (source / "metro.config.js").write_text(
            "const {getDefaultConfig}=require('expo/metro-config');\n"
            "module.exports=getDefaultConfig(__dirname);\n"
        )
        (source / "babel.config.js").write_text(
            "module.exports = function(api) { api.cache(true); return {presets:['babel-preset-expo'],"
            "plugins:['react-native-reanimated/plugin']}; };\n"
        )
        # Apply reviewed updates over the archived page without changing the source ref.
        overrides = STACK / "overrides"
        override_hashes = {}
        for override in sorted(overrides.rglob("*")):
            if not override.is_file():
                continue
            relative = override.relative_to(overrides)
            target = source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(override, target)
            if relative.as_posix() == "components/lukas/LukasFooter.tsx":
                target.write_text(target.read_text().replace("__LUKAS_RELEASE_VERSION__", release_version))
            override_hashes[str(relative)] = hashlib.sha256(override.read_bytes()).hexdigest()
        env = {k: v for k, v in os.environ.items() if not k.startswith(("EXPO_PUBLIC_", "AMPLIFY_"))}
        env.update(EXPO_NO_DOTENV="1", CI="1")
        subprocess.run(
            ["node", "node_modules/expo/bin/cli", "export", "--platform", "web", "--output-dir", "site", "--max-workers", "4"],
            cwd=source, env=env, check=True,
        )
        site = source / "site"
        if not (site / "lukas.html").is_file():
            raise SystemExit("Export is missing the Lukas landing page.")
        forbidden = [p for p in site.rglob("*") if p.suffix in (".map", ".ts", ".tsx") or "+api" in p.name]
        if forbidden:
            raise SystemExit("Unexpected source/server files in static export.")
        shutil.copy2(site / "+not-found.html", site / "404.html")
        required_assets = [
            "favicon.svg",
            "favicon-32.png",
            "apple-touch-icon.png",
            "lukas-social-card.png",
        ]
        for asset_name in required_assets:
            asset = overrides / "public" / asset_name
            if not asset.is_file():
                raise SystemExit(f"Missing required Lukas asset: {asset_name}")
            shutil.copy2(asset, site / asset_name)

        for html_path in site.glob("*.html"):
            if html_path.name in {"index.html", "lukas.html"}:
                html_path.write_text(_patch_seo(html_path.read_text()))

        (site / "recovery.json").write_text(json.dumps({
            "sourceCommit": SOURCE_COMMIT,
            "releaseVersion": release_version,
            "scope": "original-lukas-landing",
            "seo": {
                "canonical": f"{SITE_URL}/lukas",
                "socialImage": SOCIAL_IMAGE,
            },
            "overrides": override_hashes,
        }) + "\n")
        shutil.copytree(site, output)
    print(f"Static Lukas site ready at {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New directory for the static export")
    build(parser.parse_args().output.resolve())
