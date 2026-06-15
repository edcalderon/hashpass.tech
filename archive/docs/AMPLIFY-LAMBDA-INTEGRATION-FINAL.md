# Integración Lambda con Amplify - Configuración Final

## ✅ Decisión: Integrar Lambda con Amplify Build

**Ventajas de integrar con Amplify:**
- ✅ **Un solo lugar**: Todo el despliegue (frontend + API) en Amplify Console
- ✅ **Sincronización**: Frontend y API siempre en la misma versión
- ✅ **Menos configuración**: No necesitas GitHub Actions separado
- ✅ **Visibilidad**: Logs de frontend y API en el mismo lugar
- ✅ **Simplicidad**: Un solo pipeline de CI/CD

## Configuración

### Paso 1: Configurar Permisos en Amplify Service Role

Amplify necesita permisos para actualizar Lambda. Hay dos opciones:

#### Opción A: Usar Service Role Existente (Recomendado)

1. **Ir a Amplify Console:**
   - `https://console.aws.amazon.com/amplify/`
   - Seleccionar app: `hashpass.tech` (o la app correspondiente)

2. **Configurar Service Role:**
   - App settings → General → Service role
   - Seleccionar o crear un role con estos permisos:
     - `AWSLambda_FullAccess` (o permisos más específicos)
     - `AmazonS3FullAccess` (para deployment bucket)
     - `CloudFormationFullAccess` (para stacks)

3. **O crear policy específica:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction",
        "lambda:WaitFunctionUpdated"
      ],
      "Resource": "arn:aws:lambda:us-east-1:<AWS_ACCOUNT_ID>:function:hashpass-api-handler"
    }
  ]
}
```

#### Opción B: Usar IAM User (Menos recomendado)

Si no puedes usar service role, puedes agregar credenciales AWS en Amplify environment variables (menos seguro):

1. Amplify Console → App → Environment variables
2. Agregar:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`

**⚠️ No recomendado por seguridad**

### Paso 2: Verificar amplify.yml

El archivo `amplify.yml` ya está configurado con el despliegue de Lambda en `post_build`:

```yaml
post_build:
  commands:
    - echo "📦 Packaging Lambda function..."
    - ./scripts/package-lambda.sh
    - aws lambda update-function-code ...
```

### Paso 3: Probar

1. **Hacer un cambio en el código** (frontend o API)
2. **Commit y push a main:**
   ```bash
   git add .
   git commit -m "test: Amplify + Lambda deployment"
   git push origin main
   ```
3. **Ver en Amplify Console:**
   - Ir a la app en Amplify
   - Ver el build en progreso
   - Verificar que Lambda se despliega en los logs

## Flujo Completo

```
┌─────────────────────┐
│  Push a main        │
│  (hashpass-tech/       │
│   hashpass.tech)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Amplify Build      │
│  (Todo en uno)      │
└──────────┬──────────┘
           │
           ├─────────────────┐
           │                 │
           ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│  Build Frontend │  │  Package Lambda  │
│  (Static Files) │  │  (API Routes)    │
└────────┬────────┘  └────────┬─────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│  Deploy Frontend│  │  Deploy Lambda   │
│  (Amplify Host) │  │  (AWS Lambda)    │
└─────────────────┘  └─────────────────┘
```

## Verificación

### Ver Build en Amplify

1. Ir a: `https://console.aws.amazon.com/amplify/`
2. Seleccionar app: `hashpass.tech`
3. Ver builds recientes
4. Click en un build para ver logs

### Verificar Lambda Desplegado

```bash
# Ver última modificación
aws lambda get-function \
  --function-name hashpass-api-handler \
  --region us-east-1 \
  --query 'Configuration.LastModified'

# Probar API
curl https://api.hashpass.tech/api/config/versions
```

### Ver Logs de Build

En Amplify Console → Build → Ver logs:
- Buscar "📦 Packaging Lambda function..."
- Buscar "🚀 Deploying Lambda function..."
- Buscar "✅ Lambda function deployment completed"

## Troubleshooting

### Error: "Access Denied" al desplegar Lambda

**Causa**: Amplify service role no tiene permisos Lambda

**Solución**:
1. Ir a Amplify Console → App settings → General
2. Verificar Service role
3. Agregar policy `AWSLambda_FullAccess` al role
4. O crear policy específica (ver arriba)

### Error: "lambda-deployment.zip not found"

**Causa**: El build de frontend falló antes de llegar a `post_build`

**Solución**:
1. Verificar que `npm run build:web` funciona
2. Verificar que `dist/server` existe después del build
3. Revisar logs completos del build

### Lambda no se actualiza

**Causa**: El script falla silenciosamente

**Solución**:
1. Ver logs completos en Amplify
2. Verificar que `scripts/package-lambda.sh` tiene permisos de ejecución
3. Verificar que AWS CLI está disponible en el build

### Build muy lento

**Causa**: Empaquetar Lambda agrega tiempo al build

**Solución**:
- Es normal, agrega ~2-3 minutos
- Considera usar build cache en Amplify
- O desplegar Lambda solo cuando cambian archivos de API (más complejo)

## Comparación con GitHub Actions

| Aspecto | Amplify Integration | GitHub Actions |
|---------|-------------------|----------------|
| **Configuración** | ✅ Más simple | ⚠️ Requiere IAM role + secrets |
| **Visibilidad** | ✅ Todo en Amplify | ⚠️ Separado (GitHub + AWS) |
| **Sincronización** | ✅ Frontend + API juntos | ⚠️ Pueden desincronizarse |
| **Velocidad** | ⚠️ Build más lento | ✅ Más rápido (paralelo) |
| **Flexibilidad** | ⚠️ Solo cuando cambia todo | ✅ Solo cuando cambia API |
| **Costo** | ✅ Incluido en Amplify | ⚠️ GitHub Actions minutes |

## Recomendación Final

✅ **Usar Amplify Integration** porque:
- Más simple de mantener
- Frontend y API siempre sincronizados
- Un solo lugar para ver todo
- Menos configuración inicial

⚠️ **Considerar GitHub Actions** si:
- Necesitas desplegar Lambda independientemente del frontend
- Quieres builds más rápidos
- Necesitas más control sobre cuándo se despliega

## Próximos Pasos

1. ✅ **Configurar Service Role** en Amplify con permisos Lambda
2. ✅ **Verificar amplify.yml** (ya está configurado)
3. ✅ **Hacer push de prueba** y verificar en Amplify Console
4. ✅ **Monitorear primeros builds** para asegurar que funciona
