// Point d'entrée en ligne : https://<projet>.netlify.app/api
import { getStore } from '@netlify/blobs';
import { creerApi } from '../lib/equipe.mjs';

export default async (req) => {
  const store = getStore({ name: 'equipe', consistency: 'strong' });
  const api = creerApi({
    store,
    env: {
      MEMBRES_DEPART: Netlify.env.get('MEMBRES_DEPART'),
      CODE_EQUIPE: Netlify.env.get('CODE_EQUIPE'),
      CODE_GESTION: Netlify.env.get('CODE_GESTION'),
    },
  });
  return api.traiter(req);
};

export const config = { path: '/api' };
