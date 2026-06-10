#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Email configuration
const emailEnabled = process.env.NODEMAILER_HOST && 
                     process.env.NODEMAILER_PORT && 
                     process.env.NODEMAILER_USER && 
                     process.env.NODEMAILER_PASS && 
                     process.env.NODEMAILER_FROM;

if (!emailEnabled) {
  console.error('❌ Email service is not configured');
  process.exit(1);
}

const smtpHost = process.env.NODEMAILER_HOST || '';
const isBrevo = smtpHost.includes('brevo.com') || smtpHost.includes('sendinblue.com');

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: parseInt(process.env.NODEMAILER_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.NODEMAILER_USER,
    pass: process.env.NODEMAILER_PASS,
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    servername: isBrevo ? 'smtp-relay.sendinblue.com' : undefined,
    checkServerIdentity: isBrevo ? () => undefined : undefined,
  },
  requireTLS: true,
});

// Test mode flags
const TEST_MODE = process.argv.includes('--test');
const TEST_WITH_SUPPORT = process.argv.includes('--test-support');
const SEND_TO_ALL = process.argv.includes('--send');

// Support email for testing
const supportEmail = process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech';

// Get event statistics
async function getEventStatistics() {
  try {
    console.log('📊 Gathering event statistics...\n');
    
    // Total speakers
    const { count: totalSpeakers, error: speakersError } = await supabase
      .from('bsl_speakers')
      .select('id', { count: 'exact', head: true });
    
    // Active speakers (with user_id)
    const { count: activeSpeakers, error: activeSpeakersError } = await supabase
      .from('bsl_speakers')
      .select('id', { count: 'exact', head: true })
      .not('user_id', 'is', null);
    
    // Total users with active passes
    const { count: totalUsers, error: usersError } = await supabase
      .from('passes')
      .select('user_id', { count: 'exact', head: true })
      .eq('event_id', 'bsl2025')
      .eq('status', 'active');
    
    // Total meeting requests
    const { data: allRequests, error: requestsError } = await supabase
      .from('meeting_requests')
      .select('id, status, created_at');
    
    // Total meetings (confirmed)
    const { count: totalMeetings, error: meetingsError } = await supabase
      .from('meetings')
      .select('id', { count: 'exact', head: true });
    
    // Meeting request statistics
    const totalMeetingRequests = allRequests?.length || 0;
    const pendingRequests = allRequests?.filter(r => r.status === 'pending').length || 0;
    const acceptedRequests = allRequests?.filter(r => r.status === 'accepted' || r.status === 'approved').length || 0;
    const declinedRequests = allRequests?.filter(r => r.status === 'declined').length || 0;
    const cancelledRequests = allRequests?.filter(r => r.status === 'cancelled').length || 0;
    
    // Calculate acceptance rate
    const respondedRequests = totalMeetingRequests - pendingRequests - cancelledRequests;
    const acceptanceRate = respondedRequests > 0 
      ? ((acceptedRequests / respondedRequests) * 100).toFixed(1)
      : 0;
    
    // Get unique users who made requests
    const { data: uniqueRequesters, error: uniqueRequestersError } = await supabase
      .from('meeting_requests')
      .select('requester_id')
      .limit(1000);
    
    const uniqueRequestersCount = new Set(uniqueRequesters?.map(r => r.requester_id) || []).size;
    
    // Get passes breakdown by type
    const { data: passesByType, error: passesByTypeError } = await supabase
      .from('passes')
      .select('pass_type')
      .eq('event_id', 'bsl2025')
      .eq('status', 'active');
    
    const passesBreakdown = {
      general: passesByType?.filter(p => p.pass_type === 'general').length || 0,
      business: passesByType?.filter(p => p.pass_type === 'business').length || 0,
      vip: passesByType?.filter(p => p.pass_type === 'vip').length || 0,
    };
    
    // Calculate average requests per user
    const avgRequestsPerUser = uniqueRequestersCount > 0 
      ? (totalMeetingRequests / uniqueRequestersCount).toFixed(1)
      : 0;
    
    const stats = {
      totalSpeakers: totalSpeakers || 0,
      activeSpeakers: activeSpeakers || 0,
      totalUsers: totalUsers || 0,
      totalMeetingRequests,
      pendingRequests,
      acceptedRequests,
      declinedRequests,
      cancelledRequests,
      totalMeetings: totalMeetings || 0,
      acceptanceRate: parseFloat(acceptanceRate),
      uniqueRequestersCount,
      avgRequestsPerUser: parseFloat(avgRequestsPerUser),
      passesBreakdown
    };
    
    console.log('✅ Statistics gathered:');
    console.log(`   📊 Total Speakers: ${stats.totalSpeakers}`);
    console.log(`   🎤 Active Speakers: ${stats.activeSpeakers}`);
    console.log(`   👥 Total Users: ${stats.totalUsers}`);
    console.log(`   📨 Total Meeting Requests: ${stats.totalMeetingRequests}`);
    console.log(`   ✅ Accepted Requests: ${stats.acceptedRequests}`);
    console.log(`   🤝 Total Meetings Confirmed: ${stats.totalMeetings}`);
    console.log(`   📈 Acceptance Rate: ${stats.acceptanceRate}%`);
    console.log(`   👤 Unique Requesters: ${stats.uniqueRequestersCount}`);
    console.log(`   📊 Avg Requests per User: ${stats.avgRequestsPerUser}`);
    console.log(`   🎫 Passes: General: ${stats.passesBreakdown.general}, Business: ${stats.passesBreakdown.business}, VIP: ${stats.passesBreakdown.vip}\n`);
    
    return stats;
  } catch (error) {
    console.error('❌ Error gathering statistics:', error);
    throw error;
  }
}

