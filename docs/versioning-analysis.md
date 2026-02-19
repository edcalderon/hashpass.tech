# Análisis del Sistema de Versionado

## Estado Actual

### Scripts Existentes

1. **`scripts/update-version.mjs`** (Node.js)
   - ✅ Actualiza todos los archivos de versión:
     - `package.json`
     - `app.json`
     - `config/version.ts`
     - `config/versions.json`
     - `config/git-info.json`
   - ✅ Actualiza `CHANGELOG.md`
   - ✅ Actualiza historial de versiones
   - ✅ Validación de formato de versión
   - ✅ Multiplataforma (Windows/Mac/Linux)
   - ❌ No hace commits/push de git

2. **`bump-version.sh`** (Bash)
   - ❌ Solo es un wrapper que llama a `update-version.mjs`
   - ✅ Hace commit automático
   - ✅ Crea tag de git
   - ✅ Hace push automático
   - ❌ Solo funciona en Unix/Linux/Mac (no Windows)
   - ❌ Requiere `jq` para leer `app.json`
   - ⚠️ Hace cambios de git automáticamente (puede ser peligroso)

## Problemas Identificados

1. **Redundancia**: `bump-version.sh` solo llama a `update-version.mjs`
2. **Inconsistencia**: Dos formas de hacer lo mismo
3. **Limitación de plataforma**: El script bash no funciona en Windows
4. **Dependencia externa**: Requiere `jq` instalado
5. **Falta de control**: El script bash hace push automático sin confirmación

## Recomendación: Unificar en `update-version.mjs`

### Ventajas de usar solo `update-version.mjs`:

1. ✅ **Multiplataforma**: Funciona en todos los sistemas operativos
2. ✅ **Único punto de verdad**: Todo el código de actualización en un solo lugar
3. ✅ **Más control**: El usuario decide cuándo hacer commit/push
4. ✅ **Sin dependencias externas**: Solo requiere Node.js
5. ✅ **Más mantenible**: Un solo archivo para mantener

### Propuesta de Solución

Crear comandos npm que encapsulen diferentes flujos de trabajo:

```json
{
  "scripts": {
    "version:update": "node scripts/update-version.mjs",
    "version:bump": "node scripts/update-version.mjs --commit --tag --push"
  }
}
```

O mejor aún, agregar opciones opcionales a `update-version.mjs`:

```bash
# Solo actualizar archivos (actual)
npm run version:update 1.3.7

# Actualizar + commit (nuevo)
npm run version:update 1.3.7 -- --commit

# Actualizar + commit + tag + push (nuevo)
npm run version:update 1.3.7 -- --commit --tag --push
```

## Solución Implementada ✅

### Comandos Disponibles

1. **`npm run version:update <version>`** - Solo actualiza archivos (sin git)
   ```bash
   npm run version:update 1.3.7
   npm run version:update 1.3.7 -- --type=beta --notes="Bug fixes"
   ```

2. **`npm run version:bump <version>`** - Actualiza archivos + commit + tag + push
   ```bash
   npm run version:bump 1.3.7
   ```

3. **Opciones avanzadas** - Control granular de operaciones git
   ```bash
   npm run version:update 1.3.7 -- --commit          # Solo commit
   npm run version:update 1.3.7 -- --commit --tag   # Commit + tag
   npm run version:update 1.3.7 -- --auto-git      # Commit + tag + push
   ```

### Opciones Disponibles

- `--type=<type>` - Tipo de release: `alpha`, `beta`, `rc`, `stable` (default: `beta`)
- `--notes="<notes>"` - Notas de release
- `--commit` o `-c` - Hacer commit automáticamente
- `--tag` o `-t` - Crear tag automáticamente
- `--push` o `-p` - Hacer push automáticamente
- `--auto-git` - Shorthand para `--commit --tag --push`

## Plan de Acción

1. ✅ Mantener `update-version.mjs` como único script de actualización
2. ✅ Agregar opciones opcionales para git operations
3. ✅ Actualizar `package.json` con nuevos comandos npm
4. ✅ Eliminar `bump-version.sh` (ya no es necesario)
5. ✅ Actualizar documentación

## Recomendación Final

**Usar `npm run version:update` o `npm run version:bump` como único punto de versionado.**

El script `bump-version.sh` ha sido eliminado ya que `update-version.mjs` ahora incluye todas sus funcionalidades y más.

## Archivos que se actualizan

- `package.json` → `version`
- `app.json` → `expo.version`
- `config/version.ts` → `buildNumber`, `releaseDate`, `releaseType`, `notes`, `VERSION_HISTORY`
- `config/versions.json` → `currentVersion`, `versions[]`
- `config/git-info.json` → `gitCommit`, `gitCommitFull`, `gitBranch`, `gitRepoUrl`
- `CHANGELOG.md` → Nueva entrada de versión

