# ✅ Configuración API Gateway + Lambda Completada

## Resumen

Toda la configuración para migrar de Amplify API a API Gateway + Lambda ha sido completada exitosamente.

## ✅ Pasos Completados

### 1. Eliminación de App de Amplify
- ✅ App `d31bu1ot0gd14y` (api.hashpass.tech) eliminada
- ✅ Solo quedan apps de Amplify para frontend

### 2. Certificado ACM
- ✅ Certificado creado: `arn:aws:acm:us-east-1:058264267235:certificate/6ab63538-aa75-4df0-9d4f-79d163878d76`
- ✅ Dominios: `*.hashpass.tech` y `hashpass.tech`
- ✅ Estado: `ISSUED` (validado)

### 3. Dominio Personalizado API Gateway
- ✅ Dominio: `api.hashpass.tech`
- ✅ API Gateway Domain: `d-rt2wzrx5l5.execute-api.us-east-1.amazonaws.com`
- ✅ Endpoint Type: `REGIONAL`
- ✅ Estado: `AVAILABLE`

### 4. API Mapping
- ✅ API ID: `nqt8xep20g` (hashpassApi)
- ✅ Stage: `prod`
- ✅ Path: `/` (root)

### 5. DNS Configuration
- ✅ Registro actualizado en Route 53
- ✅ Tipo: `CNAME`
- ✅ Valor: `d-rt2wzrx5l5.execute-api.us-east-1.amazonaws.com`
- ⏳ Propagación DNS en curso (5-15 minutos)

## Arquitectura Final

```
Frontend (Amplify):
├── hashpass.tech → App ID: dy8duury54wam
└── bsl2025.hashpass.tech → App ID: d3ja863334bedw

API (API Gateway + Lambda):
└── api.hashpass.tech → API Gateway (nqt8xep20g) → Lambda (hashpass-api-handler)
```

## Testing

### ✅ API Gateway Directo (Funciona)
```bash
curl https://nqt8xep20g.execute-api.us-east-1.amazonaws.com/prod/api/config/versions
```

### ⏳ Dominio Personalizado (Esperando DNS)
```bash
curl https://api.hashpass.tech/api/config/versions
```

**Nota**: El dominio personalizado funcionará una vez que el DNS se propague (5-15 minutos).

## Próximos Pasos

1. ⏳ **Esperar propagación DNS** (5-15 minutos)
2. ✅ **Verificar dominio personalizado**: `curl https://api.hashpass.tech/api/config/versions`
3. ✅ **Actualizar frontend**: Configurar `EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api` en variables de entorno de Amplify
4. ✅ **Monitorear**: Revisar logs de CloudWatch para Lambda y API Gateway

## Configuración de Variables de Entorno

### Amplify (Frontend Apps)

**Para `hashpass.tech` (dy8duury54wam):**
```
EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api
```

**Para `bsl2025.hashpass.tech` (d3ja863334bedw):**
```
EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api
```

### Lambda Function

Ya configuradas (si es necesario, verificar en Lambda Console):
```
NODE_ENV=production
EXPO_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Verificación Final

### Check DNS
```bash
dig api.hashpass.tech
# Debe mostrar: d-rt2wzrx5l5.execute-api.us-east-1.amazonaws.com
```

### Test API
```bash
# Después de propagación DNS
curl https://api.hashpass.tech/api/config/versions
```

### Check API Gateway
```bash
aws apigatewayv2 get-domain-name \
  --domain-name api.hashpass.tech \
  --region us-east-1
```

## Troubleshooting

Si después de 15 minutos el dominio personalizado no funciona:

1. **Verificar DNS**: `dig api.hashpass.tech`
2. **Verificar API Mapping**: `aws apigatewayv2 get-api-mappings --domain-name api.hashpass.tech --region us-east-1`
3. **Revisar logs**: CloudWatch logs para Lambda y API Gateway
4. **Verificar certificado**: `aws acm describe-certificate --certificate-arn <ARN> --region us-east-1`

## Documentación Relacionada

- `docs/AMPLIFY-API-MIGRATION.md` - Guía de migración
- `docs/AMPLIFY-LAMBDA-INTEGRATION.md` - Integración Amplify + Lambda
- `docs/DNS-UPDATE-COMPLETE.md` - Detalles de actualización DNS
- `docs/API-GATEWAY-SETUP.md` - Configuración completa de API Gateway

