// Lecture du calendrier, des résultats et du classement d'une équipe sur ffhandball.fr
// Aucune dépendance. Fonctionne avec Node 18+ (fetch intégré) comme dans un navigateur.
//
// Le site de la FFHB range ses données dans des balises
//   <smartfire-component name='competitions---rencontre-list' attributes="{...json...}">
// On lit ce JSON directement, page par page (une page par journée).

const LOGOS = 'https://media-logos-clubs.ffhandball.fr';

export function decoderEntites(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|quot|amp|lt|gt|apos|nbsp);/gi, (tout, e) => {
    const l = e.toLowerCase();
    if (l === 'quot') return '"';
    if (l === 'amp') return '&';
    if (l === 'lt') return '<';
    if (l === 'gt') return '>';
    if (l === 'apos') return "'";
    if (l === 'nbsp') return ' ';
    if (l[0] === '#') return String.fromCodePoint(l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10));
    return tout;
  });
}

// Renvoie le JSON du premier composant portant ce nom, ou null s'il n'existe pas.
export function lireComposant(html, nom) {
  const re = /<smartfire-component\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const n = /\bname\s*=\s*(["'])(.*?)\1/i.exec(attrs);
    if (!n || n[2] !== nom) continue;
    const a = /\battributes\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    if (!a) return {};
    try {
      return JSON.parse(decoderEntites(a[1] ?? a[2]));
    } catch (e) {
      throw new Error(`Composant ${nom} illisible (${e.message})`);
    }
  }
  return null;
}

// Certaines valeurs sont du JSON "dans une chaîne". On les décode si besoin.
export function jsonPeutEtre(v) {
  if (typeof v !== 'string') return v ?? null;
  const t = v.trim();
  if (!t || (t[0] !== '[' && t[0] !== '{')) return v;
  try { return JSON.parse(t); } catch { return v; }
}

export function normaliser(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'et', 'en', 'a', 'au', 'aux']);
const SIGLES = new Set(['HB', 'HBC', 'US', 'USM', 'AS', 'SF', 'CS', 'ES', 'HC', 'UHB', 'ASPTT', 'CD', 'JS', 'EC', 'SC', 'AC', 'CA', 'FC', 'ST']);
const ACCENTS = {
  CHATEAU: 'Château', ORLEANS: 'Orléans', VENDOMOISE: 'Vendômoise', FEMININ: 'Féminin', FERTE: 'Ferté',
  ETAMPES: 'Étampes', ECOLE: 'École', ETOILE: 'Étoile', OLYMPIQUE: 'Olympique', CHALETTE: 'Châlette',
};

// "OUZOUER SUR LOIRE HB" → "Ouzouer sur Loire HB"
export function joli(nom) {
  return String(nom ?? '').trim().split(/(\s+|-|\/)/).map((mot, i) => {
    if (!mot || /^(\s+|-|\/)$/.test(mot)) return mot;
    const haut = mot.toUpperCase();
    if (SIGLES.has(haut)) return haut;
    if (ACCENTS[haut]) return ACCENTS[haut];
    const bas = mot.toLowerCase();
    if (i > 0 && PETITS.has(bas)) return bas;
    return bas.charAt(0).toUpperCase() + bas.slice(1);
  }).join('');
}

export function nomCourt(nom, table = {}) {
  const k = normaliser(nom);
  for (const [cle, val] of Object.entries(table || {})) if (normaliser(cle) === k) return val;
  return joli(nom);
}

export function urlLogo(fichier, actif = '1', taille = 128) {
  if (!fichier || String(actif) === '0') return null;
  return `${LOGOS}/${taille}/${String(fichier).replace(/\.[a-z0-9]+$/i, '')}.webp`;
}

// https://www.ffhandball.fr/competitions/<saison>/<type>/<competition>/poule-123/... → base de la compétition
export function baseCompetition(url, slugCompetition) {
  const u = new URL(url);
  const morceaux = u.pathname.split('/').filter(Boolean);
  let fin = slugCompetition ? morceaux.indexOf(slugCompetition) : -1;
  if (fin < 0) {
    const iPoule = morceaux.findIndex(m => /^poule-\d+$/.test(m));
    fin = iPoule > 0 ? iPoule - 1 : morceaux.length - 1;
  }
  return `${u.origin}/${morceaux.slice(0, fin + 1).join('/')}/`;
}

const estCode = v => v != null && String(v).trim() !== '' && !/^-?\d+$/.test(String(v).trim());
const nombre = v => (v == null || String(v).trim() === '' || estCode(v) ? null : Number(v));

