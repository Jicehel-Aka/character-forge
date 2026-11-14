import { useEffect } from 'react';
import { writeStored } from '../utils/safeStorage';

/** Sauvegarde `value` (JSON) dans localStorage à chaque changement, sans jamais lever d'exception. */
export function usePersistedJson(key: string, value: unknown): void {
  useEffect(() => {
    writeStored(key, JSON.stringify(value));
  }, [key, value]);
}

/** Idem pour une chaîne enregistrée telle quelle (compatible avec les valeurs déjà stockées). */
export function usePersistedString(key: string, value: string): void {
  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);
}
