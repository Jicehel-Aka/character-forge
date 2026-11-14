import { useEffect, useSyncExternalStore } from 'react';
import { getServerStatus, probeServer, subscribeServerStatus, ServerStatus } from '../utils/serverApi';

/** État du serveur optionnel (détecté une fois au premier usage). */
export function useServerStatus(): ServerStatus {
  const st = useSyncExternalStore(subscribeServerStatus, getServerStatus, getServerStatus);
  useEffect(() => {
    void probeServer();
  }, []);
  return st;
}
