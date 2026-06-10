# Instrucciones para Probar el Despliegue

> Nota de archivo: esta guia documenta el flujo Amplify + Lambda anterior. El flujo actual es:
> - `hashpass.tech` / `core` en Amplify
> - `bsl.hashpass.tech` / `bsl` en SST/CodeBuild con `packages/tools/buildspecs/infra-deploy.yml`
> Para el flujo vigente, revisa `README.md` y `docs/ENVIRONMENT_STRATEGY.md`.

## ✅ Commit de Prueba Creado

Se ha creado un commit de prueba que activará el despliegue automático de Lambda.

## Próximos Pasos

### 1. Hacer Push al Repositorio

Dependiendo de qué app de Amplify quieras probar:

#### Para hashpass.tech (main):
```bash
git push edcalderon main
```

#### Para bsl.hashpass.tech (flujo legacy bsl2025):
```bash
git push origin bsl2025
```

### 2. Monitorear en Amplify Console

1. **Ir a Amplify Console:**
   - `https://console.aws.amazon.com/amplify/`
   - Seleccionar la app correspondiente

2. **Ver Build en Progreso:**
   - Deberías ver un nuevo build iniciado
   - Click en el build para ver detalles

3. **Verificar Logs:**
   Buscar en los logs:
   ```
   📦 Packaging Lambda function...
   🚀 Deploying Lambda function: hashpass-api-handler
   ✅ Lambda function deployment completed
   ```

### 3. Verificar Lambda Actualizado

Después de que el build complete (5-10 minutos):

```bash
# Ver última modificación
aws lambda get-function \
  --function-name hashpass-api-handler \
  --region us-east-1 \
  --query 'Configuration.{LastModified:LastModified,Version:Version}' \
  --output table
```

### 4. Probar API

```bash
# Probar endpoint
curl https://api.hashpass.tech/api/config/versions

# Debe retornar JSON con las versiones
```

## Qué Esperar

### Build Exitoso:
- ✅ Frontend desplegado
- ✅ Lambda empaquetado
- ✅ Lambda desplegado
- ✅ Todo sincronizado

### Si Hay Errores:

**Error de permisos:**
- Verificar que service role tiene `AWSLambda_FullAccess`
- Ejecutar: `./scripts/add-lambda-permissions-to-amplify-role.sh`

**Error de packaging:**
- Verificar que `dist/server` existe después del build
- Verificar que `scripts/package-lambda.sh` tiene permisos de ejecución

**Lambda no se actualiza:**
- Verificar logs completos en Amplify
- Verificar que AWS CLI está disponible en el build
- Verificar que el service role está configurado en Amplify Console

## Verificación Final

Después del build, verificar:

1. ✅ **Build completado** en Amplify Console
2. ✅ **Lambda actualizado** (timestamp reciente)
3. ✅ **API funciona** (curl retorna JSON)
4. ✅ **Frontend funciona** (sitio web carga correctamente)

## Troubleshooting

Si algo falla, revisar:
- `docs/AMPLIFY-LAMBDA-SETUP-COMPLETE.md` - Guía de troubleshooting
- `docs/AMPLIFY-LAMBDA-INTEGRATION-FINAL.md` - Configuración completa
- Logs completos en Amplify Console
