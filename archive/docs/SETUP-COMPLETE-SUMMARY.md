# ✅ Setup Completo: Lambda + Amplify Integration

## ✅ Configuración Completada

### 1. Permisos Lambda Agregados ✅

**Service Role**: `amplify-hashpasstech-dev-96465-authRole`

**Permisos agregados**:
- ✅ `AWSLambda_FullAccess` - Permite desplegar y actualizar Lambda functions

**Verificación**:
```bash
aws iam list-attached-role-policies \
  --role-name amplify-hashpasstech-dev-96465-authRole \
  --query 'AttachedPolicies[*].PolicyName' \
  --output table
```

### 2. amplify.yml Configurado ✅

El archivo `amplify.yml` incluye despliegue automático de Lambda en `post_build`:

```yaml
post_build:
  commands:
    - echo "📦 Packaging Lambda function..."
    - ./scripts/package-lambda.sh
    - aws lambda update-function-code ...
```

### 3. Scripts Creados ✅

- ✅ `scripts/add-lambda-permissions-to-amplify-role.sh` - Configura permisos
- ✅ `scripts/package-lambda.sh` - Empaqueta Lambda para despliegue

### 4. Documentación Completa ✅

- ✅ `docs/AMPLIFY-LAMBDA-INTEGRATION-FINAL.md` - Guía completa
- ✅ `docs/AMPLIFY-LAMBDA-SETUP-COMPLETE.md` - Verificación y troubleshooting
- ✅ `docs/SETUP-COMPLETE-SUMMARY.md` - Este resumen

## Flujo de Despliegue

```
┌─────────────────────────┐
│  Push a main            │
│  (hashpass-tech/           │
│   hashpass.tech)        │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Amplify detecta push   │
│  Inicia build           │
└──────────┬──────────────┘
           │
           ├──────────────────────┐
           │                      │
           ▼                      ▼
┌──────────────────┐    ┌──────────────────┐
│  Build Frontend  │    │  Package Lambda  │
│  (npm run        │    │  (scripts/       │
│   build:web)     │    │   package-       │
│                  │    │   lambda.sh)     │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│  Deploy Frontend │    │  Deploy Lambda    │
│  (Amplify Host)  │    │  (AWS Lambda)     │
└──────────────────┘    └──────────────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
         ┌──────────────────┐
         │  ✅ Todo Listo    │
         │  Frontend + API   │
         │  Sincronizados    │
         └──────────────────┘
```

## Próximo Paso: Probar

### Opción 1: Push de Prueba (Recomendado)

```bash
# Hacer un cambio pequeño en API
echo "// Test Lambda deployment $(date)" >> app/api/config/versions+api.ts

git add app/api/
git commit -m "test: verify Lambda deployment with Amplify"
git push origin main
```

Luego:
1. Ir a Amplify Console
2. Ver build en progreso
3. Verificar logs muestran despliegue de Lambda
4. Verificar que Lambda se actualizó

### Opción 2: Redeploy en Amplify

1. Ir a: `https://console.aws.amazon.com/amplify/`
2. Seleccionar app: `hashpass.tech` o `bsl2025.hashpass.tech`
3. Click "Redeploy this version"
4. Monitorear build logs

## Verificación Post-Despliegue

### Verificar Lambda Actualizado

```bash
# Ver última modificación
aws lambda get-function \
  --function-name hashpass-api-handler \
  --region us-east-1 \
  --query 'Configuration.{LastModified:LastModified,Version:Version}' \
  --output table
```

### Probar API

```bash
# Probar endpoint
curl https://api.hashpass.tech/api/config/versions

# Debe retornar JSON con versiones
```

### Ver Logs del Build

En Amplify Console → Build → Logs, buscar:
- ✅ `📦 Packaging Lambda function...`
- ✅ `🚀 Deploying Lambda function: hashpass-api-handler`
- ✅ `✅ Lambda function deployment completed`

## Estado Final

✅ **Permisos configurados** - Service role tiene `AWSLambda_FullAccess`  
✅ **amplify.yml actualizado** - Incluye despliegue de Lambda  
✅ **Scripts listos** - Package y deploy automatizados  
✅ **Documentación completa** - Guías y troubleshooting  
✅ **Listo para probar** - Solo falta hacer un push de prueba  

## Troubleshooting Rápido

### Si Lambda no se despliega:

1. **Verificar permisos:**
   ```bash
   ./scripts/add-lambda-permissions-to-amplify-role.sh
   ```

2. **Verificar service role en Amplify:**
   - Amplify Console → App settings → General → Service role
   - Debe ser: `amplify-hashpasstech-dev-96465-authRole`

3. **Ver logs completos:**
   - Amplify Console → Build → Ver logs completos
   - Buscar errores de permisos o AWS CLI

### Si build falla:

- El frontend se despliega independientemente
- Lambda deployment es no-crítico (no bloquea frontend)
- Revisar logs para ver qué falló específicamente

## Resumen

🎉 **Todo está configurado y listo!**

Cada push a `main` en `hashpass-tech/hashpass.tech` ahora:
- ✅ Despliega frontend automáticamente (como antes)
- ✅ Despliega Lambda automáticamente (nuevo)
- ✅ Todo sincronizado en la misma versión
- ✅ Logs en un solo lugar (Amplify Console)

**Siguiente paso**: Hacer un push de prueba y verificar que funciona! 🚀

