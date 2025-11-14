import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

// Validate required environment variables (check at runtime)
function checkEmailEnabled(): boolean {
  const requiredEnvVars = [
    'NODEMAILER_HOST',
    'NODEMAILER_PORT',
    'NODEMAILER_USER',
    'NODEMAILER_PASS',
    'NODEMAILER_FROM'
  ];
  return requiredEnvVars.every(varName => !!process.env[varName]);
}

function getTransporter() {
  if (!checkEmailEnabled()) {
    return null;
  }
  
  const smtpHost = process.env.NODEMAILER_HOST || '';
  const isBrevo = smtpHost.includes('brevo.com') || smtpHost.includes('sendinblue.com');
  
  return nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(process.env.NODEMAILER_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASS,
    },
    connectionTimeout: 10000,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      servername: isBrevo ? 'smtp-relay.sendinblue.com' : undefined,
      checkServerIdentity: isBrevo ? () => undefined : undefined,
    },
    requireTLS: true,
  });
}

/**
 * Send LUKAS introduction email to HashPass users
 */
export async function sendLukasIntroductionEmail(
  email: string,
  locale: string = 'en'
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { success: false, error: 'Email service is not configured' };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { 
      success: false, 
      error: 'Invalid email address' 
    };
  }

  try {
    // Helper function to convert image to base64 data URI
    const imageToBase64 = (filePath: string, mimeType: string): string | null => {
      try {
        if (fs.existsSync(filePath)) {
          const imageBuffer = fs.readFileSync(filePath);
          const base64 = imageBuffer.toString('base64');
          return `data:${mimeType};base64,${base64}`;
        }
      } catch (error) {
        console.warn(`Could not load image from ${filePath}:`, error);
      }
      return null;
    };

    // Get lukas.png image as base64
    const lukasImagePath = path.join(process.cwd(), 'public', 'assets', 'lukas.png');
    const lukasImageBase64 = imageToBase64(lukasImagePath, 'image/png');
    const lukasImageSrc = lukasImageBase64 || '';

    // Email content in English
    const emailContent = {
      en: {
        subject: 'Introducing $LUKAS: The First Stable Meme Coin for LatAm',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 32px;
      font-weight: 800;
      color: #22C55E;
      margin-bottom: 10px;
    }
    .title {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 20px;
      line-height: 1.3;
    }
    .subtitle {
      font-size: 18px;
      color: #6B7280;
      margin-bottom: 30px;
    }
    .hero-image {
      width: 100%;
      max-width: 500px;
      height: auto;
      margin: 0 auto 30px auto;
      display: block;
      border-radius: 12px;
    }
    .content {
      margin-bottom: 30px;
    }
    .content p {
      margin-bottom: 16px;
      font-size: 16px;
      color: #374151;
    }
    .highlight {
      background: linear-gradient(135deg, #059669 0%, #10B981 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin: 25px 0;
      text-align: center;
    }
    .highlight h3 {
      margin: 0 0 10px 0;
      font-size: 20px;
      font-weight: 700;
    }
    .highlight p {
      margin: 0;
      font-size: 16px;
      opacity: 0.95;
    }
    .cta-button {
      display: inline-block;
      background-color: #22C55E;
      color: #022C22;
      padding: 14px 32px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 700;
      font-size: 16px;
      margin: 20px 0;
      text-align: center;
      box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
    }
    .features {
      background-color: #F9FAFB;
      padding: 25px;
      border-radius: 8px;
      margin: 25px 0;
    }
    .features h3 {
      color: #111827;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 15px;
    }
    .features ul {
      margin: 0;
      padding-left: 20px;
    }
    .features li {
      margin-bottom: 10px;
      color: #374151;
      font-size: 15px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 30px;
      border-top: 1px solid #E5E7EB;
      text-align: center;
      color: #6B7280;
      font-size: 14px;
    }
    .footer a {
      color: #22C55E;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
      <div class="header">
        ${lukasImageSrc ? `<img src="${lukasImageSrc}" alt="$LUKAS" class="hero-image" />` : ''}
        <h1 class="title">The First Stable Meme Coin for All of Latin America</h1>
        <p class="subtitle">1 LUKA = 1 LatAm Peso (Basket of BRL, MXN, COP, CLP, ARS)</p>
      </div>

    <div class="content">
      <p>Hello HashPass Community! 👋</p>
      
      <p>We're excited to introduce you to <strong>$LUKAS</strong> — a revolutionary stable meme coin designed specifically for real-world use across all of Latin America.</p>
      
      <p><strong>$LUKAS</strong> is not tied to a single national currency. Instead, 1 LUKA is pegged to a <strong>LatAm currency basket</strong> (BRL 40%, MXN 30%, COP 15%, CLP 10%, ARS 5%), making it regionally stable and resistant to any single country's economic volatility.</p>

      <div class="highlight">
        <h3>🎉 Exclusive Airdrop for HashPass Users</h3>
        <p>As a valued member of the HashPass community, you'll receive an exclusive $LUKAS airdrop at Token Generation Event (TGE)!</p>
        <p style="margin-top: 10px; font-size: 14px;">The more you interact with HashPass, the more $LUKAS you'll receive.</p>
      </div>

      <h3 style="color: #111827; font-size: 20px; margin-top: 30px; margin-bottom: 15px;">What is $LUKAS?</h3>
      
      <p><strong>$LUKAS</strong> is the first stable meme coin pegged 1:1 to a <strong>LatAm currency basket</strong>, not tied to any single country. Unlike traditional meme coins, $LUKAS is:</p>

      <div class="features">
        <h3>✨ Key Features</h3>
        <ul>
          <li><strong>Regionally Stable:</strong> Pegged to a basket of LatAm currencies (BRL 40%, MXN 30%, COP 15%, CLP 10%, ARS 5%) for predictable value across the region</li>
          <li><strong>Spendable Everywhere:</strong> Use $LUKAS with HashPass merchants across Latin America (events, coffee shops, coworkings, and more)</li>
          <li><strong>Backed:</strong> Supported by real crypto collateral (USDC, BTC, ETH) in omni-chain vaults plus merchant deposits</li>
          <li><strong>Real-world focused:</strong> Designed for actual payments across LatAm, not just trading screenshots</li>
          <li><strong>Algorithmically Managed:</strong> Price oracles and mint/burn mechanisms maintain the peg automatically</li>
        </ul>
      </div>

      <h3 style="color: #111827; font-size: 20px; margin-top: 30px; margin-bottom: 15px;">🚀 Start Earning $LUKAS Now!</h3>
      
      <p><strong>Every interaction you make on the HashPass app is accumulating $LUKAS!</strong></p>
      
      <p>From now until TGE, all your activities on HashPass are being tracked and will contribute to your $LUKAS airdrop amount:</p>
      
      <ul style="color: #374151; font-size: 15px; line-height: 1.8;">
        <li>Attending events and conferences across LatAm</li>
        <li>Making purchases with HashPass merchants</li>
        <li>Connecting with speakers and community members</li>
        <li>Using HashPass features and services</li>
        <li>Engaging with the HashPass ecosystem</li>
        <li>And much more!</li>
      </ul>
      
      <div style="background-color: #F0FDF4; padding: 20px; border-radius: 8px; border-left: 4px solid #22C55E; margin: 20px 0;">
        <p style="margin: 0; color: #166534; font-size: 15px; font-weight: 600;">💡 Why the LatAm Basket?</p>
        <p style="margin: 10px 0 0 0; color: #166534; font-size: 14px;">By pegging to multiple currencies instead of just one, $LUKAS remains stable even if one country experiences economic volatility. This makes it truly regional money for all of Latin America.</p>
      </div>

      <div class="highlight" style="background: linear-gradient(135deg, #1F2937 0%, #111827 100%);">
        <h3>💡 Pro Tip</h3>
        <p>The more you interact with HashPass, the more $LUKAS you'll receive at TGE. Keep using the app to maximize your airdrop! Every interaction counts toward your final airdrop amount.</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://lukas.hashpass.tech" class="cta-button">Learn More About $LUKAS</a>
      </div>

      <p style="margin-top: 30px;">We're building something special for the entire Latin American crypto community — a regional stablecoin that works for everyone, regardless of which country you're in.</p>

      <p>Stay active on HashPass and watch your $LUKAS accumulate! 🚀</p>
      
      <p style="font-size: 14px; color: #6B7280; margin-top: 20px;"><strong>Remember:</strong> 1 LUKA = 1 LatAm Peso (basket of BRL, MXN, COP, CLP, ARS). This means $LUKAS represents the average value of major LatAm currencies, making it stable across the entire region.</p>

      <p>Best regards,<br>
      <strong>The HashPass Team</strong></p>
    </div>

    <div class="footer">
      <p>Questions? Visit <a href="https://lukas.hashpass.tech">lukas.hashpass.tech</a> or reply to this email.</p>
      <p style="margin-top: 10px;">© ${new Date().getFullYear()} HashPass. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
        `,
        text: `Introducing $LUKAS: The First Stable Meme Coin for All of Latin America

Hello HashPass Community!

We're excited to introduce you to $LUKAS — a revolutionary stable meme coin designed specifically for real-world use across all of Latin America.

$LUKAS is not tied to a single national currency. Instead, 1 LUKA is pegged to a LatAm currency basket (BRL 40%, MXN 30%, COP 15%, CLP 10%, ARS 5%), making it regionally stable and resistant to any single country's economic volatility.

🎉 EXCLUSIVE AIRDROP FOR HASHPASS USERS
As a valued member of the HashPass community, you'll receive an exclusive $LUKAS airdrop at Token Generation Event (TGE)! The more you interact with HashPass, the more $LUKAS you'll receive.

WHAT IS $LUKAS?
$LUKAS is the first stable meme coin pegged 1:1 to a LatAm currency basket, not tied to any single country. Unlike traditional meme coins, $LUKAS is:

✨ Key Features:
- Regionally Stable: Pegged to a basket of LatAm currencies (BRL 40%, MXN 30%, COP 15%, CLP 10%, ARS 5%) for predictable value across the region
- Spendable Everywhere: Use $LUKAS with HashPass merchants across Latin America (events, coffee shops, coworkings, and more)
- Backed: Supported by real crypto collateral (USDC, BTC, ETH) in omni-chain vaults plus merchant deposits
- Real-world focused: Designed for actual payments across LatAm, not just trading screenshots
- Algorithmically Managed: Price oracles and mint/burn mechanisms maintain the peg automatically

🚀 START EARNING $LUKAS NOW!
Every interaction you make on the HashPass app is accumulating $LUKAS!

From now until TGE, all your activities on HashPass are being tracked and will contribute to your $LUKAS airdrop amount:
- Attending events and conferences across LatAm
- Making purchases with HashPass merchants
- Connecting with speakers and community members
- Using HashPass features and services
- Engaging with the HashPass ecosystem
- And much more!

💡 WHY THE LATAM BASKET?
By pegging to multiple currencies instead of just one, $LUKAS remains stable even if one country experiences economic volatility. This makes it truly regional money for all of Latin America.

💡 PRO TIP
The more you interact with HashPass, the more $LUKAS you'll receive at TGE. Keep using the app to maximize your airdrop! Every interaction counts toward your final airdrop amount.

Learn more: https://lukas.hashpass.tech

We're building something special for the entire Latin American crypto community — a regional stablecoin that works for everyone, regardless of which country you're in.

Stay active on HashPass and watch your $LUKAS accumulate!

Remember: 1 LUKA = 1 LatAm Peso (basket of BRL, MXN, COP, CLP, ARS). This means $LUKAS represents the average value of major LatAm currencies, making it stable across the entire region.

Best regards,
The HashPass Team

Questions? Visit lukas.hashpass.tech or reply to this email.
© ${new Date().getFullYear()} HashPass. All rights reserved.`
      },
      es: {
        subject: 'Presentando $LUKAS: La Primera Stable Meme Coin para Toda América Latina',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 32px;
      font-weight: 800;
      color: #22C55E;
      margin-bottom: 10px;
    }
    .title {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 20px;
      line-height: 1.3;
    }
    .subtitle {
      font-size: 18px;
      color: #6B7280;
      margin-bottom: 30px;
    }
    .hero-image {
      width: 100%;
      max-width: 500px;
      height: auto;
      margin: 0 auto 30px auto;
      display: block;
      border-radius: 12px;
    }
    .content {
      margin-bottom: 30px;
    }
    .content p {
      margin-bottom: 16px;
      font-size: 16px;
      color: #374151;
    }
    .highlight {
      background: linear-gradient(135deg, #059669 0%, #10B981 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin: 25px 0;
      text-align: center;
    }
    .highlight h3 {
      margin: 0 0 10px 0;
      font-size: 20px;
      font-weight: 700;
    }
    .highlight p {
      margin: 0;
      font-size: 16px;
      opacity: 0.95;
    }
    .cta-button {
      display: inline-block;
      background-color: #22C55E;
      color: #022C22;
      padding: 14px 32px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 700;
      font-size: 16px;
      margin: 20px 0;
      text-align: center;
      box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
    }
    .features {
      background-color: #F9FAFB;
      padding: 25px;
      border-radius: 8px;
      margin: 25px 0;
    }
    .features h3 {
      color: #111827;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 15px;
    }
    .features ul {
      margin: 0;
      padding-left: 20px;
    }
    .features li {
      margin-bottom: 10px;
      color: #374151;
      font-size: 15px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 30px;
      border-top: 1px solid #E5E7EB;
      text-align: center;
      color: #6B7280;
      font-size: 14px;
    }
    .footer a {
      color: #22C55E;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${lukasImageSrc ? `<img src="${lukasImageSrc}" alt="$LUKAS" class="hero-image" />` : ''}
      <h1 class="title">La Primera Stable Meme Coin para Toda América Latina</h1>
      <p class="subtitle">1 LUKA = 1 Peso LatAm (Canasta de BRL, MXN, COP, CLP, ARS)</p>
    </div>

    <div class="content">
      <p>¡Hola Comunidad HashPass! 👋</p>
      
      <p>Estamos emocionados de presentarte <strong>$LUKAS</strong> — una stable meme coin revolucionaria diseñada específicamente para uso real en toda América Latina.</p>
      
      <p><strong>$LUKAS</strong> no está vinculado a una sola moneda nacional. En cambio, 1 LUKA está vinculado a una <strong>canasta de monedas LatAm</strong> (BRL 40%, MXN 30%, COP 15%, CLP 10%, ARS 5%), haciéndolo regionalmente estable y resistente a la volatilidad económica de cualquier país individual.</p>

      <div class="highlight">
        <h3>🎉 Airdrop Exclusivo para Usuarios HashPass</h3>
        <p>Como miembro valioso de la comunidad HashPass, recibirás un airdrop exclusivo de $LUKAS en el Evento de Generación de Tokens (TGE)!</p>
        <p style="margin-top: 10px; font-size: 14px;">Mientras más interactúes con HashPass, más $LUKAS recibirás.</p>
      </div>

      <h3 style="color: #111827; font-size: 20px; margin-top: 30px; margin-bottom: 15px;">¿Qué es $LUKAS?</h3>
      
      <p><strong>$LUKAS</strong> es la primera stable meme coin vinculada 1:1 a una <strong>canasta de monedas LatAm</strong>, no vinculada a un solo país. A diferencia de las meme coins tradicionales, $LUKAS es:</p>

      <div class="features">
        <h3>✨ Características Clave</h3>
        <ul>
          <li><strong>Regionalmente Estable:</strong> Vinculada a una canasta de monedas LatAm (BRL 40%, MXN 30%, COP 15%, CLP 10%, ARS 5%) para un valor predecible en toda la región</li>
          <li><strong>Gastable en Todas Partes:</strong> Usa $LUKAS con comercios HashPass en toda América Latina (eventos, cafeterías, coworkings y más)</li>
          <li><strong>Respaldada:</strong> Soportada por garantía cripto real (USDC, BTC, ETH) en cofres omni-chain más depósitos de comercios</li>
          <li><strong>Enfocada en el mundo real:</strong> Diseñada para pagos reales en toda LatAm, no solo screenshots de trading</li>
          <li><strong>Gestionada Algorítmicamente:</strong> Oráculos de precios y mecanismos de acuñación/quema mantienen el peg automáticamente</li>
        </ul>
      </div>

      <h3 style="color: #111827; font-size: 20px; margin-top: 30px; margin-bottom: 15px;">🚀 ¡Comienza a Ganar $LUKAS Ahora!</h3>
      
      <p><strong>¡Cada interacción que hagas en la app HashPass está acumulando $LUKAS!</strong></p>
      
      <p>Desde ahora hasta el TGE, todas tus actividades en HashPass están siendo rastreadas y contribuirán a la cantidad de tu airdrop de $LUKAS:</p>
      
      <ul style="color: #374151; font-size: 15px; line-height: 1.8;">
        <li>Asistir a eventos y conferencias en toda LatAm</li>
        <li>Hacer compras con comercios HashPass</li>
        <li>Conectar con speakers y miembros de la comunidad</li>
        <li>Usar funciones y servicios de HashPass</li>
        <li>Participar en el ecosistema HashPass</li>
        <li>¡Y mucho más!</li>
      </ul>
      
      <div style="background-color: #F0FDF4; padding: 20px; border-radius: 8px; border-left: 4px solid #22C55E; margin: 20px 0;">
        <p style="margin: 0; color: #166534; font-size: 15px; font-weight: 600;">💡 ¿Por qué la Canasta LatAm?</p>
        <p style="margin: 10px 0 0 0; color: #166534; font-size: 14px;">Al vincularse a múltiples monedas en lugar de solo una, $LUKAS permanece estable incluso si un país experimenta volatilidad económica. Esto lo convierte en dinero verdaderamente regional para toda América Latina.</p>
      </div>

      <div class="highlight" style="background: linear-gradient(135deg, #1F2937 0%, #111827 100%);">
        <h3>💡 Consejo Pro</h3>
        <p>Mientras más interactúes con HashPass, más $LUKAS recibirás en el TGE. ¡Sigue usando la app para maximizar tu airdrop! Cada interacción cuenta hacia tu cantidad final de airdrop.</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://lukas.hashpass.tech" class="cta-button">Aprende Más Sobre $LUKAS</a>
      </div>

      <p style="margin-top: 30px;">Estamos construyendo algo especial para toda la comunidad cripto de América Latina — una stablecoin regional que funciona para todos, sin importar en qué país estés.</p>

      <p>¡Mantente activo en HashPass y observa cómo se acumula tu $LUKAS! 🚀</p>
      
      <p style="font-size: 14px; color: #6B7280; margin-top: 20px;"><strong>Recuerda:</strong> 1 LUKA = 1 Peso LatAm (canasta de BRL, MXN, COP, CLP, ARS). Esto significa que $LUKAS representa el valor promedio de las principales monedas LatAm, haciéndolo estable en toda la región.</p>

      <p>Saludos cordiales,<br>
      <strong>El Equipo HashPass</strong></p>
    </div>

    <div class="footer">
      <p>¿Preguntas? Visita <a href="https://lukas.hashpass.tech">lukas.hashpass.tech</a> o responde a este email.</p>
      <p style="margin-top: 10px;">© ${new Date().getFullYear()} HashPass. Todos los derechos reservados.</p>
    </div>
  </div>
</body>
</html>
        `,
        text: `Presentando $LUKAS: La Primera Stable Meme Coin para Toda América Latina

¡Hola Comunidad HashPass!

Estamos emocionados de presentarte $LUKAS — una stable meme coin revolucionaria diseñada específicamente para uso real en toda América Latina.

$LUKAS no está vinculado a una sola moneda nacional. En cambio, 1 LUKA está vinculado a una canasta de monedas LatAm (BRL 40%, MXN 30%, COP 15%, CLP 10%, ARS 5%), haciéndolo regionalmente estable y resistente a la volatilidad económica de cualquier país individual.

🎉 AIRDROP EXCLUSIVO PARA USUARIOS HASHPASS
Como miembro valioso de la comunidad HashPass, recibirás un airdrop exclusivo de $LUKAS en el Evento de Generación de Tokens (TGE)! Mientras más interactúes con HashPass, más $LUKAS recibirás.

¿QUÉ ES $LUKAS?
$LUKAS es la primera stable meme coin vinculada 1:1 a una canasta de monedas LatAm, no vinculada a un solo país. A diferencia de las meme coins tradicionales, $LUKAS es:

✨ Características Clave:
- Regionalmente Estable: Vinculada a una canasta de monedas LatAm (BRL 40%, MXN 30%, COP 15%, CLP 10%, ARS 5%) para un valor predecible en toda la región
- Gastable en Todas Partes: Usa $LUKAS con comercios HashPass en toda América Latina (eventos, cafeterías, coworkings y más)
- Respaldada: Soportada por garantía cripto real (USDC, BTC, ETH) en cofres omni-chain más depósitos de comercios
- Enfocada en el mundo real: Diseñada para pagos reales en toda LatAm, no solo screenshots de trading
- Gestionada Algorítmicamente: Oráculos de precios y mecanismos de acuñación/quema mantienen el peg automáticamente

🚀 ¡COMIENZA A GANAR $LUKAS AHORA!
¡Cada interacción que hagas en la app HashPass está acumulando $LUKAS!

Desde ahora hasta el TGE, todas tus actividades en HashPass están siendo rastreadas y contribuirán a la cantidad de tu airdrop de $LUKAS:
- Asistir a eventos y conferencias en toda LatAm
- Hacer compras con comercios HashPass
- Conectar con speakers y miembros de la comunidad
- Usar funciones y servicios de HashPass
- Participar en el ecosistema HashPass
- ¡Y mucho más!

💡 ¿POR QUÉ LA CANASTA LATAM?
Al vincularse a múltiples monedas en lugar de solo una, $LUKAS permanece estable incluso si un país experimenta volatilidad económica. Esto lo convierte en dinero verdaderamente regional para toda América Latina.

💡 CONSEJO PRO
Mientras más interactúes con HashPass, más $LUKAS recibirás en el TGE. ¡Sigue usando la app para maximizar tu airdrop! Cada interacción cuenta hacia tu cantidad final de airdrop.

Aprende más: https://lukas.hashpass.tech

Estamos construyendo algo especial para toda la comunidad cripto de América Latina — una stablecoin regional que funciona para todos, sin importar en qué país estés.

¡Mantente activo en HashPass y observa cómo se acumula tu $LUKAS!

Recuerda: 1 LUKA = 1 Peso LatAm (canasta de BRL, MXN, COP, CLP, ARS). Esto significa que $LUKAS representa el valor promedio de las principales monedas LatAm, haciéndolo estable en toda la región.

Saludos cordiales,
El Equipo HashPass

¿Preguntas? Visita lukas.hashpass.tech o responde a este email.
© ${new Date().getFullYear()} HashPass. Todos los derechos reservados.`
      }
    };

    const content = emailContent[locale as keyof typeof emailContent] || emailContent.en;

    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    };

    const info = await transporter.sendMail(mailOptions);
    
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending LUKAS introduction email:', error);
    return { 
      success: false, 
      error: error?.message || 'Failed to send LUKAS introduction email' 
    };
  }
}

