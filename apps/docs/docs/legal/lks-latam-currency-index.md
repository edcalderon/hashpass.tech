---
title: Índice Monetario LATAM LKS
description: Nota de producto y metodología propuesta para el LKS LatAm Currency Index.
---

# Índice Monetario LATAM LKS

**Estado:** propuesta de arquitectura y documentación de producto — 25 de septiembre de 2026<br />
**Idioma principal:** español<br />
**Documentos vinculantes:** [Términos de Servicio](terms-of-service.md) y los términos del emisor, custodio, protocolo, canje o mercado que resulten aplicables.

> Esta página describe una propuesta de hoja de ruta. No es una oferta, una
> recomendación de inversión, una promesa de rendimiento, ni una declaración
> de que exista emisión, canje, reserva, liquidez, paridad o disponibilidad de
> $LKS. En caso de conflicto, prevalecen los documentos vinculantes de la
> entidad responsable de la función correspondiente.

## Propósito

El **LKS LatAm Currency Index (LACI)** es el nombre propuesto para una
referencia monetaria regional. La propuesta busca representar una canasta de
monedas latinoamericanas y servir como contexto informativo para futuras
experiencias del ecosistema, eventos y comercios que puedan aceptar $LKS.

No es una stablecoin algorítmica y no implica una paridad permanente con USD,
COP ni otra moneda. Que un activo haga referencia a un índice no garantiza que
su precio de mercado, liquidez, canje o poder adquisitivo siga esa referencia.

## Canasta propuesta

La siguiente composición es una propuesta inicial de metodología y suma 100%:

| Moneda | Peso propuesto |
| --- | ---: |
| Real brasileño (BRL) | 40% |
| Peso mexicano (MXN) | 30% |
| Peso colombiano (COP) | 15% |
| Peso chileno (CLP) | 10% |
| Peso argentino (ARS) | 5% |

Antes de cualquier lanzamiento, la entidad responsable de la metodología debe
publicar la base de cálculo, fuentes de precios u oráculos, frecuencia,
tratamiento de mercados no disponibles, reglas de rebalanceo, gobernanza,
versionado de cambios y el mecanismo de publicación verificable. Un valor
inicial de referencia, si se publica, no constituye una garantía de precio ni
de canje.

## Hoja de ruta propuesta

1. Publicar metodología, fuentes, controles y divulgaciones de riesgo.
2. Validar datos y cálculo de NAV de referencia en un entorno de prueba.
3. Definir las entidades responsables de emisión, reservas, canje, custodia,
   cumplimiento y atención al usuario, si esas funciones llegaran a existir.
4. Evaluar integraciones técnicas y experiencias de utilidad de forma gradual,
   con avisos claros para usuarios y comercios.

Las referencias técnicas de la propuesta —Celo para una posible capa canónica
de reserva/emisión/canje, Unichain para liquidez y DeFi, y tecnologías de Zama
o Fhenix para investigación de privacidad— son opciones de arquitectura, no
compromisos de integración, disponibilidad ni respaldo de terceros.

## Relación con HASHPASS

HASHPASS puede actuar como interfaz tecnológica o merchant para experiencias,
eventos y comercios del ecosistema cuando se indique expresamente. Salvo que
un documento vinculante establezca lo contrario, HASHPASS no es emisor,
garante, banco, custodio, exchange, bróker, asesor de inversión, fondo de
inversión ni creador de mercado de $LKS.

## Riesgos y cumplimiento

La interacción con activos digitales puede involucrar volatilidad, fallas de
contratos inteligentes, oráculos, puentes o redes, pérdida de claves,
limitaciones de liquidez, cambios regulatorios, impuestos, sanciones y
operaciones irreversibles. La disponibilidad puede depender de requisitos de
identidad, elegibilidad, AML/CFT, restricciones geográficas y los términos de
proveedores independientes.

Para saber cómo tratamos los datos asociados a la cuenta, invitaciones y uso
del servicio, consulte la [Política de Privacidad](privacy-policy.md).
