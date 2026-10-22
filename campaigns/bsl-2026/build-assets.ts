import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { renderMarketingEmail } from '../../apps/mobile-app/lib/marketing';
import pack from '../../apps/mobile-app/config/marketing/bsl2026.json';

async function main() {
const root = path.resolve('campaigns/bsl-2026');
const repo = path.resolve(root, '../..');
const publicDir = path.join(repo, 'apps/mobile-app/public/campaigns/bsl-2026');
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
await mkdir(publicDir, { recursive: true });
await mkdir(path.join(root, 'emails'), { recursive: true });
await copyFile(path.join(repo, 'apps/mobile-app/assets/logos/hashpass/logo-full-hashpass-white-cyan.png'), path.join(publicDir, 'hashpass-logo.png'));
for (const message of pack.messages) for (const locale of ['es', 'en'] as const) {
  const rendered = renderMarketingEmail(message.content[locale], 'https://api.hashpass.tech/api/marketing/unsubscribe?token=PREVIEW', locale, 'BSL COLOMBIA 2026 · BOGOTÁ · NOV 4–6');
  await writeFile(path.join(root, `emails/${message.key}.${locale}.html`), rendered.html);
  await writeFile(path.join(root, `emails/${message.key}.${locale}.txt`), `REVIEW PREVIEW — recipient unsubscribe token is inserted only at send time.\n\n${rendered.text}\n`);
}
const films = [
  { id: 'teaser', title: 'Antes de llegar, empieza a conectar.', caption: 'BSL Colombia · 4–6 noviembre · Bogotá. Explora el evento, prepara tu agenda y empieza tu red en HASHPASS.', scenes: [
    ['BSL COLOMBIA 2026', 'Antes de llegar,<br>empieza a<br>conectar.', '4–6 noviembre · Bogotá', '01 / EXPLORA LO QUE VIENE'],
    ['TU EVENTO, A TU MANERA', 'Tu agenda.<br>Tus reuniones.<br>Tu red.', 'Una acción hoy. Más posibilidades al llegar.', '02 / PREPÁRATE CON HASHPASS'],
    ['NOS VEMOS EN BOGOTÁ', 'Llega con<br>conexiones<br>en marcha.', 'Universidad Externado · edificios H e I', 'HASHPASS.TECH / EVENTOS'],
  ] },
  { id: 'agenda', title: 'Crea tu agenda para BSL Colombia', caption: 'Abre el programa, guarda tus sesiones favoritas y confirma tu asistencia cuando esté disponible. Consulta cambios del organizador antes de llegar.', scenes: [
    ['GUÍA · AGENDA / 01', 'Encuentra<br>tu próxima<br>gran idea.', 'Abre BSL Colombia en HASHPASS y entra en Agenda.', '4–6 NOVIEMBRE · BOGOTÁ'],
    ['GUÍA · AGENDA / 02', 'Guarda lo<br>que te mueve.', 'Filtra el programa y marca tus sesiones favoritas.', 'ELIGE POR TUS INTERESES'],
    ['GUÍA · AGENDA / 03', 'Haz espacio<br>para lo<br>importante.', 'Confirma cuando esté disponible y revisa tu agenda. Favorito no garantiza un cupo.', 'HASHPASS.TECH / EVENTS / COLOMBIA2026 / AGENDA'],
  ] },
  { id: 'meetings', title: 'Solicita una reunión con intención', caption: 'Encuentra un perfil relevante, escribe una propuesta concreta y envía una solicitud. Una solicitud pendiente no es una reunión confirmada.', scenes: [
    ['GUÍA · REUNIONES / 01', 'Una buena<br>conversación<br>empieza aquí.', 'Entra en Networking y encuentra perfiles relevantes.', 'BUSCA UN INTERÉS EN COMÚN'],
    ['GUÍA · REUNIONES / 02', 'Di por qué<br>vale la pena<br>conocerse.', 'Escribe una propuesta concreta y envía tu solicitud según los límites de tu pase.', 'CONTEXTO + PROPÓSITO + RESPETO'],
    ['GUÍA · REUNIONES / 03', 'La conexión<br>se construye<br>entre dos.', 'Espera la aceptación. Revisa Mis solicitudes y Mi agenda para seguir el estado.', 'PENDIENTE ≠ CONFIRMADA'],
  ] },
  { id: 'contacts', title: 'Construye tu red en Contacts', caption: 'Completa tu tarjeta e intereses, comparte tu enlace o QR y acepta conexiones. La red crece con consentimiento mutuo. Network XP y los puntos provisionales de actividad son distintos.', scenes: [
    ['GUÍA · CONTACTS / 01', 'Un interés.<br>Una nueva<br>conexión.', 'Abre Contacts. Completa tu tarjeta y elige tus temas de interés.', 'TU RED EMPIEZA CONTIGO'],
    ['GUÍA · CONTACTS / 02', 'Comparte<br>algo más<br>que un nombre.', 'Comparte tu enlace o QR y envía una solicitud a personas que quieras conocer.', 'HASHPASS.TECH / CONTACTS'],
    ['GUÍA · CONTACTS / 03', 'Más conexiones.<br>Más caminos<br>por descubrir.', 'Acepta conexiones para hacer crecer tu red. Tú decides tu visibilidad en el ranking.', 'NETWORK XP ES DISTINTO DEL BONUS $LKS'],
  ] },
  { id: 'activity', title: 'Actividad y futuro bonus exclusivo $LKS', caption: 'HASHPASS prepara puntos provisionales por interacciones verificadas para un futuro bonus exclusivo de usuarios en el TGE de $LKS. Tiers, corte, asignación y pasos de reclamo se anunciarán. Un registro de testnet no es una distribución de tokens.', scenes: [
    ['ACTIVIDAD · PROGRAMA EN PREPARACIÓN', 'Participa.<br>Conecta.<br>Construye.', 'Las interacciones verificadas registran puntos provisionales de actividad.', 'AGENDA · REUNIONES · CONTACTS'],
    ['FUTURO BONUS EXCLUSIVO DE USUARIOS', 'Tu actividad,<br>en el camino<br>al TGE $LKS.', 'Los niveles y la asignación final se anunciarán en los canales oficiales.', 'SIN MONTOS NI FECHA DE TGE ANUNCIADOS'],
    ['TESTNET · REGISTROS DE PRUEBA', 'Sigue las<br>novedades<br>oficiales.', 'Un snapshot preparado no es una publicación on-chain ni una entrega de tokens.', 'HASHPASS.TECH'],
  ] },
];
const css = `@font-face{font-family:Manrope;src:url(assets/manrope.woff2)}*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden;background:#111114;color:#fafafa;font-family:Manrope,sans-serif}.clip{position:absolute;inset:0}.scene-content{width:100%;height:100%;display:flex;flex-direction:column;padding:110px 88px 150px;gap:56px;background:#111114}.logo{width:320px;height:auto;object-fit:contain;align-self:flex-start}.kicker{color:#22d3ee;font-size:28px;font-weight:700;letter-spacing:3px;line-height:1.5;max-width:880px}.headline{font-size:106px;line-height:1.06;letter-spacing:-5px;font-weight:700;max-width:900px}.body{font-size:36px;line-height:1.55;color:#b0b0bc;max-width:850px}.footer{margin-top:auto;font-size:28px;line-height:1.6;letter-spacing:2px;color:#b0b0bc;max-width:870px;overflow-wrap:anywhere}.network{width:800px;height:280px;flex-shrink:0}.line{stroke:#2d2d38;stroke-width:3}.node{fill:#19191f;stroke:#22d3ee;stroke-width:3}.core{fill:#0e7490}.progress{height:4px;background:#22d3ee;transform-origin:left}.poster{width:1080px;height:1350px;position:relative}.poster .scene-content{padding:80px;gap:40px}.poster .headline{font-size:96px}.poster .network{height:200px}.poster .body{font-size:32px}.poster .footer{font-size:28px}`;
const network = `<svg class="network" viewBox="0 0 800 280" role="img" aria-label="Red de conexiones"><path class="line" d="M80 160L260 70L440 140L700 60M80 160L300 240L440 140L720 230M260 70L300 240M440 140L700 60" fill="none"/>${[[80,160],[260,70],[300,240],[440,140],[700,60],[720,230]].map(([cx,cy], i) => `<circle class="node ${i===3?'core':''}" cx="${cx}" cy="${cy}" r="${i===3?34:20}"/>`).join('')}</svg>`;
for (const film of films) {
  const dir = path.join(root, `videos/${film.id}`);
  await mkdir(path.join(dir, 'assets'), { recursive: true });
  await copyFile(path.join(root, 'assets/Manrope-OFL.txt'), path.join(dir, 'assets/Manrope-OFL.txt'));
  await copyFile(path.join(root, 'assets/gsap.min.js'), path.join(dir, 'assets/gsap.min.js'));
  await copyFile(path.join(publicDir, 'hashpass-logo.png'), path.join(dir, 'assets/logo.png'));
  await copyFile(path.join(repo, 'node_modules/@fontsource/manrope/files/manrope-latin-700-normal.woff2'), path.join(dir, 'assets/manrope.woff2'));
  await writeFile(path.join(dir, 'hyperframes.json'), JSON.stringify({ authoringSkill: 'hyperframes', paths: { assets: 'assets' } }, null, 2));
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ private: true, scripts: { check: 'npx hyperframes@0.8.185 check', render: 'npx hyperframes@0.8.185 render --fps 24' } }, null, 2));
  const scenes = film.scenes.map(([kicker, headline, body, footer], i) => `<section id="scene-${i}" class="clip" data-start="${i*6}" data-duration="${i===2?6:6.6}" data-track-index="${i}"><div class="scene-content" data-layout-allow-overlap="opaque push between scenes" data-hold="caption reading time"><img class="logo" src="assets/logo.png" alt="HASHPASS"><div class="kicker">${esc(kicker)}</div><h1 class="headline">${headline}</h1>${network}<p class="body">${esc(body)}</p><div class="footer">${esc(footer)}</div></div></section>`).join('');
  const animation = `window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});${film.scenes.map((_, i) => `tl.fromTo('#scene-${i} .kicker,#scene-${i} .headline,#scene-${i} .network,#scene-${i} .body,#scene-${i} .footer',{y:36,opacity:0},{y:0,opacity:1,duration:.7,stagger:.12,ease:'power3.out'},${i*6+.15});${i>0?`tl.fromTo('#scene-${i}',{x:1080},{x:0,duration:.6,ease:'power3.inOut'},${i*6});`:''}tl.fromTo('#scene-${i} .node',{scale:.7,transformOrigin:'center'},{scale:1,duration:.6,stagger:.08,ease:'back.out(1.4)'},${i*6+.8});`).join('')}tl.to({}, {duration:.01},17.99);window.__timelines['${film.id}']=tl;`;
  await writeFile(path.join(dir, 'index.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=1080,height=1920"><title>${esc(film.title)}</title><script src="assets/gsap.min.js"></script><style>${css}</style></head><body><main data-composition-id="${film.id}" data-start="0" data-duration="18" data-width="1080" data-height="1920">${scenes}</main><script>${animation}</script></body></html>`);
  const [kicker, headline, body, footer] = film.scenes[0];
  await writeFile(path.join(dir, 'poster.html'), `<!doctype html><html lang="es"><meta charset="utf-8"><title>${esc(film.title)}</title><style>${css}html,body{height:1350px}</style><body><main class="poster"><div class="scene-content" data-layout-allow-overlap="opaque push between scenes" data-hold="caption reading time"><img class="logo" src="assets/logo.png" alt="HASHPASS"><div class="kicker">${esc(kicker)}</div><h1 class="headline">${headline}</h1>${network}<p class="body">${esc(body)}</p><div class="footer">${esc(footer)}</div></div></main></body></html>`);
  await writeFile(path.join(root, `videos/${film.id}/caption.txt`), `${film.caption}\n\n#HASHPASS #BSLColombia2026\n`);
}
await writeFile(path.join(publicDir, 'index.html'), `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prepárate para BSL Colombia 2026 · HASHPASS</title><style>body{margin:0;padding:32px 24px;background:#111114;color:#fafafa;font:18px/1.6 Arial,sans-serif}main{max-width:1100px;margin:auto}h1{font-size:clamp(36px,6vw,72px);line-height:1.1}h2{font-size:32px}a{color:#22d3ee}section{padding:40px 0;border-bottom:1px solid #2d2d38}video{max-width:360px;width:100%;max-height:640px}img.logo{width:200px}p{max-width:760px}.grid{display:flex;gap:32px;flex-wrap:wrap}</style><main><img class="logo" src="hashpass-logo.png" alt="HASHPASS"><p>4–6 NOVIEMBRE · BOGOTÁ</p><h1>Antes de llegar,<br>empieza a conectar.</h1><p>Prepárate para BSL Colombia 2026 con estas guías. Sede del catálogo: edificios H e I, Universidad Externado, La Candelaria. Consulta los avisos del organizador para cambios.</p><p><a href="https://hashpass.tech/events/colombia2026">Explorar BSL Colombia</a> · <a href="https://hashpass.tech/contacts">Abrir Contacts</a></p>${films.map(film => `<section id="${film.id}"><h2>${esc(film.title)}</h2><div class="grid"><video controls preload="metadata" poster="${film.id}-poster.png" aria-label="${esc(film.title)}"><source src="${film.id}.mp4" type="video/mp4"></video><div><p>${esc(film.caption)}</p><ol>${film.scenes.map(([, , step]) => `<li>${esc(step)}</li>`).join('')}</ol><p><a href="${film.id}.mp4" download>Descargar video</a> · <a href="${film.id}-poster.png" download>Descargar pieza social</a></p></div></div></section>`).join('')}<p>Las guías animadas explican los flujos; no muestran cuentas ni reuniones reales. Los límites y accesos dependen del pase. Network XP es distinto de puntos provisionales y de tokens $LKS. Los tiers, reglas finales y fecha del TGE se anunciarán.</p></main></html>`);
console.log('Built 12 email HTML/text previews, five video sources, social poster sources and a public guide page.');

}
main().catch(error => { console.error(error); process.exitCode = 1; });
