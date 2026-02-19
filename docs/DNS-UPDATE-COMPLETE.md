# DNS Update Complete ✅

## Status

✅ **DNS actualizado correctamente**

### Cambios Realizados

1. ✅ **Certificado ACM validado** - `ISSUED`
2. ✅ **Dominio personalizado configurado** en API Gateway
3. ✅ **API mapping creado** - API `nqt8xep20g` → Stage `prod`
4. ✅ **DNS actualizado** - `api.hashpass.tech` → `d-rt2wzrx5l5.execute-api.us-east-1.amazonaws.com`

### Registro DNS Actual

```
Name: api.hashpass.tech
Type: CNAME
Value: d-rt2wzrx5l5.execute-api.us-east-1.amazonaws.com
TTL: 300
```

### API Gateway Configuration

- **Domain Name**: `api.hashpass.tech`
- **API Gateway Domain**: `d-rt2wzrx5l5.execute-api.us-east-1.amazonaws.com`
- **API ID**: `nqt8xep20g`
- **Stage**: `prod`
- **Endpoint Type**: `REGIONAL`
- **Certificate**: `arn:aws:acm:us-east-1:058264267235:certificate/6ab63538-aa75-4df0-9d4f-79d163878d76`

## Testing

### Test API Gateway Directly (with stage)
```bash
curl https://d-rt2wzrx5l5.execute-api.us-east-1.amazonaws.com/prod/api/config/versions
```

### Test Custom Domain (after DNS propagation)
```bash
curl https://api.hashpass.tech/api/config/versions
```

**Note**: DNS propagation can take 5-15 minutes. If you get connection errors, wait a bit and try again.

## Verification

### Check DNS Resolution
```bash
dig api.hashpass.tech
# Should show: d-rt2wzrx5l5.execute-api.us-east-1.amazonaws.com
```

### Check API Gateway Domain
```bash
aws apigatewayv2 get-domain-name \
  --domain-name api.hashpass.tech \
  --region us-east-1 \
  --query 'DomainNameConfigurations[0].ApiGatewayDomainName' \
  --output text
```

### Check API Mappings
```bash
aws apigatewayv2 get-api-mappings \
  --domain-name api.hashpass.tech \
  --region us-east-1
```

## Next Steps

1. ⏳ **Wait for DNS propagation** (5-15 minutes)
2. ✅ **Test custom domain**: `curl https://api.hashpass.tech/api/config/versions`
3. ✅ **Update frontend**: Set `EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api` in Amplify environment variables
4. ✅ **Remove old Amplify app** for api.hashpass.tech (already done)

## Troubleshooting

### If DNS not resolving:
- Wait 5-15 minutes for propagation
- Check Route 53: `aws route53 list-resource-record-sets --hosted-zone-id Z0236404TWGQH7K9IU6F`
- Verify DNS: `dig api.hashpass.tech`

### If API returns 403/404:
- Check API mapping is configured
- Verify Lambda function is deployed
- Check API Gateway stage is deployed
- Review CloudWatch logs for Lambda

### If SSL certificate errors:
- Verify ACM certificate is `ISSUED`
- Check certificate covers `*.hashpass.tech` or `api.hashpass.tech`
- Wait for certificate propagation (can take up to 40 minutes)