// Generate closing thank you email (bilingual: Spanish first, then English)
function generateClosingEmail(stats) {
  const appUrl = 'https://bsl2025.hashpass.tech';
  
  const emailContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>¡Gracias por ser parte de BSL 2025! / Thank you for being part of BSL 2025!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); padding: 50px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700;">¡Gracias por ser parte de BSL 2025! / Thank you for being part of BSL 2025!</h1>
              <p style="color: #ffffff; margin: 20px 0 0 0; font-size: 18px; opacity: 0.95; font-weight: 500;">Un evento sin precedentes en Latinoamérica / An unprecedented event in Latin America</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <!-- Introduction -->
              <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 0 0 30px 0;">
                Queridos asistentes, speakers y colaboradores,<br>
                <span style="color: #86868b; font-size: 14px;">Dear attendees, speakers and collaborators,</span>
              </p>
              
              <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 0 0 30px 0;">
                Desde el equipo de <strong>HashPass</strong>, queremos expresar nuestra <strong>gratitud enorme</strong> por haber sido parte de este evento tan importante en la región. BSL 2025 ha sido un hito histórico que ha reunido a las mentes más brillantes de la industria blockchain y tecnología en Latinoamérica.
              </p>
              
              <p style="color: #86868b; font-size: 14px; line-height: 1.6; margin: 0 0 30px 0; font-style: italic;">
                From the <strong>HashPass</strong> team, we want to express our <strong>enormous gratitude</strong> for being part of this important event in the region. BSL 2025 has been a historic milestone that has brought together the brightest minds in the blockchain and technology industry in Latin America.
              </p>
              
              <!-- Statistics Section -->
              <div style="background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); border: 2px solid #4ECDC4; border-radius: 12px; padding: 30px; margin: 30px 0;">
                <h2 style="color: #1d1d1f; margin: 0 0 10px 0; font-size: 24px; font-weight: 700; text-align: center;">📊 Estadísticas del Evento</h2>
                <p style="color: #86868b; font-size: 14px; text-align: center; margin: 0 0 25px 0; font-style: italic;">Event Statistics</p>
                
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                  <tr>
                    <td style="padding: 15px; background: #ffffff; border-radius: 8px; margin-bottom: 10px;">
                      <div style="text-align: center;">
                        <div style="font-size: 36px; font-weight: 700; color: #4ECDC4; margin-bottom: 5px;">${stats.totalSpeakers}</div>
                        <div style="font-size: 14px; color: #86868b; font-weight: 600;">Speakers Totales</div>
                        <div style="font-size: 12px; color: #86868b; margin-top: 2px; font-style: italic;">Total Speakers</div>
                      </div>
                    </td>
                    <td width="10"></td>
                    <td style="padding: 15px; background: #ffffff; border-radius: 8px;">
                      <div style="text-align: center;">
                        <div style="font-size: 36px; font-weight: 700; color: #4ECDC4; margin-bottom: 5px;">${stats.activeSpeakers}</div>
                        <div style="font-size: 14px; color: #86868b; font-weight: 600;">Speakers Activos</div>
                        <div style="font-size: 12px; color: #86868b; margin-top: 2px; font-style: italic;">Active Speakers</div>
                      </div>
                    </td>
                  </tr>
                </table>
                
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                  <tr>
                    <td style="padding: 15px; background: #ffffff; border-radius: 8px; margin-bottom: 10px;">
                      <div style="text-align: center;">
                        <div style="font-size: 36px; font-weight: 700; color: #FF6B6B; margin-bottom: 5px;">${stats.totalUsers}</div>
                        <div style="font-size: 14px; color: #86868b; font-weight: 600;">Asistentes Totales</div>
                        <div style="font-size: 12px; color: #86868b; margin-top: 2px; font-style: italic;">Total Attendees</div>
                      </div>
                    </td>
                    <td width="10"></td>
                    <td style="padding: 15px; background: #ffffff; border-radius: 8px;">
                      <div style="text-align: center;">
                        <div style="font-size: 36px; font-weight: 700; color: #FF6B6B; margin-bottom: 5px;">${stats.totalMeetingRequests}</div>
                        <div style="font-size: 14px; color: #86868b; font-weight: 600;">Solicitudes de Reunión</div>
                        <div style="font-size: 12px; color: #86868b; margin-top: 2px; font-style: italic;">Meeting Requests</div>
                      </div>
                    </td>
                  </tr>
                </table>
                
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                  <tr>
                    <td style="padding: 15px; background: #ffffff; border-radius: 8px; margin-bottom: 10px;">
                      <div style="text-align: center;">
                        <div style="font-size: 36px; font-weight: 700; color: #4ECDC4; margin-bottom: 5px;">${stats.acceptedRequests}</div>
                        <div style="font-size: 14px; color: #86868b; font-weight: 600;">Solicitudes Aceptadas</div>
                        <div style="font-size: 12px; color: #86868b; margin-top: 2px; font-style: italic;">Accepted Requests</div>
                      </div>
                    </td>
                    <td width="10"></td>
                    <td style="padding: 15px; background: #ffffff; border-radius: 8px;">
                      <div style="text-align: center;">
                        <div style="font-size: 36px; font-weight: 700; color: #4ECDC4; margin-bottom: 5px;">${stats.totalMeetings}</div>
                        <div style="font-size: 14px; color: #86868b; font-weight: 600;">Reuniones Confirmadas</div>
                        <div style="font-size: 12px; color: #86868b; margin-top: 2px; font-style: italic;">Confirmed Meetings</div>
                      </div>
                    </td>
                  </tr>
                </table>
                
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 15px; background: #ffffff; border-radius: 8px; margin-bottom: 10px;">
                      <div style="text-align: center;">
                        <div style="font-size: 36px; font-weight: 700; color: #FF6B6B; margin-bottom: 5px;">${stats.acceptanceRate}%</div>
                        <div style="font-size: 14px; color: #86868b; font-weight: 600;">Tasa de Aceptación</div>
                        <div style="font-size: 12px; color: #86868b; margin-top: 2px; font-style: italic;">Acceptance Rate</div>
                      </div>
                    </td>
                    <td width="10"></td>
                    <td style="padding: 15px; background: #ffffff; border-radius: 8px;">
                      <div style="text-align: center;">
                        <div style="font-size: 36px; font-weight: 700; color: #FF6B6B; margin-bottom: 5px;">${stats.avgRequestsPerUser}</div>
                        <div style="font-size: 14px; color: #86868b; font-weight: 600;">Promedio por Usuario</div>
                        <div style="font-size: 12px; color: #86868b; margin-top: 2px; font-style: italic;">Avg per User</div>
                      </div>
                    </td>
                  </tr>
                </table>
                
                <div style="margin-top: 20px; padding: 15px; background: #ffffff; border-radius: 8px; text-align: center;">
                  <div style="font-size: 14px; color: #86868b; margin-bottom: 8px;">Distribución de Passes / Pass Distribution:</div>
                  <div style="font-size: 16px; color: #1d1d1f; font-weight: 600;">
                    General: ${stats.passesBreakdown.general} | Business: ${stats.passesBreakdown.business} | VIP: ${stats.passesBreakdown.vip}
                  </div>
                </div>
              </div>
              
              <!-- Thank you section -->
              <div style="margin: 40px 0;">
                <h2 style="color: #1d1d1f; margin: 0 0 10px 0; font-size: 22px; font-weight: 700;">🙏 Agradecimientos Especiales</h2>
                <p style="color: #86868b; font-size: 14px; margin: 0 0 20px 0; font-style: italic;">Special Acknowledgments</p>
                
                <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 0 0 15px 0;">
                  Queremos agradecer especialmente a <strong>Rodrigo</strong> por el <strong>monumental trabajo realizado</strong> para lograr un evento sin precedentes en LATAM. Tu dedicación, visión y esfuerzo incansable han sido fundamentales para hacer de BSL 2025 una realidad que marcará el inicio de una gran apertura de comunidades cross latinoamericanas.
                </p>
                <p style="color: #86868b; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; font-style: italic;">
                  We especially want to thank <strong>Rodrigo</strong> for the <strong>monumental work done</strong> to achieve an unprecedented event in LATAM. Your dedication, vision and tireless effort have been fundamental to making BSL 2025 a reality that will mark the beginning of a great opening of cross-Latin American communities.
                </p>
                
                <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 0 0 15px 0;">
                  También queremos reconocer a nuestros valiosos colaboradores del equipo BSL: <strong>Juli, Julian y Laura</strong>, y al resto de colaboradores del equipo. Su compromiso y trabajo en equipo han sido esenciales para el éxito de este evento.
                </p>
                <p style="color: #86868b; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; font-style: italic;">
                  We also want to recognize our valuable collaborators from the BSL team: <strong>Juli, Julian and Laura</strong>, and the rest of the team collaborators. Their commitment and teamwork have been essential to the success of this event.
                </p>
                
                <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 0 0 15px 0;">
                  Un agradecimiento especial a la <strong>Universidad EAFIT</strong> por su invaluable apoyo y colaboración en la realización de este evento histórico.
                </p>
                <p style="color: #86868b; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; font-style: italic;">
                  A special thanks to <strong>EAFIT University</strong> for their invaluable support and collaboration in making this historic event possible.
                </p>
                
                <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 0 0 15px 0;">
                  Queremos agradecer a <strong>todos los que hicieron posible este evento</strong>. Cada persona, organización y colaborador que contribuyó con su tiempo, esfuerzo y dedicación para hacer de BSL 2025 una realidad sin precedentes.
                </p>
                <p style="color: #86868b; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; font-style: italic;">
                  We want to thank <strong>everyone who made this event possible</strong>. Every person, organization and collaborator who contributed with their time, effort and dedication to make BSL 2025 an unprecedented reality.
                </p>
                
                <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 0 0 15px 0;">
                  Y finalmente, <strong>gracias a todos los asistentes</strong> que hicieron de BSL 2025 una experiencia única. Su participación activa, networking y entusiasmo han sido la fuerza motriz de este evento histórico.
                </p>
                <p style="color: #86868b; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; font-style: italic;">
                  And finally, <strong>thank you to all attendees</strong> who made BSL 2025 a unique experience. Your active participation, networking and enthusiasm have been the driving force of this historic event.
                </p>
              </div>
              
              <!-- Feedback section -->
              <div style="background: #f8f9fa; border-left: 4px solid #4ECDC4; padding: 20px; border-radius: 8px; margin: 30px 0;">
                <h3 style="color: #1d1d1f; margin: 0 0 10px 0; font-size: 18px; font-weight: 700;">💬 Tu Opinión Importa</h3>
                <p style="color: #86868b; font-size: 12px; margin: 0 0 15px 0; font-style: italic;">Your Opinion Matters</p>
                <p style="color: #1d1d1f; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">
                  Estamos siempre atentos a mejorar. Si tienes reportes de bugs, sugerencias o feedback, no dudes en contactarnos. Tu experiencia es nuestra prioridad y cada comentario nos ayuda a crecer.
                </p>
                <p style="color: #86868b; font-size: 13px; line-height: 1.5; margin: 0; font-style: italic;">
                  We are always attentive to improve. If you have bug reports, suggestions or feedback, don't hesitate to contact us. Your experience is our priority and every comment helps us grow.
                </p>
              </div>
              
              <!-- Closing -->
              <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 30px 0 0 0; text-align: center; font-weight: 600;">
                ¡Nos vemos en la próxima! 🚀
              </p>
              <p style="color: #86868b; font-size: 14px; line-height: 1.6; margin: 5px 0 0 0; text-align: center; font-style: italic;">
                See you next time! 🚀
              </p>
              
              <p style="color: #86868b; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0; text-align: center;">
                Con gratitud,<br>
                <span style="color: #86868b; font-size: 12px; font-style: italic;">With gratitude,</span><br>
                <strong style="color: #1d1d1f;">El equipo de HashPass</strong><br>
                <span style="color: #86868b; font-size: 12px; font-style: italic;">The HashPass Team</span>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f5f5f7; text-align: center; border-top: 1px solid #e5e5e7;">
              <p style="color: #86868b; font-size: 12px; margin: 0 0 10px 0;">
                Este es un email automático del sistema de BSL 2025. / This is an automated email from the BSL 2025 system.
              </p>
              <p style="color: #86868b; font-size: 12px; margin: 0;">
                <a href="${appUrl}" style="color: #007AFF; text-decoration: none;">HashPass</a> | 
                <a href="https://blockchainsummit.la/" style="color: #007AFF; text-decoration: none;">BSL 2025</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
  
  return emailContent;
}

