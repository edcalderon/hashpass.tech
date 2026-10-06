#!/usr/bin/env python3
"""Recover only the original public Lukas landing page from its pinned source."""
import argparse
import hashlib
import json
import os
from pathlib import Path
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


def build(output):
    expected = "v" + (REPO / ".nvmrc").read_text().strip()
    release_version = json.loads((REPO / "package.json").read_text())["version"]
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
        favicon = overrides / "public/favicon.svg"
        if favicon.is_file():
            shutil.copy2(favicon, site / "favicon.svg")
            for html in site.glob("*.html"):
                content = html.read_text()
                content = content.replace('rel="icon" href="/favicon.ico"', 'rel="icon" type="image/svg+xml" href="/favicon.svg"')
                content = content.replace("rel=\"icon\" href=\"/favicon.ico\"", "rel=\"icon\" type=\"image/svg+xml\" href=\"/favicon.svg\"")
                html.write_text(content)
        (site / "recovery.json").write_text(json.dumps({"sourceCommit": SOURCE_COMMIT, "releaseVersion": release_version, "scope": "original-lukas-landing", "overrides": override_hashes}) + "\n")
        shutil.copytree(site, output)
    print(f"Static Lukas site ready at {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New directory for the static export")
    build(parser.parse_args().output.resolve())
