/* HBC Château-Renard · Seniors F
   L'agenda de l'équipe : présences aux entraînements et aux matchs, covoiturage, qui ramène quoi,
   résultats, classement et gestion de l'équipe. */
(() => {
  'use strict';

  const CONFIG = Object.assign({
    adresseApi: '',
    club: 'HBC Château-Renard',
    equipe: 'Seniors filles',
    entrainements: [{ jour: 'mercredi', heure: '20:00' }, { jour: 'vendredi', heure: '20:30' }],
    finSaison: '2027-06-30',
    semainesVisibles: 6,
  }, window.HBC_CONFIG || {});
  const DEMO = window.HBC_DEMO || null;
  const LOGO = window.HBC_LOGO || 'assets/logo.webp';
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const APPORTS = [
    { cle: 'alcool', titre: 'Boissons avec alcool', emoji: '🍻' },
    { cle: 'soft', titre: 'Boissons sans alcool', emoji: '🧃' },
    { cle: 'sale', titre: 'Salé', emoji: '🥨' },
    { cle: 'sucre', titre: 'Sucré', emoji: '🧁' },
  ];
  const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ---------- Mémoire du téléphone (ne plante jamais) ---------- */
  const memoire = {
    lire(cle, defaut = null) {
      try { const v = localStorage.getItem('hbc.' + cle); return v == null ? defaut : JSON.parse(v); } catch { return defaut; }
    },
    ecrire(cle, v) {
      try { if (v == null) localStorage.removeItem('hbc.' + cle); else localStorage.setItem('hbc.' + cle, JSON.stringify(v)); } catch { /* stockage bloqué */ }
    },
  };

  const S = {
    matchs: window.HBC_MATCHS || memoire.lire('matchs'),
    etat: DEMO ? null : memoire.lire('etat2'),
    moi: memoire.lire('moi'),
    code: memoire.lire('code', ''),
    codeGestion: memoire.lire('codeGestion', ''),
    onglet: 'agenda',
    vueMatchs: 'avenir',
    semaines: CONFIG.semainesVisibles,
    feuille: null,
    besoinCode: false,
    erreurCode: '',
    horsLigne: false,
    erreurChargement: '',
    chargeLe: 0,
    enCours: 0,
    pour: null,
    annulerOuvert: null,
    edition: null,
  };

  /* ---------- Petits outils ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const capitaliser = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const normaliser = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const minuit = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ajouterJours = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
  const cleJour = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateDe = cle => { const [a, m, j] = String(cle).split('-').map(Number); return new Date(a, m - 1, j); };
  const ecartJours = (a, b) => Math.round((minuit(a) - minuit(b)) / 864e5);
  const lundiDe = d => { const x = minuit(d); return ajouterJours(x, -((x.getDay() + 6) % 7)); };
  const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
  const listeNoms = noms => (noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` : noms[0] || '');
  const fmt = o => new Intl.DateTimeFormat('fr-FR', o);
  const F = {
    jourLong: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
    jourSeul: fmt({ weekday: 'long' }),
    jourAbr: fmt({ weekday: 'short' }),
    mois: fmt({ month: 'long' }),
    moisAbr: fmt({ month: 'short' }),
    dateHeure: fmt({ day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
    courte: fmt({ weekday: 'short', day: 'numeric', month: 'short' }),
  };
  const heure = d => `${d.getHours()}h${d.getMinutes() ? pad(d.getMinutes()) : ''}`;
  const heureTxt = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return `${h}h${m ? pad(m) : ''}`; };
  const numJour = d => (d.getDate() === 1 ? '1er' : String(d.getDate()));

  function vibrer() { try { navigator.vibrate && navigator.vibrate(8); } catch { /* rien */ } }

  const ACCENTS = { CHATEAU: 'Château', ORLEANS: 'Orléans', TRIGUERES: 'Triguères', VENDOME: 'Vendôme', FERTE: 'Ferté', GUERIN: 'Guérin', AMPERE: 'Ampère', ILE: 'Île', ECOLE: 'École', CHALETTE: 'Châlette' };
  const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'et', 'en', 'au', 'aux']);
  function joli(t) {
    return String(t ?? '').trim().replace(/\s+/g, ' ').split(/(\s|-|\/)/).map((mot, i) => {
      if (!mot || /^(\s|-|\/)$/.test(mot)) return mot;
      if (/\./.test(mot) || /^\d/.test(mot)) return mot.toUpperCase();
      const haut = mot.toUpperCase();
      if (/^[LD]'/.test(haut)) return haut[0].toLowerCase() + "'" + joli(haut.slice(2));
      if (ACCENTS[haut]) return ACCENTS[haut];
      if (haut === 'ST') return 'St';
      const bas = mot.toLowerCase();
      if (i > 0 && PETITS.has(bas)) return bas;
      return bas.charAt(0).toUpperCase() + bas.slice(1);
    }).join('');
  }

  /* ---------- Icônes ---------- */
  const ICONES = {
    oui: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    peut: '<path d="M9.2 9.2a2.9 2.9 0 1 1 4.2 2.6c-.9.4-1.4 1.1-1.4 2v.6"/><path d="M12 17.8h.01"/>',
    non: '<path d="M7 7l10 10M17 7L7 17"/>',
    pin: '<path d="M12 21s-7-6.1-7-11.4a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.6" r="2.4"/>',
    horloge: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendrier: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    ballon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6l3.6 2.6-1.4 4.3H9.8l-1.4-4.3z"/><path d="M12 3.5v4.1M15.6 10.2l3.9-1.3M14.2 14.5l2.4 3.4M9.8 14.5l-2.4 3.4M8.4 10.2 4.5 8.9"/>',
    podium: '<path d="M3 20.5h18M4.5 20.5V14h5v6.5M9.5 20.5V8.5h5v12M14.5 20.5v-9h5v9"/><path d="M12 3.2l.8 1.6 1.7.2-1.3 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.3-1.2 1.7-.2z"/>',
    chevron: '<path d="M9.5 6l6 6-6 6"/>',
    voiture: '<path d="M5.2 15.8V12l1.7-4.4A2 2 0 0 1 8.8 6.3h6.4a2 2 0 0 1 1.9 1.3l1.7 4.4v3.8"/><path d="M3.8 16h16.4v2.4a1 1 0 0 1-1 1h-1.6a1 1 0 0 1-1-1V17.6H7.4v.8a1 1 0 0 1-1 1H4.8a1 1 0 0 1-1-1z"/><path d="M5.2 12h13.6"/>',
    message: '<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    annonce: '<path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16 9a3.5 3.5 0 0 1 0 6M18.6 6.4a7.2 7.2 0 0 1 0 11.2"/>',
    cloche: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    horsLigne: '<path d="M3 3l18 18"/><path d="M8.7 16.3a4.8 4.8 0 0 1 6.6 0M5.2 12.8a9.8 9.8 0 0 1 4.6-2.5M18.8 12.8a9.8 9.8 0 0 0-2-1.5M2 9.3A14.6 14.6 0 0 1 6.3 6.6M22 9.3A14.7 14.7 0 0 0 11 5.6M12 19.8h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copier: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
    partager: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8 10.5H6.5A1.5 1.5 0 0 0 5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5H16"/>',
    itineraire: '<path d="M20.5 3.5 3.5 10.6l7.2 2.7 2.7 7.2z"/>',
    maison: '<path d="M4.5 10.8 12 4.5l7.5 6.3v8.2a1 1 0 0 1-1 1H15v-5.5H9v5.5H5.5a1 1 0 0 1-1-1z"/>',
    fermer: '<path d="M7 7l10 10M17 7L7 17"/>',
    personnes: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.9M17.5 14.3a5.5 5.5 0 0 1 3 5.2"/>',
    sifflet: '<path d="M3.5 13.5a5 5 0 0 0 9.6 1.9L20.5 12V8.5H8.5a5 5 0 0 0-5 5z"/><path d="M8.5 8.5V5.5M11.5 8.5l1-3"/><circle cx="8.5" cy="13.5" r="1.4"/>',
    reglages: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    poubelle: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7"/>',
    crayon: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    verre: '<path d="M7.5 3.5h9l-.6 5.6a3.9 3.9 0 0 1-7.8 0z"/><path d="M12 13v7M8.5 20.5h7"/>',
    gobelet: '<path d="M6.5 7.5h11l-1.4 12.1a1 1 0 0 1-1 .9H8.9a1 1 0 0 1-1-.9z"/><path d="M12 7.5l1.8-4.5h3.2M6.8 11h10.4"/>',
    sale: '<path d="M12 20.5 4 6a16.5 16.5 0 0 1 16 0z"/><circle cx="10" cy="10" r="1.1"/><circle cx="14" cy="10.5" r="1.1"/><circle cx="12" cy="14.5" r="1.1"/>',
    sucre: '<path d="M5.5 12.5h13l-1.6 7.2a1 1 0 0 1-1 .8H8.1a1 1 0 0 1-1-.8z"/><path d="M6.2 12.5a5.8 5.8 0 0 1 11.6 0"/><path d="M12 3.5v3"/>',
    cadenas: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  };
  const ico = (nom, classe = '') => `<svg class="ico ${classe}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nom] || ''}</svg>`;
  const emo = e => `<span class="emoji" aria-hidden="true">${e}</span>`;

  /* ---------- Membres ---------- */
  const membres = () => (S.etat && S.etat.membres) || [];
  const joueuses = () => membres().filter(m => m.role !== 'coach');
  const coachs = () => membres().filter(m => m.role === 'coach');
  const membre = id => membres().find(m => m.id === id) || null;
  const estCoach = id => { const m = membre(id); return !!m && m.role === 'coach'; };
  const motAbsent = id => (estCoach(id) ? 'Absent' : 'Absente');
  function prenomDe(id) {
    const m = membre(id) || (S.etat && S.etat.gestion && S.etat.gestion.membres.find(x => x.id === id));
    if (!m) return '';
    const memes = membres().filter(x => normaliser(x.prenom) === normaliser(m.prenom));
    return memes.length > 1 && m.nom ? `${m.prenom} ${m.nom.charAt(0)}.` : m.prenom;
  }
  function initiales(id) {
    const m = membre(id) || (S.etat && S.etat.gestion && S.etat.gestion.membres.find(x => x.id === id));
    const p = m ? m.prenom : '?';
    const n = m ? m.nom : '';
    return (n ? p.charAt(0) + n.charAt(0) : p.slice(0, 2)).toUpperCase();
  }
  function teinte(id) {
    let h = 7;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % 8;
  }
  const avatar = (id, classe = '') => `<span class="avatar ${classe}" data-teinte="${teinte(id)}" aria-hidden="true">${esc(initiales(id))}</span>`;
  function pile(ids, max = 5, plus = true) {
    if (!ids.length) return '';
    const vus = ids.slice(0, max).map(id => avatar(id)).join('');
    const reste = ids.length - max;
    return `<span class="pile" aria-hidden="true">${vus}${plus && reste > 0 ? `<span class="avatar pile-plus">+${reste}</span>` : ''}</span>`;
  }

  /* ---------- Rendez-vous ---------- */
  function samediDu(weekend) {
    if (!weekend || !weekend.debut) return null;
    const d = dateDe(weekend.debut);
    const s = ajouterJours(d, (6 - d.getDay() + 7) % 7);
    s.setHours(15, 0, 0, 0);
    return s;
  }
  const reglages = () => (S.etat && S.etat.reglages) || {};
  const entrainementsSemaine = () => (S.etat && S.etat.entrainements) || CONFIG.entrainements;
  const finSaison = () => (S.etat && S.etat.finSaison) || CONFIG.finSaison;

  function construireRendezVous() {
    const etat = S.etat || {};
    const annulations = etat.annulations || [];
    const liste = [];
    const matchs = (S.matchs && S.matchs.matchs) || [];
    const joursDeMatch = new Set(matchs.filter(m => m.date).map(m => cleJour(new Date(m.date))));

    const fin = dateDe(finSaison());
    for (let d = minuit(new Date()); d <= fin; d = ajouterJours(d, 1)) {
      for (const e of entrainementsSemaine()) {
        if (JOURS.indexOf(normaliser(e.jour)) !== d.getDay()) continue;
        const [h, mi] = String(e.heure).split(/[:h]/).map(x => Number(x) || 0);
        const quand = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi);
        const cle = cleJour(quand);
        const annulation = annulations.find(a => cle >= a.du && cle <= (a.au || a.du));
        liste.push({
          id: `E-${cle}-${pad(h)}${pad(mi)}`,
          type: 'entrainement',
          titre: 'Entraînement',
          debut: quand,
          tri: quand,
          heureConnue: true,
          lieu: reglages().lieuEntrainement || '',
          annule: annulation ? (annulation.motif || 'Pas d’entraînement') : (joursDeMatch.has(cle) ? 'Jour de match' : null),
          annulation: annulation || null,
        });
      }
    }

    for (const m of matchs) {
      const quand = m.date ? new Date(m.date) : null;
      const tri = quand || samediDu(m.weekend);
      if (!tri) continue;
      liste.push({
        id: 'M-' + m.id,
        type: 'match',
        match: m,
        titre: m.adversaire.court || joli(m.adversaire.nom),
        debut: quand,
        tri,
        heureConnue: !!quand && m.heureConnue,
        domicile: m.domicile,
        lieu: m.salle ? joli(m.salle.ville) : '',
        annule: null,
      });
    }

    for (const x of etat.ajouts || []) {
      const jour = dateDe(x.date);
      const [h, mi] = (x.heure || '').split(':').map(Number);
      const quand = x.heure ? new Date(jour.getFullYear(), jour.getMonth(), jour.getDate(), h, mi || 0) : null;
      liste.push({
        id: x.id,
        type: 'autre',
        titre: x.titre,
        debut: quand,
        tri: quand || new Date(jour.getFullYear(), jour.getMonth(), jour.getDate(), 12),
        heureConnue: !!quand,
        lieu: x.lieu || '',
        infos: x.infos || '',
        annule: null,
      });
    }
    return liste.sort((a, b) => a.tri - b.tri);
  }

  function finDe(r) {
    if (r.debut) return new Date(r.debut.getTime() + 2 * 3600e3);
    if (r.type === 'match' && r.match.weekend && r.match.weekend.fin) return ajouterJours(dateDe(r.match.weekend.fin), 1);
    return ajouterJours(minuit(r.tri), 1);
  }
  const aVenir = r => finDe(r) > new Date();
  let cacheRdv = null;
  function rendezVous() {
    if (!cacheRdv) cacheRdv = construireRendezVous();
    return cacheRdv;
  }
  const trouver = id => rendezVous().find(r => r.id === id);

  const reponses = id => (S.etat && S.etat.reponses && S.etat.reponses[id]) || {};
  const maReponse = id => reponses(id)[S.moi] || '';
  function compter(id) {
    const r = reponses(id);
    const c = { oui: [], peut: [], non: [], sans: [] };
    for (const j of joueuses()) (c[r[j.id]] || c.sans).push(j.id);
    return c;
  }
  function texteCompte(c) {
    if (!c.oui.length && !c.peut.length && !c.non.length) return 'Personne n’a encore répondu';
    const bouts = [`<b>${c.oui.length}</b> ${c.oui.length > 1 ? 'présentes' : 'présente'}`];
    if (c.peut.length) bouts.push(`${c.peut.length} peut-être`);
    return bouts.join(', ');
  }

  function quandRelatif(d) {
    const n = ecartJours(d, new Date());
    if (n === 0) return d.getHours() >= 18 ? 'Ce soir' : 'Aujourd’hui';
    if (n === 1) return d.getHours() >= 18 ? 'Demain soir' : 'Demain';
    if (n > 1 && n < 7) return capitaliser(F.jourSeul.format(d));
    return capitaliser(F.jourLong.format(d));
  }
  function bientot(r) {
    const n = ecartJours(r.tri, new Date());
    return n <= 1 ? '' : `Dans ${n} jours`;
  }
  function periode(we) {
    const a = dateDe(we.debut), b = dateDe(we.fin);
    if (a.getMonth() === b.getMonth()) return `du ${numJour(a)} au ${numJour(b)} ${F.mois.format(b)}`;
    return `du ${numJour(a)} ${F.mois.format(a)} au ${numJour(b)} ${F.mois.format(b)}`;
  }
  function quandTexte(r) {
    if (r.type === 'match' && !r.debut) return `Week-end ${periode(r.match.weekend)}`;
    return capitaliser(F.jourLong.format(r.tri));
  }
  function heureTexte(r) {
    if (r.type === 'match' && !r.debut) return 'Date et horaire à confirmer';
    if (!r.heureConnue) return 'Horaire à confirmer';
    return heure(r.debut);
  }
  function libelleQuoi(r) {
    if (r.type === 'match') return `Match ${r.domicile ? 'contre' : 'à'} ${r.titre}${r.domicile ? ' (domicile)' : ''}`;
    return r.titre;
  }
  function libelleQuand(r) {
    const jour = r.type === 'match' && !r.debut ? `week-end ${periode(r.match.weekend)}` : F.jourLong.format(r.tri);
    return r.heureConnue && r.debut ? `${jour} à ${heure(r.debut)}` : jour;
  }
  function groupeSemaine(d) {
    const n = Math.round((lundiDe(d) - lundiDe(new Date())) / (7 * 864e5));
    if (n <= 0) return 'Cette semaine';
    if (n === 1) return 'La semaine prochaine';
    const l = lundiDe(d), dim = ajouterJours(l, 6);
    return `Du ${numJour(l)} ${F.moisAbr.format(l)} au ${numJour(dim)} ${F.moisAbr.format(dim)}`;
  }

  /* ---------- Logos des clubs ---------- */
  function srcLogo(url) {
    if (!url) return null;
    if (window.HBC_LOGOS) {
      const cle = String(url).split('/').pop().replace(/\.[a-z0-9]+$/i, '');
      return window.HBC_LOGOS[cle] || null;
    }
    return url;
  }
  function initialesClub(nom) {
    const mots = String(nom || '?').split(/[\s\-\/]+/).filter(m => m && !PETITS.has(m.toLowerCase()));
    return mots.slice(0, 3).map(m => m.charAt(0)).join('').toUpperCase() || '?';
  }
  function blason(logo, nom, classe = 'blason') {
    const src = srcLogo(logo);
    const ini = initialesClub(nom);
    return `<span class="${classe}">${src ? `<img src="${esc(src)}" alt="" data-repli="${esc(ini)}" loading="lazy" decoding="async">` : `<span class="blason-initiales">${esc(ini)}</span>`}</span>`;
  }
  const blasonNous = (classe = 'blason') => `<span class="${classe} ${classe}--nous"><img src="${esc(LOGO)}" alt=""></span>`;
  document.addEventListener('error', e => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.dataset.repli) {
      const s = document.createElement('span');
      s.className = 'blason-initiales';
      s.textContent = img.dataset.repli;
      img.replaceWith(s);
    }
  }, true);

  /* ---------- Morceaux d'interface ---------- */
  function boutonsVote(id, classe = 'votes', qui = S.moi) {
    const actuelle = reponses(id)[qui] || '';
    const pour = qui !== S.moi ? ` data-pour="${esc(qui)}"` : '';
    const b = (v, texte) => `<button type="button" class="vote vote--${v}" data-action="voter" data-id="${esc(id)}" data-valeur="${v}"${pour} aria-pressed="${actuelle === v}">${ico(v)}<span>${texte}</span></button>`;
    return `<div class="${classe}">${b('oui', qui === S.moi ? 'Je viens' : 'Vient')}${b('peut', 'Peut-être')}${b('non', motAbsent(qui))}</div>`;
  }
  function miniVotes(id) {
    const moi = maReponse(id);
    const b = (v, texte) => `<button type="button" class="mini-vote vote--${v}" data-action="voter" data-id="${esc(id)}" data-valeur="${v}" aria-pressed="${moi === v}" aria-label="${texte}">${ico(v)}</button>`;
    return `<div class="mini-votes">${b('oui', 'Je viens')}${b('peut', 'Peut-être')}${b('non', motAbsent(S.moi))}</div>`;
  }
  function pastilles(r) {
    if (r.annule) return `<span class="pastille pastille--annule">${r.annule === 'Jour de match' ? 'Jour de match' : 'Annulé'}</span>`;
    if (r.type !== 'match') return '';
    return r.domicile
      ? `<span class="pastille pastille--dom">${emo('🏠')}Domicile</span>`
      : `<span class="pastille pastille--ext">${emo('🚗')}Extérieur</span>`;
  }
  function tuileDate(r) {
    const d = r.tri;
    const jour = r.type === 'match' && !r.debut ? 'W-E' : F.jourAbr.format(d).replace('.', '');
    return `<span class="tuile-date ${r.type === 'match' ? 'tuile-date--match' : ''}" aria-hidden="true"><span class="tuile-jour">${esc(jour)}</span><span class="tuile-num">${d.getDate()}</span><span class="tuile-mois">${esc(F.moisAbr.format(d))}</span></span>`;
  }
  function ligneRdv(r) {
    const c = compter(r.id);
    const meta = [];
    if (r.annule) meta.push(`<span>${esc(r.annule)}</span>`);
    else {
      if (r.type === 'match') meta.push(pastilles(r));
      meta.push(`<span>${ico('horloge')}${esc(r.type === 'match' && !r.debut ? 'Date à confirmer' : heureTexte(r))}</span>`);
      if (r.lieu) meta.push(`<span>${ico('pin')}${esc(r.lieu)}</span>`);
    }
    const compte = c.oui.length ? `<b>${c.oui.length}</b> ${c.oui.length > 1 ? 'présentes' : 'présente'}`
      : c.peut.length ? `<b>${c.peut.length}</b> peut-être`
      : c.non.length ? `<b>${c.non.length}</b> ${c.non.length > 1 ? 'absentes' : 'absente'}`
      : 'Aucune réponse';
    return `<div class="ligne ligne--rdv ${r.annule ? 'ligne--annule' : ''}" id="rdv-${esc(r.id)}">
      <button type="button" class="ligne-tap" data-action="ouvrir" data-id="${esc(r.id)}" aria-label="${esc(`${r.titre}, ${libelleQuand(r)}`)}">
        ${tuileDate(r)}
        <span class="ligne-corps">
          <span class="ligne-titre">${r.type === 'match' ? blason(r.match.adversaire.logo, r.titre, 'blason-mini') : ''}<span class="ligne-titre-texte">${esc(r.titre)}</span>${r.annule ? pastilles(r) : ''}</span>
          <span class="ligne-meta">${meta.join('')}</span>
        </span>
        ${ico('chevron', 'chevron')}
      </button>
      ${r.annule ? '' : `<div class="ligne-bas"><span class="ligne-presences">${pile(c.oui, 2, false)}<span class="ligne-compte">${compte}</span></span>${miniVotes(r.id)}</div>`}
    </div>`;
  }

  function hero(r) {
    const c = compter(r.id);
    const etiquettes = r.type === 'match'
      ? `<span class="hero-etiquette hero-etiquette--renard">${emo('🤾‍♀️')}Match ${r.domicile ? 'à domicile' : 'à l’extérieur'}</span><span class="hero-etiquette">Journée ${r.match.journee}</span>`
      : `<span class="hero-etiquette">${emo(r.type === 'autre' ? '🎉' : '🤾‍♀️')}${r.type === 'autre' ? 'Rendez-vous' : 'Entraînement'}</span>`;
    let corps;
    if (r.type === 'match') {
      const nous = (S.matchs && S.matchs.equipe && S.matchs.equipe.court) || 'Château-Renard';
      const gauche = r.domicile ? [blasonNous(), nous] : [blason(r.match.adversaire.logo, r.titre), r.titre];
      const droite = r.domicile ? [blason(r.match.adversaire.logo, r.titre), r.titre] : [blasonNous(), nous];
      const centre = r.debut
        ? `<span class="affiche-sur">${esc(quandRelatif(r.debut))}</span><span class="affiche-heure ${r.heureConnue ? '' : 'affiche-heure--attente'}">${esc(r.heureConnue ? heure(r.debut) : 'Horaire à venir')}</span>`
        : `<span class="affiche-sur">Week-end</span><span class="affiche-heure affiche-heure--attente">${esc(periode(r.match.weekend).replace(/^du /, ''))}</span><span class="affiche-sur">Horaire à venir</span>`;
      corps = `<div class="affiche">
          <div class="affiche-equipe">${gauche[0]}<span class="affiche-nom">${esc(gauche[1])}</span></div>
          <div class="affiche-centre">${centre}</div>
          <div class="affiche-equipe">${droite[0]}<span class="affiche-nom">${esc(droite[1])}</span></div>
        </div>
        ${r.match.salle ? `<div class="hero-lieu">${ico('pin')}${esc(joli(r.match.salle.nom))}, ${esc(joli(r.match.salle.ville))}</div>` : ''}`;
    } else {
      corps = `<div class="hero-quand">${esc(r.debut ? quandRelatif(r.debut) : quandTexte(r))}</div>
        ${r.type === 'autre' ? `<div class="hero-quand hero-quand--titre">${esc(r.titre)}</div>` : ''}
        <div class="hero-heure ${r.heureConnue ? '' : 'hero-heure--attente'}">${esc(r.heureConnue ? heure(r.debut) : 'Horaire à venir')}</div>
        ${r.lieu ? `<div class="hero-lieu">${ico('pin')}${esc(r.lieu)}</div>` : ''}`;
    }
    return `<article class="hero ${r.type === 'match' ? 'hero--match' : ''}" id="rdv-${esc(r.id)}" aria-label="Prochain rendez-vous">
      <div class="hero-haut">${etiquettes}<span class="hero-bientot">${esc(bientot(r))}</span></div>
      ${corps}
      ${boutonsVote(r.id, 'votes votes--hero')}
      <div class="hero-presences">${pile(c.oui, 4)}<span class="hero-compte">${texteCompte(c)}</span>
        <button type="button" class="hero-detail" data-action="ouvrir" data-id="${esc(r.id)}">${r.type === 'match' && r.domicile ? 'Détails' : 'Qui vient'}${ico('chevron')}</button>
      </div>
    </article>`;
  }

  function barre() {
    return `<header class="barre" id="barre">
      <img class="barre-logo" src="${esc(LOGO)}" alt="">
      <span class="barre-titre"><strong>${esc(CONFIG.equipe)}</strong><span>${esc(CONFIG.club)}</span></span>
      <span class="barre-espace"></span>
      ${S.etat && S.etat.gestion ? `<button type="button" class="barre-gestion" data-action="gestion" aria-label="Gestion de l’équipe">${ico('reglages')}</button>` : ''}
      <button type="button" class="avatar-btn" data-action="profil" aria-label="Mon profil">${avatar(S.moi)}</button>
    </header>`;
  }
  function onglets() {
    const o = (id, icone, texte) => `<button type="button" class="onglet" data-action="onglet" data-onglet="${id}" ${S.onglet === id ? 'aria-current="page"' : ''}>${ico(icone)}<span>${texte}</span></button>`;
    return `<nav class="onglets" aria-label="Sections">${o('agenda', 'calendrier', 'Agenda')}${o('matchs', 'ballon', 'Matchs')}${o('classement', 'podium', 'Classement')}</nav>`;
  }
  function majTexte() {
    if (!S.matchs || !S.matchs.maj) return '';
    const d = new Date(S.matchs.maj);
    const n = ecartJours(new Date(), d);
    if (n === 0) return `aujourd’hui à ${heure(d)}`;
    if (n === 1) return `hier à ${heure(d)}`;
    return `le ${F.dateHeure.format(d)}`;
  }
  function bandeaux() {
    let h = '';
    if (S.horsLigne) h += `<div class="alerte" role="status">${emo('📡')}<div class="rappel-texte">Pas de connexion pour l’instant. Les réponses affichées datent de ta dernière visite. <button type="button" data-action="reessayer">Réessayer</button></div></div>`;
    const annonce = reglages().annonce;
    if (annonce) h += `<div class="annonce" role="note">${emo('📣')}<div>${esc(annonce)}</div></div>`;
    return h;
  }

  /* ---------- Onglet Agenda ---------- */
  function vueAgenda() {
    const tous = rendezVous().filter(aVenir);
    const prochain = tous.find(r => !r.annule);
    const horizon = ajouterJours(lundiDe(new Date()), S.semaines * 7);
    const reste = tous.filter(r => r !== prochain);
    const visibles = reste.filter(r => r.tri < horizon);
    const groupes = [];
    for (const r of visibles) {
      const t = groupeSemaine(r.tri);
      const g = groupes[groupes.length - 1];
      if (g && g.titre === t) g.rdv.push(r); else groupes.push({ titre: t, rdv: [r] });
    }
    const dans15 = ajouterJours(new Date(), 15);
    const enAttente = tous.filter(r => !r.annule && r.tri < dans15 && !maReponse(r.id));
    const m = membre(S.moi);
    return `
      <header class="entete-page">
        <h1 class="grand-titre">Salut ${esc(m ? m.prenom : '')} 👋</h1>
        <p class="sous-titre">${esc(F.jourLong.format(new Date()))}</p>
      </header>
      ${bandeaux()}
      ${prochain ? hero(prochain) : `<div class="liste" style="padding:20px"><p class="vide">Aucun rendez-vous prévu pour le moment.</p></div>`}
      ${enAttente.length ? `<div class="rappel">${emo('🔔')}<div class="rappel-texte"><strong>${pluriel(enAttente.length, 'rendez-vous attend', 'rendez-vous attendent')}</strong> ta réponse dans les deux semaines à venir.</div><button type="button" data-action="rappel" data-id="${esc(enAttente[0].id)}">Voir</button></div>` : ''}
      ${groupes.map(g => `<section class="section"><h2 class="section-titre">${esc(g.titre)}</h2><div class="liste">${g.rdv.map(ligneRdv).join('')}</div></section>`).join('')}
      ${reste.length > visibles.length ? `<div class="plus"><button type="button" class="bouton bouton--doux bouton--petit" data-action="plus">Afficher les semaines suivantes</button></div>` : ''}
      ${DEMO ? `<p class="demo">Aperçu de démonstration, les réponses des autres sont fictives et restent sur ce téléphone.</p>` : ''}
    `;
  }

  /* ---------- Onglet Matchs ---------- */
  function competitionTexte() {
    const c = S.matchs && S.matchs.competitions && S.matchs.competitions[0];
    return c ? `${c.nom}, ${c.poule.toLowerCase()}` : 'Championnat';
  }
  function carteSaison() {
    const l = S.matchs && S.matchs.classement && S.matchs.classement.find(x => x.nous);
    if (!l) return '';
    const forme = l.forme.map(f => `<i class="${f > 0 ? 'v' : f < 0 ? 'd' : 'n'}"></i>`).join('');
    return `<button type="button" class="liste saison" data-action="onglet" data-onglet="classement" aria-label="Voir le classement">
      <span class="saison-place">${l.place}<sup>${l.place === 1 ? 're' : 'e'}</sup></span>
      <span class="saison-infos">
        <span class="saison-chiffres">
          <span class="saison-chiffre"><b>${l.pts}</b><span>points</span></span>
          <span class="saison-chiffre"><b>${l.v}-${l.n}-${l.d}</b><span>V-N-D</span></span>
          <span class="saison-chiffre"><b>${l.diff > 0 ? '+' : ''}${l.diff}</b><span>buts</span></span>
        </span>
        <span class="forme" aria-label="Derniers résultats">${forme}</span>
      </span>
    </button>`;
  }
  function ligneResultat(r) {
    const m = r.match;
    const res = m.resultat;
    const mot = m.forfait === 'eux' ? 'Victoire par forfait' : m.forfait === 'nous' ? 'Défaite par forfait' : res === 'V' ? 'Victoire 🎉' : res === 'D' ? 'Défaite' : res === 'N' ? 'Match nul 🤝' : 'Score à venir';
    const score = m.score && !m.forfait && m.score.nous != null && m.score.eux != null
      ? `<span class="score score--${res || ''}">${esc(m.score.nous)}<small>-</small>${esc(m.score.eux)}</span>`
      : `<span class="score score--${res || ''}" style="font-size:20px">${m.forfait ? 'Forfait' : '–'}</span>`;
    return `<button type="button" class="ligne ligne--resultat" data-action="ouvrir" data-id="${esc(r.id)}">
      ${tuileDate(r)}
      <span class="ligne-corps">
        <span class="ligne-titre">${blason(m.adversaire.logo, r.titre, 'blason-mini')}<span class="ligne-titre-texte">${esc(r.titre)}</span></span>
        <span class="ligne-meta"><span>Journée ${m.journee}</span><span>${m.domicile ? 'À domicile' : 'À l’extérieur'}</span></span>
      </span>
      <span class="resultat-fin">${score}<span class="score-mot score--${res || ''}">${esc(mot)}</span></span>
    </button>`;
  }
  function vueMatchs() {
    const tous = rendezVous().filter(r => r.type === 'match');
    const avenir = tous.filter(aVenir);
    const passes = tous.filter(r => !aVenir(r)).reverse();
    const liste = S.vueMatchs === 'avenir'
      ? (avenir.length ? avenir.map(ligneRdv).join('') : `<div style="padding:18px"><p class="vide">La saison est terminée.</p></div>`)
      : (passes.length ? passes.map(ligneResultat).join('') : `<div style="padding:18px"><p class="vide">Pas encore de match joué.</p></div>`);
    const lienAgenda = !DEMO && location.protocol.startsWith('http')
      ? `webcal://${location.host}${location.pathname.replace(/[^/]*$/, '')}data/matchs.ics` : '';
    const source = S.matchs && S.matchs.competitions && S.matchs.competitions[0];
    return `
      <header class="entete-page">
        <h1 class="grand-titre">Matchs</h1>
        <p class="sous-titre">${esc(competitionTexte())}</p>
      </header>
      ${bandeaux()}
      ${carteSaison()}
      <section class="section">
        <div class="segment" role="group" aria-label="Choisir les matchs">
          <button type="button" data-action="vue-matchs" data-vue="avenir" aria-pressed="${S.vueMatchs === 'avenir'}">À venir (${avenir.length})</button>
          <button type="button" data-action="vue-matchs" data-vue="resultats" aria-pressed="${S.vueMatchs === 'resultats'}">Résultats (${passes.length})</button>
        </div>
        <div class="liste">${liste}</div>
      </section>
      ${lienAgenda ? `<section class="section"><a class="bouton bouton--doux bouton--plein" href="${esc(lienAgenda)}">${emo('📅')}Ajouter les matchs à mon agenda</a>
        <p class="note">L’agenda de ton téléphone se mettra à jour tout seul quand un horaire change.</p></section>` : ''}
      <p class="note">Calendrier, scores et gymnases repris automatiquement du site de la FFHB, mis à jour ${esc(majTexte())}.${source ? ` <a href="${esc(source.url)}" target="_blank" rel="noopener">Voir sur ffhandball.fr</a>` : ''}</p>
    `;
  }

  /* ---------- Onglet Classement ---------- */
  function vueClassement() {
    const cl = (S.matchs && S.matchs.classement) || [];
    const lignes = cl.map(l => `<div class="classement-ligne ${l.nous ? 'classement-ligne--nous' : ''}">
        <span class="cl-place">${l.place}</span>
        ${l.nous ? blasonNous('blason-mini') : blason(l.logo, l.court, 'blason-mini')}
        <span class="cl-equipe">
          <span class="cl-nom">${esc(l.court)}${l.nous ? ' 🦊' : ''}</span>
          <span class="cl-details"><span>${l.j} J</span><span>${l.v} V, ${l.n} N, ${l.d} D</span><span>${l.diff > 0 ? '+' : ''}${l.diff}</span>
            <span class="forme">${l.forme.map(f => `<i class="${f > 0 ? 'v' : f < 0 ? 'd' : 'n'}"></i>`).join('')}</span></span>
        </span>
        <span class="cl-pts"><b>${l.pts}</b><span>pts</span></span>
      </div>`).join('');
    return `
      <header class="entete-page">
        <h1 class="grand-titre">Classement</h1>
        <p class="sous-titre">${esc(competitionTexte())}</p>
      </header>
      ${cl.length ? `<div class="liste">${lignes}</div>` : `<div class="liste" style="padding:18px"><p class="vide">Le classement n’est pas encore disponible.</p></div>`}
      <div class="legende"><span><span class="forme"><i class="v"></i></span>Victoire</span><span><span class="forme"><i class="n"></i></span>Nul</span><span><span class="forme"><i class="d"></i></span>Défaite</span></div>
      <p class="note">Les pastilles montrent les derniers matchs, du plus ancien au plus récent. Une victoire rapporte 3 points, un nul 2 points et une défaite 1 point. Classement de la FFHB mis à jour ${esc(majTexte())}.</p>
    `;
  }

  /* ---------- Feuille de détail ---------- */
  function liensItineraire(lat, lng, adresse) {
    const dest = lat != null && lng != null ? `${lat},${lng}` : adresse;
    if (!dest) return '';
    const q = encodeURIComponent(dest);
    const plans = IOS ? `https://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    const waze = lat != null ? `https://waze.com/ul?ll=${q}&navigate=yes` : `https://waze.com/ul?q=${q}&navigate=yes`;
    return `<span class="liens"><a class="lien-pilule" href="${esc(plans)}" target="_blank" rel="noopener">${ico('itineraire')}Itinéraire</a><a class="lien-pilule" href="${esc(waze)}" target="_blank" rel="noopener">${ico('voiture')}Waze</a></span>`;
  }
  const lienRdv = r => `${location.origin}${location.pathname}#rdv-${r.id}`;
  function lienWhatsApp(r, c) {
    const noms = c.sans.map(prenomDe);
    const texte = [
      `${r.type === 'match' ? '🤾‍♀️ ' : ''}${libelleQuoi(r)}, ${libelleQuand(r)}`,
      `✅ ${c.oui.length} ${c.oui.length > 1 ? 'présentes' : 'présente'}   🤔 ${c.peut.length} peut-être   ❌ ${c.non.length} ${c.non.length > 1 ? 'absentes' : 'absente'}`,
      noms.length ? `On attend encore la réponse de ${listeNoms(noms)} 🙏` : '',
      `Réponds ici 👉 ${lienRdv(r)}`,
    ].filter(Boolean).join('\n');
    return `https://wa.me/?text=${encodeURIComponent(texte)}`;
  }
  function puce(id, r, gestion) {
    const classe = `personne ${id === S.moi ? 'personne--moi' : ''} ${S.pour && S.pour.id === r.id && S.pour.membre === id ? 'personne--choisie' : ''}`;
    const contenu = `${avatar(id)}${esc(prenomDe(id))}`;
    return gestion && !r.annule
      ? `<button type="button" class="${classe}" data-action="pour" data-id="${esc(r.id)}" data-membre="${esc(id)}" aria-label="Changer la réponse de ${esc(prenomDe(id))}">${contenu}</button>`
      : `<span class="${classe}">${contenu}</span>`;
  }
  function groupePersonnes(titre, cle, ids, r, gestion) {
    if (!ids.length) return '';
    return `<div><div class="groupe-titre groupe-titre--${cle}"><i></i>${esc(titre)} (${ids.length})</div>
      <div class="personnes">${ids.map(id => puce(id, r, gestion)).join('')}</div></div>`;
  }
  function blocCoach(r, gestion) {
    const liste = coachs();
    if (!liste.length) return '';
    const mots = { oui: 'vient', peut: 'peut-être', non: 'ne vient pas' };
    return `<div class="coach-ligne">${liste.map(c => {
      const rep = reponses(r.id)[c.id] || '';
      return `<span class="coach">${emo('🧢')}<span>Coach</span>${puce(c.id, r, gestion)}<span class="coach-etat coach-etat--${rep || 'sans'}">${rep ? mots[rep] : 'pas encore répondu'}</span></span>`;
    }).join('')}</div>`;
  }
  function vueDetail(r) {
    const c = compter(r.id);
    const m = r.match;
    const gestion = !!(S.etat && S.etat.gestion);
    let titre;
    if (r.type === 'match') {
      const nous = (S.matchs && S.matchs.equipe && S.matchs.equipe.court) || 'Château-Renard';
      const [a, b] = r.domicile ? [nous, r.titre] : [r.titre, nous];
      titre = `<h2 class="detail-titre detail-titre--affiche" id="feuille-titre"><span>${esc(a)}</span><span class="contre">contre</span><span>${esc(b)}</span></h2>`;
    } else {
      titre = `<h2 class="detail-titre" id="feuille-titre">${esc(r.titre)}</h2>`;
    }
    const chips = r.type === 'match'
      ? `${pastilles(r)}<span class="pastille">Journée ${m.journee}</span>`
      : (r.annule ? pastilles(r) : `<span class="pastille">${r.type === 'autre' ? 'Rendez-vous' : 'Entraînement'}</span>`);
    let lieu = '';
    if (r.type === 'match' && m.salle) {
      const s = m.salle;
      lieu = `<div class="info">${ico('pin')}<div class="info-texte"><strong>${esc(joli(s.nom))}</strong><span>${esc([joli(s.rue), `${s.cp} ${joli(s.ville)}`.trim()].filter(Boolean).join(', '))}</span>${liensItineraire(s.lat, s.lng, `${s.nom} ${s.cp} ${s.ville}`)}</div></div>`;
    } else if (r.type === 'match') {
      lieu = `<div class="info">${ico('pin')}<div class="info-texte"><strong>${r.domicile ? 'À domicile' : 'À l’extérieur'}</strong><span>Le gymnase sera affiché dès que la FFHB l’aura indiqué.</span></div></div>`;
    } else if (r.lieu) {
      lieu = `<div class="info">${ico('pin')}<div class="info-texte"><strong>${esc(r.lieu)}</strong>${liensItineraire(null, null, r.lieu)}</div></div>`;
    }
    const resultat = r.type === 'match' && m.score
      ? `<div class="info">${ico('ballon')}<div class="info-texte"><strong>${m.forfait === 'eux' ? 'Victoire par forfait' : m.forfait === 'nous' ? 'Défaite par forfait' : `Score ${esc(m.score.nous)} - ${esc(m.score.eux)}`}</strong>${m.score.mtNous != null ? `<span>Mi-temps ${esc(m.score.mtNous)} - ${esc(m.score.mtEux)}</span>` : ''}</div></div>` : '';
    const choixPour = gestion && S.pour && S.pour.id === r.id && membre(S.pour.membre)
      ? `<div class="pour"><p class="pour-titre">Réponse de ${esc(prenomDe(S.pour.membre))}</p>${boutonsVote(r.id, 'votes votes--compact', S.pour.membre)}</div>` : '';
    return `
      <div class="detail-type">${chips}</div>
      ${titre}
      <div class="liste infos">
        <div class="info">${ico('calendrier')}<div class="info-texte"><strong>${esc(quandTexte(r))}</strong><span>${esc(r.annule ? r.annule : heureTexte(r))}</span></div></div>
        ${lieu}${resultat}
        ${r.infos ? `<div class="info">${ico('info')}<div class="info-texte"><span>${esc(r.infos)}</span></div></div>` : ''}
      </div>
      ${r.annule ? '' : `<section class="bloc"><h3 class="bloc-titre">${emo('✋')}Ta réponse</h3>${boutonsVote(r.id)}</section>`}
      <section class="bloc">
        <h3 class="bloc-titre">${emo('🙋‍♀️')}Qui vient ? <small>${pluriel(c.oui.length, 'présente', 'présentes')} sur ${joueuses().length}</small></h3>
        <div class="liste presences">
          ${blocCoach(r, gestion)}
          ${groupePersonnes('Présentes', 'oui', c.oui, r, gestion)}${groupePersonnes('Peut-être', 'peut', c.peut, r, gestion)}${groupePersonnes('Absentes', 'non', c.non, r, gestion)}${groupePersonnes('Pas encore répondu', 'sans', c.sans, r, gestion)}
          ${choixPour}
          ${gestion && !r.annule ? '<p class="bloc-aide">Gestion, touche un prénom pour répondre à sa place.</p>' : ''}
        </div>
        ${c.sans.length && !r.annule ? `<div style="margin-top:12px"><a class="bouton bouton--whatsapp bouton--plein" href="${esc(lienWhatsApp(r, c))}" target="_blank" rel="noopener">${emo('📢')}Relancer sur WhatsApp</a></div>` : ''}
      </section>
      ${r.type === 'match' && r.domicile && aVenir(r) ? vueBuffet(r) : ''}
      ${r.type === 'match' && !r.domicile && aVenir(r) ? vueCovoit(r) : ''}
      ${gestion ? actionsGestionRdv(r) : ''}
      ${r.type === 'match' ? `<p class="note">Infos reprises du site de la FFHB, mises à jour ${esc(majTexte())}. <a href="${esc(m.url)}" target="_blank" rel="noopener">Voir la fiche du match</a></p>` : ''}
    `;
  }

  /* ---------- Qui ramène quoi (matchs à domicile) ---------- */
  const apportsDe = id => (S.etat && S.etat.apports && S.etat.apports[id]) || {};
  function vueBuffet(r) {
    const a = apportsDe(r.id);
    const moi = a[S.moi] || [];
    const qui = Object.keys(a).filter(id => membre(id) && (a[id] || []).length);
    const cartes = APPORTS.map(c => {
      const ids = qui.filter(id => a[id].includes(c.cle));
      const noms = ids.map(prenomDe);
      const choisi = moi.includes(c.cle);
      return `<button type="button" class="apport" data-action="apporter" data-id="${esc(r.id)}" data-cle="${c.cle}" aria-pressed="${choisi}">
        <span class="apport-haut"><span class="apport-ico">${emo(c.emoji)}</span><span class="apport-coche">${ico('oui')}</span></span>
        <span class="apport-titre">${esc(c.titre)}</span>
        <span class="apport-qui">${noms.length ? esc(listeNoms(noms)) : 'Personne pour l’instant'}</span>
      </button>`;
    }).join('');
    return `<section class="bloc">
      <h3 class="bloc-titre">${emo('🍽️')}Qui ramène quoi ? <small>${qui.length ? pluriel(qui.length, 'personne', 'personnes') : ''}</small></h3>
      <p class="bloc-aide">Coche ce que tu ramènes pour l’après-match 🎉 tu peux en choisir plusieurs.</p>
      <div class="buffet">${cartes}</div>
    </section>`;
  }

  /* ---------- Covoiturage ---------- */
  const covoitDe = id => (S.etat && S.etat.covoit && S.etat.covoit[id]) || {};
  function analyseCovoit(id) {
    const cv = covoitDe(id);
    const ids = Object.keys(cv).filter(j => membre(j));
    const conductrices = ids.filter(j => cv[j].role === 'conductrice');
    const dansVoiture = c => ids.filter(j => cv[j].role === 'passagere' && cv[j].avec === c);
    const cherchent = ids.filter(j => cv[j].role === 'passagere' && !conductrices.includes(cv[j].avec));
    const voitures = conductrices.map(c => {
      const passageres = dansVoiture(c);
      return { conductrice: c, places: cv[c].places || 1, depart: cv[c].depart || '', passageres, libres: Math.max(0, (cv[c].places || 1) - passageres.length) };
    });
    return { cv, voitures, cherchent, libres: voitures.reduce((s, v) => s + v.libres, 0) };
  }
  function vueCovoit(r) {
    const a = analyseCovoit(r.id);
    const moi = a.cv[S.moi];
    const reponse = maReponse(r.id);
    const resume = [
      `<span class="pastille pastille--dom">${pluriel(a.voitures.length, 'voiture', 'voitures')}</span>`,
      `<span class="pastille">${pluriel(a.libres, 'place libre', 'places libres')}</span>`,
      a.cherchent.length ? `<span class="pastille pastille--annule">${pluriel(a.cherchent.length, 'cherche une place', 'cherchent une place')}</span>` : '',
    ].join('');
    const voitures = a.voitures.map(v => {
      const dedans = moi && moi.role === 'passagere' && moi.avec === v.conductrice;
      const peutMonter = v.libres > 0 && v.conductrice !== S.moi && !dedans && reponse !== 'non';
      return `<div class="voiture">
        <span class="voiture-ico">${emo('🚗')}</span>
        <div class="voiture-corps">
          <div class="voiture-nom">Voiture de ${esc(prenomDe(v.conductrice))}${v.conductrice === S.moi ? ' (toi)' : ''}</div>
          <div class="voiture-depart">${pluriel(v.places, 'place', 'places')} pour les autres, ${v.libres ? pluriel(v.libres, 'libre', 'libres') : 'complet'}${v.depart ? `. Départ ${esc(v.depart)}` : ''}</div>
          <div class="sieges">
            ${v.passageres.map(p => `<span class="siege">${avatar(p)}${esc(prenomDe(p))}</span>`).join('')}
            ${peutMonter ? `<button type="button" class="siege siege--libre" data-action="covoit-monter" data-id="${esc(r.id)}" data-avec="${esc(v.conductrice)}">${ico('plus')}Monter avec ${esc(prenomDe(v.conductrice))}</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    let actions;
    if (reponse === 'non') {
      actions = `<p class="vide">Tu as répondu ${estCoach(S.moi) ? 'absent' : 'absente'}, pas besoin de covoiturage.</p>`;
    } else if (!moi) {
      actions = `<p>Et toi, comment tu y vas ?</p>
        <div class="boutons boutons--pile">
          <button type="button" class="bouton bouton--petit" data-action="covoit-conduire" data-id="${esc(r.id)}">${emo('🚗')}Je prends ma voiture</button>
          <button type="button" class="bouton bouton--petit bouton--doux" data-action="covoit-chercher" data-id="${esc(r.id)}">${emo('🙋‍♀️')}Je cherche une place</button>
        </div>`;
    } else if (moi.role === 'conductrice') {
      actions = `<p><b>Tu prends ta voiture.</b> Combien de places pour les autres ?</p>
        <div class="compteur">
          <button type="button" data-action="places" data-id="${esc(r.id)}" data-pas="-1" aria-label="Une place de moins">−</button>
          <output aria-live="polite">${moi.places || 1}</output>
          <button type="button" data-action="places" data-id="${esc(r.id)}" data-pas="1" aria-label="Une place de plus">+</button>
        </div>
        <label class="etiquette-champ" for="champ-depart">Heure et lieu de départ (facultatif)</label>
        <input id="champ-depart" class="champ" data-champ="depart" data-id="${esc(r.id)}" maxlength="80" placeholder="Par exemple 18h45 devant le gymnase" value="${esc(moi.depart || '')}">
        <div class="boutons"><button type="button" class="bouton bouton--petit bouton--gris" data-action="covoit-retirer" data-id="${esc(r.id)}">Je ne prends plus ma voiture</button></div>`;
    } else if (moi.avec && a.voitures.some(v => v.conductrice === moi.avec)) {
      actions = `<p><b>Tu montes avec ${esc(prenomDe(moi.avec))}.</b></p>
        <div class="boutons">
          <button type="button" class="bouton bouton--petit bouton--gris" data-action="covoit-chercher" data-id="${esc(r.id)}">Changer de voiture</button>
          <button type="button" class="bouton bouton--petit bouton--gris" data-action="covoit-retirer" data-id="${esc(r.id)}">Je n’ai plus besoin de place</button>
        </div>`;
    } else {
      actions = `<p><b>Tu cherches une place.</b> ${a.libres ? 'Choisis une voiture juste au-dessus.' : 'Dès que quelqu’un propose sa voiture, tu pourras monter avec.'}</p>
        <div class="boutons">
          <button type="button" class="bouton bouton--petit bouton--doux" data-action="covoit-conduire" data-id="${esc(r.id)}">Finalement je conduis</button>
          <button type="button" class="bouton bouton--petit bouton--gris" data-action="covoit-retirer" data-id="${esc(r.id)}">Je n’ai plus besoin de place</button>
        </div>`;
    }
    return `<section class="bloc">
      <h3 class="bloc-titre">${emo('🚗')}Covoiturage</h3>
      <div class="liste covoit">
        <div class="covoit-resume">${resume}</div>
        ${voitures || '<p class="vide">Personne ne propose encore sa voiture 🚗</p>'}
        ${a.cherchent.length ? `<div><div class="groupe-titre groupe-titre--non"><i></i>Cherchent une place</div><div class="personnes">${a.cherchent.map(p => `<span class="personne ${p === S.moi ? 'personne--moi' : ''}">${avatar(p)}${esc(prenomDe(p))}</span>`).join('')}</div></div>` : ''}
        <div class="covoit-moi">${actions}</div>
      </div>
    </section>`;
  }

  /* ---------- Gestion : actions rapides sur un rendez-vous ---------- */
  function actionsGestionRdv(r) {
    let contenu = '';
    if (r.type === 'entrainement') {
      const a = r.annulation;
      if (!r.annule) {
        contenu = S.annulerOuvert === r.id
          ? `<form class="formulaire" data-form="annuler-rdv" data-id="${esc(r.id)}">
              <label class="etiquette-champ" for="g-motif">Motif affiché à l’équipe</label>
              <input id="g-motif" class="champ" data-champ="g" maxlength="80" placeholder="Par exemple gymnase fermé">
              <div class="boutons"><button type="submit" class="bouton bouton--petit bouton--danger">Annuler cet entraînement</button><button type="button" class="bouton bouton--petit bouton--gris" data-action="annuler-fermer">Garder</button></div>
            </form>`
          : `<button type="button" class="bouton bouton--petit bouton--gris bouton--plein" data-action="annuler-ouvrir" data-id="${esc(r.id)}">${ico('non')}Annuler cet entraînement</button>`;
      } else if (a && a.du === a.au) {
        contenu = `<button type="button" class="bouton bouton--petit bouton--doux bouton--plein" data-action="g-annulation-retirer" data-annulation="${esc(a.id)}">Rétablir cet entraînement</button>`;
      } else if (a) {
        contenu = `<p class="bloc-aide">Annulé par la période du ${esc(F.courte.format(dateDe(a.du)))} au ${esc(F.courte.format(dateDe(a.au)))}. Tu peux la modifier dans la gestion.</p>`;
      } else {
        contenu = '<p class="bloc-aide">Pas d’entraînement ce jour-là car il y a un match.</p>';
      }
    } else if (r.type === 'autre') {
      contenu = `<button type="button" class="bouton bouton--petit bouton--gris bouton--plein" data-action="g-ajout-retirer" data-ajout="${esc(r.id)}">${ico('poubelle')}Supprimer ce rendez-vous</button>`;
    }
    if (!contenu) return '';
    return `<section class="bloc bloc--gestion"><h3 class="bloc-titre">${emo('🛠️')}Gestion</h3>${contenu}</section>`;
  }

  /* ---------- Feuille de gestion ---------- */
  function bilanPresences() {
    const rep = (S.etat && S.etat.reponses) || {};
    const maintenant = new Date();
    const annulations = (S.etat && S.etat.annulations) || [];
    const matchs = new Map(((S.matchs && S.matchs.matchs) || []).map(m => [`M-${m.id}`, m]));
    const passes = { E: [], M: [] };
    for (const id of Object.keys(rep)) {
      if (id.startsWith('E-')) {
        const [, a, mo, j, hm] = /^E-(\d{4})-(\d{2})-(\d{2})-(\d{4})$/.exec(id) || [];
        if (!a) continue;
        const d = new Date(+a, +mo - 1, +j, +hm.slice(0, 2), +hm.slice(2));
        const cle = `${a}-${mo}-${j}`;
        if (d < maintenant && !annulations.some(x => cle >= x.du && cle <= x.au)) passes.E.push(id);
      } else if (id.startsWith('M-')) {
        const m = matchs.get(id);
        if (m && m.date && new Date(m.date) < maintenant) passes.M.push(id);
      }
    }
    if (!passes.E.length && !passes.M.length) return '<p class="bloc-aide">Le bilan se remplira au fil des entraînements et des matchs passés.</p>';
    const lignes = joueuses().map(j => ({
      id: j.id,
      e: passes.E.filter(id => rep[id][j.id] === 'oui').length,
      m: passes.M.filter(id => rep[id][j.id] === 'oui').length,
    })).sort((x, y) => (y.e + y.m) - (x.e + x.m) || prenomDe(x.id).localeCompare(prenomDe(y.id), 'fr'));
    return `<div class="liste">${lignes.map(l => `<div class="g-ligne">${avatar(l.id)}<span class="g-nom"><strong>${esc(prenomDe(l.id))}</strong></span>
      <span class="g-chiffres">${passes.E.length ? `<span><b>${l.e}</b>/${passes.E.length} entraînements</span>` : ''}${passes.M.length ? `<span><b>${l.m}</b>/${passes.M.length} matchs</span>` : ''}</span></div>`).join('')}</div>
      <p class="bloc-aide">Compte les réponses « Je viens » aux rendez-vous déjà passés.</p>`;
  }
  function vueGestion() {
    const g = S.etat && S.etat.gestion;
    if (!g) return '<p class="vide">La gestion est fermée sur ce téléphone.</p>';
    const reg = reglages();
    const tousMembres = g.membres.slice().sort((a, b) => (a.role === 'coach' ? -1 : 0) - (b.role === 'coach' ? -1 : 0) || a.prenom.localeCompare(b.prenom, 'fr'));
    const ent = entrainementsSemaine();
    const annulations = (S.etat.annulations || []).filter(a => a.au >= cleJour(new Date()));
    const ajouts = (S.etat.ajouts || []).filter(a => a.date >= cleJour(new Date()));
    const lienInvitation = `${location.origin}${location.pathname}`;
    const ligneMembre = m => {
      if (S.edition === m.id) {
        return `<form class="g-ligne g-ligne--edition formulaire" data-form="membre-modifier" data-id="${esc(m.id)}">
          <div class="champs-ligne">
            <input id="g-prenom-${esc(m.id)}" class="champ" data-champ="g" name="prenom" maxlength="40" value="${esc(m.prenom)}" aria-label="Prénom" required>
            <input id="g-nom-${esc(m.id)}" class="champ" data-champ="g" name="nom" maxlength="40" value="${esc(m.nom)}" aria-label="Nom" placeholder="Nom">
          </div>
          <select id="g-role-${esc(m.id)}" class="champ" data-champ="g" name="role" aria-label="Rôle"><option value="joueuse" ${m.role !== 'coach' ? 'selected' : ''}>Joueuse</option><option value="coach" ${m.role === 'coach' ? 'selected' : ''}>Coach</option></select>
          <div class="boutons"><button type="submit" class="bouton bouton--petit">Enregistrer</button><button type="button" class="bouton bouton--petit bouton--gris" data-action="g-edition-fermer">Annuler</button></div>
        </form>`;
      }
      return `<div class="g-ligne ${m.active ? '' : 'g-ligne--inactive'}">${avatar(m.id)}
        <span class="g-nom"><strong>${esc(`${m.prenom} ${m.nom}`.trim())}</strong><small>${m.role === 'coach' ? 'Coach' : 'Joueuse'}${m.active ? '' : ', plus dans l’équipe'}</small></span>
        <button type="button" class="g-icone" data-action="g-edition" data-id="${esc(m.id)}" aria-label="Modifier ${esc(m.prenom)}">${ico('crayon')}</button>
        <button type="button" class="interrupteur" role="switch" aria-checked="${m.active}" data-action="g-membre-actif" data-id="${esc(m.id)}" aria-label="${esc(m.prenom)} dans l’équipe"><span></span></button>
      </div>`;
    };
    return `
      <h2 class="detail-titre" id="feuille-titre">Gestion de l’équipe</h2>
      <p class="sous-titre">Ce que tu changes ici s’applique tout de suite pour toute l’équipe.</p>

      <section class="bloc">
        <h3 class="bloc-titre">${emo('📣')}Annonce</h3>
        <form class="liste formulaire" data-form="annonce">
          <label class="etiquette-champ" for="g-annonce">Message affiché en haut de l’agenda</label>
          <textarea id="g-annonce" class="champ" data-champ="g" maxlength="240" rows="2" placeholder="Par exemple, pas d’entraînement pendant les vacances">${esc(reg.annonce || '')}</textarea>
          <div class="boutons"><button type="submit" class="bouton bouton--petit">Publier</button>${reg.annonce ? '<button type="button" class="bouton bouton--petit bouton--gris" data-action="g-annonce-retirer">Retirer l’annonce</button>' : ''}</div>
        </form>
      </section>

      <section class="bloc">
        <h3 class="bloc-titre">${emo('🗓️')}Entraînements de la semaine</h3>
        <div class="liste">
          ${ent.map((e, i) => `<div class="g-ligne"><span class="g-nom"><strong>${esc(capitaliser(e.jour))} à ${esc(heureTxt(e.heure))}</strong></span><button type="button" class="g-icone" data-action="g-entrainement-retirer" data-i="${i}" aria-label="Retirer le ${esc(e.jour)}">${ico('poubelle')}</button></div>`).join('') || '<div class="g-ligne"><span class="vide">Aucun entraînement régulier.</span></div>'}
          <form class="formulaire formulaire--ligne" data-form="entrainement">
            <select id="g-jour" class="champ" data-champ="g" aria-label="Jour">${JOURS_SEMAINE.map(j => `<option value="${j}">${capitaliser(j)}</option>`).join('')}</select>
            <input id="g-heure" class="champ" data-champ="g" type="time" value="20:00" aria-label="Heure" required>
            <button type="submit" class="bouton bouton--petit">Ajouter</button>
          </form>
        </div>
        <form class="liste formulaire" data-form="lieu">
          <label class="etiquette-champ" for="g-lieu">Lieu des entraînements</label>
          <input id="g-lieu" class="champ" data-champ="g" maxlength="120" placeholder="Par exemple Gymnase de Château-Renard" value="${esc(reg.lieuEntrainement || '')}">
          <div class="boutons"><button type="submit" class="bouton bouton--petit">Enregistrer le lieu</button></div>
        </form>
        <form class="liste formulaire" data-form="fin-saison">
          <label class="etiquette-champ" for="g-fin">Derniers entraînements proposés jusqu’au</label>
          <input id="g-fin" class="champ" data-champ="g" type="date" value="${esc(finSaison())}" required>
          <div class="boutons"><button type="submit" class="bouton bouton--petit">Enregistrer la date</button></div>
        </form>
      </section>

      <section class="bloc">
        <h3 class="bloc-titre">${emo('🚫')}Entraînements annulés</h3>
        <div class="liste">
          ${annulations.map(a => `<div class="g-ligne"><span class="g-nom"><strong>${a.du === a.au ? esc(capitaliser(F.jourLong.format(dateDe(a.du)))) : `Du ${esc(F.courte.format(dateDe(a.du)))} au ${esc(F.courte.format(dateDe(a.au)))}`}</strong><small>${esc(a.motif)}</small></span><button type="button" class="g-icone" data-action="g-annulation-retirer" data-annulation="${esc(a.id)}" aria-label="Rétablir">${ico('poubelle')}</button></div>`).join('')}
          <form class="formulaire" data-form="annulation">
            <div class="champs-ligne">
              <label class="champ-etiquete"><span>Du</span><input id="g-du" class="champ" data-champ="g" type="date" required></label>
              <label class="champ-etiquete"><span>Au (facultatif)</span><input id="g-au" class="champ" data-champ="g" type="date"></label>
            </div>
            <input id="g-motif-periode" class="champ" data-champ="g" maxlength="80" placeholder="Motif, par exemple vacances de Noël">
            <div class="boutons"><button type="submit" class="bouton bouton--petit">Annuler ces entraînements</button></div>
          </form>
        </div>
      </section>

      <section class="bloc">
        <h3 class="bloc-titre">${emo('🎉')}Rendez-vous en plus</h3>
        <div class="liste">
          ${ajouts.map(a => `<div class="g-ligne"><span class="g-nom"><strong>${esc(a.titre)}</strong><small>${esc(capitaliser(F.jourLong.format(dateDe(a.date))))}${a.heure ? ` à ${esc(heureTxt(a.heure))}` : ''}${a.lieu ? `, ${esc(a.lieu)}` : ''}</small></span><button type="button" class="g-icone" data-action="g-ajout-retirer" data-ajout="${esc(a.id)}" aria-label="Supprimer">${ico('poubelle')}</button></div>`).join('')}
          <form class="formulaire" data-form="ajout">
            <input id="g-titre" class="champ" data-champ="g" maxlength="60" placeholder="Titre, par exemple match amical ou soirée d’équipe" required>
            <div class="champs-ligne">
              <label class="champ-etiquete"><span>Date</span><input id="g-date" class="champ" data-champ="g" type="date" required></label>
              <label class="champ-etiquete"><span>Heure (facultatif)</span><input id="g-heure-ajout" class="champ" data-champ="g" type="time"></label>
            </div>
            <input id="g-lieu-ajout" class="champ" data-champ="g" maxlength="120" placeholder="Lieu (facultatif)">
            <input id="g-infos" class="champ" data-champ="g" maxlength="240" placeholder="Infos pour l’équipe (facultatif)">
            <div class="boutons"><button type="submit" class="bouton bouton--petit">Ajouter le rendez-vous</button></div>
          </form>
        </div>
      </section>

      <section class="bloc">
        <h3 class="bloc-titre">${emo('👥')}Membres de l’équipe <small>${g.membres.filter(m => m.active).length}</small></h3>
        <div class="liste">
          ${tousMembres.map(ligneMembre).join('')}
          <form class="formulaire" data-form="membre-ajouter">
            <div class="champs-ligne">
              <input id="g-nouveau-prenom" class="champ" data-champ="g" maxlength="40" placeholder="Prénom" required>
              <input id="g-nouveau-nom" class="champ" data-champ="g" maxlength="40" placeholder="Nom">
            </div>
            <select id="g-nouveau-role" class="champ" data-champ="g" aria-label="Rôle"><option value="joueuse">Joueuse</option><option value="coach">Coach</option></select>
            <div class="boutons"><button type="submit" class="bouton bouton--petit">Ajouter à l’équipe</button></div>
          </form>
        </div>
        <p class="bloc-aide">L’interrupteur retire quelqu’un de l’équipe sans effacer ses réponses, tu peux la remettre à tout moment.</p>
      </section>

      <section class="bloc">
        <h3 class="bloc-titre">${emo('📊')}Bilan des présences</h3>
        ${bilanPresences()}
      </section>

      <section class="bloc">
        <h3 class="bloc-titre">${emo('🔐')}Lien et code de gestion</h3>
        <div class="liste formulaire">
          <p class="etiquette-champ" style="margin:0">Le site s’ouvre sans code, il suffit d’envoyer le lien dans le groupe de l’équipe.</p>
          <div class="boutons"><button type="button" class="bouton bouton--petit bouton--gris" data-action="copier" data-texte="${esc(lienInvitation)}">${ico('copier')}Copier le lien du site</button></div>
        </div>
        <form class="liste formulaire" data-form="code-gestion">
          <label class="etiquette-champ" for="g-code-gestion">Nouveau code de gestion (6 caractères minimum)</label>
          <input id="g-code-gestion" class="champ" data-champ="g" maxlength="40" autocomplete="off" autocapitalize="none" placeholder="Garde-le pour toi et le coach">
          <div class="boutons"><button type="submit" class="bouton bouton--petit">Changer le code de gestion</button></div>
        </form>
        <div class="boutons" style="margin-top:12px"><button type="button" class="bouton bouton--petit bouton--gris bouton--plein" data-action="g-quitter">Fermer la gestion sur ce téléphone</button></div>
      </section>
    `;
  }

  /* ---------- Feuille du profil ---------- */
  function vueProfil() {
    const m = membre(S.moi);
    const installe = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const etapes = IOS
      ? `<li>Ouvre ce site dans Safari puis touche le bouton Partager ${ico('partager')} en bas de l’écran.</li><li>Choisis « Sur l’écran d’accueil ».</li><li>Touche « Ajouter » en haut à droite.</li>`
      : `<li>Touche les trois points en haut à droite de Chrome.</li><li>Choisis « Ajouter à l’écran d’accueil » ou « Installer l’application ».</li><li>Confirme, l’icône du club apparaît avec tes applis.</li>`;
    const lien = `${location.origin}${location.pathname}`;
    const invitation = `Voici le site de l’équipe pour dire si tu viens aux entraînements et aux matchs 🤾‍♀️ Touche le lien puis ton prénom 👉 ${lien}`;
    return `
      <div class="profil-tete">${avatar(S.moi)}<h2 id="feuille-titre">${esc(m ? `${m.prenom} ${m.nom}`.trim() : '')}</h2><p class="sous-titre">${m && m.role === 'coach' ? 'Coach' : esc(CONFIG.equipe)}, ${esc(CONFIG.club)}</p></div>
      <div class="boutons" style="margin-top:16px"><button type="button" class="bouton bouton--gris" data-action="changer-membre">Ce n’est pas moi</button></div>
      <section class="bloc">
        <h3 class="bloc-titre">${emo('📲')}Le site sur ton écran d’accueil</h3>
        ${installe ? `<div class="liste" style="padding:14px 16px"><p style="margin:0">C’est déjà fait, le site s’ouvre comme une appli.</p></div>` : `<ol class="liste etapes">${etapes}</ol>`}
      </section>
      ${DEMO ? '' : `<section class="bloc">
        <h3 class="bloc-titre">${emo('💌')}Inviter une coéquipière</h3>
        <div class="boutons">
          <a class="bouton bouton--whatsapp bouton--petit" href="https://wa.me/?text=${esc(encodeURIComponent(invitation))}" target="_blank" rel="noopener">${ico('message')}Envoyer le lien</a>
          <button type="button" class="bouton bouton--gris bouton--petit" data-action="copier" data-texte="${esc(lien)}">${ico('copier')}Copier le lien</button>
        </div>
        <p class="note">Le site s’ouvre sans code, partage le lien seulement avec l’équipe.</p>
      </section>`}
      <section class="bloc">
        <h3 class="bloc-titre">${emo('🛠️')}Gestion de l’équipe</h3>
        ${S.etat && S.etat.gestion
          ? `<div class="boutons"><button type="button" class="bouton bouton--petit bouton--plein" data-action="gestion">Ouvrir la gestion</button></div>`
          : `<form class="liste formulaire" data-form="ouvrir-gestion">
              <label class="etiquette-champ" for="g-code-ouvrir">Réservé au coach et à l’organisation de l’équipe</label>
              <input id="g-code-ouvrir" class="champ" data-champ="g" autocomplete="off" autocapitalize="none" placeholder="Code de gestion">
              <div class="boutons"><button type="submit" class="bouton bouton--petit">Ouvrir la gestion</button></div>
            </form>`}
      </section>
      <p class="note">Calendrier FFHB mis à jour ${esc(majTexte())}.</p>
    `;
  }

  /* ---------- Écrans d'accueil ---------- */
  function ecranCode() {
    return `<div class="ecran"><div class="ecran-contenu">
      <img class="ecran-logo" src="${esc(LOGO)}" alt="Logo du HBC Château-Renard">
      <h1>${esc(CONFIG.equipe)}</h1>
      <p class="ecran-texte">L’agenda de l’équipe du ${esc(CONFIG.club)} 🤾‍♀️ Entre le code de l’équipe pour commencer.</p>
      <form data-form="code" novalidate>
        <label class="sr" for="champ-code">Code de l’équipe</label>
        <input id="champ-code" class="champ" name="code" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Code de l’équipe" value="">
        <p class="erreur" role="alert">${esc(S.erreurCode)}</p>
        <button class="bouton bouton--plein" type="submit">Continuer</button>
      </form>
      <p class="note">Le code se trouve dans le groupe WhatsApp de l’équipe.</p>
    </div></div>`;
  }
  function ecranQui() {
    const tri = (a, b) => a.prenom.localeCompare(b.prenom, 'fr');
    const carte = m => `<button type="button" class="choix-joueuse" data-action="choisir" data-id="${esc(m.id)}">${avatar(m.id)}<span class="choix-texte"><strong>${esc(m.prenom)}</strong>${m.role === 'coach' ? '<small>Coach</small>' : m.nom ? `<small>${esc(m.nom)}</small>` : ''}</span></button>`;
    const j = joueuses().slice().sort(tri), c = coachs().slice().sort(tri);
    return `<div class="ecran"><div class="ecran-contenu">
      <img class="ecran-logo" src="${esc(LOGO)}" alt="Logo du HBC Château-Renard">
      <h1>Qui es-tu ?</h1>
      <p class="ecran-texte">Touche ton prénom 👇 le site s’en souviendra sur ce téléphone.</p>
      <div class="grille-joueuses">${j.map(carte).join('')}</div>
      ${c.length ? `<p class="grille-titre">🧢 Encadrement</p><div class="grille-joueuses">${c.map(carte).join('')}</div>` : ''}
      ${membres().length ? '' : '<p class="vide" style="margin-top:20px">L’équipe est encore vide. Ouvre la gestion pour ajouter les joueuses.</p>'}
    </div></div>`;
  }
  function ecranChargement() {
    return `<div class="ecran"><div class="ecran-contenu"><img class="ecran-logo" src="${esc(LOGO)}" alt=""><div style="margin-top:28px" class="roue" role="status" aria-label="Chargement"></div></div></div>`;
  }
  function ecranErreur() {
    return `<div class="ecran"><div class="ecran-contenu">
      <img class="ecran-logo" src="${esc(LOGO)}" alt="">
      <h1>Impossible de charger l’agenda</h1>
      <p class="ecran-texte">${esc(S.erreurChargement)}</p>
      <div style="margin-top:24px;width:100%"><button type="button" class="bouton bouton--plein" data-action="reessayer">Réessayer</button></div>
    </div></div>`;
  }
  function ecranConfig() {
    return `<div class="ecran"><div class="ecran-contenu">
      <img class="ecran-logo" src="${esc(LOGO)}" alt="">
      <h1>Presque prêt</h1>
      <p class="ecran-texte">Il reste à indiquer l’adresse des données de l’équipe dans le fichier config.js.</p>
    </div></div>`;
  }

  /* ---------- Affichage ---------- */
  const app = document.getElementById('app');
  const racineFeuille = document.createElement('div');
  document.body.appendChild(racineFeuille);
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastEl);

  function rendre() {
    cacheRdv = null;
    if (!CONFIG.adresseApi && !DEMO) { app.innerHTML = ecranConfig(); return; }
    if (S.besoinCode) {
      const champ = document.getElementById('champ-code');
      const valeur = champ ? champ.value : '';
      app.innerHTML = ecranCode();
      document.getElementById('champ-code').value = valeur;
      return;
    }
    if (!S.etat) { app.innerHTML = S.erreurChargement ? ecranErreur() : ecranChargement(); return; }
    if (!S.moi || !membre(S.moi)) {
      if (S.feuille && S.feuille.type === 'gestion' && S.etat.gestion) { app.innerHTML = ecranQui(); rendreFeuille(); return; }
      app.innerHTML = ecranQui();
      return;
    }
    const vue = S.onglet === 'matchs' ? vueMatchs() : S.onglet === 'classement' ? vueClassement() : vueAgenda();
    app.innerHTML = `${barre()}<main class="page" id="page">${vue}</main>${onglets()}`;
    majBarre();
    rendreFeuille();
  }

  let feuilleOuverte = false;
  function contenuFeuille() {
    if (!S.feuille) return '';
    if (S.feuille.type === 'profil') return vueProfil();
    if (S.feuille.type === 'gestion') return vueGestion();
    const r = trouver(S.feuille.id);
    return r ? vueDetail(r) : '';
  }
  function rendreFeuille() {
    if (!S.feuille) { if (feuilleOuverte) fermerFeuilleDom(); return; }
    const contenu = contenuFeuille();
    if (!contenu) { S.feuille = null; fermerFeuilleDom(); return; }
    const actif = document.activeElement;
    if (feuilleOuverte && actif && actif.dataset && actif.dataset.champ !== undefined && racineFeuille.contains(actif)) return;
    if (!feuilleOuverte) {
      racineFeuille.innerHTML = `<div class="voile" data-action="fermer"></div>
        <div class="feuille" role="dialog" aria-modal="true" aria-labelledby="feuille-titre">
          <div class="feuille-poignee" aria-hidden="true"></div>
          <div class="feuille-entete"><button type="button" class="feuille-fermer" data-action="fermer" aria-label="Fermer">${ico('fermer')}</button></div>
          <div class="feuille-corps"></div>
        </div>`;
      racineFeuille.querySelector('.feuille-corps').innerHTML = contenu;
      feuilleOuverte = true;
      document.documentElement.style.overflow = 'hidden';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        racineFeuille.querySelector('.voile').classList.add('ouvert');
        racineFeuille.querySelector('.feuille').classList.add('ouvert');
      }));
      setTimeout(() => { const f = racineFeuille.querySelector('.feuille-fermer'); if (f) f.focus({ preventScroll: true }); }, 60);
    } else {
      const corps = racineFeuille.querySelector('.feuille-corps');
      const haut = corps.scrollTop;
      const brouillons = {};
      corps.querySelectorAll('[data-champ="g"][id]').forEach(el => { if (el.value !== el.defaultValue || el.tagName === 'SELECT') brouillons[el.id] = el.value; });
      corps.innerHTML = contenu;
      for (const [id, v] of Object.entries(brouillons)) { const el = document.getElementById(id); if (el) el.value = v; }
      corps.scrollTop = haut;
    }
  }
  function fermerFeuilleDom() {
    feuilleOuverte = false;
    document.documentElement.style.overflow = '';
    const v = racineFeuille.querySelector('.voile'), f = racineFeuille.querySelector('.feuille');
    if (v) v.classList.remove('ouvert');
    if (f) f.classList.remove('ouvert');
    setTimeout(() => { if (!feuilleOuverte) racineFeuille.innerHTML = ''; }, 420);
  }
  function ouvrirFeuille(f) {
    if (feuilleOuverte && S.feuille && (S.feuille.type !== f.type || S.feuille.id !== f.id)) {
      S.feuille = f;
      const corps = racineFeuille.querySelector('.feuille-corps');
      corps.innerHTML = contenuFeuille();
      corps.scrollTop = 0;
      return;
    }
    S.feuille = f;
    rendreFeuille();
  }
  function fermerFeuille() {
    S.feuille = null;
    S.pour = null;
    S.annulerOuvert = null;
    S.edition = null;
    if (/^#rdv-/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    rendreFeuille();
  }

  let minuterieToast;
  function toast(texte, erreur = false) {
    toastEl.className = `toast ${erreur ? 'toast--erreur' : ''} ${feuilleOuverte ? 'toast--haut' : ''}`;
    toastEl.innerHTML = `${ico(erreur ? 'info' : 'oui')}<span>${esc(texte)}</span>`;
    requestAnimationFrame(() => toastEl.classList.add('visible'));
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(() => toastEl.classList.remove('visible'), erreur ? 4200 : 1900);
  }
  function majBarre() {
    const b = document.getElementById('barre');
    if (b) b.classList.toggle('defile', window.scrollY > 8);
  }
  window.addEventListener('scroll', majBarre, { passive: true });

  /* ---------- Petites fêtes : bulles, confettis, voiture, emojis ---------- */
  const reduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FETES = {
    oui: { humeur: 'oui', effet: 'confettis', phrases: c => [
      ['🏆', `Youpi, tu gères ${c ? 'champion' : 'championne'} !`],
      ['🔥', 'Trop bien, on compte sur toi !'],
      ['🦊', 'Allez Château-Renard !'],
      ['💪', 'Avec toi on va tout casser !'],
    ] },
    peut: { humeur: 'peut', effet: 'eclat', eclat: ['🤞', '🙏', '✨'], phrases: () => [
      ['🤞', 'On croise les doigts !'],
      ['😇', 'Allez, laisse-toi tenter !'],
      ['👀', 'Suspense…'],
    ] },
    non: { humeur: 'non', effet: 'zzz', phrases: () => [
      ['🙄', 'Pfff, t’es naze !'],
      ['😢', 'Ohhh non, on va te regretter…'],
      ['😤', 'La prochaine fois tu viens, hein !'],
      ['🛋️', 'Profite bien de ton canapé !'],
    ] },
    conduire: { humeur: 'vert', effet: 'voiture', phrases: () => [
      ['🌍', 'Merci, tu penses à la planète !'],
      ['💚', 'Le covoit, c’est la classe !'],
      ['🚗', 'Une voiture de plus, top !'],
    ] },
    monter: { humeur: 'vert', effet: 'voiture', phrases: () => [
      ['🌍', 'Tu penses à la planète, bravo !'],
      ['🚗', 'En voiture Simone !'],
      ['😎', 'Bonne route, attache ta ceinture !'],
    ] },
    chercher: { humeur: 'peut', effet: 'eclat', eclat: ['👍', '🚗', '✨'], phrases: () => [
      ['🙌', 'On va te trouver une place !'],
      ['👍', 'Quelqu’un va bien t’emmener !'],
    ] },
    alcool: { humeur: 'fete', effet: 'eclat', eclat: ['🍾', '🥂', '🫧', '✨'], phrases: () => [
      ['🍾', 'Top, fais péter le champagne !'],
      ['🥂', 'Santé ! On trinque après le match'],
      ['🍻', 'La troisième mi-temps s’annonce belle !'],
    ] },
    soft: { humeur: 'fete', effet: 'eclat', eclat: ['🧃', '🥤', '💦'], phrases: () => [
      ['🧃', 'Santé, en toute fraîcheur !'],
      ['💦', 'Parfait pour s’hydrater !'],
    ] },
    sale: { humeur: 'fete', effet: 'eclat', eclat: ['🥨', '🍕', '🧀', '😋'], phrases: () => [
      ['😋', 'Miam miam !'],
      ['🍕', 'Trop bon, vivement l’après-match !'],
      ['🧀', 'Ça va être un festin !'],
    ] },
    sucre: { humeur: 'fete', effet: 'eclat', eclat: ['🧁', '🍰', '🍫', '🍩'], phrases: () => [
      ['🧁', 'Miam miam, trop bon !'],
      ['🍩', 'Le sucre, c’est la vie !'],
      ['🍫', 'La gourmandise, c’est pas un défaut !'],
    ] },
  };
  const compteurs = {};
  const annonceEl = document.createElement('div');
  annonceEl.className = 'cache-lecteur';
  annonceEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(annonceEl);
  let bulleActive = null;
  function bulle(emoji, texte, humeur) {
    texte = texte.replace(/ ([!?;:»])/g, '\u00A0$1');
    if (bulleActive) bulleActive.remove();
    const b = document.createElement('div');
    b.className = `bulle bulle--${humeur}`;
    b.setAttribute('aria-hidden', 'true');
    b.innerHTML = `<span class="bulle-emoji">${emoji}</span><span class="bulle-texte">${esc(texte)}</span>`;
    annonceEl.textContent = '';
    setTimeout(() => { annonceEl.textContent = texte; }, 60);
    document.body.appendChild(b);
    bulleActive = b;
    requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('visible')));
    setTimeout(() => { b.classList.add('partie'); setTimeout(() => { b.remove(); if (bulleActive === b) bulleActive = null; }, 380); }, 2100);
    return b;
  }
  // La bulle est posée au milieu de l'écran (top 47 % dans le style), on retrouve son cadre sans tenir compte de l'animation
  function cadreBulle(b) {
    const l = b.offsetWidth, h = b.offsetHeight;
    const cx = innerWidth / 2, cy = innerHeight * 0.47;
    return { gauche: cx - l / 2, haut: cy - h / 2, bas: cy + h / 2, cx, cy };
  }
  function centreDe(el) {
    if (!el || !el.getBoundingClientRect || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, haut: r.top, bas: r.bottom };
  }
  function confettis(x, y) {
    const c = document.createElement('canvas');
    c.className = 'confettis';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    document.body.appendChild(c);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const couleurs = ['#FF8500', '#001CD7', '#D73458', '#FFC53D', '#2840DE', '#FFFFFF'];
    const parts = Array.from({ length: 110 }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const vitesse = 6 + Math.random() * 10;
      return { x, y, vx: Math.cos(angle) * vitesse, vy: Math.sin(angle) * vitesse, l: 6 + Math.random() * 6, h: 3 + Math.random() * 4, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.5, c: couleurs[i % couleurs.length], rond: Math.random() < 0.3 };
    });
    const debut = performance.now();
    let avant = debut;
    (function image(t) {
      const dt = Math.min(34, t - avant) / 16.7;
      avant = t;
      g.clearRect(0, 0, innerWidth, innerHeight);
      const vie = (t - debut) / 2000;
      for (const p of parts) {
        p.vy += 0.32 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        g.save(); g.globalAlpha = Math.max(0, 1 - vie * vie); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c;
        if (p.rond) { g.beginPath(); g.arc(0, 0, p.h, 0, 6.3); g.fill(); } else g.fillRect(-p.l / 2, -p.h / 2, p.l, p.h);
        g.restore();
      }
      if (vie < 1) requestAnimationFrame(image); else c.remove();
    })(debut);
  }
  function eclat(emojis, x, y, n = 11) {
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'eclat';
      s.textContent = emojis[i % emojis.length];
      s.style.left = `${x}px`; s.style.top = `${y}px`;
      document.body.appendChild(s);
      const dx = (Math.random() - 0.5) * 340, dy = -(70 + Math.random() * 200), r = (Math.random() - 0.5) * 80;
      const a = s.animate([
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.4}px), calc(-50% + ${dy * 0.4}px)) scale(1.15)`, opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.9) rotate(${r}deg)`, opacity: 0 },
      ], { duration: 1200 + Math.random() * 600, easing: 'cubic-bezier(.2,.8,.2,1)', delay: i * 25, fill: 'both' });
      a.onfinish = () => s.remove();
    }
  }
  function zzz(b) {
    const e = b.querySelector('.bulle-emoji');
    const c = cadreBulle(b);
    const x0 = c.cx + e.offsetWidth * 0.38;
    const y0 = c.haut + e.offsetTop + 6;
    ['💤', '😴', '💤', '🛋️', '💤'].forEach((em, i) => {
      const s = document.createElement('span');
      s.className = 'eclat eclat--dessus';
      s.textContent = em;
      s.style.left = `${x0}px`; s.style.top = `${y0}px`;
      document.body.appendChild(s);
      const dx = 24 + i * 15, dy = -(46 + i * 24);
      const a = s.animate([
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.45}px)) scale(1) rotate(-12deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1) rotate(10deg)`, opacity: 0 },
      ], { duration: 1400, delay: 260 + i * 160, easing: 'ease-out', fill: 'both' });
      a.onfinish = () => s.remove();
    });
  }
  // La voiture roule juste sous la bulle (ou au-dessus s'il n'y a pas la place), sans jamais la cacher
  function voitureQuiPasse(b) {
    const s = document.createElement('span');
    s.className = 'vroum';
    s.textContent = '🚗💨';
    let haut = innerHeight - 190;
    if (b) {
      const c = cadreBulle(b);
      haut = c.bas + 24 + 60 < innerHeight ? c.bas + 24 : Math.max(8, c.haut - 74);
    }
    s.style.top = `${Math.round(haut)}px`;
    document.body.appendChild(s);
    const a = s.animate([{ transform: 'translateX(105vw)' }, { transform: 'translateX(-45vw)' }], { duration: 1700, easing: 'cubic-bezier(.4,.1,.6,.9)', fill: 'both' });
    a.onfinish = () => s.remove();
  }
  // « ou » est le centre du bouton touché, relevé avant que l'écran ne se redessine
  function feter(type, ou) {
    const f = FETES[type];
    if (!f) return;
    const phrases = f.phrases(estCoach(S.moi));
    const n = compteurs[type] = (compteurs[type] || 0) + 1;
    const [emoji, texte] = phrases[(n - 1) % phrases.length];
    const b = bulle(emoji, texte, f.humeur);
    try { navigator.vibrate && navigator.vibrate(type === 'non' ? [30, 40, 30] : [12, 30, 12]); } catch { /* rien */ }
    if (reduit()) return;
    const { x, y } = ou || { x: innerWidth / 2, y: innerHeight / 2 };
    if (f.effet === 'confettis') confettis(x, y);
    else if (f.effet === 'eclat') eclat(f.eclat, x, y);
    else if (f.effet === 'zzz') zzz(b);
    else if (f.effet === 'voiture') voitureQuiPasse(b);
  }

  /* ---------- Échanges avec le serveur de l'équipe ---------- */
  class ErreurApi extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  function verifier(d) {
    if (!d || typeof d !== 'object') throw new ErreurApi('ACCES', 'Le serveur de l’équipe ne répond pas.');
    if (!d.ok) throw new ErreurApi(d.code, d.erreur || 'Erreur inconnue');
    return d;
  }
  async function lireReponse(r) {
    let d;
    try { d = await r.json(); } catch { throw new ErreurApi('ACCES', 'Le serveur de l’équipe ne répond pas, réessaie dans un instant.'); }
    return verifier(d);
  }
  const api = {
    async etat() {
      const p = { code: S.code || '' };
      if (S.codeGestion) p.codeGestion = S.codeGestion;
      if (DEMO) return verifier(await DEMO.api.traiter('GET', p));
      const q = new URLSearchParams({ ...p, t: String(Date.now()) });
      return lireReponse(await fetch(`${CONFIG.adresseApi}?${q}`));
    },
    async envoyer(corps) {
      const complet = Object.assign({}, corps, { code: S.code || '' }, S.codeGestion ? { codeGestion: S.codeGestion } : {});
      if (DEMO) return verifier(await DEMO.api.traiter('POST', complet));
      return lireReponse(await fetch(CONFIG.adresseApi, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(complet),
      }));
    },
  };

  function appliquerEtat(etat) {
    S.etat = etat;
    S.horsLigne = false;
    S.erreurChargement = '';
    S.chargeLe = Date.now();
    if (!DEMO) memoire.ecrire('etat2', Object.assign({}, etat, { gestion: undefined }));
    rendre();
  }
  function erreurCode(e) {
    S.besoinCode = true;
    S.erreurCode = e.code === 'CODE_INCORRECT' ? 'Ce code ne marche pas. Vérifie-le dans le groupe WhatsApp.' : '';
    S.etat = null;
    memoire.ecrire('etat2', null);
    S.feuille = null;
    fermerFeuilleDom();
    rendre();
  }
  async function rafraichir() {
    if (S.enCours) return;
    try {
      const etat = await api.etat();
      if (S.enCours) return;
      if (DEMO && DEMO.semer && !DEMO.seme) { DEMO.seme = true; await DEMO.semer(evenementsPour(etat)); appliquerEtat(await api.etat()); return; }
      appliquerEtat(etat);
    } catch (e) {
      if (e.code === 'CODE_REQUIS' || e.code === 'CODE_INCORRECT') return erreurCode(e);
      if (S.etat) { S.horsLigne = true; rendre(); return; }
      S.erreurChargement = e instanceof ErreurApi ? e.message : 'Vérifie ta connexion internet puis réessaie.';
      rendre();
    }
  }
  function evenementsPour(etat) {
    const avant = S.etat;
    S.etat = etat;
    cacheRdv = null;
    const liste = rendezVous().filter(aVenir).map(r => ({ id: r.id, type: r.type, domicile: r.domicile }));
    S.etat = avant;
    cacheRdv = null;
    return liste;
  }

  let file = Promise.resolve();
  function envoyer(corps) {
    S.enCours++;
    const p = file.then(() => api.envoyer(corps));
    file = p.catch(() => {});
    return p.finally(() => { S.enCours--; });
  }
  async function ecrire(corps, modifier, message) {
    const copie = JSON.parse(JSON.stringify(S.etat));
    if (modifier) modifier(S.etat);
    vibrer();
    rendre();
    try {
      const etat = await envoyer(corps);
      if (!S.enCours) appliquerEtat(etat);
      if (message) toast(message);
      return true;
    } catch (e) {
      if (e.code === 'CODE_REQUIS' || e.code === 'CODE_INCORRECT') { erreurCode(e); return false; }
      if (e.code === 'GESTION') { S.codeGestion = ''; memoire.ecrire('codeGestion', null); }
      if (!S.enCours) {
        S.etat = copie;
        if (e.code === 'GESTION') delete S.etat.gestion;
        rendre();
        rafraichir();
      }
      toast(e && e.code && e.message ? e.message : 'Pas de connexion, rien n’a été enregistré.', true);
      return false;
    }
  }

  function voter(id, valeur, qui = S.moi, el = null) {
    const r = trouver(id);
    if (!r) return;
    const nouvelle = (reponses(id)[qui] || '') === valeur ? '' : valeur;
    const pourMoi = qui === S.moi;
    const prenom = prenomDe(qui);
    const messages = pourMoi
      ? { oui: 'C’est noté, tu viens 💪', peut: 'C’est noté, peut-être 🤞', non: `C’est noté, tu es ${estCoach(qui) ? 'absent' : 'absente'} 👌`, '': 'Réponse retirée' }
      : { oui: `${prenom} vient`, peut: `${prenom} peut-être`, non: `${prenom} ${estCoach(qui) ? 'absent' : 'absente'}`, '': `Réponse de ${prenom} retirée` };
    const fete = pourMoi && nouvelle;
    const ou = fete ? centreDe(el) : null;
    ecrire({ action: 'repondre', evenement: id, membre: qui, reponse: nouvelle }, etat => {
      etat.reponses = etat.reponses || {};
      const m = etat.reponses[id] = etat.reponses[id] || {};
      if (nouvelle) m[qui] = nouvelle; else delete m[qui];
    }, fete ? null : messages[nouvelle]);
    if (fete) feter(nouvelle, ou);
  }

  function apporter(id, cle, el = null) {
    const actuel = apportsDe(id)[S.moi] || [];
    const liste = actuel.includes(cle) ? actuel.filter(x => x !== cle) : [...actuel, cle];
    const titre = (APPORTS.find(a => a.cle === cle) || {}).titre || '';
    const ou = centreDe(el);
    ecrire({ action: 'apporter', evenement: id, membre: S.moi, liste }, etat => {
      etat.apports = etat.apports || {};
      const m = etat.apports[id] = etat.apports[id] || {};
      if (liste.length) m[S.moi] = liste; else delete m[S.moi];
    }, actuel.includes(cle) ? `${titre} retiré` : null);
    if (!actuel.includes(cle)) feter(cle, ou);
  }

  function covoit(id, changement, message) {
    if (!trouver(id)) return;
    const actuel = covoitDe(id)[S.moi] || {};
    const role = changement.role !== undefined ? changement.role : actuel.role || '';
    const suivant = {
      role,
      places: changement.places !== undefined ? changement.places : (actuel.places || 2),
      avec: changement.avec !== undefined ? changement.avec : (role === 'passagere' ? actuel.avec || '' : ''),
      depart: changement.depart !== undefined ? changement.depart : (actuel.depart || ''),
    };
    ecrire({ action: 'covoit', evenement: id, membre: S.moi, role: suivant.role, places: suivant.places, avec: suivant.avec, depart: suivant.depart }, etat => {
      etat.covoit = etat.covoit || {};
      const m = etat.covoit[id] = etat.covoit[id] || {};
      if (!role) delete m[S.moi];
      else m[S.moi] = { role, places: role === 'conductrice' ? suivant.places : 0, avec: role === 'passagere' ? suivant.avec : '', depart: role === 'conductrice' ? suivant.depart : '' };
    }, message);
  }

  let minuteriePlaces;
  function changerPlaces(id, pas) {
    const m = covoitDe(id)[S.moi];
    if (!m || m.role !== 'conductrice') return;
    const n = Math.min(8, Math.max(1, (m.places || 1) + pas));
    if (n === m.places) return;
    m.places = n;
    rendre();
    clearTimeout(minuteriePlaces);
    minuteriePlaces = setTimeout(() => covoit(id, { role: 'conductrice', places: n }, pluriel(n, 'place proposée', 'places proposées')), 700);
  }

  async function gerer(op, donnees, message) {
    const ok = await ecrire(Object.assign({ action: 'gestion', op }, donnees), null, message);
    return ok;
  }

  /* ---------- Interactions ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const id = el.dataset.id;
    if (a === 'voter') { e.stopPropagation(); voter(id, el.dataset.valeur, el.dataset.pour || S.moi, el); }
    else if (a === 'ouvrir') { S.pour = null; S.annulerOuvert = null; ouvrirFeuille({ type: 'rdv', id }); }
    else if (a === 'fermer') fermerFeuille();
    else if (a === 'profil') ouvrirFeuille({ type: 'profil' });
    else if (a === 'gestion') { S.edition = null; ouvrirFeuille({ type: 'gestion' }); }
    else if (a === 'onglet') {
      S.onglet = el.dataset.onglet;
      history.replaceState(null, '', S.onglet === 'agenda' ? location.pathname + location.search : `#${S.onglet}`);
      rendre();
      window.scrollTo({ top: 0 });
    }
    else if (a === 'vue-matchs') { S.vueMatchs = el.dataset.vue; rendre(); }
    else if (a === 'plus') { S.semaines += 8; rendre(); }
    else if (a === 'choisir') {
      S.moi = el.dataset.id;
      memoire.ecrire('moi', S.moi);
      if (DEMO && DEMO.liberer) { DEMO.liberer(S.moi).then(rafraichir); }
      if (S.feuille && S.feuille.type === 'gestion') fermerFeuille();
      rendre();
      window.scrollTo({ top: 0 });
      toast(`Salut ${prenomDe(S.moi)} 👋`);
      ouvrirDepuisLien();
    }
    else if (a === 'changer-membre') { S.moi = null; memoire.ecrire('moi', null); S.feuille = null; fermerFeuilleDom(); rendre(); }
    else if (a === 'reessayer') { S.erreurChargement = ''; rendre(); rafraichir(); }
    else if (a === 'rappel') {
      const cible = document.getElementById(`rdv-${id}`);
      if (cible) {
        cible.scrollIntoView({ behavior: 'smooth', block: 'center' });
        cible.classList.remove('ligne--surbrillance');
        void cible.offsetWidth;
        if (cible.classList.contains('ligne')) cible.classList.add('ligne--surbrillance');
      } else ouvrirFeuille({ type: 'rdv', id });
    }
    else if (a === 'apporter') apporter(id, el.dataset.cle, el);
    else if (a === 'covoit-conduire') { const ou = centreDe(el); covoit(id, { role: 'conductrice' }, null); feter('conduire', ou); }
    else if (a === 'covoit-chercher') { const ou = centreDe(el); covoit(id, { role: 'passagere', avec: '' }, null); feter('chercher', ou); }
    else if (a === 'covoit-monter') { const ou = centreDe(el); covoit(id, { role: 'passagere', avec: el.dataset.avec }, null); feter('monter', ou); }
    else if (a === 'covoit-retirer') covoit(id, { role: '' }, 'Covoiturage mis à jour');
    else if (a === 'places') changerPlaces(id, Number(el.dataset.pas));
    else if (a === 'pour') {
      S.pour = S.pour && S.pour.id === id && S.pour.membre === el.dataset.membre ? null : { id, membre: el.dataset.membre };
      rendreFeuille();
    }
    else if (a === 'annuler-ouvrir') { S.annulerOuvert = id; rendreFeuille(); setTimeout(() => { const c = document.getElementById('g-motif'); if (c) c.focus(); }, 30); }
    else if (a === 'annuler-fermer') { S.annulerOuvert = null; rendreFeuille(); }
    else if (a === 'g-annulation-retirer') gerer('annulation-retirer', { id: el.dataset.annulation }, 'Entraînement rétabli');
    else if (a === 'g-ajout-retirer') {
      gerer('ajout-retirer', { id: el.dataset.ajout }, 'Rendez-vous supprimé').then(ok => { if (ok && S.feuille && S.feuille.type === 'rdv') fermerFeuille(); });
    }
    else if (a === 'g-annonce-retirer') gerer('annonce', { texte: '' }, 'Annonce retirée');
    else if (a === 'g-entrainement-retirer') {
      const liste = entrainementsSemaine().filter((_, i) => i !== Number(el.dataset.i));
      gerer('entrainements', { liste }, 'Entraînement retiré');
    }
    else if (a === 'g-edition') { S.edition = id; rendreFeuille(); }
    else if (a === 'g-edition-fermer') { S.edition = null; rendreFeuille(); }
    else if (a === 'g-membre-actif') {
      const m = S.etat.gestion.membres.find(x => x.id === id);
      if (m) gerer('membre-modifier', { id, active: !m.active }, m.active ? `${m.prenom} n’apparaît plus dans l’équipe` : `${m.prenom} est de retour dans l’équipe`);
    }
    else if (a === 'g-quitter') {
      S.codeGestion = '';
      memoire.ecrire('codeGestion', null);
      if (S.etat) delete S.etat.gestion;
      fermerFeuille();
      rendre();
      toast('Gestion fermée sur ce téléphone');
    }
    else if (a === 'copier') {
      const texte = el.dataset.texte;
      const ok = () => toast('Lien copié');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(ok, () => toast(texte));
      else toast(texte);
    }
  });

  document.addEventListener('change', e => {
    const champ = e.target.closest('[data-champ="depart"]');
    if (champ) covoit(champ.dataset.id, { role: 'conductrice', depart: champ.value.trim().slice(0, 80) }, 'Départ enregistré');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.feuille) fermerFeuille();
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-champ="depart"]')) e.target.blur();
  });

  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  document.addEventListener('submit', async e => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const type = f.dataset.form;
    if (type === 'code') {
      const code = val('champ-code');
      if (!code) { S.erreurCode = 'Entre le code de l’équipe.'; rendre(); return; }
      S.code = code;
      memoire.ecrire('code', code);
      S.besoinCode = false;
      S.erreurCode = '';
      rendre();
      rafraichir();
      return;
    }
    const bouton = f.querySelector('[type="submit"]');
    if (bouton) bouton.disabled = true;
    const vider = () => f.querySelectorAll('input, textarea').forEach(el => { if (el.type !== 'time' && el.type !== 'date') el.value = ''; else el.value = el.defaultValue; });
    let ok = false;
    if (type === 'ouvrir-gestion') {
      const code = val('g-code-ouvrir');
      if (!code) { if (bouton) bouton.disabled = false; return; }
      S.codeGestion = code;
      try {
        const etat = await envoyer({ action: 'ouvrir-gestion' });
        memoire.ecrire('codeGestion', code);
        appliquerEtat(etat);
        ouvrirFeuille({ type: 'gestion' });
        toast('Gestion ouverte');
        ok = true;
      } catch (err) {
        S.codeGestion = '';
        toast(err.code === 'GESTION' ? 'Ce code de gestion ne marche pas.' : (err.message || 'Pas de connexion.'), true);
      }
    } else if (type === 'annonce') ok = await gerer('annonce', { texte: val('g-annonce') }, val('g-annonce') ? 'Annonce publiée' : 'Annonce retirée');
    else if (type === 'lieu') ok = await gerer('lieu', { texte: val('g-lieu') }, 'Lieu enregistré');
    else if (type === 'fin-saison') ok = await gerer('fin-saison', { date: val('g-fin') }, 'Date enregistrée');
    else if (type === 'entrainement') {
      const liste = entrainementsSemaine().concat([{ jour: val('g-jour'), heure: val('g-heure') }]);
      ok = await gerer('entrainements', { liste }, 'Entraînement ajouté');
    } else if (type === 'annulation') {
      ok = await gerer('annulation-ajouter', { du: val('g-du'), au: val('g-au'), motif: val('g-motif-periode') }, 'Entraînements annulés');
      if (ok) vider();
    } else if (type === 'annuler-rdv') {
      const date = f.dataset.id.slice(2, 12);
      ok = await gerer('annulation-ajouter', { du: date, au: date, motif: val('g-motif') || 'Entraînement annulé' }, 'Entraînement annulé');
      if (ok) { S.annulerOuvert = null; rendreFeuille(); }
    } else if (type === 'ajout') {
      ok = await gerer('ajout-ajouter', { titre: val('g-titre'), date: val('g-date'), heure: val('g-heure-ajout'), lieu: val('g-lieu-ajout'), infos: val('g-infos') }, 'Rendez-vous ajouté');
      if (ok) vider();
    } else if (type === 'membre-ajouter') {
      ok = await gerer('membre-ajouter', { prenom: val('g-nouveau-prenom'), nom: val('g-nouveau-nom'), role: val('g-nouveau-role') }, `${val('g-nouveau-prenom')} a rejoint l’équipe`);
      if (ok) vider();
    } else if (type === 'membre-modifier') {
      const mid = f.dataset.id;
      ok = await gerer('membre-modifier', { id: mid, prenom: f.querySelector('[name="prenom"]').value, nom: f.querySelector('[name="nom"]').value, role: f.querySelector('[name="role"]').value }, 'Modification enregistrée');
      if (ok) { S.edition = null; rendreFeuille(); }
    } else if (type === 'code-gestion') {
      const nouveau = val('g-code-gestion');
      ok = await gerer('code-gestion', { nouveau }, 'Code de gestion changé');
      if (ok) { S.codeGestion = nouveau; memoire.ecrire('codeGestion', nouveau); vider(); }
    }
    if (bouton && document.body.contains(bouton)) bouton.disabled = false;
    if (ok) rendreFeuille();
  });

  function lireLien() {
    const h = decodeURIComponent(location.hash.slice(1));
    const code = /^code=(.+)$/.exec(h);
    if (code) {
      S.code = code[1];
      memoire.ecrire('code', S.code);
      history.replaceState(null, '', location.pathname + location.search);
    } else if (h === 'matchs' || h === 'classement') S.onglet = h;
  }
  function ouvrirDepuisLien() {
    const m = /^#rdv-(.+)$/.exec(location.hash);
    if (m && S.etat && S.moi && trouver(decodeURIComponent(m[1]))) ouvrirFeuille({ type: 'rdv', id: decodeURIComponent(m[1]) });
  }
  window.addEventListener('hashchange', () => {
    lireLien();
    ouvrirDepuisLien();
    rendre();
  });

  async function chargerMatchs() {
    if (window.HBC_MATCHS) return;
    try {
      const r = await fetch(`data/matchs.json?v=${Math.floor(Date.now() / 6e5)}`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      S.matchs = await r.json();
      memoire.ecrire('matchs', S.matchs);
    } catch { /* on garde la dernière version connue */ }
  }

  async function demarrer() {
    lireLien();
    rendre();
    await chargerMatchs();
    if (!S.matchs) S.matchs = { equipe: { court: 'Château-Renard' }, matchs: [], classement: [], competitions: [] };
    if (CONFIG.adresseApi || DEMO) await rafraichir();
    ouvrirDepuisLien();
    setInterval(() => { if (document.visibilityState === 'visible') rafraichir(); }, 90e3);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - S.chargeLe > 20e3) chargerMatchs().then(rafraichir);
    });
  }
  window.HBC = { S, rendezVous, construireRendezVous, compter, rendre };
  demarrer();
})();
