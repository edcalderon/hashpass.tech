# ✅ Setup Completo: Lambda + Amplify Integration

> Nota de archivo: esta guia describe la integracion Amplify + Lambda historica. El flujo actual
> del proyecto mantiene `hashpass.tech` en Amplify y mueve `bsl.hashpass.tech` al pipeline
> SST/CodeBuild descrito en `packages/tools/buildspecs/infra-deploy.yml`.

## Estado Actual

✅ **Configuración completada:**
- `amplify.yml` actualizado con despliegue automático de Lambda
- Script creado para agregar permisos Lambda
- Documentación completa disponible

## Verificación de Setup

### Paso 1: Verificar Permisos Lambda en Service Role

Ejecutar:
```bash
./scripts/add-lambda-permissions-to-amplify-role.sh
```

Este script:
- ✅ Detecta el service role de Amplify
- ✅ Agrega `AWSLambda_FullAccess` policy
- ✅ Verifica la configuración

### Paso 2: Verificar en Amplify Console

1. **Ir a Amplify Console:**
   - `https://console.aws.amazon.com/amplify/`
   - Buscar app: `hashpass.tech` o `bsl2025.hashpass.tech`

2. **Verificar Service Role:**
   - App settings → General → Service role
   - Debe tener permisos Lambda

3. **Verificar Build Settings:**
   - Build settings → `amplify.yml`
   - Debe incluir el despliegue de Lambda en `post_build`

### Paso 3: Probar Despliegue

#### Opción A: Push de Prueba

```bash
# Hacer un cambio pequeño en API
echo "// Test Lambda deployment" >> app/api/config/versions+api.ts

git add app/api/
git commit -m "test: verify Lambda deployment with Amplify"
git push origin main
```

#### Opción B: Redeploy en Amplify

1. Ir a Amplify Console
2. Seleccionar app
3. Click en "Redeploy this version"
4. Monitorear build logs

### Paso 4: Verificar Logs del Build

En Amplify Console → Build → Ver logs, buscar:

```
📦 Packaging Lambda function...
🚀 Deploying Lambda function: hashpass-api-handler
✅ Lambda function deployment completed
```

### Paso 5: Verificar Lambda Actualizado

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

## Troubleshooting

### Error: "Access Denied" en Lambda Deployment

**Causa**: Service role no tiene permisos Lambda

**Solución**:
1. Ejecutar: `./scripts/add-lambda-permissions-to-amplify-role.sh`
2. Verificar en IAM Console que el role tiene `AWSLambda_FullAccess`
3. Verificar en Amplify Console que el service role está configurado

### Error: "lambda-deployment.zip not found"

**Causa**: Build de frontend falló antes de `post_build`

**Solución**:
1. Verificar que `npm run build:web` funciona
2. Verificar que `dist/server` existe después del build
3. Revisar logs completos del build en Amplify

### Lambda no se actualiza

**Causa**: Script falla silenciosamente

**Solución**:
1. Ver logs completos en Amplify Console
2. Verificar que `scripts/package-lambda.sh` tiene permisos de ejecución
3. Verificar que AWS CLI está disponible en el build
4. Verificar que el service role tiene permisos correctos

### Build muy lento

**Causa**: Empaquetar Lambda agrega tiempo

**Solución**:
- Es normal, agrega ~2-3 minutos al build
- Considera usar build cache en Amplify
- El frontend se despliega independientemente si Lambda falla

## Flujo Completo Verificado

```
✅ Push a main (edcalderon/hashpass.tech)
    │
    ▼
✅ Amplify detecta cambios
    │
    ▼
✅ Build Frontend (npm run build:web)
    │
    ▼
✅ Package Lambda (./scripts/package-lambda.sh)
    │
    ▼
✅ Deploy Lambda (aws lambda update-function-code)
    │
    ▼
✅ Deploy Frontend (Amplify Hosting)
    │
    ▼
✅ Todo desplegado y sincronizado
```

## Próximos Pasos Después de Setup

1. ✅ **Monitorear primeros builds** para asegurar que funciona
2. ✅ **Verificar que Lambda se actualiza** con cada push
3. ✅ **Ajustar si es necesario** (timeouts, permisos, etc.)
4. ✅ **Documentar cualquier ajuste** específico del proyecto

## Referencias

- `docs/AMPLIFY-LAMBDA-INTEGRATION-FINAL.md` - Guía completa
- `scripts/add-lambda-permissions-to-amplify-role.sh` - Script de setup
- `amplify.yml` - Configuración del build
