# Resumen de Apps de Amplify

## Apps Actuales

### Frontend App Activa (Blockchain Summit)

1. **blockchainsummit.hashpass.lat**
   - **App ID**: `d951nuj7hrqeg`
   - **Región**: `sa-east-1`
   - **Propósito**: Frontend principal (branches `main` y `develop`)
   - **Estado**: ✅ Activa

### Frontend Apps Legacy (Opcionales)

2. **hashpass.tech**
   - **App ID**: `dy8duury54wam`
   - **Región**: `us-east-2`
   - **Propósito**: Legacy / histórico
   - **Estado**: ⚠️ Legacy

3. **bsl2025.hashpass.tech**
   - **App ID**: `d3ja863334bedw`
   - **Región**: `us-east-2`
   - **Propósito**: Legacy / evento anterior
   - **Estado**: ⚠️ Legacy

### API App (ELIMINADA)

4. **api.hashpass.tech** ❌
   - **App ID**: `d31bu1ot0gd14y` (ELIMINADA)
   - **Región**: `us-east-2`
   - **Propósito**: Ya no se necesita (usamos API Gateway + Lambda)
   - **Estado**: ✅ Eliminada

## Arquitectura Actual

```
Frontend:
└── blockchainsummit.hashpass.lat / blockchainsummit-dev.hashpass.lat → Amplify App (d951nuj7hrqeg, sa-east-1)

API:
└── api.hashpass.tech → API Gateway + Lambda (NO Amplify)
```

## Próximos Pasos

1. ✅ **Eliminar app de Amplify para API** - COMPLETADO
2. ⏳ **Esperar validación de certificado ACM**
3. ⏳ **Configurar dominio personalizado en API Gateway**
4. ⏳ **Actualizar DNS: api.hashpass.tech → API Gateway**

## Verificación

Para verificar que la app fue eliminada:

```bash
aws amplify get-app --app-id d31bu1ot0gd14y --region us-east-2
# Debe retornar error: ResourceNotFoundException
```

Para verificar la app activa:

```bash
aws amplify get-app --app-id d951nuj7hrqeg --region sa-east-1
aws amplify list-branches --app-id d951nuj7hrqeg --region sa-east-1
```
