#!/usr/bin/env node

// Check speakers from blockchainsummit.la and add missing ones to database
// Scrapes speaker pages and compares with database

import fs from 'node:fs';
import path from 'path';
import https from 'node:https';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(process.cwd());
const BASE_URL = 'https://blockchainsummit.la/teams';

// Speaker priority list (in order)
const SPEAKER_PRIORITY_LIST = [
  'Claudia Restrepo',
  'Leonardo Villar',
  'César Ferrari',
  'Alberto Naudon',
  'José Outumuro',
  'Efraín Barraza',
  'Sandra Meza',
  'Sebastián Durán',
  'Ana Garcés',
  'Rocelo Lopes',
  'Juan Carlos Reyes',
  'Daniel Calvo',
  'Nagel Paulino',
  'Gabriel Santos',
  'María Paula Rodríguez',
  'César Tamayo',
  'Daniel Mangabeira',
  'Juan Pablo Rodríguez',
  'Willian Santos',
  'Rocío Alvarez-Ossorio',
  'Diego Fernández',
  'Steffen Härting',
  'Andres Florido',
  'Liz Bejarano',
  'Andrés Meneses',
  'Luther Maday',
  'Rafael Teruszkin',
  'Albi Rodríguez',
  'Judith Vergara',
  'William Durán',
  'Daniel Aguilar',
  'Rafael Gago',
  'Pablo Santos',
  'Ana María Zuluaga',
  'Alireza Siadat',
  'Omar Castelblanco',
  'Pedro Gutiérrez',
  'Marcos Carpio',
  'Nathaly Diniz',
  'Juan Pablo Salazar',
  'Santiago Mejía',
  'Andrés González',
  'Stephanie Sánchez',
  'Albert Prat',
  'Mónica Ramírez de Arellano',
  'Luisa Cárdenas',
  'Camilo Suárez',
  'Vivian Cruz',
  'Daniel Marulanda',
  'David Yao',
  'María Fernanda Marín',
  'Sebastián Zapata',
  'Kieve Huffman',
  'Pilar Álvarez',
  'Daniel Mesa',
  'Matias Marmisolle',
  'Karol Benavides',
  'Camilo Romero',
  'José Manuel Souto',
  'Edison Montoya',
  'Fernando Quirós',
  'Camila Santana',
  'Lizeth Jaramillo',
  'Mariangel García',
  'Edward Calderón',
  'Roberto Darrigrandi',
  'Arlette Salas',
  'Ed Marquez',
  'Young Cho',
  'Diego Osuna',
  'Paula Bermúdez',
  'Luis Castañeda',
  'Gerardo Lagos',
  'Mireya Acosta',
  'Juliana Franco',
  '0xj4an',
  'Mercedes Bidart',
  'Daniela Salcedo',
  'Michelle Arguelles',
  'Sebastián Ramírez',
  'Camilo Serna',
  'Javier Lozano',
  'Ximena Monclou',
  'Oscar Moratto',
  'Miguel Ángel Calero',
  'Lisa Parra',
  'Camila Ortegón',
  'Luis Miguel Arroyave',
  'Juan Carlos Pérez',
  'José Martínez',
  'Manuel Becker',
  'Manú Hersch',
  'Federico Biskupovich',
  'Alvaro Castro',
  'Nick Waytula',
  'Wilder Rosero',
  'Liliana Vásquez',
  'Daniela Corredor',
  'Lissa Parra',
];

