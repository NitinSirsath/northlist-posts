import { useEffect, useRef, useState } from 'react';
import type { IdeaView } from '../../shared/contracts';
import { useEditIdea, type IdeaPatch } from '../queries';

type FieldName = 'take' | 'xText' | 'linkedinText';

/** One editable text: what is on screen, and what the server last had. */
function useField(server: string) {
  const [value, setValue] = useState(server);
  const saved = useRef(server);
  const editing = useRef(false);
  // A newer copy from the server wins, unless the user is typing in this field.
  useEffect(() => {
    if (!editing.current && server !== saved.current) {
      saved.current = server;
      setValue(server);
    }
  }, [server]);
  return { value, setValue, saved, editing };
}

/**
 * Local copies of an idea's take and drafts. Each field saves on blur; `flush` saves anything
 * still unsaved and waits, so Post and Copy always use the text on screen.
 */
export function useIdeaEdits(idea: IdeaView) {
  const edit = useEditIdea(idea.id);
  const fields = {
    take: useField(idea.take),
    xText: useField(idea.xText ?? ''),
    linkedinText: useField(idea.linkedinText ?? ''),
  };
  const pending = useRef<Promise<unknown>>(Promise.resolve());

  const exists = (name: FieldName) =>
    name === 'take' || (name === 'xText' ? idea.xText !== null : idea.linkedinText !== null);

  async function flush(only?: FieldName): Promise<boolean> {
    const patch: IdeaPatch = {};
    for (const name of only ? [only] : (Object.keys(fields) as FieldName[])) {
      const field = fields[name];
      if (!exists(name) || field.value === field.saved.current) continue;
      // A draft can't be empty: put the last saved text back.
      if (name !== 'take' && !field.value.trim()) {
        field.setValue(field.saved.current);
        continue;
      }
      patch[name] = field.value;
    }
    if (Object.keys(patch).length) {
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, fields[k as FieldName].saved.current]));
      for (const [k, v] of Object.entries(patch)) fields[k as FieldName].saved.current = v;
      pending.current = edit.mutateAsync(patch).catch((err: unknown) => {
        for (const [k, v] of Object.entries(before)) fields[k as FieldName].saved.current = v;
        throw err;
      });
    }
    try {
      await pending.current;
      return true;
    } catch {
      pending.current = Promise.resolve();
      return false;
    }
  }

  const bind = (name: FieldName) => ({
    value: fields[name].value,
    onChange: (e: { target: { value: string } }) => fields[name].setValue(e.target.value),
    onFocus: () => {
      fields[name].editing.current = true;
    },
    onBlur: () => {
      fields[name].editing.current = false;
      void flush(name);
    },
  });

  return {
    take: fields.take.value,
    xText: fields.xText.value,
    linkedinText: fields.linkedinText.value,
    bind,
    flush,
    saveError: edit.error,
  };
}

export type IdeaEdits = ReturnType<typeof useIdeaEdits>;
