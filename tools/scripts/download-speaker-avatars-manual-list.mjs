#!/usr/bin/env node
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const NAMES = [
  "Claudia Restrepo",
  "Leonardo Villar",
  "César Ferrari",
  "Alberto Naudon",
  "Efraín Barraza",
  "Sandra Meza",
  "Sebastián Durán",
  "Daniel Calvo",
  "Rocelo Lopes",
  "Juan Carlos Reyes",
  "Liliana Vásquez",
  "Ana Garcés",
  "Nagel Paulino",
  "María Paula Rodríguez",
  "Daniel Mangabeira",
  "César Tamayo",
  "Juan Pablo Rodríguez",
  "Willian Santos",
  "Diego Fernández",
  "Andres Florido",
  "Steffen Härting",
  "Andrés Meneses",
  "Rafael Teruszkin",
  "Liz Bejarano",
  "Albi Rodríguez",
  "Judith Vergara",
  "William Durán",
  "Daniel Aguilar",
  "Pablo Santos",
  "Ana María Zuluaga",
  "Alireza Siadat",
  "Rafael Gago",
  "Omar Castelblanco",
  "Pedro Gutiérrez",
  "Nathaly Diniz",
  "Juan Pablo Salazar",
  "Andrés González",
  "Stephanie Sánchez",
  "Santiago Mejía",
  "Camilo Suárez",
  "Vivian Cruz",
  "Mónica Ramírez de Arellano",
  "Luisa Cárdenas",
  "Albert Prat",
  "Markus Kluge",
  "Daniel Marulanda",
  "David Yao",
  "María Fernanda Marín",
  "Sebastián Zapata",
  "Pilar Álvarez",
  "Daniel Mesa",
  "Matias Marmisolle",
  "Karol Benavides",
  "Camilo Romero",
  "José Manuel Souto",
  "Edison Montoya",
  "Camila Santana",
  "Fernando Quirós",
  "Lizeth Jaramillo",
  "Mariangel García",
  "Roberto Darrigrandi",
  "Ed Marquez",
  "Young Cho",
  "Edward Calderón",
  "Arlette Salas",
  "Paula Bermúdez",
  "Diego Osuna",
  "Gerardo Lagos",
  "Mireya Acosta",
  "Juliana Franco",
  "Luis Castañeda",
  "0xj4an",
  "Mercedes Bidart",
  "Michelle Arguelles",
  "Sebastián Ramírez",
  "Camilo Serna",
  "Daniela Corredor",
  "Javier Lozano",
  "Jorge Borges",
  "Lissa Parra",
  "Ximena Monclou",
  "Oscar Moratto",
  "Miguel Ángel Calero",
  "Andrea Jaramillo",
  "Camila Ortegón",
  "Luis Miguel Arroyave",
  "Marco Suvillaga",
  "José Martínez",
  "Juan Carlos Pérez",
  "Manuel Becker",
  "Juan Lalinde",
  "Manú Hersch",
  "Federico Biskupovich",
  "Alvaro Castro",
  "Nick Waytula",
  "Sergio Ramírez",
  "Wilder Rosero",
  "Rodrigo Sainz"
];
const OUTDIR = path.resolve('tmp/speaker-avatars');
const MAPPING = path.resolve('speaker-list-manual.json');
const MISSING = path.resolve('missing-speaker-list.json');

if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

function sanitize(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

async function tryDownload(name) {
  // puede haber variantes de mes/ruta, prueba septiembre (09), octubre (10), julio (07), noviembre (11)
  const months = ['09','10','11','07','08'];
  const files = [];
  for (let m of months) {
    files.push(`https://blockchainsummit.la/wp-content/uploads/2025/${m}/foto-${sanitize(name)}.png`);
    files.push(`https://blockchainsummit.la/wp-content/uploads/2025/${m}/foto-${sanitize(name)}-1.png`);
    files.push(`https://blockchainsummit.la/wp-content/uploads/2025/${m}/Foto-${sanitize(name)}.png`);
    files.push(`https://blockchainsummit.la/wp-content/uploads/2025/${m}/${sanitize(name)}.png`);
  }
  for (let url of files) {
    let localfile = path.join(OUTDIR, path.basename(url));
    if (fs.existsSync(localfile)) return { name, url_tried: url, local_filepath: localfile, status: 'exists' };
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        const buf = await res.arrayBuffer();
        fs.writeFileSync(localfile, Buffer.from(buf));
        return { name, url_tried: url, local_filepath: localfile, status: 'downloaded' };
      }
    } catch {}
  }
  return { name, url_tried: files.join(' | '), local_filepath: null, status: 'missing' };
}

(async ()=>{
  const found=[],missing=[];
  for (let name of NAMES) {
    const res = await tryDownload(name);
    if(res.status==='downloaded'||res.status==='exists'){
      found.push(res);
      console.log(`✅`, name, res.status==='exists'?'(ya estaba)':'descargada');
    } else {
      missing.push(res);
      console.log(`❌`, name, 'NO SE ENCONTRÓ');
    }
  }
  fs.writeFileSync(MAPPING, JSON.stringify(found,null,2));
  fs.writeFileSync(MISSING, JSON.stringify(missing,null,2));
  console.log(`✔️ Descarga finalizada. Avatares: ${found.length}, Faltantes: ${missing.length}`);
})();





















