'use client';

import { useRef, useState } from 'react';
import Dialog from '@/components/workspace/Dialog';
import { FIELD_LABEL, INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/workspace/styles';

export function CreateColumnDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const next = name.trim();
    if (!next) return;
    onCreate(next);
    setName('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create a list"
      description="Lists group cards into stages of work."
      initialFocusRef={inputRef}
    >
      <form
        onSubmit={event => {
          event.preventDefault();
          submit();
        }}
      >
        <label className={FIELD_LABEL} htmlFor="new-list-name">
          List name
        </label>
        <input
          ref={inputRef}
          id="new-list-name"
          value={name}
          maxLength={80}
          onChange={event => setName(event.target.value)}
          placeholder="e.g. In progress"
          className={`${INPUT} mt-2`}
        />
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="submit" disabled={!name.trim()} className={PRIMARY_BUTTON}>
            Create list
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ConfirmColumnDelete({
  columnName,
  onClose,
  onConfirm,
}: {
  columnName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Delete “${columnName}”?`}
      description="Cards in this list will be archived, not deleted. You can restore them individually from board details."
      initialFocusRef={cancelRef}
    >
      <div className="flex justify-end gap-2">
        <button ref={cancelRef} type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`${PRIMARY_BUTTON} bg-red-600 hover:bg-red-700`}
        >
          Delete list
        </button>
      </div>
    </Dialog>
  );
}
