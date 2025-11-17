# Lambda CI/CD - Quick Start

## Resumen

Ahora Lambda se actualiza **automáticamente** cuando haces cambios en `main` o `bsl2025` en el repositorio `hashpass.tech`.

## ¿Cómo Funciona?

### Flujo Automático

```
┌─────────────────────┐
│  Push a main/bsl2025│
│  (cambios en API)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  GitHub Actions     │
│  Detecta cambios    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Build & Package    │
│  Lambda function    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Deploy a Lambda    │
│  Automáticamente    │
└─────────────────────┘
```

### ¿Cuándo se Despliega?

El workflow se activa cuando hay cambios en:
- ✅ `app/api/**` - Cualquier archivo de API
- ✅ `lambda/**` - Archivos de Lambda
- ✅ `scripts/package-lambda.sh` - Script de empaquetado
- ✅ `package.json` o `package-lock.json` - Dependencias

**No se despliega** si solo cambias:
- ❌ Frontend (componentes React)
- ❌ Estilos CSS
- ❌ Documentación
- ❌ Otros archivos no relacionados con API

## Setup Inicial (Una Vez)

### Paso 1: Crear IAM Role

```bash
./scripts/setup-github-actions-role.sh
```

Este script:
- ✅ Crea OIDC provider para GitHub (si no existe)
- ✅ Crea IAM role con permisos Lambda
- ✅ Te da el ARN del role

### Paso 2: Configurar GitHub Secret

1. Ve a GitHub → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Agregar:
   - **Name**: `AWS_ROLE_ARN`
   - **Value**: El ARN que te dio el script (ej: `arn:aws:iam::058264267235:role/GitHubActions-LambdaDeploy`)
4. Click **Add secret**

### Paso 3: Probar

1. Haz un cambio pequeño en `app/api/` (ej: agregar un comentario)
2. Commit y push:
   ```bash
   git add app/api/
   git commit -m "test: trigger Lambda deployment"
   git push origin main
   ```
3. Ve a GitHub → **Actions** → Verifica que el workflow se ejecutó
4. Verifica que Lambda se actualizó:
   ```bash
   aws lambda get-function \
     --function-name hashpass-api-handler \
     --region us-east-1 \
     --query 'Configuration.LastModified'
   ```

## Verificación

### Ver Workflow en GitHub

1. Ve a: `https://github.com/lstech-solutions/bsl2025.hashpass.tech/actions`
2. Deberías ver "Deploy Lambda Function" en la lista
3. Click para ver detalles del despliegue

### Verificar Lambda Actualizado

```bash
# Ver última modificación
aws lambda get-function \
  --function-name hashpass-api-handler \
  --region us-east-1 \
  --query 'Configuration.{LastModified:LastModified,Version:Version}' \
  --output table

# Probar API
curl https://api.hashpass.tech/api/config/versions
```

### Ver Logs

```bash
# Logs de Lambda
aws logs tail /aws/lambda/hashpass-api-handler --follow --region us-east-1

# Logs del workflow en GitHub Actions
# (ve a Actions → Click en el workflow → Ver logs)
```

## Preguntas Frecuentes

### ¿Se despliega en cada push?

**No**, solo cuando hay cambios en archivos relacionados con API. Si solo cambias el frontend, Lambda no se despliega.

### ¿Puedo desplegar manualmente?

**Sí**, puedes:
1. Ir a GitHub → Actions → "Deploy Lambda Function" → "Run workflow"
2. O ejecutar localmente:
   ```bash
   ./scripts/package-lambda.sh
   aws lambda update-function-code \
     --function-name hashpass-api-handler \
     --region us-east-1 \
     --zip-file fileb://lambda-deployment.zip
   ```

### ¿Qué pasa si el workflow falla?

- GitHub te enviará una notificación (si está configurada)
- Puedes ver los logs en GitHub Actions
- El despliegue anterior sigue funcionando
- Puedes reintentar desde GitHub Actions

### ¿Afecta el build de Amplify?

**No**, son completamente independientes:
- Amplify despliega el frontend
- GitHub Actions despliega Lambda
- No se bloquean entre sí

## Troubleshooting

### Workflow no se ejecuta

1. Verifica que el archivo `.github/workflows/deploy-lambda.yml` existe
2. Verifica que hiciste push a `main` o `bsl2025`
3. Verifica que cambiaste archivos en `app/api/` o `lambda/`

### Error: "Access Denied"

1. Verifica que `AWS_ROLE_ARN` está en GitHub Secrets
2. Verifica que el IAM role existe y tiene permisos
3. Ejecuta `./scripts/setup-github-actions-role.sh` de nuevo

### Lambda no se actualiza

1. Verifica logs del workflow en GitHub Actions
2. Verifica que `lambda-deployment.zip` se creó
3. Verifica permisos del IAM role

## Documentación Completa

Para más detalles, ver: `docs/LAMBDA-CI-CD-SETUP.md`

