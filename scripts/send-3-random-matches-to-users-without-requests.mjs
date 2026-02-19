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
const SEND_TO_USERS = process.argv.includes('--send');

// Support email for testing
const supportEmail = process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech';

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

// Check if user has any meeting requests
async function userHasNoRequests(userId) {
  try {
    const { data, error } = await supabase
      .from('meeting_requests')
      .select('id')
      .eq('requester_id', userId)
      .limit(1);

    if (error) {
      console.warn(`⚠️  Error checking requests for user ${userId}:`, error.message);
      return false; // Assume they have requests if we can't check
    }

    return !data || data.length === 0;
  } catch (error) {
    console.warn(`⚠️  Error checking requests for user ${userId}:`, error.message);
    return false;
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

// Bilingual email translations for 3 matches recommendation (Spanish first)
const matchTranslations = {
  title: '🎯 Recomendaciones de Speakers / Speaker Recommendations - BSL 2025',
  greeting: (name) => `¡Hola ${name} / Hello ${name}!`,
  subtitle: '¡Encontramos 3 matches perfectos para ti! / We found 3 great matches for you!',
  intro1: 'Basado en nuestro algoritmo de matching, hemos identificado <strong>3 speakers excepcionales</strong> que se alinean perfectamente con tu perfil e intereses. / Based on our matching algorithm, we\'ve identified <strong>3 exceptional speakers</strong> who align perfectly with your profile and interests.',
  intro2: 'Hemos enviado solicitudes de reunión a estos speakers en tu nombre. ¡Estas son recomendaciones especiales que creemos conducirán a conexiones valiosas! / We\'ve sent meeting requests to these speakers on your behalf. These are special recommendations we believe will lead to valuable connections!',
  viewProfile: 'Ver Perfil / View Profile',
  viewAllRequests: 'Ver Mis Solicitudes / View My Requests',
  footer: 'Este es un email automático del sistema de matchmaking de BSL 2025. / This is an automated email from the BSL 2025 matchmaking system.'
};

// Generate bilingual email HTML for 3 matches recommendation
function generateMatchesEmail(userName, speakers) {
  const appUrl = 'https://bsl2025.hashpass.tech';
  
  // Generate speaker cards HTML
  const speakerCards = speakers.map((speaker, index) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; border: 2px solid #4ECDC4; border-radius: 12px; overflow: hidden; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);">
      <tr>
        <td style="padding: 20px;">
          <div style="text-align: center; margin-bottom: 15px;">
            <span style="background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); color: #ffffff; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Match ${index + 1}</span>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="80" valign="top" style="padding-right: 15px;">
                ${speaker.imageurl ? `
                  <img src="${speaker.imageurl}" alt="${speaker.name}" style="width: 80px; height: 80px; border-radius: 10px; object-fit: cover; display: block; border: 2px solid #4ECDC4;">
                ` : `
                  <div style="width: 80px; height: 80px; border-radius: 10px; background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 24px; font-weight: 600; border: 2px solid #4ECDC4;">
                    ${speaker.name.charAt(0).toUpperCase()}
                  </div>
                `}
              </td>
              <td valign="top">
                <h3 style="color: #1d1d1f; margin: 0 0 6px 0; font-size: 18px; font-weight: 700;">${speaker.name}</h3>
                ${speaker.title ? `<p style="color: #4ECDC4; margin: 0 0 6px 0; font-size: 14px; font-weight: 600;">${speaker.title}</p>` : ''}
                ${speaker.company ? `<p style="color: #86868b; margin: 0 0 10px 0; font-size: 13px;">${speaker.company}</p>` : ''}
                ${speaker.bio ? `<p style="color: #1d1d1f; margin: 10px 0 0 0; font-size: 14px; line-height: 1.5;">${speaker.bio.substring(0, 150)}${speaker.bio.length > 150 ? '...' : ''}</p>` : ''}
                <a href="${appUrl}/events/bsl2025/speakers/${speaker.id}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600; box-shadow: 0 3px 10px rgba(78, 205, 196, 0.3);">${matchTranslations.viewProfile}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `).join('');
  
  const emailContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${matchTranslations.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">${matchTranslations.greeting(userName)}</h1>
              <p style="color: #ffffff; margin: 15px 0 0 0; font-size: 18px; opacity: 0.95; font-weight: 500;">${matchTranslations.subtitle}</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0;">
                ${matchTranslations.intro1}
              </p>
              
              <p style="color: #1d1d1f; font-size: 16px; line-height: 1.8; margin: 0 0 30px 0;">
                ${matchTranslations.intro2}
              </p>
              
              <!-- Speaker Cards -->
              ${speakerCards}
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                <tr>
                  <td align="center">
                    <a href="${appUrl}/events/bsl2025/networking" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);">${matchTranslations.viewAllRequests}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f5f5f7; text-align: center; border-top: 1px solid #e5e5e7;">
              <p style="color: #86868b; font-size: 12px; margin: 0 0 10px 0;">
                ${matchTranslations.footer}
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

// Send bilingual matches recommendation email
async function sendMatchesEmail(email, userName, speakers, isTest = false) {
  try {
    const subject = isTest 
      ? `[TEST] ${matchTranslations.title}`
      : matchTranslations.title;
    const htmlContent = generateMatchesEmail(userName, speakers);
    
    const speakerList = speakers.map(s => 
      `${s.name}${s.title ? ` - ${s.title}` : ''}${s.company ? ` at ${s.company}` : ''}`
    ).join('\n');
    
    const textContent = `${isTest ? '[TEST] ' : ''}${matchTranslations.greeting(userName)}\n\n${matchTranslations.subtitle}\n\n${speakerList}\n\nVisita tu perfil para ver más detalles / Visit your profile to see more details:\nhttps://bsl2025.hashpass.tech/events/bsl2025/networking`;
    
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
      console.log('🧪 TEST MODE: Testing email and matches with support first...\n');
    } else if (TEST_MODE) {
      console.log('🧪 TEST MODE: Testing with sample data...\n');
    } else if (SEND_TO_USERS) {
      console.log('📤 SEND MODE: Sending to users without requests...\n');
    } else {
      console.log('ℹ️  DRY RUN MODE: Use --test-support to test with support, --send to send to users\n');
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
    
    if (activeSpeakers.length < 3) {
      console.error('❌ Need at least 3 active speakers to create matches');
      process.exit(1);
    }
    
    // If testing with support, send test email
    if (TEST_WITH_SUPPORT) {
      console.log('🧪 Sending test email to support...\n');
      
      // Select 3 random speakers for testing
      const shuffled = shuffleArray(activeSpeakers);
      const testSpeakers = shuffled.slice(0, 3);
      
      console.log('📋 Test matches:');
      testSpeakers.forEach((speaker, index) => {
        console.log(`   ${index + 1}. ${speaker.name}${speaker.title ? ` - ${speaker.title}` : ''}`);
      });
      console.log();
      
      // Create test meeting requests (but don't actually create them, just show what would be created)
      console.log('📝 Would create meeting requests for:');
      testSpeakers.forEach((speaker, index) => {
        console.log(`   ${index + 1}. ${speaker.name} (ID: ${speaker.id})`);
      });
      console.log();
      
      // Send test email to support
      const testEmailResult = await sendMatchesEmail(
        supportEmail,
        'Test User',
        testSpeakers,
        true
      );
      
      if (testEmailResult.success) {
        console.log(`✅ Test email sent successfully to ${supportEmail}`);
        console.log(`   Message ID: ${testEmailResult.messageId}\n`);
        console.log('✅ TEST COMPLETE - Review the email and matches above');
        console.log('   If everything looks good, run with --send to send to actual users\n');
      } else {
        console.error(`❌ Failed to send test email: ${testEmailResult.error}`);
        process.exit(1);
      }
      
      return;
    }
    
    // If not sending to users, just show what would be done
    if (!SEND_TO_USERS) {
      console.log('ℹ️  DRY RUN - No emails will be sent');
      console.log('   Use --test-support to test with support email');
      console.log('   Use --send to actually send emails to users\n');
      return;
    }
    
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
    
    // Filter users with active passes and no requests
    console.log('📋 Filtering users with active passes and NO meeting requests...');
    const usersWithoutRequests = [];
    
    for (const user of allUsers) {
      if (!user.email) continue;
      
      // Check for active pass
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
      
      if (!passes || passes.length === 0) {
        continue; // No active pass
      }
      
      // Check if user has no meeting requests
      const hasNoRequests = await userHasNoRequests(user.id);
      
      if (hasNoRequests) {
        usersWithoutRequests.push({
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || user.user_metadata?.full_name || user.email.split('@')[0],
          passType: passes[0].pass_type || 'general',
          user_metadata: user.user_metadata || {}
        });
      }
    }
    
    console.log(`✅ Found ${usersWithoutRequests.length} users with active passes and NO meeting requests\n`);
    
    if (usersWithoutRequests.length === 0) {
      console.log('⚠️  No users found without meeting requests');
      return;
    }
    
    // Process each user
    console.log('='.repeat(60));
    console.log('📤 Processing users and creating matches...\n');
    console.log('='.repeat(60));
    
    let successCount = 0;
    let errorCount = 0;
    const results = [];
    
    for (const user of usersWithoutRequests) {
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
          // Exclude if speaker name contains user email domain
          if (s.name.toLowerCase().includes(userEmailDomain)) {
            return false;
          }
          return true;
        });
        
        if (availableSpeakers.length < 3) {
          console.log(`   ⚠️  Not enough available speakers (${availableSpeakers.length} available, need 3)`);
          errorCount++;
          continue;
        }
        
        // Randomly select 3 speakers
        const shuffled = shuffleArray(availableSpeakers);
        const selectedSpeakers = shuffled.slice(0, 3);
        
        console.log(`   ⭐ Selected 3 Matches:`);
        selectedSpeakers.forEach((speaker, index) => {
          console.log(`      ${index + 1}. ${speaker.name}`);
        });
        
        // Create meeting requests for all 3 speakers
        const createdRequests = [];
        for (const speaker of selectedSpeakers) {
          const result = await createMeetingRequest(
            user.id,
            user.name,
            user.email,
            speaker.id,
            speaker.name,
            user.passType
          );
          
          if (result.success) {
            createdRequests.push(speaker.name);
            console.log(`   ✅ Request created for ${speaker.name}`);
          } else {
            console.log(`   ❌ Failed to create request for ${speaker.name}: ${result.error}`);
          }
        }
        
        if (createdRequests.length === 0) {
          console.log(`   ❌ No requests were created successfully`);
          errorCount++;
          continue;
        }
        
        // Send email with all 3 matches
        console.log(`   🌐 Sending email with ${createdRequests.length} matches`);
        
        const emailResult = await sendMatchesEmail(
          user.email,
          user.name,
          selectedSpeakers.filter(s => createdRequests.includes(s.name)),
          false
        );
        
        if (emailResult.success) {
          console.log(`   ✅ Email sent successfully`);
          successCount++;
          results.push({
            user: user.email,
            speakers: createdRequests,
            status: 'success'
          });
        } else {
          console.log(`   ❌ Failed to send email: ${emailResult.error}`);
          errorCount++;
          results.push({
            user: user.email,
            speakers: createdRequests,
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
    console.log(`Total users processed: ${usersWithoutRequests.length}`);
    console.log(`✅ Successfully processed: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    
    if (results.length > 0) {
      console.log('\n📋 Detailed Results:');
      results.forEach((result, index) => {
        console.log(`\n${index + 1}. ${result.user}`);
        if (result.speakers) {
          console.log(`   Matches: ${result.speakers.join(', ')}`);
        }
        console.log(`   Status: ${result.status}`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      });
    }
    
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();









