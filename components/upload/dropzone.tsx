'use client';

import { useActionState, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { uploadReceipt, type UploadState } from '@/app/(app)/upload/actions';

const initial: UploadState = { status: 'idle' };

// Anthropic's vision API gets unhappy with very large or oddly-encoded
// images. Downscale every image to at most 1568px on the long edge and
// re-encode as JPEG before upload. PDFs pass through untouched.
const MAX_EDGE = 1568;
const JPEG_QUALITY = 0.85;

async function preparePicked(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const ratio = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    // Browser can't decode (HEIC, corrupt, etc.) — fall back to the original
    // and let the server-side reject it with a clear error.
    return file;
  }
}

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
      const prepared = await preparePicked(files[0]);
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