export function resultatDe(scoreNous, scoreEux) {
  if (scoreNous == null && scoreEux == null) return { resultat: null, forfait: null };
  const cN = estCode(scoreNous), cE = estCode(scoreEux);
  if (cE && !cN) return { resultat: 'V', forfait: 'eux' };
  if (cN && !cE) return { resultat: 'D', forfait: 'nous' };
  if (cN && cE) return { resultat: null, forfait: 'les deux' };
  const n = nombre(scoreNous), e = nombre(scoreEux);
  if (n == null || e == null) return { resultat: null, forfait: null };
  return { resultat: n > e ? 'V' : n < e ? 'D' : 'N', forfait: null };
}

export function heureConnue(date) {
  const m = /T(\d\d):(\d\d)/.exec(date || '');
  return !!m && !(m[1] === '00' && m[2] === '00');
}

function convertirRencontre(r, ctx) {
  const dom = ctx.domicile;
  const nous = dom ? 1 : 2;
  const eux = dom ? 2 : 1;
  const sN = r[`equipe${nous}Score`];
  const sE = r[`equipe${eux}Score`];
  const joue = sN != null || sE != null;
  const { resultat, forfait } = resultatDe(sN, sE);
  return {
    id: String(r.ext_rencontreId),
    journee: Number(r.journeeNumero) || ctx.journee.n,
    competition: ctx.competition,
    poule: ctx.poule,
    date: r.date || null,
    heureConnue: heureConnue(r.date),
    weekend: { debut: ctx.journee.debut || null, fin: ctx.journee.fin || null },
    domicile: dom,
    adversaire: {
      nom: r[`equipe${eux}Libelle`] || '',
      court: nomCourt(r[`equipe${eux}Libelle`], ctx.nomsCourts),
      logo: urlLogo(r[`structure${eux}Logo`], r[`equipe${eux}ShowLogo`]),
    },
    score: joue ? {
      nous: sN == null ? null : String(sN),
      eux: sE == null ? null : String(sE),
      mtNous: r[`equipe${nous}ScoreMT`] == null ? null : String(r[`equipe${nous}ScoreMT`]),
      mtEux: r[`equipe${eux}ScoreMT`] == null ? null : String(r[`equipe${eux}ScoreMT`]),
    } : null,
    resultat,
    forfait,
    equipementId: r.equipementId ? String(r.equipementId) : null,
    salle: null,
    url: `${ctx.urlPoule}rencontre-${r.ext_rencontreId}/`,
  };
}

function convertirSalle(e) {
  if (!e || !e.libelle) return null;
  const lat = Number(e.latitude), lng = Number(e.longitude);
  return {
    nom: e.libelle || '',
    rue: (e.rue || '').replace(/\s+/g, ' ').trim(),
    cp: e.codePostal || '',
    ville: e.ville || '',
    lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
    lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
  };
}

