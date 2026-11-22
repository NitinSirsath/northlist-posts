/**
 * The space the app is showing (owner, 22 Nov 2026: one space at a time, picked with the switcher).
 * Kept in this browser; falls back to the first space when the saved one is gone.
 */
import { useSyncExternalStore } from 'react';
import type { SpaceView } from '../../shared/contracts';

const KEY = 'nlp.space';
const EVENT = 'nlp-space';

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setCurrentSpace(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Private mode: the pick lasts until reload.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export const useSavedSpaceId = () => useSyncExternalStore(subscribe, read, () => null);

/** The current space out of the list: the saved one, else the first. */
export function pickSpace(spaces: SpaceView[] | undefined, saved: string | null) {
  if (!spaces?.length) return undefined;
  return spaces.find((s) => s.id === saved) ?? spaces[0];
}
