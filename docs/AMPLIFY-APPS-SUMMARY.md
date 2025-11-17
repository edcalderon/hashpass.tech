# Resumen de Apps de Amplify

## Apps Actuales

### Frontend Apps (MANTENER)

1. **hashpass.tech**
   - **App ID**: `dy8duury54wam`
   - **Región**: `us-east-2`
   - **Propósito**: Frontend principal
   - **Estado**: ✅ Activa

2. **bsl2025.hashpass.tech**
   - **App ID**: `d3ja863334bedw`
   - **Región**: `us-east-2`
   - **Propósito**: Frontend para evento BSL2025
   - **Estado**: ✅ Activa

### API App (ELIMINADA)

3. **api.hashpass.tech** ❌
   - **App ID**: `d31bu1ot0gd14y` (ELIMINADA)
   - **Región**: `us-east-2`
   - **Propósito**: Ya no se necesita (usamos API Gateway + Lambda)
   - **Estado**: ✅ Eliminada

## Arquitectura Actual

```
Frontend:
├── hashpass.tech → Amplify App (dy8duury54wam)
└── bsl2025.hashpass.tech → Amplify App (d3ja863334bedw)

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

