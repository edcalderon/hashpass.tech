#!/usr/bin/env node
/**
 * Check and update speakers from the provided list
 */

import { createClient } from '@supabase/supabase-js';
import https from 'https';
import 'dotenv/config';

const BASE_URL = 'https://blockchainsummit.la/teams';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// Speakers from the website with their titles
const speakersFromWeb = [
  { name: 'Claudia Restrepo', title: 'Rectora EAFIT' },
  { name: 'Leonardo Villar', title: 'Gerente General Banco de la República' },
  { name: 'César Ferrari', title: 'Superintendente Financiero de Colombia' },
  { name: 'Alberto Naudon', title: 'Consejero Banco Central de Chile' },
  { name: 'Efraín Barraza', title: 'Regional Expansion Manager - Latam @ Tether' },
  { name: 'Sandra Meza', title: 'Vicepresidente Control Interno y Cumplimiento BBVA' },
  { name: 'Sebastián Durán', title: 'Subdirector de Regulación Superintendencia Financiera de Colombia' },
  { name: 'Daniel Calvo', title: 'Director Regulación Prudencial de Valores, Medios de Pago y Finanzas Abiertas CMF CHile' },
  { name: 'Rocelo Lopes', title: 'CEO SmartPay' },
  { name: 'Juan Carlos Reyes', title: 'Presidente Comisión Nacional de Activos Digitales (CNAD) El Salvador' },
  { name: 'Liliana Vásquez', title: 'Vicepresidente de Producto Bancolombia' },
  { name: 'Ana Garcés', title: 'Chief Compliance Officer Banco BHD' },
  { name: 'Nagel Paulino', title: 'Jefe Departamento de Regulación - Banco Central de Brasil' },
  { name: 'María Paula Rodríguez', title: 'Money Laundering Reporting Officer / Binance' },
  { name: 'Daniel Mangabeira', title: 'Vice President Strategy & Policy, Brazil & Latin America @Circle' },
  { name: 'César Tamayo', title: 'Dean, School of Finance, Economics & Government - Universidad EAFIT' },
  { name: 'Juan Pablo Rodríguez', title: 'Socio de rics management Colombia y Guatemala' },
  { name: 'Willian Santos', title: 'Gerente de Compliance - Oficial de Cumplimiento Banco W' },
  { name: 'Diego Fernández', title: 'Gerente Corporativo de Innovación nuam' },
  { name: 'Andres Florido', title: 'Senior Manager - Blockchain & AI Assurance @Deloitte' },
  { name: 'Steffen Härting', title: 'Senior Manager @Deloitte: Crypto Asset Markets' },
  { name: 'Andrés Meneses', title: 'Founder Orbyt X' },
  { name: 'Rafael Teruszkin', title: 'Head Latam @Bitpanda Technology Solutions' },
  { name: 'Liz Bejarano', title: 'Directora Financiera y de Riesgo en Asobancaria' },
  { name: 'Albi Rodríguez', title: 'Senior Web3 & DLT Consultant' },
  { name: 'Judith Vergara', title: 'Director of Executive Education- School of Finance, Economics and Government @Universidad EAFIT' },
  { name: 'William Durán', title: 'CO-CEO & Founder @Minteo' },
  { name: 'Daniel Aguilar', title: 'Co Founder & COO Trokera' },
  { name: 'Pablo Santos', title: 'Founder & CEO Finaktiva' },
  { name: 'Ana María Zuluaga', title: 'Head of Open Finance Office Grupo Aval' },
  { name: 'Alireza Siadat', title: '1inch Head of Strategy and Policy' },
  { name: 'Rafael Gago', title: 'Director Comercial, Gerencia de Ideación e Incubación nuam exchange' },
  { name: 'Omar Castelblanco', title: 'Co Founder & CEO Relámpago Payments' },
  { name: 'Pedro Gutiérrez', title: 'Head of Partnerships en LNET' },
  { name: 'Nathaly Diniz', title: 'Chief Revenue Officer @Lumx' },
  { name: 'Juan Pablo Salazar', title: 'Head of Legal, Regulatory Affairs y Compliance. Ripio USA y Colombia.' },
  { name: 'Andrés González', title: 'Co Founder & CEO indahouse' },
  { name: 'Stephanie Sánchez', title: 'MissCryptoLawyer / Founder & CEO BlockRock' },
  { name: 'Santiago Mejía', title: 'Chief Sales Officer @Lulo bank' },
  { name: 'Camilo Suárez', title: 'Co Founder & CEO Vurelo' },
  { name: 'Vivian Cruz', title: 'Finance Professor / Universidad del Pacífico, Lima, Perú' },
  { name: 'Mónica Ramírez de Arellano', title: 'Managing Director - Stablecoins @Anchorage' },
  { name: 'Luisa Cárdenas', title: 'CEO SURED' },
  { name: 'Albert Prat', title: 'Fundador de Beself Brands' },
  { name: 'Markus Kluge', title: 'Managing Director Tokenforge' },
  { name: 'Daniel Marulanda', title: 'Co Founder & CEO Trokera' },
  { name: 'David Yao', title: 'Principal LBanks Labs' },
  { name: 'María Fernanda Marín', title: 'Compliance Officer @DJIRO' },
  { name: 'Sebastián Zapata', title: 'Universidad Externado / Head of Legal Bitso' },
  { name: 'Pilar Álvarez', title: 'Doctora en Administración Estratégica de Empresas. CENTRUM - Universidad Católica de Perú, Perú' },
  { name: 'Daniel Mesa', title: 'Operations Manager North LATAM at Binance' },
  { name: 'Matias Marmisolle', title: 'Co Founder & CEO Anzi Finance' },
  { name: 'Karol Benavides', title: 'Regional Head – LATAM Partnerships & Strategy @Fiskil' },
  { name: 'Camilo Romero', title: 'Co Fundador y CEO de Spyral Labs' },
  { name: 'José Manuel Souto', title: 'Consultor Internacional en Compliance y Criptoactivos. CCO Grupo Vishab y PRIUS Consulting' },
  { name: 'Edison Montoya', title: 'Profesor Tech Business School Universidad EAI' },
  { name: 'Camila Santana', title: 'Chief Compliance Officer / Revolut' },
  { name: 'Fernando Quirós', title: 'Managing Editor de Cointelegraph en Español' },
  { name: 'Lizeth Jaramillo', title: 'Head of Network Growth (LATAM / Americas), Indahouse Inc.' },
  { name: 'Mariangel García', title: 'Co-Founder Women In Investment Network' },
  { name: 'Roberto Darrigrandi', title: 'Socio en Altadirección Capital Latam' },
  { name: 'Ed Marquez', title: 'Head of Developer Relations - Hashgraph' },
  { name: 'Young Cho', title: 'CEO at CiNKO' },
  { name: 'Edward Calderón', title: 'CEO HashPass' },
  { name: 'Arlette Salas', title: 'LATAM Growth Lead de Hive y Founder de H.E.R DAO Venezuela' },
  { name: 'Paula Bermúdez', title: 'Abogada - Founder & CEO– de la firma Colombiana Digitalaw' },
  { name: 'Diego Osuna', title: 'CEO y Co Founder MonaBit' },
  { name: 'Gerardo Lagos', title: 'Co-Founder ObsidiaLab' },
  { name: 'Mireya Acosta', title: 'Co founder ColocaPayments' },
  { name: 'Juliana Franco', title: 'Vicepresidente de Cumplimiento Coltefinanciera' },
  { name: 'Luis Castañeda', title: 'Co-Founder & CFO Anzi Finance' },
  { name: '0xj4an', title: 'Advisor Celo Colombia' },
  { name: 'Mercedes Bidart', title: 'Co Founder & CEO Quipu' },
  { name: 'Michelle Arguelles', title: 'CEO de M.A Global Accounting' },
  { name: 'Sebastián Ramírez', title: 'Developer TuCOP' },
  { name: 'Camilo Serna', title: 'Head of Product @Kravata' },
  { name: 'Daniela Corredor', title: 'COO de Alastria' },
  { name: 'Javier Lozano', title: 'Founder & CTO Minteo' },
  { name: 'Jorge Borges', title: 'Head of Sales & Strategic Business Development LATAM / Fireblocks' },
  { name: 'Lissa Parra', title: 'Asociada Principal | Estudio de Abogados Garrigues Colombia' },
  { name: 'Ximena Monclou', title: 'Abogada y Contadora / Celo Colombia' },
  { name: 'Oscar Moratto', title: 'Director General Beyond Risk SAS' },
  { name: 'Miguel Ángel Calero', title: 'Miembro de la Junta Directiva de Alastria' },
  { name: 'Andrea Jaramillo', title: 'Profesora Escuela de Derecho EAFIT' },
  { name: 'Camila Ortegón', title: 'Coordinadora Legal en RapiCredit' },
  { name: 'Luis Miguel Arroyave', title: 'Sales Director Fireblocks' },
  { name: 'Marco Suvillaga', title: 'Abogado y Consultor Internacional en DLT' },
  { name: 'José Martínez', title: 'Country Manager Colombia at VelaFi' },
  { name: 'Juan Carlos Pérez', title: 'Founder de BKCap' },
  { name: 'Manuel Becker', title: 'Chief Product Officer AllUnity' },
  { name: 'Juan Lalinde', title: 'Profesor Escuela de Ciencias Aplicadas e Ingeniería EAFIT' },
  { name: 'Manú Hersch', title: 'Compliance Specialist / Lemon' },
  { name: 'Federico Biskupovich', title: 'COO / Lemon' },
  { name: 'Alvaro Castro', title: 'Socio / Partner en Damma' },
  { name: 'Nick Waytula', title: 'Head of Tax | Crypto Tax Calculator' },
  { name: 'Sergio Ramírez', title: 'Profesor asistente Escuela de Ciencias Aplicadas e Ingeniería EAFIT' },
  { name: 'Wilder Rosero', title: 'Developer TuCOP' },
];

