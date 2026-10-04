Import("env")

from pathlib import Path
import shutil

project_dir = Path(env.subst("$PROJECT_DIR")).resolve()
repo_root = project_dir.parents[1]
source = repo_root / "apps" / "localpass" / "public" / "data" / "guatape.json"
destination = project_dir / "data" / "pack.json"

destination.parent.mkdir(parents=True, exist_ok=True)

if not source.exists():
    raise RuntimeError(f"LocalPass destination pack not found: {source}")

shutil.copyfile(source, destination)
print(f"[LocalPass Node] synced destination pack: {source} -> {destination}")
