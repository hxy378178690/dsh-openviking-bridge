#!/bin/bash
# restore.sh — apply DSH ↔ OpenViking bridge to a fresh DSH checkout.
#
# Usage:
#   cd path/to/dsh-openviking-bridge
#   bash restore.sh /path/to/DSH
#
# Effect (idempotent — safe to re-run):
#   1. Copy 6 sibling packages into $DSH/packages/{memory,session}/
#   2. Append `memory/...` row to $DSH/packages/README.md
#   3. Add `packages/memory/README.md`
#   4. Add devDeps to $DSH/apps/cli/package.json (preserves any newer DSH entries)
#   5. Add refs to $DSH/tsconfig.host.json
#   6. Add deps to $DSH/examples/package.json
#   7. Copy 5 split cordis.yml + 1 mcp-memory cordis.yml into $DSH/examples/
#   8. Copy .agents/notes/{environment-local, archived feature} into $DSH/.agents/notes/
#   9. Copy start-dsh-edge.ps1 + config.json to $DSH's UI/dsh-desktop/
#   10. Run `pnpm install` in $DSH
#
# This script never overwrites an existing file unless a sibling file is also
# being restored — so DSH upgrade scenarios that touched other files keep
# their upgrades.

set -euo pipefail

DSH_DIR="${1:-D:/聚合工具/DSH}"
PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$DSH_DIR" ]; then
  echo "ERROR: DSH directory not found: $DSH_DIR"
  echo "Usage: bash restore.sh /path/to/DSH"
  exit 1
fi

if [ ! -f "$DSH_DIR/package.json" ]; then
  echo "ERROR: $DSH_DIR does not look like a DSH checkout (no package.json)"
  exit 1
fi

echo "Restoring DSH ↔ OpenViking bridge into: $DSH_DIR"
echo "From plugin directory: $PLUGIN_DIR"
echo

# --- 1. Copy 6 sibling packages ----------------------------------------
echo "[1/10] Copying 6 sibling packages"
for pkg in openviking-mcp memory-auto-recall memory-auto-capture add-resource; do
  src="$PLUGIN_DIR/packages/memory/$pkg"
  dst="$DSH_DIR/packages/memory/$pkg"
  if [ -d "$src" ]; then
    mkdir -p "$dst"
    cp -rn "$src"/. "$dst"/
    echo "  -> packages/memory/$pkg"
  fi
done
for pkg in session-persistence-viking session-search-viking; do
  src="$PLUGIN_DIR/packages/session/$pkg"
  dst="$DSH_DIR/packages/session/$pkg"
  if [ -d "$src" ]; then
    mkdir -p "$dst"
    cp -rn "$src"/. "$dst"/
    echo "  -> packages/session/$pkg"
  fi
done

# --- 2. Patch packages/README.md (add memory/ row) ---------------------
echo "[2/10] Patching packages/README.md (add memory/ row)"
if ! grep -q '\[`memory/\`' "$DSH_DIR/packages/README.md" 2>/dev/null; then
  python3 -c "
import sys, re
p = r'''$DSH_DIR/packages/README.md'''
with open(p, 'r', encoding='utf-8') as f:
    content = f.read()
# Insert memory row right after the experimental/ row
new_row = '| [\`memory/\`](memory/README.md) | OpenViking memory family: auto-recall / auto-capture Consumers + viking mirror Provider | Support — opt-in reference |'
m = re.search(r'(^\| *\`experimental/\`.*$)+', content, re.MULTILINE)
if m:
    insert_at = m.end()
    content = content[:insert_at] + '\n' + new_row + content[insert_at:]
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content)
    print('  -> added memory/ row')
else:
    print('  -> WARN: could not find insertion point')
" || echo "  -> WARN: python3 not available, manually edit packages/README.md"
else
  echo "  -> already patched"
fi

# --- 3. Add packages/memory/README.md ------------------------------------
echo "[3/10] Copying packages/memory/README.md"
mkdir -p "$DSH_DIR/packages/memory"
cp -f "$PLUGIN_DIR/dsh-modifications/packages/memory/README.md" "$DSH_DIR/packages/memory/README.md"

# --- 4. Patch apps/cli/package.json (add devDeps) ------------------------
echo "[4/10] Patching apps/cli/package.json (add devDeps)"
python3 -c "
import json
p = r'''$DSH_DIR/apps/cli/package.json'''
with open(p, 'r', encoding='utf-8') as f:
    pkg = json.load(f)
deps = pkg.setdefault('devDependencies', {})
new_deps = {
    '@deepseek-ai/dsh-add-resource': 'workspace:^',
    '@deepseek-ai/dsh-memory-auto-capture': 'workspace:^',
    '@deepseek-ai/dsh-memory-auto-recall': 'workspace:^',
    '@deepseek-ai/dsh-openviking-mcp': 'workspace:^',
    '@deepseek-ai/dsh-session': 'workspace:^',
    '@deepseek-ai/dsh-session-persistence-viking': 'workspace:^',
}
added = []
for name, ver in new_deps.items():
    if name not in deps:
        deps[name] = ver
        added.append(name)
