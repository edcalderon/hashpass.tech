#!/usr/bin/env node
/**
 * Update agenda from provided accurate data
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// Accurate agenda data provided by user
const agendaData = [
  // Day 1
  { id: 'agenda-1', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '08:00 - 09:15', title: 'Registro y café de bienvenida', type: 'registration', speakers: null },
  { id: 'agenda-2', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '09:15 - 09:20', title: 'Palabras de apertura BSL', type: 'keynote', speakers: ['Rodrigo Sainz'] },
  { id: 'agenda-3', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '09:25 – 09:45', title: 'Palabras de apertura EAFIT', type: 'keynote', speakers: ['César Tamayo'] },
  { id: 'agenda-4', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '09:50 – 10:20', title: 'Keynote – "El futuro de la supervisión y regulación financiera en la era digital"', type: 'keynote', speakers: ['Sebastián Durán'] },
  { id: 'agenda-5', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '10:30 – 11:00', title: 'Keynote – "Activos Digitales, la experiencia de El Salvador"', type: 'keynote', speakers: ['Juan Carlos Reyes'] },
  { id: 'agenda-6', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '11:10 – 11:40', title: 'Keynote – "CBDCs y el Futuro del Dinero en LatAm"', type: 'keynote', speakers: ['Alberto Naudon'] },
  { id: 'agenda-7', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '11:45 – 12:15', title: 'Panel – "De la Ley Fintech a la normativa, fase de implementación en Chile"', type: 'panel', speakers: ['Daniel Calvo'] },
  { id: 'agenda-8', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '12:20 – 13:00', title: 'Keynote – "El rol de los bancos centrales en la innovación financiera: lecciones del caso Brasil"', type: 'keynote', speakers: ['Nagel Paulino'] },
  { id: 'agenda-9', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '13:00 – 14:00', title: 'Almuerzo Libre', type: 'meal', speakers: null },
  { id: 'agenda-10', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '14:00 – 15:00', title: 'Panel Bancario – "Transformación Digital de la Banca Tradicional"', type: 'panel', speakers: ['César Tamayo', 'Liz Bejarano', 'Santiago Mejía', 'Mónica Ramírez de Arellano', 'Liliana Vásquez'] },
  { id: 'agenda-11', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '15:05 – 15:35', title: 'Keynote – "Retos en el proceso de Licenciamiento Bancario Digital"', type: 'keynote', speakers: ['Camila Santana'] },
  { id: 'agenda-12', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '15:40 – 16:40', title: 'Panel de Reguladores – "Marco regulatorio para la innovación financiera en LatAm"', type: 'panel', speakers: ['Ana María Zuluaga', 'Daniel Calvo', 'Nagel Paulino', 'Alberto Naudon', 'Sebastián Durán'] },
  { id: 'agenda-13', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '16:45 – 17:15', title: 'Keynote – "Regulación de pagos y stablecoins: lecciones desde Europa y el ecosistema DeFi"', type: 'keynote', speakers: ['Steffen Härting'] },
  { id: 'agenda-14', day: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12', time: '17:20 – 17:50', title: 'Keynote – "El Futuro del Dinero Digital: Innovación, Confianza y Colaboración en LATAM"', type: 'keynote', speakers: ['Pedro Gutiérrez'] },
  
  // Day 2
  { id: 'agenda-15', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '08:00 - 09:00', title: 'Registro y café de bienvenida', type: 'registration', speakers: null },
  { id: 'agenda-16', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '09:00 - 09:25', title: 'Keynote – "Finanzas verdes y tecnología blockchain: tokenización de activos climáticos en mercados emergentes"', type: 'keynote', speakers: ['Judith Vergara'] },
  { id: 'agenda-17', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '09:30 - 10:30', title: 'Panel – "Hacia la convergencia regulatoria: los retos de armonizar los mercados de valores tokenizados entre América Latina, EE. UU. y la Unión Europea"', type: 'panel', speakers: ['Albi Rodríguez', 'Lissa Parra', 'Sebastián Zapata', 'Alvaro Castro', 'Ximena Monclou'] },
  { id: 'agenda-18', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '10:35 - 11:00', title: 'Keynote – "Pagos y transferencias utilizando Activos Digitales, la nueva lógica global"', type: 'keynote', speakers: ['Rocelo Lopes'] },
  { id: 'agenda-19', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '11:05 - 12:05', title: 'Panel – Finanzas Tradicionales y Activos Digitales: ¿Competencia o Complemento?', type: 'panel', speakers: ['Nathaly Diniz', 'Luisa Cárdenas', 'Andres Florido', 'Juliana Franco', 'Daniel Marulanda'] },
  { id: 'agenda-20', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '12:10 - 13:10', title: 'Panel - "El Rol de la Tokenización en la Evolución de los Mercados de Capitales"', type: 'panel', speakers: ['Pilar Álvarez', 'Diego Fernández', 'Albert Prat', 'Javier Lozano', 'Alireza Siadat'] },
  { id: 'agenda-21', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '13:10 – 14:00', title: 'Almuerzo libre', type: 'meal', speakers: null },
  { id: 'agenda-22', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '14:00 – 15:00', title: 'Panel – "PSAV y los bancos, el rol del Compliance"', type: 'panel', speakers: ['Juan Pablo Rodríguez', 'Sandra Meza', 'Ana Garcés', 'Willian Santos', 'Oscar Moratto'] },
  { id: 'agenda-23', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '15:05 – 15:30', title: 'Keynote – "Tendencias y oportunidades regulatorias sobre activos virtuales en LATAM"', type: 'keynote', speakers: ['Manú Hersch'] },
  { id: 'agenda-24', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '15:35 – 15:50', title: 'Keynote – "Compliance como motor de adopción: la nueva era de los activos digitales regulados"', type: 'keynote', speakers: ['María Paula Rodríguez'] },
  { id: 'agenda-25', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '15:55 – 16:55', title: 'Panel – "Road to Adoption: Estrategias para la institucionalización de los activos tokenizados"', type: 'panel', speakers: ['Karol Benavides', 'Rafael Teruszkin', 'Efraín Barraza', 'Markus Kluge', 'Manuel Becker'] },
  { id: 'agenda-26', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '17:00 – 17:25', title: 'Keynote – "Entering the era for mainstream adoption of Digital Assets"', type: 'keynote', speakers: ['Jorge Borges'] },
  { id: 'agenda-27', day: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13', time: '17:30 – 18:30', title: 'Panel – "Blockchain y su fundamento técnico-financiero: Criptografía y smart contracts"', type: 'panel', speakers: ['Edward Calderón', 'Edison Montoya', 'Juan Lalinde', 'Andrea Jaramillo', 'Sergio Ramírez'] },
  
  // Day 3
  { id: 'agenda-28', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '08:00 - 09:00', title: 'Registro y café de bienvenida', type: 'registration', speakers: null },
  { id: 'agenda-29', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '09:00 - 09:30', title: 'Keynote – Banco de la República – "Digitalización e Innovación en el Banco de la República"', type: 'keynote', speakers: ['Leonardo Villar'] },
  { id: 'agenda-30', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '09:35 - 10:05', title: 'Keynote – "Experiencia Global en Stablecoins"', type: 'keynote', speakers: ['Daniel Mangabeira'] },
  { id: 'agenda-31', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '10:10 - 11:10', title: 'Panel – "Stablecoins como Infraestructura: Más Allá del Dinero Digital"', type: 'panel', speakers: ['Lizeth Jaramillo', 'Juan Carlos Pérez', 'Federico Biskupovich', '0xj4an', 'Diego Osuna'] },
  { id: 'agenda-32', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '11:15 - 11:45', title: 'Keynote – "Beyond Blockchain: How Hedera Hashgraph Is Powering the Next Generation of Financial Infrastructure"', type: 'keynote', speakers: ['Ed Marquez'] },
  { id: 'agenda-33', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '11:50 - 12:50', title: 'Panel – "Interoperabilidad y eficiencia en pagos cross-border con stablecoins"', type: 'panel', speakers: ['Mireya Acosta', 'Young Cho', 'Omar Castelblanco', 'Rocelo Lopes', 'Camilo Suárez'] },
  { id: 'agenda-34', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '13:00 - 14:00', title: 'Almuerzo Libre', type: 'meal', speakers: null },
  { id: 'agenda-35', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '14:00 - 15:00', title: 'Panel – "Compliance y Tributación en el Ecosistema DeFi y Stablecoins"', type: 'panel', speakers: ['José Manuel Souto', 'Michelle Arguelles', 'Nick Waytula', 'Paula Bermúdez', 'Stephanie Sánchez'] },
  { id: 'agenda-36', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '15:05 - 15:30', title: 'Keynote – "Ecosistemas colaborativos para la economía tokenizada: la experiencia de Alastria"', type: 'keynote', speakers: ['Daniela Corredor', 'Miguel Ángel Calero'] },
  { id: 'agenda-37', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '15:35 - 16:35', title: 'Panel – "DeFi + TradFi: Nuevas sinergias en infraestructura financiera descentralizada"', type: 'panel', speakers: ['Vivian Cruz', 'Luis Castañeda', 'Mercedes Bidart', 'Camilo Serna', 'Juan Pablo Salazar'] },
  { id: 'agenda-38', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '16:40 - 17:05', title: 'Keynote – "Acceso Global a Capital con Tokens Regulados: El Caso de Trokera"', type: 'keynote', speakers: ['Daniel Marulanda'] },
  { id: 'agenda-39', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '17:10 - 18:10', title: 'Panel – "Sistema Financiero Global en 2030: Visión, riesgos y oportunidades"', type: 'panel', speakers: ['Fernando Quirós', 'José Martínez', 'Camilo Romero', 'David Yao', 'Marco Suvillaga'] },
  { id: 'agenda-40', day: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14', time: '18:15 - 18:30', title: 'Clausura', type: 'keynote', speakers: ['Rodrigo Sainz'] },
];

async function main() {
  try {
    console.log('🔄 Updating agenda with accurate data...\n');
    
    // Prepare agenda items with all required fields
    const agendaItems = agendaData.map(item => ({
      id: item.id,
      event_id: 'bsl2025',
      day: item.day,
      time: item.time,
      title: item.title,
      description: null,
      speakers: item.speakers,
      type: item.type,
      location: 'Universidad EAFIT, Medellín',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
    console.log(`📋 Prepared ${agendaItems.length} agenda items\n`);

    // Clear existing agenda
    console.log('🗑️  Clearing existing agenda...');
    const { error: deleteError } = await supabase
      .from('event_agenda')
      .delete()
      .eq('event_id', 'bsl2025');

    if (deleteError) {
      throw deleteError;
    }
    console.log('✅ Existing agenda cleared\n');

    // Insert new agenda items
    console.log('📝 Inserting accurate agenda items...');
    const { data, error } = await supabase
      .from('event_agenda')
      .insert(agendaItems);

    if (error) {
      throw error;
    }

    console.log(`✅ Inserted ${agendaItems.length} agenda items\n`);
    
    // Verify and show summary
    const { data: verifyData, error: verifyError } = await supabase
      .from('event_agenda')
      .select('id, day, title, time, speakers, type')
      .eq('event_id', 'bsl2025')
      .order('day', { ascending: true })
      .order('time', { ascending: true });

    if (verifyError) {
      console.error('❌ Verification error:', verifyError);
    } else {
      console.log(`✅ Verification successful: ${verifyData.length} items in database\n`);
      
      // Show distribution by day
      const day1Items = verifyData.filter(item => item.day.includes('Día 1'));
      const day2Items = verifyData.filter(item => item.day.includes('Día 2'));
      const day3Items = verifyData.filter(item => item.day.includes('Día 3'));
      
      console.log('📅 Distribution by day:');
      console.log(`   Day 1: ${day1Items.length} items`);
      console.log(`   Day 2: ${day2Items.length} items`);
      console.log(`   Day 3: ${day3Items.length} items\n`);
      
      // Count items with speakers
      const itemsWithSpeakers = verifyData.filter(item => item.speakers && item.speakers.length > 0);
      console.log(`👥 Items with speakers: ${itemsWithSpeakers.length} out of ${verifyData.length}`);
      
      // Count total speakers
      const allSpeakers = new Set();
      verifyData.forEach(item => {
        if (item.speakers && Array.isArray(item.speakers)) {
          item.speakers.forEach(speaker => allSpeakers.add(speaker));
        }
      });
      console.log(`   Unique speakers: ${allSpeakers.size}\n`);
    }
    
    console.log('✅ Agenda updated successfully!');
    
  } catch (error) {
    console.error('💥 Error:', error);
    process.exit(1);
  }
}

main();