function slugifyName(name) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function extractCompanyFromTitle(title) {
  if (!title) return null;
  
  // Try to extract company from title patterns
  const patterns = [
    /@\s*([^@]+?)(?:\s|$)/,  // @ Company
    /at\s+([A-Z][^@]+?)(?:\s|$)/i,  // at Company
    /\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/,  // Last word(s) capitalized
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SpeakerScraper/1.0)'
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        res.resume();
        httpGet(redirectUrl).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function extractSpeakerInfo(html, name, providedTitle) {
  const info = {
    name: name,
    title: providedTitle || null,
    company: null,
    bio: null,
    linkedin: null,
    twitter: null,
    imageUrl: null
  };
  
  // Extract title from HTML if not provided
  if (!info.title) {
    const titleMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/i) || 
                      html.match(/<strong[^>]*>([^<]+)<\/strong>/i) ||
                      html.match(/<p[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/p>/i);
    if (titleMatch) {
      info.title = titleMatch[1].trim();
    }
  }
  
  // Extract company from title or HTML
  info.company = extractCompanyFromTitle(info.title);
  if (!info.company) {
    const companyMatch = html.match(/<p[^>]*class="[^"]*company[^"]*"[^>]*>([^<]+)<\/p>/i) ||
                         html.match(/<span[^>]*class="[^"]*company[^"]*"[^>]*>([^<]+)<\/span>/i);
    if (companyMatch) {
      info.company = companyMatch[1].trim();
    }
  }
  
  // Extract bio
  const bioMatch = html.match(/<p[^>]*>([^<]{50,500})<\/p>/i);
  if (bioMatch) {
    info.bio = bioMatch[1].trim().substring(0, 500);
  }
  
  // Extract LinkedIn
  const linkedinMatch = html.match(/href="([^"]*linkedin\.com[^"]*)"/i);
  if (linkedinMatch) {
    info.linkedin = linkedinMatch[1];
  }
  
  // Extract Twitter
  const twitterMatch = html.match(/href="([^"]*twitter\.com[^"]*)"/i) ||
                       html.match(/href="([^"]*x\.com[^"]*)"/i);
  if (twitterMatch) {
    info.twitter = twitterMatch[1];
  }
  
  // Extract image
  const imageMatch = html.match(/<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"/i) ||
                    html.match(/<img[^>]*src="([^"]*foto-[^"]+\.(?:png|jpg|jpeg))"/i);
  if (imageMatch) {
    info.imageUrl = imageMatch[1].startsWith('http') ? imageMatch[1] : `https://blockchainsummit.la${imageMatch[1]}`;
  } else {
    const slug = slugifyName(name);
    info.imageUrl = `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${slug}.png`;
  }
  
  return info;
}

async function updateOrAddSpeaker(speakerInfo) {
  const slug = slugifyName(speakerInfo.name);
  const url = `${BASE_URL}/${slug}/`;
  
  // First, check if speaker already exists by name (case-insensitive)
  const { data: existingSpeakers, error: findError } = await supabase
    .from('bsl_speakers')
    .select('*')
    .ilike('name', speakerInfo.name)
    .limit(1);
  
  let existingSpeaker = existingSpeakers && existingSpeakers.length > 0 ? existingSpeakers[0] : null;
  
  // Generate UUID v5 from slug (consistent ID generation)
  const crypto = await import('node:crypto');
  const namespaceUUID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  const namespaceBytes = Buffer.from(namespaceUUID.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(slug, 'utf8');
  const hash = crypto.createHash('sha1');
  hash.update(Buffer.concat([namespaceBytes, nameBytes]));
  const hashBytes = hash.digest();
  hashBytes[6] = (hashBytes[6] & 0x0f) | 0x50;
  hashBytes[8] = (hashBytes[8] & 0x3f) | 0x80;
  const id = existingSpeaker ? existingSpeaker.id : [
    hashBytes.slice(0, 4).toString('hex'),
    hashBytes.slice(4, 6).toString('hex'),
    hashBytes.slice(6, 8).toString('hex'),
    hashBytes.slice(8, 10).toString('hex'),
    hashBytes.slice(10, 16).toString('hex')
  ].join('-');
  
  try {
    // Try to fetch from website
    const html = await httpGet(url);
    const webInfo = extractSpeakerInfo(html, speakerInfo.name, speakerInfo.title);
    
    // Merge provided info with web info (provided info takes precedence)
    const finalInfo = {
      ...webInfo,
      title: speakerInfo.title || webInfo.title || existingSpeaker?.title,
      company: extractCompanyFromTitle(speakerInfo.title) || webInfo.company || existingSpeaker?.company
    };
    
    const speakerData = {
      id: id,
      name: finalInfo.name,
      title: finalInfo.title || null,
      company: finalInfo.company || null,
      bio: finalInfo.bio || existingSpeaker?.bio || `${finalInfo.title || 'Speaker'} at Blockchain Summit Latam 2025.`,
      linkedin: finalInfo.linkedin || existingSpeaker?.linkedin || null,
      twitter: finalInfo.twitter || existingSpeaker?.twitter || null,
      imageurl: finalInfo.imageUrl || existingSpeaker?.imageurl || `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${slug}.png`,
      tags: existingSpeaker?.tags || ['blockchain', 'fintech', 'innovation'],
      availability: existingSpeaker?.availability || {},
      user_id: existingSpeaker?.user_id || null, // Preserve user_id if exists
      updated_at: new Date().toISOString()
    };
    
    // Upsert speaker (will update if exists, insert if not)
    const { data, error: upsertError } = await supabase
      .from('bsl_speakers')
      .upsert(speakerData, { onConflict: 'id' })
      .select();
    
    if (upsertError) {
      throw upsertError;
    }
    
    return { success: true, updated: true, data };
  } catch (error) {
    // If website fetch fails, still try to update with provided info
    const speakerData = {
      id: id,
      name: speakerInfo.name,
      title: speakerInfo.title || existingSpeaker?.title || null,
      company: extractCompanyFromTitle(speakerInfo.title) || existingSpeaker?.company || null,
      bio: existingSpeaker?.bio || `${speakerInfo.title || 'Speaker'} at Blockchain Summit Latam 2025.`,
      linkedin: existingSpeaker?.linkedin || null,
      twitter: existingSpeaker?.twitter || null,
      imageurl: existingSpeaker?.imageurl || `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${slug}.png`,
      tags: existingSpeaker?.tags || ['blockchain', 'fintech', 'innovation'],
      availability: existingSpeaker?.availability || {},
      user_id: existingSpeaker?.user_id || null, // Preserve user_id if exists
      updated_at: new Date().toISOString()
    };
    
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('bsl_speakers')
      .upsert(speakerData, { onConflict: 'id' })
      .select();
    
    if (fallbackError) {
      return { success: false, error: fallbackError.message };
    }
    
    return { success: true, updated: true, data: fallbackData, fromWeb: false };
  }
}

async function main() {
  console.log('🔍 Checking speakers from web list...\n');
  
  // Get existing speakers
  const { data: existingSpeakers, error: fetchError } = await supabase
    .from('bsl_speakers')
    .select('name, title, company');
  
  if (fetchError) {
    console.error('❌ Error fetching speakers:', fetchError);
    process.exit(1);
  }
  
  const existingNames = new Set(existingSpeakers.map(s => s.name.toLowerCase()));
  console.log(`📊 Found ${existingSpeakers.length} existing speakers in database\n`);
  
  const missing = [];
  const existing = [];
  
  for (const speaker of speakersFromWeb) {
    if (existingNames.has(speaker.name.toLowerCase())) {
      existing.push(speaker);
    } else {
      missing.push(speaker);
    }
  }
  
  console.log(`✅ Found in database: ${existing.length}`);
  console.log(`❌ Missing from database: ${missing.length}\n`);
  
  if (missing.length > 0) {
    console.log('Missing speakers:');
    missing.forEach(s => console.log(`   - ${s.name}`));
    console.log('');
  }
  
  // Update all speakers (both existing and missing) with latest info
  console.log('🔄 Updating all speakers with latest information...\n');
  
  let updated = 0;
  let failed = 0;
  
  for (const speaker of speakersFromWeb) {
    const result = await updateOrAddSpeaker(speaker);
    
    if (result.success) {
      updated++;
      const status = result.fromWeb === false ? ' (no web data)' : '';
      console.log(`✅ ${speaker.name}${status}`);
    } else {
      failed++;
      console.log(`❌ ${speaker.name}: ${result.error}`);
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n📊 Summary:');
  console.log(`   ✅ Updated/Added: ${updated}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📋 Total: ${speakersFromWeb.length}\n`);
}

main().catch(console.error);

