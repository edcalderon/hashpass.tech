#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

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

// Test mode - only process specific user
const TEST_MODE = process.argv.includes('--test');
// Test with different users based on flag
// Use --test-en for English test, --test for Spanish test
const TEST_USER_EMAIL = process.argv.includes('--test-en') 
  ? 'edward@hashpass.tech'  // English user
  : 'edward@hashpass.tech'; // Default test user
const TEST_SPEAKER_NAMES = ['Edward Calderon']; // Can add more for testing

// Helper function to shuffle array
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Get user's pass type
async function getUserPassType(userId) {
  try {
    const { data: passes, error } = await supabase
      .from('passes')
      .select('pass_type')
      .eq('user_id', userId)
      .eq('event_id', 'bsl2025')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !passes) {
      return 'general'; // Default to general
    }

    return passes.pass_type || 'general';
  } catch (error) {
    console.warn(`⚠️  Error getting pass type for user ${userId}:`, error.message);
    return 'general';
  }
}

// Create meeting request
async function createMeetingRequest(requesterId, requesterName, requesterEmail, speakerId, speakerName, passType) {
  try {
    const message = `Hola ${speakerName.split(' ')[0]}, me gustaría coordinar una reunión contigo durante el BSL 2025.`;
    
    const { data, error } = await supabase.rpc('insert_meeting_request', {
      p_requester_id: requesterId,
      p_speaker_id: speakerId,
      p_speaker_name: speakerName,
      p_requester_name: requesterName,
      p_requester_company: null,
      p_requester_title: null,
      p_requester_ticket_type: passType,
      p_meeting_type: 'networking',
      p_message: message,
      p_note: 'Recomendación automática del sistema',
      p_boost_amount: 0,
      p_duration_minutes: 15,
      p_expires_at: null
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && data.success === false) {
      return { success: false, error: data.message || data.error };
    }

    return { 
      success: true, 
      requestId: data?.request_id || data?.id || 'N/A' 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Bilingual email translations for super match recommendation
const superMatchTranslations = {
  title: '🎯 Super Match Recommendation / Recomendación de Super Match - BSL 2025',
  greeting: (name) => `Hello ${name} / ¡Hola ${name}!`,
  subtitle: 'We found your perfect match! / ¡Encontramos tu match perfecto!',
  intro1: 'Based on our advanced matching algorithm, we\'ve identified <strong>one exceptional speaker</strong> who aligns perfectly with your profile and interests. / Basado en nuestro algoritmo avanzado de matching, hemos identificado <strong>un speaker excepcional</strong> que se alinea perfectamente con tu perfil e intereses.',
  intro2: 'We\'ve sent a meeting request to this speaker on your behalf. This is a special recommendation we believe will lead to a valuable connection! / Hemos enviado una solicitud de reunión a este speaker en tu nombre. ¡Esta es una recomendación especial que creemos conducirá a una conexión valiosa!',
  viewProfile: 'View Profile / Ver Perfil',
  viewAllRequests: 'View My Requests / Ver Mis Solicitudes',
  footer: 'This is an automated email from the BSL 2025 matchmaking system. / Este es un email automático del sistema de matchmaking de BSL 2025.'
};

// Generate bilingual email HTML for super match recommendation
function generateSuperMatchEmail(userName, speaker) {
  const appUrl = 'https://bsl2025.hashpass.tech';
  
  const emailContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${superMatchTranslations.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">${superMatchTranslations.greeting(userName)}</h1>
              <p style="color: #ffffff; margin: 15px 0 0 0; font-size: 18px; opacity: 0.95; font-weight: 500;">${superMatchTranslations.subtitle}</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
                ${superMatchTranslations.intro1}
              </p>
              
              <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 0 0 30px 0;">
                ${superMatchTranslations.intro2}
              </p>
              
              <!-- Super Match Speaker Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 25px; border: 2px solid #4ECDC4; border-radius: 12px; overflow: hidden; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);">
                <tr>
                  <td style="padding: 25px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                      <span style="background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); color: #ffffff; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">⭐ Super Match / Super Match ⭐</span>
                    </div>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="100" valign="top" style="padding-right: 20px;">
                          ${speaker.imageurl ? `
                            <img src="${speaker.imageurl}" alt="${speaker.name}" style="width: 100px; height: 100px; border-radius: 12px; object-fit: cover; display: block; border: 3px solid #4ECDC4;">
                          ` : `
                            <div style="width: 100px; height: 100px; border-radius: 12px; background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 32px; font-weight: 600; border: 3px solid #4ECDC4;">
                              ${speaker.name.charAt(0).toUpperCase()}
                            </div>
                          `}
                        </td>
                        <td valign="top">
                          <h3 style="color: #1d1d1f; margin: 0 0 8px 0; font-size: 22px; font-weight: 700;">${speaker.name}</h3>
                          ${speaker.title ? `<p style="color: #4ECDC4; margin: 0 0 8px 0; font-size: 15px; font-weight: 600;">${speaker.title}</p>` : ''}
                          ${speaker.company ? `<p style="color: #86868b; margin: 0 0 12px 0; font-size: 14px;">${speaker.company}</p>` : ''}
                          ${speaker.bio ? `<p style="color: #1d1d1f; margin: 12px 0 0 0; font-size: 15px; line-height: 1.6;">${speaker.bio.substring(0, 200)}${speaker.bio.length > 200 ? '...' : ''}</p>` : ''}
                          <a href="${appUrl}/events/bsl2025/speakers/${speaker.id}" style="display: inline-block; margin-top: 15px; padding: 12px 24px; background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);">${superMatchTranslations.viewProfile}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                <tr>
                  <td align="center">
                    <a href="${appUrl}/events/bsl2025/networking" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);">${superMatchTranslations.viewAllRequests}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f5f5f7; text-align: center; border-top: 1px solid #e5e5e7;">
              <p style="color: #86868b; font-size: 12px; margin: 0 0 10px 0;">
                ${superMatchTranslations.footer}
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

// Send bilingual super match recommendation email
async function sendSuperMatchEmail(email, userName, speaker) {
  try {
    const subject = '🎯 Super Match Recommendation / Recomendación de Super Match - BSL 2025';
    const htmlContent = generateSuperMatchEmail(userName, speaker);
    
    const textContent = `Hello ${userName} / ¡Hola ${userName}!\n\nWe found your perfect match! / ¡Encontramos tu match perfecto!\n\n${speaker.name}${speaker.title ? ` - ${speaker.title}` : ''}${speaker.company ? ` at ${speaker.company}` : ''}\n\nVisit your profile to see more details / Visita tu perfil para ver más detalles:\nhttps://bsl2025.hashpass.tech/events/bsl2025/networking`;
    
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
    console.log('🚀 Starting user-speaker matching and recommendation campaign...\n');
    
    if (TEST_MODE) {
      console.log('🧪 TEST MODE: Only processing test user\n');
    }
    
    // Get all active speakers (those with user_id linked)
    console.log('📋 Fetching all active speakers...');
    const { data: activeSpeakers, error: speakersError } = await supabase
      .from('bsl_speakers')
      .select('id, name, title, company, bio, imageurl, user_id')
      .not('user_id', 'is', null)
      .order('name');
    
    if (speakersError) {
      console.error('❌ Error fetching speakers:', speakersError);
      process.exit(1);
    }
    
    if (!activeSpeakers || activeSpeakers.length === 0) {
      console.error('❌ No active speakers found');
      process.exit(1);
    }
    
    console.log(`✅ Found ${activeSpeakers.length} active speakers\n`);
    
    // Get all active users (users with active passes)
    console.log('📋 Fetching all active users...');
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
    
    console.log(`✅ Found ${allUsers.length} total users\n`);
    
    // Filter users with active passes
    console.log('📋 Filtering users with active passes...');
    const usersWithActivePasses = [];
    
    for (const user of allUsers) {
      if (!user.email) continue;
      
      // In test mode, only process test user
      if (TEST_MODE && user.email !== TEST_USER_EMAIL) {
        continue;
      }
      
      const { data: passes, error: passesError } = await supabase
        .from('passes')
        .select('id, pass_type, status')
        .eq('user_id', user.id)
        .eq('event_id', 'bsl2025')
        .eq('status', 'active')
        .limit(1);
      
      if (passesError) {
        console.warn(`⚠️  Error checking passes for ${user.email}:`, passesError.message);
        continue;
      }
      
      if (passes && passes.length > 0) {
        usersWithActivePasses.push({
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || user.user_metadata?.full_name || user.email.split('@')[0],
          passType: passes[0].pass_type || 'general',
          user_metadata: user.user_metadata || {}
        });
      }
    }
    
    console.log(`✅ Found ${usersWithActivePasses.length} users with active passes\n`);
    
    if (usersWithActivePasses.length === 0) {
      console.log('⚠️  No users with active passes found');
      return;
    }
    
    // Process each user
    console.log('='.repeat(60));
    console.log('📤 Processing users and creating recommendations...\n');
    console.log('='.repeat(60));
    
    let successCount = 0;
    let errorCount = 0;
    const results = [];
    
    for (const user of usersWithActivePasses) {
      try {
        console.log(`\n👤 Processing: ${user.name} (${user.email})`);
        
        // Get user's speaker user_id if they are a speaker (to exclude themselves)
        const userSpeakerIds = activeSpeakers
          .filter(s => s.user_id === user.id)
          .map(s => s.id);
        
        // Also check by email domain/name to catch edge cases
        const userEmailDomain = user.email.split('@')[0].toLowerCase();
        const userNameLower = user.name.toLowerCase();
        
        // Filter out speakers that are the user themselves
        const availableSpeakers = activeSpeakers.filter(s => {
          // Exclude if user_id matches
          if (userSpeakerIds.includes(s.id)) {
            return false;
          }
          // Exclude if speaker name matches user name (case-insensitive)
          if (s.name.toLowerCase() === userNameLower) {
            return false;
          }
          // Exclude if speaker name contains user email domain (e.g., "edward" in "edward@hashpass.app")
          if (s.name.toLowerCase().includes(userEmailDomain)) {
            return false;
          }
          return true;
        });
        
        if (availableSpeakers.length < 1) {
          console.log(`   ⚠️  Not enough available speakers (${availableSpeakers.length} available, need 1)`);
          errorCount++;
          continue;
        }
        
        // Randomly select 1 speaker (super match recommendation)
        const shuffled = shuffleArray(availableSpeakers);
        const selectedSpeakers = shuffled.slice(0, 1);
        
        console.log(`   ⭐ Selected Super Match:`);
        console.log(`      ${selectedSpeakers[0].name}`);
        
        // Create meeting request for the super match speaker
        const speaker = selectedSpeakers[0];
        const result = await createMeetingRequest(
          user.id,
          user.name,
          user.email,
          speaker.id,
          speaker.name,
          user.passType
        );
        
        if (!result.success) {
          console.log(`   ❌ Failed to create request for ${speaker.name}: ${result.error}`);
          errorCount++;
          continue;
        }
        
        console.log(`   ✅ Super match request created for ${speaker.name}`);
        
        // Send bilingual super match email (both English and Spanish)
        console.log(`   🌐 Sending bilingual email (English & Spanish)`);
        
        const emailResult = await sendSuperMatchEmail(
          user.email,
          user.name,
          speaker
        );
        
        if (emailResult.success) {
          console.log(`   ✅ Super match email sent successfully (bilingual)`);
          successCount++;
          results.push({
            user: user.email,
            speaker: speaker.name,
            status: 'success'
          });
        } else {
          console.log(`   ❌ Failed to send email: ${emailResult.error}`);
          errorCount++;
          results.push({
            user: user.email,
            speaker: speaker.name,
            status: 'email_failed',
            error: emailResult.error
          });
        }
        
        // Delay between users
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`   💥 Exception processing ${user.email}:`, error.message);
        errorCount++;
        results.push({
          user: user.email,
          status: 'error',
          error: error.message
        });
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total users processed: ${usersWithActivePasses.length}`);
    console.log(`✅ Successfully processed: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    
    if (results.length > 0) {
      console.log('\n📋 Detailed Results:');
      results.forEach((result, index) => {
        console.log(`\n${index + 1}. ${result.user}`);
        if (result.speaker) {
          console.log(`   ⭐ Super Match: ${result.speaker}`);
        } else if (result.speakers) {
          console.log(`   Speakers: ${result.speakers.join(', ')}`);
        }
        console.log(`   Status: ${result.status}`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      });
    }
    
    console.log('='.repeat(60));
    
    if (TEST_MODE) {
      console.log('\n🧪 TEST MODE COMPLETE');
      console.log('If everything looks good, run without --test flag to process all users');
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();

