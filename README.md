# HBC Château-Renard · Seniors filles 🤾‍♀️

Le site interne de l'équipe. Chaque joueuse dit si elle vient aux entraînements et aux matchs, voit qui sera là, s'organise pour le covoiturage des matchs à l'extérieur, coche ce qu'elle ramène pour l'après-match à domicile et suit les résultats et le classement.

## Comment ça marche

- **Le site** est publié par GitHub Pages à chaque changement (`.github/workflows/site.yml`).
- **Les matchs** viennent du site de la FFHB. Deux fois par jour, GitHub relit le calendrier, les horaires, les gymnases, les scores et le classement, puis remet le site à jour tout seul (`scripts/maj-ffhb.mjs`).
- **Les réponses, le covoiturage, le buffet et la gestion de l'équipe** sont gardés par Netlify, dans les coulisses (`netlify/`). Netlify ne se relance que quand ce dossier change.

## Tout se gère dans l'appli

Avec le code de gestion, l'espace **Gestion** (roue dentée en haut de l'appli) permet de publier une annonce, régler les jours, heures et lieu des entraînements, annuler un entraînement ou une période de vacances, ajouter un match amical ou une soirée, ajouter, renommer ou retirer une joueuse, voir le bilan des présences, répondre à la place de quelqu'un et changer les codes.

## Nouvelle saison

Coller l'adresse de la nouvelle compétition FFHB dans `scripts/ffhb.config.json`, le reste suit tout seul.

## Mise à jour du calendrier à la main

Onglet **Actions**, puis **Site de l'équipe**, puis **Run workflow**. Le site est à jour une à deux minutes plus tard.
