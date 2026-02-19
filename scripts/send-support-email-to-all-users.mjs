import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

// Initialize Supabase
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   EXPO_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Validate required environment variables
const requiredVars = [
  'NODEMAILER_HOST',
  'NODEMAILER_PORT',
  'NODEMAILER_USER',
  'NODEMAILER_PASS',
  'NODEMAILER_FROM'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

const smtpHost = process.env.NODEMAILER_HOST;
const smtpPort = parseInt(process.env.NODEMAILER_PORT || '587');
const smtpUser = process.env.NODEMAILER_USER;
const smtpPass = process.env.NODEMAILER_PASS;
const fromEmail = process.env.NODEMAILER_FROM;

const isBrevo = smtpHost.includes('brevo.com') || smtpHost.includes('sendinblue.com');

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: false,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  connectionTimeout: 10000,
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    servername: isBrevo ? 'smtp-relay.sendinblue.com' : undefined,
    checkServerIdentity: isBrevo ? () => undefined : undefined,
  },
  requireTLS: true,
});

const subject = '⚠️ Acceso restablecido y guía para comenzar';

const getEmailContent = () => {
  const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
    <h1 style="color: #667eea; margin-top: 0;">⚠️</h1>
    <h2 style="color: #333; font-size: 18px; margin-top: 20px;">Tu guía para comenzar en Blockchain Summit Latam 2025</h2>
    
    <p style="margin-top: 30px;">Hola! 👋</p>
    
    <p>El equipo de HashPass quiere ofrecerte una sincera disculpa por los inconvenientes que pudiste haber experimentado al intentar ingresar a la aplicación. 🙏</p>
    
    <p>Detectamos un error con nuestro proveedor de envío de correos que impedía recibir los códigos de acceso (OTP).</p>
    
    <p>El problema ya fue completamente solucionado por nuestro equipo, y ahora puedes ingresar sin inconvenientes al siguiente enlace:</p>
    
    <p style="margin-top: 30px; text-align: center;">
      <a href="https://bsl2025.hashpass.tech/auth" 
         style="background-color: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        👉 Acceder
      </a>
    </p>
    <p style="margin-top: 10px; text-align: center;">
      <a href="https://bsl2025.hashpass.tech/auth" 
         style="color: #667eea; text-decoration: none; font-size: 14px;">
        bsl2025.hashpass.tech
      </a>
    </p>
    
    <div style="margin-top: 40px; border-top: 2px solid #e0e0e0; padding-top: 30px;">
      <h3 style="color: #333; font-size: 20px; margin-bottom: 20px;">Guía de uso paso a paso</h3>
      
      <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #667eea;">
        <h4 style="color: #667eea; margin-top: 0; font-size: 18px;">1️⃣ Inicia sesión en tu cuenta</h4>
        <p style="margin-top: 10px; font-weight: bold; color: #555;">Cómo hacerlo:</p>
        <ul style="margin-top: 10px; padding-left: 20px; color: #555;">
          <li>Abre el enlace en tu navegador (recomendamos Chrome o Safari)</li>
          <li>Ingresa tu correo electrónico</li>
          <li>Revisa tu bandeja de entrada y busca el código de acceso de un solo uso (OTP)</li>
          <li>Ingresa el código en la app para acceder</li>
        </ul>
        <p style="margin-top: 15px; padding: 10px; background-color: #fff3cd; border-radius: 5px; color: #856404;">
          ⚠️ Si no ves el correo, revisa las carpetas de Spam o Promociones.
        </p>
      </div>
      
      <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #667eea;">
        <h4 style="color: #667eea; margin-top: 0; font-size: 18px;">2️⃣ Explora speakers y eventos</h4>
        <p style="margin-top: 10px; color: #555;">Una vez dentro, podrás descubrir todo lo que ofrece el Blockchain Summit Latam 2025:</p>
        <ul style="margin-top: 10px; padding-left: 20px; color: #555;">
          <li>Entra a la sección Explorar</li>
          <li>Busca speakers por tema o empresa</li>
          <li>Consulta sus perfiles, temas y disponibilidad</li>
        </ul>
      </div>
      
      <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #667eea;">
        <h4 style="color: #667eea; margin-top: 0; font-size: 18px;">3️⃣ Envía solicitudes de reunión</h4>
        <p style="margin-top: 10px; color: #555;">¿Quieres conectar con un speaker o empresa? Así de fácil:</p>
        <ul style="margin-top: 10px; padding-left: 20px; color: #555;">
          <li>Encuentra el perfil con quien deseas reunirte</li>
          <li>Haz clic en "Solicitar reunión"</li>
          <li>Elige la fecha y hora que prefieras</li>
          <li>Agrega un mensaje breve (opcional)</li>
          <li>Envía la solicitud y espera la confirmación 🚀</li>
        </ul>
      </div>
      
      <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #667eea;">
        <h4 style="color: #667eea; margin-top: 0; font-size: 18px;">4️⃣ Revisa tus solicitudes</h4>
        <p style="margin-top: 10px; color: #555;">Puedes hacer seguimiento en la sección Notificaciones:</p>
        <ul style="margin-top: 10px; padding-left: 20px; color: #555;">
          <li>Ver solicitudes pendientes, aceptadas o rechazadas</li>
          <li>Recibir actualizaciones en tiempo real cuando respondan</li>
        </ul>
      </div>
      
      <div style="background-color: #e8f4f8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h4 style="color: #333; margin-top: 0; font-size: 18px;">💡 Consejos útiles</h4>
        <ul style="margin-top: 10px; padding-left: 20px; color: #555;">
          <li>✨ Sé claro en tu mensaje al solicitar reuniones — los speakers lo agradecerán</li>
          <li>⏰ Revisa la disponibilidad antes de enviar la solicitud</li>
          <li>📩 Confirma rápidamente las reuniones aceptadas</li>
          <li>🔍 Usa la barra de búsqueda para encontrar speakers por tema o empresa</li>
        </ul>
      </div>
      
      <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h4 style="color: #856404; margin-top: 0; font-size: 18px;">🔧 Si tienes problemas para cargar la app web</h4>
        <p style="margin-top: 10px; color: #856404;">Si la página no carga correctamente:</p>
        <ul style="margin-top: 10px; padding-left: 20px; color: #856404;">
          <li>Borra la caché del navegador: ve a Configuración → "Borrar archivos e imágenes en caché"</li>
          <li>Haz una recarga forzada:
            <ul style="margin-top: 5px;">
              <li>Windows/Linux: <strong>Ctrl + Shift + R</strong></li>
              <li>Mac: <strong>Cmd + Shift + R</strong></li>
            </ul>
          </li>
          <li>O abre la página en una ventana de incógnito</li>
        </ul>
      </div>
      
      <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ff9500;">
        <h4 style="color: #856404; margin-top: 0; font-size: 18px;">⚠️ Importante para Ponentes</h4>
        <p style="margin-top: 10px; color: #856404;">
          Si eres ponente y no tienes el estatus de ponente y/o acceso VIP mostrado en tu sección de pases en HashPass, por favor contacta a soporte o envía un correo con tu correo actual para configurar correctamente tus credenciales y permitirte aceptar solicitudes de reunión.
        </p>
      </div>
      
      <div style="background-color: #d1ecf1; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h4 style="color: #0c5460; margin-top: 0; font-size: 18px;">🧩 ¿Necesitas ayuda?</h4>
        <p style="margin-top: 10px; color: #0c5460;">Nuestro equipo está disponible para apoyarte:</p>
        <p style="margin-top: 10px; color: #0c5460;">
          📧 Correo: <a href="mailto:support@hashpass.tech" style="color: #667eea; text-decoration: none;">support@hashpass.tech</a><br>
          📱 WhatsApp: <a href="https://wa.me/573118396038" style="color: #667eea; text-decoration: none;">+57 311 839 6038</a>
        </p>
      </div>
    </div>
    
    <p style="margin-top: 30px; color: #666; font-size: 14px;">
      Continúa disfrutando de Blockchain Summit Latam 2025!
    </p>
    
    <p style="margin-top: 30px; color: #999; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px;">
      Saludos,<br>
      El equipo de <a href="https://hashpass.co" style="color: #667eea; text-decoration: none;">HashPass</a>
    </p>
  </div>
</body>
</html>
  `;

  const textContent = `
⚠️
Tu guía para comenzar en Blockchain Summit Latam 2025

Hola! 👋

El equipo de HashPass quiere ofrecerte una sincera disculpa por los inconvenientes que pudiste haber experimentado al intentar ingresar a la aplicación. 🙏
Detectamos un error con nuestro proveedor de envío de correos que impedía recibir los códigos de acceso (OTP).
El problema ya fue completamente solucionado por nuestro equipo, y ahora puedes ingresar sin inconvenientes al siguiente enlace:

👉 https://bsl2025.hashpass.tech/auth
bsl2025.hashpass.tech

GUÍA DE USO PASO A PASO

1️⃣ Inicia sesión en tu cuenta

Cómo hacerlo:
- Abre el enlace en tu navegador (recomendamos Chrome o Safari)
- Ingresa tu correo electrónico
- Revisa tu bandeja de entrada y busca el código de acceso de un solo uso (OTP)
- Ingresa el código en la app para acceder

⚠️ Si no ves el correo, revisa las carpetas de Spam o Promociones.

2️⃣ Explora speakers y eventos

Una vez dentro, podrás descubrir todo lo que ofrece el Blockchain Summit Latam 2025:
- Entra a la sección Explorar
- Busca speakers por tema o empresa
- Consulta sus perfiles, temas y disponibilidad

3️⃣ Envía solicitudes de reunión

¿Quieres conectar con un speaker o empresa? Así de fácil:
- Encuentra el perfil con quien deseas reunirte
- Haz clic en "Solicitar reunión"
- Elige la fecha y hora que prefieras
- Agrega un mensaje breve (opcional)
- Envía la solicitud y espera la confirmación 🚀

4️⃣ Revisa tus solicitudes

Puedes hacer seguimiento en la sección Notificaciones:
- Ver solicitudes pendientes, aceptadas o rechazadas
- Recibir actualizaciones en tiempo real cuando respondan

💡 Consejos útiles

✨ Sé claro en tu mensaje al solicitar reuniones — los speakers lo agradecerán
⏰ Revisa la disponibilidad antes de enviar la solicitud
📩 Confirma rápidamente las reuniones aceptadas
🔍 Usa la barra de búsqueda para encontrar speakers por tema o empresa

🔧 Si tienes problemas para cargar la app web

Si la página no carga correctamente:
- Borra la caché del navegador: ve a Configuración → "Borrar archivos e imágenes en caché"
- Haz una recarga forzada:
  * Windows/Linux: Ctrl + Shift + R
  * Mac: Cmd + Shift + R
- O abre la página en una ventana de incógnito

⚠️ Importante para Ponentes

Si eres ponente y no tienes el estatus de ponente y/o acceso VIP mostrado en tu sección de pases en HashPass, por favor contacta a soporte o envía un correo con tu correo actual para configurar correctamente tus credenciales y permitirte aceptar solicitudes de reunión.

🧩 ¿Necesitas ayuda?

Nuestro equipo está disponible para apoyarte:
📧 Correo: support@hashpass.tech
📱 WhatsApp: +57 311 839 6038

Continúa disfrutando de Blockchain Summit Latam 2025!

Saludos,
El equipo de HashPass
https://hashpass.co
  `;

  return { htmlContent, textContent };
};

async function sendSupportEmailToUser(email) {
  const { htmlContent, textContent } = getEmailContent();
  
  try {
    const mailOptions = {
      from: `HashPass <${fromEmail}>`,
      to: email,
      subject: subject,
      html: htmlContent,
      text: textContent,
    };
    
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getAllUsers() {
  try {
    console.log('📋 Fetching all users from database...');
    let allUsers = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const { data: users, error } = await supabase.auth.admin.listUsers({
        page: page,
        perPage: 1000
      });
      
      if (error) {
        console.error('❌ Error fetching users:', error);
        throw error;
      }
      
      if (users && users.users && users.users.length > 0) {
        allUsers = allUsers.concat(users.users);
        console.log(`   Fetched ${users.users.length} users (total: ${allUsers.length})`);
        
        // Check if there are more pages
        hasMore = users.users.length === 1000;
        page++;
      } else {
        hasMore = false;
      }
    }
    
    console.log(`\n✅ Total users found: ${allUsers.length}\n`);
    return allUsers;
  } catch (error) {
    console.error('❌ Error getting users:', error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting support email campaign to all users...\n');
  
  try {
    // Get all users
    const allUsers = await getAllUsers();
    
    if (allUsers.length === 0) {
      console.log('⚠️  No users found in database');
      return;
    }
    
    // Statistics
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // Process each user
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const email = user.email;
      
      if (!email) {
        console.log(`⚠️  Skipping user ${user.id} - no email address`);
        continue;
      }
      
      console.log(`[${i + 1}/${allUsers.length}] 📧 Sending to: ${email}`);
      
      const result = await sendSupportEmailToUser(email);
      
      if (result.success) {
        successCount++;
        console.log(`   ✅ Sent successfully (Message ID: ${result.messageId})`);
      } else {
        errorCount++;
        errors.push({ email, error: result.error });
        console.log(`   ❌ Failed: ${result.error}`);
      }
      
      // Add a small delay to avoid rate limiting
      if (i < allUsers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Campaign Summary');
    console.log('='.repeat(60));
    console.log(`✅ Successfully sent: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`📧 Total users processed: ${allUsers.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(({ email, error }) => {
        console.log(`   ${email}: ${error}`);
      });
    }
    
    console.log('\n');
  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => {
    console.log('✅ Campaign completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