// Speaker titles mapping
const SPEAKER_TITLES = {
  'Claudia Restrepo': 'Rectora EAFIT',
  'Leonardo Villar': 'Gerente General Banco de la República',
  'César Ferrari': 'Superintendente Financiero de Colombia',
  'Alberto Naudon': 'Consejero Banco Central de Chile',
  'José Outumuro': 'Director Institutional sales EMEA @ Crypto.com',
  'Efraín Barraza': 'Regional Expansion Manager - Latam @ Tether',
  'Sandra Meza': 'Vicepresidente Control Interno y Cumplimiento BBVA',
  'Sebastián Durán': 'Subdirector de Regulación Superintendencia Financiera de Colombia',
  'Ana Garcés': 'Chief Compliance Officer Banco BHD',
  'Rocelo Lopes': 'CEO SmartPay',
  'Juan Carlos Reyes': 'Presidente Comisión Nacional de Activos Digitales (CNAD) El Salvador',
  'Daniel Calvo': 'Director Regulación Prudencial de Valores, Medios de Pago y Finanzas Abiertas CMF CHile',
  'Nagel Paulino': 'Jefe Departamento de Regulación - Banco Central de Brasil',
  'Gabriel Santos': 'Presidente Ejecutivo Colombia FinTech',
  'María Paula Rodríguez': 'Money Laundering Reporting Officer / Binance',
  'César Tamayo': 'Dean, School of Finance, Economics & Government - Universidad EAFIT',
  'Daniel Mangabeira': 'Vice President Strategy & Policy, Brazil & Latin America @Circle',
  'Juan Pablo Rodríguez': 'Socio de rics management Colombia y Guatemala',
  'Willian Santos': 'Gerente de Compliance - Oficial de Cumplimiento Banco W',
  'Rocío Alvarez-Ossorio': 'Founder & CEO Hator',
  'Diego Fernández': 'Gerente Corporativo de Innovación nuam',
  'Steffen Härting': 'Senior Manager @Deloitte: Crypto Asset Markets',
  'Andres Florido': 'Senior Manager - Blockchain & AI Assurance @Deloitte',
  'Liz Bejarano': 'Directora Financiera y de Riesgo en Asobancaria',
  'Andrés Meneses': 'Founder Orbyt X',
  'Luther Maday': 'Head of Payments at Algorand Foundation',
  'Rafael Teruszkin': 'Head Latam @Bitpanda Technology Solutions',
  'Albi Rodríguez': 'Senior Web3 & DLT Consultant',
  'Judith Vergara': 'Director of Executive Education- School of Finance, Economics and Government @Universidad EAFIT',
  'William Durán': 'CO-CEO & Founder @Minteo',
  'Daniel Aguilar': 'Co Founder & COO Trokera',
  'Rafael Gago': 'Director Comercial, Gerencia de Ideación e Incubación nuam exchange',
  'Pablo Santos': 'Founder & CEO Finaktiva',
  'Ana María Zuluaga': 'Head of Open Finance Office Grupo Aval',
  'Alireza Siadat': '1inch Head of Strategy and Policy',
  'Omar Castelblanco': 'Co Founder & CEO Relámpago Payments',
  'Pedro Gutiérrez': 'Head of Partnerships en LNET',
  'Marcos Carpio': 'Co-Founder & CFO Tokelab',
  'Nathaly Diniz': 'Chief Revenue Officer @Lumx',
  'Juan Pablo Salazar': 'Head of Legal, Regulatory Affairs y Compliance. Ripio USA y Colombia.',
  'Santiago Mejía': 'Chief Sales Officer @Lulo bank',
  'Andrés González': 'Co Founder & CEO indahouse',
  'Stephanie Sánchez': 'MissCryptoLawyer / Founder & CEO BlockRock',
  'Albert Prat': 'Fundador de Beself Brands',
  'Mónica Ramírez de Arellano': 'Managing Director - Stablecoins @Anchorage',
  'Luisa Cárdenas': 'CEO SURED',
  'Camilo Suárez': 'Co Founder & CEO Vurelo',
  'Vivian Cruz': 'Finance Professor / Universidad del Pacífico, Lima, Perú',
  'Daniel Marulanda': 'Co Founder & CEO Trokera',
  'David Yao': 'Principal LBanks Labs',
  'María Fernanda Marín': 'Compliance Officer @DJIRO',
  'Sebastián Zapata': 'Universidad Externado / Head of Legal Bitso',
  'Kieve Huffman': 'Founder and Chief Revenue Officer - Engager',
  'Pilar Álvarez': 'Doctora en Administración Estratégica de Empresas. CENTRUM - Universidad Católica de Perú, Perú',
  'Daniel Mesa': 'Operations Manager North LATAM at Binance',
  'Matias Marmisolle': 'Co Founder & CEO Anzi Finance',
  'Karol Benavides': 'Regional Head – LATAM Partnerships & Strategy @Fiskil',
  'Camilo Romero': 'Co Fundador y CEO de Spyral Labs',
  'José Manuel Souto': 'Consultor Internacional en Compliance y Criptoactivos. CCO Grupo Vishab y PRIUS Consulting',
  'Edison Montoya': 'Finhub EAFIT',
  'Fernando Quirós': 'Managing Editor de Cointelegraph en Español',
  'Camila Santana': 'Chief Compliance Officer / Revolut',
  'Lizeth Jaramillo': 'Head of Network Growth (LATAM / Americas), Indahouse Inc.',
  'Mariangel García': 'Co-Founder Women In Investment Network',
  'Edward Calderón': 'CEO HashPass',
  'Roberto Darrigrandi': 'Socio en Altadirección Capital Latam',
  'Arlette Salas': 'LATAM Growth Lead de Hive y Founder de H.E.R DAO Venezuela',
  'Ed Marquez': 'Head of Developer Relations - Hashgraph',
  'Young Cho': 'CEO at CiNKO',
  'Diego Osuna': 'CEO y Co Founder MonaBit',
  'Paula Bermúdez': 'Abogada - Founder & CEO– de la firma Colombiana Digitalaw',
  'Luis Castañeda': 'Co-Founder & CFO Anzi Finance',
  'Gerardo Lagos': 'Co-Founder ObsidiaLab',
  'Mireya Acosta': 'Co founder ColocaPayments',
  'Juliana Franco': 'Vicepresidente de Cumplimiento Coltefinanciera',
  '0xj4an': 'Advisor Celo Colombia',
  'Mercedes Bidart': 'Co Founder & CEO Quipu',
  'Daniela Salcedo': 'COO de Alastria',
  'Michelle Arguelles': 'CEO de M.A Global Accounting',
  'Sebastián Ramírez': 'Developer TuCOP',
  'Camilo Serna': 'Head of Product @Kravata',
  'Javier Lozano': 'Founder & CTO Minteo',
  'Ximena Monclou': 'Abogada y Contadora / Celo Colombia',
  'Oscar Moratto': 'Director General Beyond Risk SAS',
  'Miguel Ángel Calero': 'Miembro de la Junta Directiva de Alastria',
  'Lisa Parra': 'Asociada Principal | Estudio de Abogados Garrigues Colombia',
  'Camila Ortegón': 'Coordinadora Legal en RapiCredit',
  'Luis Miguel Arroyave': 'Sales Director Fireblocks',
  'Juan Carlos Pérez': 'Founder de BKCap',
  'José Martínez': 'Country Manager Colombia at VelaFi',
  'Manuel Becker': 'Chief Product Officer AllUnity',
  'Manú Hersch': 'Compliance Specialist / Lemon',
  'Federico Biskupovich': 'COO / Lemon',
  'Alvaro Castro': 'Socio / Partner en Damma',
  'Nick Waytula': 'Head of Tax | Crypto Tax Calculator',
  'Wilder Rosero': 'Developer TuCOP',
  'Liliana Vásquez': 'Vicepresidente de Producto Bancolombia',
  'Daniela Corredor': 'COO de Alastria',
  'Lissa Parra': 'Asociada Principal | Estudio de Abogados Garrigues Colombia',
};

