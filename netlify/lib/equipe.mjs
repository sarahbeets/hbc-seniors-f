// Données de l'équipe : réponses, covoiturage, membres, annulations, rendez-vous en plus et réglages.
// Aucune dépendance à Netlify ici : le stockage est fourni de l'extérieur (Netlify Blobs en ligne,
// un faux stockage pour les tests et pour l'aperçu).
//
// Rangement :
//   config         → réglages de l'équipe, modifiés seulement depuis l'espace Gestion
//   m/<id>         → réponses et covoiturage d'un membre, modifiés seulement par ce membre

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const REPONSES = new Set(['oui', 'peut', 'non']);
const ROLES = new Set(['joueuse', 'coach']);
const APPORTS = ['alcool', 'soft', 'sale', 'sucre'];
const ID_RDV = /^[A-Z]-[A-Za-z0-9_-]{1,80}$/;
// Un rendez-vous ajouté peut être un match : à l'extérieur il ouvre le covoiturage, à domicile le « qui ramène quoi »
const GENRES = ['autre', 'exterieur', 'domicile'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

const ENTETES = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

class ErreurApi extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const echec = (code, message) => new ErreurApi(code, message);

export const texte = (v, max = 200) => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max);
const normaliser = v => texte(v, 400).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const slug = v => normaliser(v).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'membre';
const hasard = () => Math.random().toString(36).slice(2, 6);

function idLibre(base, pris) {
  let id = base, n = 2;
  while (pris.has(id)) id = `${base}-${n++}`;
  pris.add(id);
  return id;
}

export function configDeDepart(env = {}) {
  let liste = [];
  try { liste = JSON.parse(env.MEMBRES_DEPART || '[]'); } catch { liste = []; }
  const pris = new Set();
  const membres = liste.map(m => {
    const [prenom, nom, role] = Array.isArray(m) ? m : [m.prenom, m.nom, m.role];
    return { id: idLibre(slug(`${prenom} ${nom || ''}`), pris), prenom: texte(prenom, 40), nom: texte(nom, 40), role: ROLES.has(role) ? role : 'joueuse', active: true };
  }).filter(m => m.prenom);
  return {
    version: 1,
    codeGestion: texte(env.CODE_GESTION, 40),
    membres,
    entrainements: [{ jour: 'mercredi', heure: '20:00' }, { jour: 'vendredi', heure: '20:30' }],
    finSaison: '2027-06-30',
    lieuEntrainement: '',
    annonce: '',
    annulations: [],
    ajouts: [],
  };
}

