# Lambda CI/CD Setup Guide

## Overview

Este documento explica cómo configurar el despliegue automático de Lambda cuando hay cambios en el repositorio.

## Opciones de Integración

### Opción 1: GitHub Actions (Recomendado) ✅

**Ventajas:**
- ✅ Despliegue automático en cada push a `main` o `bsl2025`
- ✅ Solo despliega cuando hay cambios en archivos relacionados con API
- ✅ No afecta el tiempo de build de Amplify
- ✅ Separación clara entre frontend y backend
- ✅ Logs y notificaciones en GitHub

**Configuración:**

1. **Crear IAM Role para GitHub Actions (OIDC)**

   ```bash
   # Crear role con trust policy para GitHub Actions
   aws iam create-role \
     --role-name GitHubActions-LambdaDeploy \
     --assume-role-policy-document '{
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Principal": {
             "Federated": "arn:aws:iam::058264267235:oidc-provider/token.actions.githubusercontent.com"
           },
           "Action": "sts:AssumeRoleWithWebIdentity",
           "Condition": {
             "StringEquals": {
               "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
             },
             "StringLike": {
               "token.actions.githubusercontent.com:sub": "repo:lstech-solutions/bsl2025.hashpass.tech:*"
             }
           }
         }
       ]
     }'
   
   # Attach policy para Lambda
   aws iam attach-role-policy \
     --role-name GitHubActions-LambdaDeploy \
     --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess
   ```

2. **Configurar GitHub Secrets**

   En GitHub → Settings → Secrets and variables → Actions:
   - Agregar `AWS_ROLE_ARN`: `arn:aws:iam::058264267235:role/GitHubActions-LambdaDeploy`

3. **El workflow ya está configurado**

   El archivo `.github/workflows/deploy-lambda.yml` está listo y se activará automáticamente cuando:
   - Haya cambios en `app/api/**`
   - Haya cambios en `lambda/**`
   - Haya cambios en `scripts/package-lambda.sh`
   - Haya cambios en `package.json` o `package-lock.json`
   - Push a `main` o `bsl2025`

### Opción 2: Integrar en Amplify Build

**Ventajas:**
- ✅ Todo en un solo lugar
- ✅ Frontend y API siempre sincronizados

**Desventajas:**
- ⚠️ Builds más lentos
- ⚠️ Requiere permisos Lambda en Amplify service role
- ⚠️ Despliega Lambda incluso si solo cambió el frontend

**Configuración:**

1. **Agregar permisos Lambda al Amplify service role**

   ```bash
   aws iam attach-role-policy \
     --role-name amplify-hashpasstech-dev-96465-authRole \
     --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess
   ```

2. **Descomentar en `amplify.yml`:**

   ```yaml
   post_build:
     commands:
       - echo "Packaging Lambda function..."
       - ./scripts/package-lambda.sh || echo "Lambda packaging skipped"
       - |
         if [ -f lambda-deployment.zip ]; then
           echo "Deploying Lambda function..."
           aws lambda update-function-code \
             --function-name hashpass-api-handler \
             --region us-east-1 \
             --zip-file fileb://lambda-deployment.zip || echo "Lambda deployment skipped"
         fi
   ```

### Opción 3: Despliegue Manual

Para despliegues manuales cuando sea necesario:

```bash
./scripts/package-lambda.sh
aws lambda update-function-code \
  --function-name hashpass-api-handler \
  --region us-east-1 \
  --zip-file fileb://lambda-deployment.zip
```

## Flujo Actual (Recomendado)

```
┌─────────────────┐
│  Push to main   │
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│  Amplify Build  │  │ GitHub Actions  │
│  (Frontend)     │  │  (Lambda API)   │
└─────────────────┘  └─────────────────┘
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│ hashpass.tech   │  │ Lambda Function │
│ (Static Files)  │  │  (API Routes)    │
└─────────────────┘  └─────────────────┘
```

## Verificación

### Verificar que el workflow funciona:

1. **Hacer un cambio en `app/api/` o `lambda/`**
2. **Commit y push a `main`**
3. **Verificar en GitHub Actions** que el workflow se ejecutó
4. **Verificar Lambda** que se actualizó:
   ```bash
   aws lambda get-function \
     --function-name hashpass-api-handler \
     --region us-east-1 \
     --query 'Configuration.LastModified'
   ```

### Verificar despliegue:

```bash
# Probar API
curl https://api.hashpass.tech/api/config/versions

# Ver logs de Lambda
aws logs tail /aws/lambda/hashpass-api-handler --follow --region us-east-1
```

## Troubleshooting

### GitHub Actions falla con "Access Denied"

1. Verificar que el IAM role existe y tiene los permisos correctos
2. Verificar que `AWS_ROLE_ARN` está configurado en GitHub Secrets
3. Verificar que el OIDC provider está configurado en AWS

### Lambda no se actualiza

1. Verificar que el workflow se ejecutó (GitHub Actions)
2. Verificar logs del workflow
3. Verificar que `lambda-deployment.zip` se creó correctamente
4. Verificar permisos del IAM role

### Build de Amplify falla al desplegar Lambda

1. Verificar que el Amplify service role tiene permisos Lambda
2. Verificar que AWS credentials están configuradas
3. Considerar usar GitHub Actions en su lugar (recomendado)

## Próximos Pasos

1. ✅ **Configurar IAM Role para GitHub Actions** (si no existe)
2. ✅ **Agregar `AWS_ROLE_ARN` a GitHub Secrets**
3. ✅ **Hacer un cambio de prueba y verificar despliegue**
4. ✅ **Monitorear primeros despliegues**

## Referencias

- [GitHub Actions OIDC with AWS](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS Lambda Deployment](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-deploy.html)
- [Amplify Build Settings](https://docs.aws.amazon.com/amplify/latest/userguide/build-settings.html)

