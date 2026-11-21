import { useState } from 'react';

/** Copies text; falls back to a hidden textarea where the Clipboard API is missing. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('Could not copy. Select the text and copy it yourself.');
}

/** Copy, keeping an error the page can show. */
export function useCopy() {
  const [error, setError] = useState<unknown>(null);
  return {
    error,
    async run(text: string, onDone?: () => void) {
      setError(null);
      try {
        await copyText(text);
        onDone?.();
        return true;
      } catch {
        setError(new Error('Could not copy. Select the text and copy it yourself.'));
        return false;
      }
    },
  };
}
