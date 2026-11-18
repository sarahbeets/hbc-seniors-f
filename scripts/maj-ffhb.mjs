// Met à jour data/matchs.json (et data/matchs.ics) à partir du site de la FFHB.
// Lancé chaque jour par GitHub Actions (.github/workflows/site.yml).
// À la main : node scripts/maj-ffhb.mjs

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { collecter } from './ffhb.mjs';

const racine = new URL('../', import.meta.url);
const fichier = chemin => new URL(chemin, racine);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 HBC-Seniors-F/1.0';

async function lireTexte(url, essais = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'fr-FR,fr;q=0.9' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i >= essais) throw new Error(`${url} → ${e.message}`);
      await new Promise(res => setTimeout(res, 2500 * i));
    }
  }
}

async function existe(f) {
  try { await access(f); return true; } catch { return false; }
}

// Copie les logos des clubs dans data/logos pour ne pas dépendre du site de la FFHB
async function rapatrierLogos(donnees) {
  await mkdir(fichier('data/logos/'), { recursive: true });
  const faits = new Map();
  const local = async url => {
    if (!url || !/^https:\/\/media-logos-clubs\.ffhandball\.fr\//.test(url)) return url;
    if (faits.has(url)) return faits.get(url);
    const nom = url.split('/').pop();
    const cible = fichier(`data/logos/${nom}`);
    let resultat = url;
    try {
      if (!(await existe(cible))) {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        await writeFile(cible, Buffer.from(await r.arrayBuffer()));
      }
      resultat = `data/logos/${nom}`;
    } catch (e) {
      console.warn(`Logo non copié (${nom}) : ${e.message}`);
    }
    faits.set(url, resultat);
    return resultat;
  };
  donnees.equipe.logo = await local(donnees.equipe.logo);
  for (const m of donnees.matchs) m.adversaire.logo = await local(m.adversaire.logo);
  for (const l of donnees.classement) l.logo = await local(l.logo);
}

const pad = n => String(n).padStart(2, '0');
const enUTC = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const echapperIcs = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const plier = ligne => {
  const out = [];
  let reste = ligne;
  while (Buffer.byteLength(reste) > 74) {
    let n = 74;
    while (Buffer.byteLength(reste.slice(0, n)) > 74) n--;
    out.push(reste.slice(0, n));
    reste = ' ' + reste.slice(n);
  }
  out.push(reste);
  return out.join('\r\n');
};

function calendrierIcs(donnees) {
  const nous = donnees.equipe.court || 'Nous';
  const lignes = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HBC Chateau-Renard//Seniors F//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${echapperIcs(`Matchs ${nous} SF`)}`, 'X-WR-TIMEZONE:Europe/Paris', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
  ];
  const maintenant = enUTC(new Date());
  for (const m of donnees.matchs) {
    if (!m.date) continue;
    const debut = new Date(m.date);
    if (Number.isNaN(debut.getTime())) continue;
    const fin = new Date(debut.getTime() + 2 * 3600 * 1000);
    const titre = m.domicile ? `${nous} - ${m.adversaire.court} (domicile)` : `${m.adversaire.court} - ${nous} (extérieur)`;
    const s = m.salle;
    const lieu = s ? [s.nom, s.rue, `${s.cp} ${s.ville}`.trim()].filter(Boolean).join(', ') : '';
    const desc = [`Journée ${m.journee} · ${m.competition}`, m.heureConnue ? '' : 'Horaire à confirmer', m.url].filter(Boolean).join('\n');
    lignes.push(
      'BEGIN:VEVENT',
      `UID:ffhb-${m.id}@hbc-seniors-f`,
      `DTSTAMP:${maintenant}`,
      `DTSTART:${enUTC(debut)}`,
      `DTEND:${enUTC(fin)}`,
      `SUMMARY:${echapperIcs(`Match ${titre}`)}`,
      lieu ? `LOCATION:${echapperIcs(lieu)}` : null,
      `DESCRIPTION:${echapperIcs(desc)}`,
      `URL:${m.url}`,
      'END:VEVENT',
    );
  }
  lignes.push('END:VCALENDAR');
  return lignes.filter(Boolean).map(plier).join('\r\n') + '\r\n';
}

async function principal() {
  const config = JSON.parse(await readFile(fichier('scripts/ffhb.config.json'), 'utf8'));
  let ancien = null;
  try { ancien = JSON.parse(await readFile(fichier('data/matchs.json'), 'utf8')); } catch { /* premier lancement */ }
  const sallesConnues = {};
  for (const m of ancien?.matchs || []) if (m.equipementId && m.salle) sallesConnues[m.equipementId] = m.salle;

  const donnees = await collecter({
    ...config,
    lireTexte,
    sallesConnues,
    journal: t => console.log(t),
  });
  if (!donnees.matchs.length) throw new Error("Aucun match trouvé : le site de la FFHB a peut-être changé. L'ancien calendrier est conservé.");

  await rapatrierLogos(donnees);
  await mkdir(fichier('data/'), { recursive: true });
  await writeFile(fichier('data/matchs.json'), JSON.stringify(donnees, null, 1) + '\n');
  await writeFile(fichier('data/matchs.ics'), calendrierIcs(donnees));
  const avecDate = donnees.matchs.filter(m => m.date).length;
  console.log(`OK : ${donnees.matchs.length} matchs (${avecDate} avec une date), ${donnees.classement.length} équipes au classement.`);
}

principal().catch(e => {
  console.error(`Erreur : ${e.message}`);
  process.exit(1);
});
