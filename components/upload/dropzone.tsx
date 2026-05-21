'use client';

import { useActionState, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { uploadReceipt, type UploadState } from '@/app/(app)/upload/actions';
import { prepareImage } from '@/lib/upload/prepare-image';

const initial: UploadState = { status: 'idle' };

export function Dropzone() {
  const [state, action, pending] = useActionState(uploadReceipt, initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPreparing(true);
    try {
      const prepared = await prepareImage(files[0]);
      setPicked(prepared);
    } finally {
      setPreparing(false);
    }
  }

  function submit() {
    if (!picked || !inputRef.current || !formRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(picked);
    inputRef.current.files = dt.files;
    formRef.current.requestSubmit();
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={
          'flex h-56 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm transition ' +
          (dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card text-muted-foreground hover:bg-muted/40')
        }
      >
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {picked ? (
          <div className="text-center">
            <p className="font-medium text-foreground">{picked.name}</p>
            <p className="mt-1 text-xs">
              {(picked.size / 1024).toFixed(0)} KB · {picked.type || 'unknown'}
            </p>
          </div>
        ) : (
          <>
            <p className="font-medium text-foreground">
              Drop a receipt here, or tap to choose
            </p>
            <p className="mt-1 text-xs">JPG · PNG · WebP · PDF · up to 20 MB</p>
          </>
        )}
      </label>

      {state.status === 'error' && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      <div className="flex justify-end gap-2">
        {picked && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => setPicked(null)}
          >
            Clear
          </Button>
        )}
        <Button
          type="button"
          disabled={!picked || pending || preparing}
          onClick={submit}
        >
          {pending
            ? 'Extracting…'
            : preparing
              ? 'Preparing…'
              : 'Upload & extract'}
        </Button>
      </div>
    </form>
  );
}
