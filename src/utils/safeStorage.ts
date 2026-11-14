/**
 * Accès à localStorage qui ne plante jamais : navigation privée, stockage bloqué, quota dépassé
 * (les vues multi-angles sont des images base64 volumineuses) ou JSON corrompu.
 */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readStoredJson<T>(key: string, fallback: T): T {
  const raw = readStored(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Écrit une valeur ; retourne false (sans lever d'exception) si le navigateur refuse. */
export function writeStored(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`Sauvegarde locale impossible pour « ${key} » (stockage plein ou bloqué)`, err);
    return false;
  }
}
