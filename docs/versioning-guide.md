# Guía de Versionado

## Comandos Rápidos

### Actualizar versión sin git
```bash
npm run version:update 1.3.7
```

### Actualizar versión con git automático (recomendado)
```bash
npm run version:bump 1.3.7
```

✅ **Nota**: El comando `npm run version:bump` ahora funciona correctamente y acepta la versión como argumento.

## Uso Detallado

### Comando Básico
```bash
npm run version:update <version> [opciones]
```

### Ejemplos

**1. Actualizar solo archivos:**
```bash
npm run version:update 1.3.7
```

**2. Con tipo y notas:**
```bash
npm run version:update 1.3.7 -- --type=beta --notes="Fixed agenda display issues"
```

**3. Con operaciones git automáticas:**
```bash
npm run version:update 1.3.7 -- --auto-git
```

**4. Solo commit (sin tag ni push):**
```bash
npm run version:update 1.3.7 -- --commit
```

**5. Commit + tag (sin push):**
```bash
npm run version:update 1.3.7 -- --commit --tag
```

### Opciones Disponibles

| Opción | Descripción | Ejemplo |
|--------|-------------|---------|
| `--type=<type>` | Tipo de release (`alpha`, `beta`, `rc`, `stable`) | `--type=beta` |
| `--notes="text"` | Notas de release | `--notes="Bug fixes"` |
| `--commit` o `-c` | Hacer commit automáticamente | `--commit` |
| `--tag` o `-t` | Crear tag automáticamente | `--tag` |
| `--push` o `-p` | Hacer push automáticamente | `--push` |
| `--auto-git` | Equivalente a `--commit --tag --push` | `--auto-git` |

## Archivos Actualizados

El script actualiza automáticamente:

- ✅ `package.json` → campo `version`
- ✅ `app.json` → campo `expo.version`
- ✅ `config/version.ts` → `buildNumber`, `releaseDate`, `releaseType`, `notes`, `VERSION_HISTORY`
- ✅ `config/versions.json` → `currentVersion`, array `versions[]`
- ✅ `config/git-info.json` → información de git (commit, branch, repo)
- ✅ `CHANGELOG.md` → nueva entrada de versión

## Flujo Recomendado

### Para Desarrollo Normal
```bash
# 1. Actualizar versión con git automático
npm run version:bump 1.3.7

# 2. Verificar cambios
git log -1

# 3. Continuar con el flujo normal
```

### Para Releases Importantes
```bash
# 1. Actualizar solo archivos primero
npm run version:update 1.3.7 -- --type=stable --notes="Major release"

# 2. Revisar cambios
git diff

# 3. Hacer commit manualmente si es necesario
git add .
git commit -m "chore: bump version to 1.3.7"
git tag -a "v1.3.7" -m "Version 1.3.7"
git push origin <branch> && git push --tags
```

## Notas Importantes

✅ **El script `bump-version.sh` ha sido eliminado** - Ahora usa `npm run version:update` o `npm run version:bump` como único punto de versionado.

✅ **Multiplataforma** - Funciona en Windows, Mac y Linux.

✅ **Sin dependencias externas** - Solo requiere Node.js (no necesita `jq` ni otras herramientas).

✅ **Control total** - Puedes elegir qué operaciones git realizar.