// Send closing email
async function sendClosingEmail(email, userName, stats, isTest = false) {
  try {
    const subject = isTest 
      ? `[TEST] ¡Gracias por ser parte de BSL 2025! / Thank you for being part of BSL 2025!`
      : `¡Gracias por ser parte de BSL 2025! / Thank you for being part of BSL 2025!`;
    const htmlContent = generateClosingEmail(stats);
    
    const appUrl = 'https://bsl2025.hashpass.tech';
    
    const textContent = `${isTest ? '[TEST] ' : ''}¡Gracias por ser parte de BSL 2025! / Thank you for being part of BSL 2025!

Queridos asistentes, speakers y colaboradores,
Dear attendees, speakers and collaborators,

Desde el equipo de HashPass, queremos expresar nuestra gratitud enorme por haber sido parte de este evento tan importante en la región. BSL 2025 ha sido un hito histórico que ha reunido a las mentes más brillantes de la industria blockchain y tecnología en Latinoamérica.
From the HashPass team, we want to express our enormous gratitude for being part of this important event in the region. BSL 2025 has been a historic milestone that has brought together the brightest minds in the blockchain and technology industry in Latin America.

📊 Estadísticas del Evento / Event Statistics:
- Speakers Totales / Total Speakers: ${stats.totalSpeakers}
- Speakers Activos / Active Speakers: ${stats.activeSpeakers}
- Asistentes Totales / Total Attendees: ${stats.totalUsers}
- Solicitudes de Reunión / Meeting Requests: ${stats.totalMeetingRequests}
- Solicitudes Aceptadas / Accepted Requests: ${stats.acceptedRequests}
- Reuniones Confirmadas / Confirmed Meetings: ${stats.totalMeetings}
- Tasa de Aceptación / Acceptance Rate: ${stats.acceptanceRate}%

Agradecemos especialmente a Rodrigo por el monumental trabajo realizado para lograr un evento sin precedentes en LATAM. También queremos reconocer a nuestros valiosos colaboradores del equipo BSL: Juli, Julian y Laura, y al resto de colaboradores del equipo. Un agradecimiento especial a la Universidad EAFIT por su invaluable apoyo y colaboración. Y queremos agradecer a todos los que hicieron posible este evento. Finalmente, gracias a todos los asistentes que hicieron de BSL 2025 una experiencia única.
We especially thank Rodrigo for the monumental work done to achieve an unprecedented event in LATAM. We also want to recognize our valuable collaborators from the BSL team: Juli, Julian and Laura, and the rest of the team collaborators. A special thanks to EAFIT University for their invaluable support and collaboration. And we want to thank everyone who made this event possible. Finally, thank you to all attendees who made BSL 2025 a unique experience.

Estamos siempre atentos a mejorar. Si tienes reportes de bugs, sugerencias o feedback, no dudes en contactarnos.
We are always attentive to improve. If you have bug reports, suggestions or feedback, don't hesitate to contact us.

¡Nos vemos en la próxima! / See you next time! 🚀

Con gratitud / With gratitude,
El equipo de HashPass / The HashPass Team
${appUrl}`;
    
    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
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

// Main function
async function main() {
  try {
    if (TEST_WITH_SUPPORT) {
      console.log('🧪 TEST MODE: Testing closing email with support...\n');
    } else if (TEST_MODE) {
      console.log('🧪 TEST MODE: Testing with sample data...\n');
    } else if (SEND_TO_ALL) {
      console.log('📤 SEND MODE: Sending closing emails to all users...\n');
    } else {
      console.log('ℹ️  DRY RUN MODE: Use --test-support to test with support, --send to send to all users\n');
    }
    
    // Get statistics
    const stats = await getEventStatistics();
    
    // If testing with support, send test email
    if (TEST_WITH_SUPPORT) {
      console.log('🧪 Sending test email to support...\n');
      
      const testEmailResult = await sendClosingEmail(
        supportEmail,
        'Test User',
        stats,
        true
      );
      
      if (testEmailResult.success) {
        console.log(`✅ Test email sent successfully to ${supportEmail}`);
        console.log(`   Message ID: ${testEmailResult.messageId}\n`);
        console.log('✅ TEST COMPLETE - Review the email and statistics above');
        console.log('   If everything looks good, run with --send to send to all users\n');
      } else {
        console.error(`❌ Failed to send test email: ${testEmailResult.error}`);
        process.exit(1);
      }
      
      return;
    }
    
    // If not sending to users, just show what would be done
    if (!SEND_TO_ALL) {
      console.log('ℹ️  DRY RUN - No emails will be sent');
      console.log('   Use --test-support to test with support email');
      console.log('   Use --send to actually send emails to all users\n');
      return;
    }
    
    // Get all users with active passes
    console.log('📋 Fetching all users with active passes...');
    const { data: passes, error: passesError } = await supabase
      .from('passes')
      .select('user_id')
      .eq('event_id', 'bsl2025')
      .eq('status', 'active');
    
    if (passesError) {
      console.error('❌ Error fetching passes:', passesError);
      process.exit(1);
    }
    
    const uniqueUserIds = [...new Set(passes.map(p => p.user_id))];
    console.log(`✅ Found ${uniqueUserIds.length} unique users with active passes\n`);
    
    // Get user details
    console.log('📋 Fetching user details...');
    let allUsers = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
        page: page,
        perPage: 1000
      });
      
      if (usersError) {
        console.error('❌ Error fetching users:', usersError);
        break;
      }
      
      if (usersData && usersData.users && usersData.users.length > 0) {
        allUsers = allUsers.concat(usersData.users);
        hasMore = usersData.users.length === 1000;
        page++;
      } else {
        hasMore = false;
      }
    }
    
    // Filter users with active passes
    const usersToEmail = allUsers.filter(u => 
      uniqueUserIds.includes(u.id) && u.email
    );
    
    console.log(`✅ Found ${usersToEmail.length} users to email\n`);
    
    if (usersToEmail.length === 0) {
      console.log('⚠️  No users found to email');
      return;
    }
    
    // Process each user
    console.log('='.repeat(60));
    console.log('📤 Sending closing emails...\n');
    console.log('='.repeat(60));
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const user of usersToEmail) {
      try {
        const userName = user.user_metadata?.name || user.user_metadata?.full_name || user.email.split('@')[0];
        
        console.log(`📧 Sending to: ${userName} (${user.email})`);
        
        const emailResult = await sendClosingEmail(
          user.email,
          userName,
          stats,
          false
        );
        
        if (emailResult.success) {
          console.log(`   ✅ Email sent successfully`);
          successCount++;
        } else {
          console.log(`   ❌ Failed to send email: ${emailResult.error}`);
          errorCount++;
        }
        
        // Delay between emails
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`   💥 Exception: ${error.message}`);
        errorCount++;
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total users: ${usersToEmail.length}`);
    console.log(`✅ Successfully sent: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();