// options.competitions : liste d'adresses (texte) ou d'objets { url, nom }
// options.lireTexte(url) : renvoie le HTML d'une page (promesse)
export async function collecter(options) {
  const {
    competitions,
    equipe,
    nomsCourts = {},
    lireTexte,
    pause = 350,
    journal = () => {},
    sallesConnues = {},
  } = options;
  if (!competitions?.length) throw new Error('Aucune compétition dans la configuration');
  const attendre = ms => new Promise(r => setTimeout(r, ms));
  const cible = normaliser(equipe);
  const sortie = {
    version: 1,
    maj: new Date().toISOString(),
    equipe: { nom: equipe, court: nomCourt(equipe, nomsCourts), logo: null },
    competitions: [],
    matchs: [],
    classement: [],
  };
  const poulesVues = new Set();

  for (const entree of competitions) {
    const url = typeof entree === 'string' ? entree : entree.url;
    const html = await lireTexte(url);
    const entete = lireComposant(html, 'page-header') || {};
    const selecteur = lireComposant(html, 'competitions---poule-selector') || {};
    const liste = lireComposant(html, 'competitions---rencontre-list') || {};
    const base = baseCompetition(url, selecteur.url_competition || liste.url_competition);
    const nomCompetition = (typeof entree === 'object' && entree.nom) || joli(entete.title || 'Championnat');

    let poules = jsonPeutEtre(selecteur.poules);
    if (!Array.isArray(poules) || !poules.length) {
      const p = jsonPeutEtre(liste.poule);
      poules = p && p.ext_pouleId ? [p] : [];
    }
    if (!poules.length) throw new Error(`Aucune poule trouvée sur ${url}`);

    for (const poule of poules) {
      const idPoule = String(poule.ext_pouleId);
      if (poulesVues.has(idPoule)) continue;
      poulesVues.add(idPoule);
      const urlPoule = `${base}poule-${idPoule}/`;
      await attendre(pause);
      const htmlPoule = await lireTexte(urlPoule);
      const selPoule = lireComposant(htmlPoule, 'competitions---poule-selector') || {};
      const equipes = jsonPeutEtre(selPoule.equipe_options) || [];
      const notre = equipes.find(e => normaliser(e.libelle) === cible)
        || equipes.find(e => normaliser(e.libelle).includes(cible));
      if (equipes.length && !notre) {
        journal(`${poule.libelle} : ${equipe} n'y joue pas, on passe`);
        continue;
      }
      const estNous = (id, libelle) => (notre ? String(id) === String(notre.id) : normaliser(libelle) === cible);

      let jours = jsonPeutEtre(poule.journees);
      if (!Array.isArray(jours)) {
        const js = lireComposant(htmlPoule, 'competitions---journee-selector') || {};
        jours = jsonPeutEtre(jsonPeutEtre(js.poule)?.journees) || [];
      }
      jours = jours.map(j => ({ n: Number(j.journee_numero), debut: j.date_debut, fin: j.date_fin })).filter(j => j.n > 0);
      if (!jours.length) throw new Error(`Aucune journée trouvée pour ${poule.libelle}`);

      const libellePoule = joli(poule.libelle || '');
      sortie.competitions.push({ nom: nomCompetition, poule: libellePoule, url: urlPoule });
      journal(`${nomCompetition} · ${libellePoule} · ${jours.length} journées`);

      for (const j of jours) {
        await attendre(pause);
        const hj = await lireTexte(`${urlPoule}journee-${j.n}/`);
        const rl = lireComposant(hj, 'competitions---rencontre-list') || {};
        const rencontres = jsonPeutEtre(rl.rencontres) || [];
        for (const r of rencontres) {
          const dom = estNous(r.equipe1Id, r.equipe1Libelle);
          const ext = estNous(r.equipe2Id, r.equipe2Libelle);
          if (!dom && !ext) continue;
          if (!sortie.equipe.logo) {
            const n = dom ? 1 : 2;
            sortie.equipe.logo = urlLogo(r[`structure${n}Logo`], r[`equipe${n}ShowLogo`]);
          }
          sortie.matchs.push(convertirRencontre(r, {
            domicile: dom, journee: j, urlPoule, nomsCourts,
            competition: nomCompetition, poule: libellePoule,
          }));
        }
      }

      if (!sortie.classement.length) {
        await attendre(pause);
        const hc = await lireTexte(`${urlPoule}classements/`);
        const lignes = jsonPeutEtre(lireComposant(hc, 'competitions---classement')?.classements) || [];
        sortie.classement = lignes.map(l => ({
          place: Number(l.place),
          nom: l.equipe_libelle,
          court: nomCourt(l.equipe_libelle, nomsCourts),
          logo: urlLogo(l.structure_logo, l.equipe_logoActif),
          pts: Number(l.point), j: Number(l.joue), v: Number(l.gagne), n: Number(l.nul), d: Number(l.perdu),
          bp: Number(l.butPlus), bc: Number(l.butMoins), diff: Number(l.diff),
          forme: String(l.dernieresRencontres || '').split(';').filter(x => x !== '').map(Number),
          nous: notre ? String(l.equipeId) === String(notre.id) : normaliser(l.equipe_libelle) === cible,
        })).sort((a, b) => a.place - b.place);
      }
    }
  }

  // Gymnases : une page de match suffit pour chaque salle différente
  const salles = new Map(Object.entries(sallesConnues || {}));
  const aChercher = new Map();
  for (const m of sortie.matchs) if (m.equipementId && !aChercher.has(m.equipementId)) aChercher.set(m.equipementId, m.url);
  for (const [id, urlMatch] of aChercher) {
    try {
      await attendre(pause);
      const hm = await lireTexte(urlMatch);
      const salle = convertirSalle(lireComposant(hm, 'competitions---rencontre-salle')?.equipement);
      if (salle) salles.set(id, salle);
    } catch (e) {
      journal(`Salle ${id} non lue (${e.message}), on garde l'ancienne si elle existe`);
    }
  }
  for (const m of sortie.matchs) m.salle = (m.equipementId && salles.get(m.equipementId)) || null;

  sortie.matchs.sort((a, b) => (a.journee - b.journee) || String(a.date).localeCompare(String(b.date)));
  return sortie;
}