export function creerApi({ store, env = {} }) {
  async function lireConfig() {
    const e = await store.getWithMetadata('config', { type: 'json' });
    if (e && e.data) return { config: e.data, etag: e.etag };
    const config = configDeDepart(env);
    const r = await store.setJSON('config', config, { onlyIfNew: true });
    if (r && r.modified) return { config, etag: r.etag };
    const e2 = await store.getWithMetadata('config', { type: 'json' });
    return { config: e2.data, etag: e2.etag };
  }

  async function majConfig(modifier) {
    for (let essai = 0; essai < 6; essai++) {
      const { config, etag } = await lireConfig();
      const copie = JSON.parse(JSON.stringify(config));
      modifier(copie);
      const r = await store.setJSON('config', copie, { onlyIfMatch: etag });
      if (r && r.modified) return copie;
    }
    throw echec('OCCUPE', 'Trop de modifications en même temps, réessaie dans un instant.');
  }

  async function majMembre(id, modifier) {
    const cle = `m/${id}`;
    for (let essai = 0; essai < 6; essai++) {
      const e = await store.getWithMetadata(cle, { type: 'json' });
      const doc = e && e.data ? e.data : { reponses: {}, covoit: {}, apports: {} };
      doc.reponses = doc.reponses || {};
      doc.covoit = doc.covoit || {};
      doc.apports = doc.apports || {};
      modifier(doc);
      doc.maj = new Date().toISOString();
      const r = e && e.data
        ? await store.setJSON(cle, doc, { onlyIfMatch: e.etag })
        : await store.setJSON(cle, doc, { onlyIfNew: true });
      if (r && r.modified) return doc;
    }
    throw echec('OCCUPE', 'Ta réponse n’est pas passée, réessaie dans un instant.');
  }

  async function documents(membres) {
    const docs = await Promise.all(membres.map(m => store.get(`m/${m.id}`, { type: 'json' })));
    return new Map(membres.map((m, i) => [m.id, docs[i] || { reponses: {}, covoit: {}, apports: {} }]));
  }

  async function etat(config, gestion) {
    const actifs = config.membres.filter(m => m.active);
    const docs = await documents(actifs);
    const reponses = {}, covoit = {}, apports = {};
    for (const m of actifs) {
      const d = docs.get(m.id);
      for (const [ev, r] of Object.entries(d.reponses || {})) (reponses[ev] = reponses[ev] || {})[m.id] = r;
      for (const [ev, c] of Object.entries(d.covoit || {})) (covoit[ev] = covoit[ev] || {})[m.id] = c;
      for (const [ev, a] of Object.entries(d.apports || {})) (apports[ev] = apports[ev] || {})[m.id] = a;
    }
    // Le site s'ouvre sans code : pour tout le monde on ne montre que l'initiale du nom de famille,
    // les noms complets restent réservés à l'espace Gestion.
    const sortie = {
      ok: true,
      membres: actifs.map(({ id, prenom, nom, role }) => ({ id, prenom, nom: nom ? `${nom.charAt(0).toUpperCase()}.` : '', role })),
      reponses,
      covoit,
      apports,
      annulations: config.annulations,
      ajouts: config.ajouts,
      entrainements: config.entrainements,
      finSaison: config.finSaison,
      reglages: { lieuEntrainement: config.lieuEntrainement, annonce: config.annonce },
      serveur: new Date().toISOString(),
    };
    if (gestion) {
      sortie.gestion = {
        membres: config.membres.map(({ id, prenom, nom, role, active }) => ({ id, prenom, nom, role, active })),
      };
    }
    return sortie;
  }

  function membreActif(config, id) {
    const m = config.membres.find(x => x.id === texte(id, 60) && x.active);
    if (!m) throw echec('MEMBRE', 'Ce prénom n’est plus dans l’équipe, choisis-le à nouveau.');
    return m;
  }
  function idRdv(v) {
    const id = texte(v, 90);
    if (!ID_RDV.test(id)) throw echec('REQUETE', 'Rendez-vous inconnu');
    return id;
  }

  async function repondre(config, c) {
    const m = membreActif(config, c.membre);
    const ev = idRdv(c.evenement);
    const r = REPONSES.has(c.reponse) ? c.reponse : '';
    await majMembre(m.id, doc => {
      if (r) doc.reponses[ev] = r; else delete doc.reponses[ev];
    });
  }

  async function covoiturer(config, c) {
    const m = membreActif(config, c.membre);
    const ev = idRdv(c.evenement);
    const role = c.role === 'conductrice' || c.role === 'passagere' ? c.role : '';
    let entree = null;
    if (role === 'conductrice') {
      entree = { role, places: Math.min(8, Math.max(1, parseInt(c.places, 10) || 1)), avec: '', depart: texte(c.depart, 80) };
    } else if (role === 'passagere') {
      const avec = texte(c.avec, 60);
      if (avec) {
        const actifs = config.membres.filter(x => x.active);
        const docs = await documents(actifs);
        const voiture = docs.get(avec) && docs.get(avec).covoit[ev];
        if (!voiture || voiture.role !== 'conductrice') throw echec('COVOIT', 'Cette voiture n’est plus proposée.');
        const prises = actifs.filter(x => x.id !== m.id && docs.get(x.id).covoit[ev] && docs.get(x.id).covoit[ev].role === 'passagere' && docs.get(x.id).covoit[ev].avec === avec).length;
        const conductrice = config.membres.find(x => x.id === avec);
        if (prises >= voiture.places) throw echec('COVOIT', `Plus de place dans la voiture de ${conductrice ? conductrice.prenom : 'cette personne'}.`);
      }
      entree = { role, places: 0, avec, depart: '' };
    }
    await majMembre(m.id, doc => {
      if (entree) doc.covoit[ev] = entree; else delete doc.covoit[ev];
    });
  }

  async function apporter(config, c) {
    const m = membreActif(config, c.membre);
    const ev = idRdv(c.evenement);
    const liste = (Array.isArray(c.liste) ? c.liste : []).filter((x, i, t) => APPORTS.includes(x) && t.indexOf(x) === i);
    await majMembre(m.id, doc => {
      if (liste.length) doc.apports[ev] = liste; else delete doc.apports[ev];
    });
  }

  function verifierDate(v, nom) {
    const d = texte(v, 10);
    if (!DATE.test(d) || Number.isNaN(new Date(`${d}T12:00:00Z`).getTime())) throw echec('REQUETE', `${nom} invalide`);
    return d;
  }

  async function gerer(c) {
    const op = c.op;
    return majConfig(cfg => {
      if (op === 'annonce') cfg.annonce = texte(c.texte, 240);
      else if (op === 'lieu') cfg.lieuEntrainement = texte(c.texte, 120);
      else if (op === 'fin-saison') cfg.finSaison = verifierDate(c.date, 'Date de fin de saison');
      else if (op === 'entrainements') {
        const liste = Array.isArray(c.liste) ? c.liste : [];
        const propres = liste.map(e => ({ jour: normaliser(e.jour), heure: texte(e.heure, 5) }))
          .filter(e => JOURS.includes(e.jour) && HEURE.test(e.heure)).slice(0, 7);
        propres.sort((a, b) => ((JOURS.indexOf(a.jour) + 6) % 7) - ((JOURS.indexOf(b.jour) + 6) % 7) || a.heure.localeCompare(b.heure));
        cfg.entrainements = propres;
      } else if (op === 'annulation-ajouter') {
        const du = verifierDate(c.du, 'Date');
        const au = c.au ? verifierDate(c.au, 'Date de fin') : du;
        if (au < du) throw echec('REQUETE', 'La date de fin est avant la date de début.');
        cfg.annulations.push({ id: `a-${du}-${hasard()}`, du, au, motif: texte(c.motif, 80) || 'Pas d’entraînement' });
        cfg.annulations.sort((a, b) => a.du.localeCompare(b.du));
      } else if (op === 'annulation-retirer') {
        cfg.annulations = cfg.annulations.filter(a => a.id !== c.id);
      } else if (op === 'ajout-ajouter') {
        const date = verifierDate(c.date, 'Date');
        const heure = c.heure ? texte(c.heure, 5) : '';
        if (heure && !HEURE.test(heure)) throw echec('REQUETE', 'Heure invalide');
        const titre = texte(c.titre, 60);
        if (!titre) throw echec('REQUETE', 'Donne un titre au rendez-vous.');
        const genre = GENRES.includes(c.genre) ? c.genre : 'autre';
        cfg.ajouts.push({ id: `X-${date}-${heure.replace(':', '') || 'jour'}-${hasard()}`, date, heure, titre, genre, lieu: texte(c.lieu, 120), infos: texte(c.infos, 240) });
        cfg.ajouts.sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
      } else if (op === 'ajout-retirer') {
        cfg.ajouts = cfg.ajouts.filter(a => a.id !== c.id);
      } else if (op === 'ajout-modifier') {
        const a = cfg.ajouts.find(x => x.id === c.id);
        if (!a) throw echec('REQUETE', 'Ce rendez-vous n’existe plus.');
        if (!GENRES.includes(c.genre)) throw echec('REQUETE', 'Type de rendez-vous inconnu');
        a.genre = c.genre;
      } else if (op === 'membre-ajouter') {
        const prenom = texte(c.prenom, 40), nom = texte(c.nom, 40);
        if (!prenom) throw echec('REQUETE', 'Le prénom est obligatoire.');
        const pris = new Set(cfg.membres.map(m => m.id));
        cfg.membres.push({ id: idLibre(slug(`${prenom} ${nom}`), pris), prenom, nom, role: ROLES.has(c.role) ? c.role : 'joueuse', active: true });
      } else if (op === 'membre-modifier') {
        const m = cfg.membres.find(x => x.id === c.id);
        if (!m) throw echec('REQUETE', 'Membre introuvable');
        if (c.prenom !== undefined) { const p = texte(c.prenom, 40); if (!p) throw echec('REQUETE', 'Le prénom est obligatoire.'); m.prenom = p; }
        if (c.nom !== undefined) m.nom = texte(c.nom, 40);
        if (c.role !== undefined && ROLES.has(c.role)) m.role = c.role;
        if (c.active !== undefined) m.active = !!c.active;
      } else if (op === 'code-gestion') {
        const code = texte(c.nouveau, 40);
        if (code.length < 6) throw echec('REQUETE', 'Le code de gestion doit faire au moins 6 caractères.');
        cfg.codeGestion = code;
      } else {
        throw echec('REQUETE', 'Action de gestion inconnue');
      }
    });
  }

  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: ENTETES });

  async function traiter(req) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ENTETES });
    try {
      let p = {};
      if (req.method === 'GET') p = Object.fromEntries(new URL(req.url).searchParams);
      else if (req.method === 'POST') {
        const brut = await req.text();
        if (brut.length > 20000) throw echec('REQUETE', 'Requête trop longue');
        try { p = JSON.parse(brut || '{}'); } catch { throw echec('REQUETE', 'Requête illisible'); }
      } else throw echec('REQUETE', 'Méthode non prise en charge');

      // Plus de code d'équipe : le lien suffit, seul l'espace Gestion reste protégé par son code.
      let { config } = await lireConfig();
      const gestion = !!p.codeGestion && !!config.codeGestion && normaliser(p.codeGestion) === normaliser(config.codeGestion);
      if (req.method === 'POST') {
        if (p.action === 'repondre') await repondre(config, p);
        else if (p.action === 'covoit') await covoiturer(config, p);
        else if (p.action === 'apporter') await apporter(config, p);
        else if (p.action === 'gestion') {
          if (!gestion) throw echec('GESTION', 'Code de gestion incorrect');
          config = await gerer(p);
        } else if (p.action === 'ouvrir-gestion') {
          if (!gestion) throw echec('GESTION', 'Code de gestion incorrect');
        } else throw echec('REQUETE', 'Action inconnue');
      }
      return json(await etat(config, gestion));
    } catch (e) {
      if (e instanceof ErreurApi) return json({ ok: false, code: e.code, erreur: e.message });
      console.error(e);
      return json({ ok: false, code: 'ERREUR', erreur: 'Petit souci du côté du serveur, réessaie dans un instant.' }, 500);
    }
  }

  return { traiter, lireConfig };
}
