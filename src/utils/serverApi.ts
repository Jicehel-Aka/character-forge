/**
 * Accès au serveur optionnel (Express + Gemini).
 *
 * Le site publié sur GitHub Pages est purement statique : il n'y a pas de
 * serveur. Tout appel doit donc être précédé d'une détection (`./api/health`,
 * chemin RELATIF pour fonctionner sous /character-forge/) et échouer avec un
 * message clair en français, jamais avec un corps HTML de page 404.
 */

export interface ServerStatus {
  /** La sonde a-t-elle terminé ? */
  checked: boolean;
  /** Un serveur répond-il sur ./api/health avec du JSON valide ? */
  reachable: boolean;
  /** Le serveur a-t-il une clé Gemini configurée ? */
  geminiConfigured: boolean;
  /** Le serveur exige-t-il un jeton d'accès (API_TOKEN) ? */
  authRequired: boolean;
}

export const MSG_STATIC_MODE =
  "Mode statique : aucun serveur n'est joint (version hébergée sur GitHub Pages ou ouverte sans le serveur local). " +
  "L'analyse IA, la génération 3D par IA et l'export de paquets sont indisponibles ; " +
  'le découpage heuristique et la synthèse procédurale restent utilisables.';

export const MSG_NO_GEMINI =
  "Le serveur est joint mais aucune clé Gemini n'y est configurée (variable GEMINI_API_KEY) : les fonctions IA sont désactivées.";

const TOKEN_KEY = 'character_forge_api_token';

let status: ServerStatus = { checked: false, reachable: false, geminiConfigured: false, authRequired: false };
let probing: Promise<ServerStatus> | null = null;
const listeners = new Set<() => void>();

function setStatus(next: ServerStatus) {
  status = next;
  listeners.forEach((l) => l());
}

export function getServerStatus(): ServerStatus {
  return status;
}

export function subscribeServerStatus(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Sonde `./api/health` une seule fois (résultat mis en cache). */
export function probeServer(force = false): Promise<ServerStatus> {
  if (probing && !force) return probing;
  probing = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const resp = await fetch('./api/health', { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      clearTimeout(timer);
      const ctype = resp.headers.get('content-type') || '';
      // Sur GitHub Pages / un serveur statique : 404 HTML ou index.html renvoyé en repli SPA.
      if (!resp.ok || !ctype.includes('application/json')) throw new Error('pas de serveur');
      const body = await resp.json();
      if (!body || body.status !== 'ok') throw new Error('réponse inattendue');
      setStatus({
        checked: true,
        reachable: true,
        geminiConfigured: !!body.geminiConfigured,
        authRequired: !!body.authRequired,
      });
    } catch {
      setStatus({ checked: true, reachable: false, geminiConfigured: false, authRequired: false });
    }
    return status;
  })();
  return probing;
}

export class ServerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerUnavailableError';
  }
}

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function askToken(): string {
  const t = window.prompt("Ce serveur demande un jeton d'accès (variable API_TOKEN). Saisis-le :") || '';
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* stockage indisponible : le jeton ne sera pas mémorisé */
  }
  return t;
}

/** Traduit un code HTTP en message français lisible. */
export function messageForHttp(statusCode: number, serverMsg?: string): string {
  if (statusCode === 401) return "Jeton d'accès refusé ou manquant.";
  if (statusCode === 404) return "Le serveur ne propose pas cette fonction (version trop ancienne ou mode statique).";
  if (statusCode === 413) return 'Image ou requête trop volumineuse pour le serveur.';
  if (statusCode === 429) return 'Trop de requêtes : réessaie dans une minute.';
  if (statusCode === 503) return serverMsg || MSG_NO_GEMINI;
  if (statusCode >= 500) return serverMsg || `Erreur du serveur (HTTP ${statusCode}).`;
  return serverMsg || `Requête refusée (HTTP ${statusCode}).`;
}

/**
 * `fetch` vers `./api/...` avec détection du mode statique, jeton optionnel et
 * erreurs en français. Lève `ServerUnavailableError` sans aucune requête si
 * le serveur est absent.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const st = await probeServer();
  if (!st.reachable) throw new ServerUnavailableError(MSG_STATIC_MODE);
  const rel = path.replace(/^\/+/, '');
  const run = (token: string) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('X-Api-Token', token);
    return fetch(`./${rel}`, { ...init, headers });
  };
  let resp = await run(readToken());
  if (resp.status === 401) {
    const t = askToken();
    if (t) resp = await run(t);
  }
  return resp;
}

/** Extrait le message d'erreur JSON `{error}` d'une réponse, sans jamais exposer de HTML brut. */
export async function readApiError(resp: Response): Promise<string> {
  let serverMsg: string | undefined;
  try {
    const ctype = resp.headers.get('content-type') || '';
    if (ctype.includes('application/json')) {
      const j = await resp.json();
      if (j && typeof j.error === 'string') serverMsg = j.error.slice(0, 300);
    }
  } catch {
    /* corps illisible : on ignore */
  }
  return messageForHttp(resp.status, serverMsg);
}