function slugifyName(name) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SpeakerImageScraper/1.0)'
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        res.resume();
        httpGet(redirectUrl).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Request failed. Status: ${res.statusCode} for ${url}`));
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
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function parseImageTag(html) {
  const imgTagMatch = html.match(/<img[^>]*class=["'][^"']*wp-post-image[^"']*["'][^>]*>/i);
  if (!imgTagMatch) return null;
  const tag = imgTagMatch[0];
  const srcMatch = tag.match(/\ssrc=["']([^"']+)["']/i);
  const srcsetMatch = tag.match(/\ssrcset=["']([^"']+)["']/i);
  
  const src = srcMatch ? srcMatch[1] : null;
  const srcset = {};
  if (srcsetMatch) {
    const entries = srcsetMatch[1].split(',').map(s => s.trim());
    for (const entry of entries) {
      const [url, size] = entry.split(/\s+/);
      if (url && size) srcset[size] = url;
    }
  }
  return { src, srcset };
}

function pickBestImage({ src, srcset }) {
  if (!src && !srcset) return null;
  if (srcset && srcset['1080w']) return srcset['1080w'];
  if (srcset) {
    const widths = Object.keys(srcset)
      .map(k => parseInt(k, 10))
      .filter(n => !Number.isNaN(n))
      .sort((a, b) => b - a);
    if (widths.length > 0) return srcset[`${widths[0]}w`];
  }
  return src || null;
}

function extractCompanyFromTitle(title) {
  // Try to extract company from title
  const atMatch = title.match(/@\s*([^@]+?)(?:\s|$)/);
  if (atMatch) return atMatch[1].trim();
  
  const deMatch = title.match(/\s+de\s+([A-Z][^/]+?)(?:\s|$)/);
  if (deMatch) return deMatch[1].trim();
  
  return null;
}

function normalizeImageUrl(url, slug) {
  if (!url) return null;
  
  try {
    // Decode URL to handle encoded characters
    const decodedUrl = decodeURIComponent(url);
    
    // Extract the filename from the URL
    const urlMatch = decodedUrl.match(/foto-([^/]+\.(png|jpg|jpeg))/i);
    if (urlMatch) {
      // Extract the name part (without extension)
      const filenamePart = urlMatch[1].replace(/\.(png|jpg|jpeg)$/i, '');
      // Normalize the filename part to remove accents
      const normalizedFilename = slugifyName(filenamePart);
      // Reconstruct URL with normalized filename
      const extension = urlMatch[2].toLowerCase();
      return decodedUrl.replace(/foto-[^/]+\.(png|jpg|jpeg)/i, `foto-${normalizedFilename}.${extension}`);
    }
    
    // If pattern doesn't match, try to replace any encoded characters in the filename
    return decodedUrl.replace(/%[0-9A-F]{2}/gi, (match) => {
      try {
        const char = decodeURIComponent(match);
        // If it's an accented character, remove the accent
        return char.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
      } catch {
        return match;
      }
    });
  } catch (error) {
    // If normalization fails, return the slug-based URL
    return `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${slug}.png`;
  }
}

async function main() {
  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('🔍 Checking speakers from blockchainsummit.la...\n');

  // Get existing speakers from database
  const { data: existingSpeakers, error: dbError } = await supabase
    .from('bsl_speakers')
    .select('name, id');

  if (dbError) {
    console.error('❌ Error fetching existing speakers:', dbError);
    process.exit(1);
  }

  const existingNames = new Set(existingSpeakers.map(s => s.name.toLowerCase()));
  console.log(`📊 Found ${existingSpeakers.length} existing speakers in database\n`);

  const missingSpeakers = [];
  const foundSpeakers = [];

  // Check each speaker in priority list
  for (const name of SPEAKER_PRIORITY_LIST) {
    const nameLower = name.toLowerCase();
    if (existingNames.has(nameLower)) {
      foundSpeakers.push(name);
      console.log(`✓ ${name} - already in database`);
    } else {
      missingSpeakers.push(name);
      console.log(`⚠ ${name} - MISSING from database`);
    }
  }

  console.log(`\n📈 Summary:`);
  console.log(`   Found: ${foundSpeakers.length}`);
  console.log(`   Missing: ${missingSpeakers.length}\n`);

  if (missingSpeakers.length === 0) {
    console.log('✅ All speakers are in the database!');
    return;
  }

  console.log('🔍 Scraping missing speakers...\n');

  // Scrape and add missing speakers
  let added = 0;
  let failed = 0;

  for (const name of missingSpeakers) {
    const slug = slugifyName(name);
    const url = `${BASE_URL}/${slug}/`;
    
    try {
      console.log(`📥 Fetching ${name}...`);
      const html = await httpGet(url);
      const parsed = parseImageTag(html);
      const rawImageUrl = parsed ? pickBestImage(parsed) : null;
      
      // Normalize image URL to remove accents from filename
      const imageUrl = rawImageUrl ? normalizeImageUrl(rawImageUrl, slug) : null;
      
      const title = SPEAKER_TITLES[name] || '';
      const company = extractCompanyFromTitle(title) || '';

      // Generate UUID from slug using deterministic UUID v5 (same method as migration)
      // This ensures the same slug always generates the same UUID
      const namespaceUUID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
      const { data: uuidResult, error: uuidError } = await supabase
        .rpc('uuid_generate_v5_rpc', {
          namespace_uuid: namespaceUUID,
          name_text: slug
        });
      
      let speakerId;
      if (uuidError || !uuidResult) {
        // Fallback: generate UUID v5 in JavaScript using crypto
        const crypto = await import('node:crypto');
        const namespaceBytes = Buffer.from(namespaceUUID.replace(/-/g, ''), 'hex');
        const nameBytes = Buffer.from(slug, 'utf8');
        const hash = crypto.createHash('sha1');
        hash.update(Buffer.concat([namespaceBytes, nameBytes]));
        const hashBytes = hash.digest();
        // Set version (5) and variant bits
        hashBytes[6] = (hashBytes[6] & 0x0f) | 0x50;
        hashBytes[8] = (hashBytes[8] & 0x3f) | 0x80;
        // Format as UUID string
        speakerId = [
          hashBytes.slice(0, 4).toString('hex'),
          hashBytes.slice(4, 6).toString('hex'),
          hashBytes.slice(6, 8).toString('hex'),
          hashBytes.slice(8, 10).toString('hex'),
          hashBytes.slice(10, 16).toString('hex')
        ].join('-');
        console.log(`⚠️  Generated UUID v5 in JS for ${name}`);
      } else {
        speakerId = uuidResult;
      }

      const speakerData = {
        id: speakerId,  // UUID instead of TEXT slug
        name: name,
        title: title,
        company: company,
        imageurl: imageUrl || `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${slug}.png`,
        bio: title ? `${title}${company ? ` at ${company}` : ''}` : `Speaker at Blockchain Summit LA`,
        tags: ['Blockchain', 'FinTech', 'Innovation'],
        availability: {
          monday: { start: '09:00', end: '17:00' },
          tuesday: { start: '09:00', end: '17:00' },
          wednesday: { start: '09:00', end: '17:00' },
          thursday: { start: '09:00', end: '17:00' },
          friday: { start: '09:00', end: '17:00' }
        },
        linkedin: `https://linkedin.com/in/${slug}`,
        twitter: null,
        user_id: null
      };

      const { error: insertError } = await supabase
        .from('bsl_speakers')
        .upsert(speakerData, { onConflict: 'id' });

      if (insertError) {
        console.error(`❌ Error adding ${name}:`, insertError.message);
        failed++;
      } else {
        console.log(`✅ Added ${name}`);
        added++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (err) {
      console.error(`❌ Failed to fetch ${name}:`, err.message);
      failed++;
    }
  }

  console.log(`\n✅ Done! Added: ${added}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