if added:
    pkg['devDependencies'] = dict(sorted(deps.items()))
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(pkg, f, indent=2)
        f.write('\n')
    print(f'  -> added {len(added)} deps')
else:
    print('  -> already patched')
" || echo "  -> WARN: python3 not available, manually edit apps/cli/package.json"

# --- 5. Patch tsconfig.host.json (add references) ----------------------
echo "[5/10] Patching tsconfig.host.json (add references)"
python3 -c "
import json
p = r'''$DSH_DIR/tsconfig.host.json'''
with open(p, 'r', encoding='utf-8') as f:
    cfg = json.load(f)
refs = cfg.setdefault('references', [])
new_refs = [
    {'path': './packages/memory/add-resource'},
    {'path': './packages/memory/memory-auto-capture'},
    {'path': './packages/memory/memory-auto-recall'},
    {'path': './packages/memory/openviking-mcp'},
    {'path': './packages/session/session-persistence-viking'},
]
added = []
for r in new_refs:
    if r not in refs:
        refs.append(r)
        added.append(r['path'])
if added:
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2)
        f.write('\n')
    print(f'  -> added {len(added)} refs')
else:
    print('  -> already patched')
" || echo "  -> WARN: python3 not available"

# --- 6. Patch examples/package.json (add deps) --------------------------
echo "[6/10] Patching examples/package.json (add deps)"
python3 -c "
import json
p = r'''$DSH_DIR/examples/package.json'''
with open(p, 'r', encoding='utf-8') as f:
    pkg = json.load(f)
deps = pkg.setdefault('dependencies', {})
new_deps = {
    '@deepseek-ai/dsh-add-resource': 'workspace:*',
    '@deepseek-ai/dsh-memory-auto-recall': 'workspace:*',
    '@deepseek-ai/dsh-memory-auto-capture': 'workspace:*',
    '@deepseek-ai/dsh-openviking-mcp': 'workspace:*',
    '@deepseek-ai/dsh-session-persistence-viking': 'workspace:*',
    '@deepseek-ai/dsh-session-search-viking': 'workspace:*',
}
added = []
for name, ver in new_deps.items():
    if name not in deps:
        deps[name] = ver
        added.append(name)
if added:
    pkg['dependencies'] = dict(sorted(deps.items()))
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(pkg, f, indent=2)
        f.write('\n')
    print(f'  -> added {len(added)} deps')
else:
    print('  -> already patched')
" || echo "  -> WARN: python3 not available"

# --- 7. Copy 5 split cordis.yml + 1 mcp-memory cordis.yml ---------------
echo "[7/10] Copying 6 split cordis.yml overlays"
mkdir -p "$DSH_DIR/examples/memory-viking"
for f in auto-recall.cordis.yml auto-capture.cordis.yml persistence-mirror.cordis.yml add-resource.cordis.yml session-search.cordis.yml README.md; do
  cp -f "$PLUGIN_DIR/examples/memory-viking/$f" "$DSH_DIR/examples/memory-viking/$f" && echo "  -> examples/memory-viking/$f"
done
mkdir -p "$DSH_DIR/examples/mcp-memory"
cp -f "$PLUGIN_DIR/examples/mcp-memory/openviking.cordis.yml" "$DSH_DIR/examples/mcp-memory/openviking.cordis.yml" && echo "  -> examples/mcp-memory/openviking.cordis.yml"

# --- 8. Copy .agents/notes ----------------------------------------------
echo "[8/10] Copying .agents/notes"
mkdir -p "$DSH_DIR/.agents/notes/archived/feature"
cp -f "$PLUGIN_DIR/dsh-modifications/DSH/.agents/notes/environment-local.md" "$DSH_DIR/.agents/notes/environment-local.md" && echo "  -> .agents/notes/environment-local.md"
cp -f "$PLUGIN_DIR/dsh-modifications/DSH/.agents/notes/archived/feature/2026-08-19-dsh-openviking-mcp-bridge.md" "$DSH_DIR/.agents/notes/archived/feature/2026-08-19-dsh-openviking-mcp-bridge.md" && echo "  -> .agents/notes/archived/feature/..."

# --- 9. Copy UI/dsh-desktop files --------------------------------------
echo "[9/10] Copying UI/dsh-desktop files"
UI_DIR="$(dirname "$DSH_DIR")/UI/dsh-desktop"
if [ -d "$UI_DIR" ]; then
  cp -f "$PLUGIN_DIR/ui-modifications/start-dsh-edge.ps1" "$UI_DIR/start-dsh-edge.ps1" && echo "  -> UI/dsh-desktop/start-dsh-edge.ps1"
  cp -f "$PLUGIN_DIR/ui-modifications/config.json" "$UI_DIR/config.json" && echo "  -> UI/dsh-desktop/config.json"
else
  echo "  -> WARN: $UI_DIR not found, skipping UI files"
fi

# --- 10. Run pnpm install -----------------------------------------------
echo "[10/10] Running pnpm install"
(cd "$DSH_DIR" && pnpm install) || echo "  -> WARN: pnpm install failed, run manually"

echo
echo "Done."
echo "Next: cd $DSH_DIR && pnpm dsh web --patch \"$PLUGIN_DIR/cordis.yml\" --host 127.0.0.1 --port 3080"