# Solución para errores de memoria (Out of Memory)

Si encuentras errores como:
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

## Solución rápida

Ejecuta el script con más memoria usando una de estas opciones:

### Opción 1: Usar el wrapper script
```bash
./scripts/run-with-more-memory.sh scripts/send-support-email.mjs
```

### Opción 2: Usar NODE_OPTIONS directamente
```bash
NODE_OPTIONS="--max-old-space-size=8192" node scripts/send-support-email.mjs
```

### Opción 3: Modificar package.json
Agrega un script en `package.json`:
```json
{
  "scripts": {
    "send:support-email": "NODE_OPTIONS='--max-old-space-size=4096' node scripts/send-support-email.mjs"
  }
}
```

Luego ejecuta:
```bash
npm run send:support-email
```

## Valores recomendados

- **4GB (4096)**: Para scripts simples de email
- **8GB (8192)**: Para scripts que procesan muchos datos (usuarios, speakers, etc.)
- **16GB (16384)**: Para scripts muy pesados o builds grandes

## Verificar memoria disponible

```bash
# Ver memoria total del sistema
free -h

# Ver memoria usada por Node.js
ps aux | grep node
```

## Optimizaciones adicionales

Si el problema persiste, considera:

1. **Procesar en lotes**: En lugar de cargar todos los datos en memoria, procesa en chunks
2. **Usar streams**: Para archivos grandes, usa streams en lugar de cargar todo en memoria
3. **Liberar recursos**: Asegúrate de cerrar conexiones y limpiar referencias cuando termines

## Ejemplo de procesamiento en lotes

```javascript
// ❌ Malo: Carga todos los usuarios en memoria
const allUsers = await supabase.from('users').select('*');

// ✅ Bueno: Procesa en lotes de 100
const BATCH_SIZE = 100;
let offset = 0;
while (true) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .range(offset, offset + BATCH_SIZE - 1);
  
  if (!data || data.length === 0) break;
  
  // Procesar lote
  for (const user of data) {
    // ... procesar usuario
  }
  
  offset += BATCH_SIZE;
}
```



















