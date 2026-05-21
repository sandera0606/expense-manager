'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { uploadScannedReceipt } from '@/app/(app)/upload/actions';
import { canvasToJpegFile, JPEG_QUALITY, MAX_EDGE } from '@/lib/upload/prepare-image';

// Hard cap on parallel uploads. Each one drives a Claude extraction
// server-side; three at a time keeps the API reasonably warm without
// pinning a single phone's tab.
const MAX_CONCURRENT = 3;

type Status = 'queued' | 'uploading' | 'done' | 'duplicate' | 'failed';

type ScanItem = {
  id: string;
  thumbnailUrl: string;
  status: Status;
  receiptId?: string;
  error?: string;
  file: File;
};

export function CameraClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Tracks which item ids have already been handed to the upload runner so
  // a re-run of the queue effect doesn't double-fire while React is still
  // flipping their status from 'queued' → 'uploading'.
  const launchedRef = useRef<Set<string>>(new Set());
  const [items, setItems] = useState<ScanItem[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);

  // ---- camera lifecycle ----
  // We deliberately do NOT auto-start the camera on mount. iOS browsers
  // (Safari and every WKWebView-based browser like Chrome/Brave/Firefox on
  // iOS) are flaky about permission prompts that aren't triggered by a
  // direct user gesture — symptoms include "no prompt at all" and a
  // viewfinder that never lights up. Requiring a tap is both more reliable
  // and how every native camera app behaves.
  async function startCamera() {
    if (ready || starting) return;
    setStarting(true);
    setCameraError(null);
    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        throw new Error(
          'This browser does not expose the camera API. Try Safari, or update iOS to 14.3+.'
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        // Inside a click handler, play() is allowed even without muted.
        await v.play().catch(() => {});
      }
      setReady(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Camera permission denied';
      setCameraError(msg);
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Object-URL cleanup: revoke thumbnails for items that have left the list.
  // (They only leave when the component unmounts in v1, but this keeps the
  // invariant correct if we add removal later.)
  useEffect(() => {
    const urls = items.map((i) => i.thumbnailUrl).filter(Boolean);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [items]);

  // ---- upload queue ----
  // Whenever the list changes, fan out up-to-MAX_CONCURRENT uploads for
  // anything still queued. The launchedRef set prevents the same item from
  // being kicked off twice across rapid effect re-runs.
  useEffect(() => {
    const uploadingCount = items.filter((i) => i.status === 'uploading').length;
    const slots = MAX_CONCURRENT - uploadingCount;
    if (slots <= 0) return;
    const toStart = items
      .filter((i) => i.status === 'queued' && !launchedRef.current.has(i.id))
      .slice(0, slots);
    if (toStart.length === 0) return;

    toStart.forEach((i) => launchedRef.current.add(i.id));

    // Flip their status to 'uploading' in one commit so concurrency math
    // stays correct on the next effect run.
    setItems((cur) =>
      cur.map((i) =>
        toStart.some((t) => t.id === i.id) ? { ...i, status: 'uploading' } : i
      )
    );

    toStart.forEach((item) => {
      (async () => {
        try {
          const fd = new FormData();
          fd.append('file', item.file);
          const result = await uploadScannedReceipt(fd);
          setItems((cur) =>
            cur.map((i) => {
              if (i.id !== item.id) return i;
              if (!result.ok)
                return { ...i, status: 'failed', error: result.error };
              return {
                ...i,
                status: result.duplicate ? 'duplicate' : 'done',
                receiptId: result.receiptId,
              };
            })
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          setItems((cur) =>
            cur.map((i) =>
              i.id === item.id ? { ...i, status: 'failed', error: msg } : i
            )
          );
        }
      })();
    });
  }, [items]);

  // ---- snap ----
  async function onSnap() {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;

    // Scale to MAX_EDGE on the long side so we're not shipping 4K frames
    // over cellular.
    const longEdge = Math.max(v.videoWidth, v.videoHeight);
    const ratio = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
    const w = Math.round(v.videoWidth * ratio);
    const h = Math.round(v.videoHeight * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);

    const id = crypto.randomUUID();
    const file = await canvasToJpegFile(canvas, `scan-${id}.jpg`, JPEG_QUALITY);
    if (!file) return;

    // Tiny thumb for the strip. Separate canvas so upload bytes stay full-res.
    const thumb = document.createElement('canvas');
    const thumbEdge = 128;
    const tRatio = thumbEdge / Math.max(w, h);
    thumb.width = Math.round(w * tRatio);
    thumb.height = Math.round(h * tRatio);
    thumb.getContext('2d')?.drawImage(canvas, 0, 0, thumb.width, thumb.height);
    const thumbBlob = await new Promise<Blob | null>((r) =>
      thumb.toBlob(r, 'image/jpeg', 0.7)
    );
    const thumbnailUrl = thumbBlob ? URL.createObjectURL(thumbBlob) : '';

    if (navigator.vibrate) navigator.vibrate(15);

    setItems((cur) => [
      { id, thumbnailUrl, status: 'queued', file },
      ...cur,
    ]);
  }

  // ---- render ----
  if (cameraError) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <h2 className="text-lg font-semibold">Camera unavailable</h2>
        <p className="mt-2 text-sm text-muted-foreground">{cameraError}</p>
        <p className="mt-4 text-xs text-muted-foreground">
          Camera access requires HTTPS. If you&rsquo;re on a local dev tunnel
          make sure it&rsquo;s served over https.
        </p>
        <Link
          href="/upload"
          className="mt-6 rounded-md bg-foreground px-4 py-2 text-sm text-background"
        >
          Use the file uploader instead
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)]">
        <Link
          href="/feed"
          className="rounded-full bg-black/40 px-3 py-1 text-sm backdrop-blur"
        >
          Done
        </Link>
        {ready && (
          <span className="rounded-full bg-black/40 px-3 py-1 text-xs uppercase tracking-wide backdrop-blur">
            {items.length} snapped
          </span>
        )}
      </div>

      <div className="flex-1" />

      {!ready && (
        <div className="relative z-10 flex flex-col items-center gap-3 px-6 pb-12 text-center">
          <p className="text-sm text-white/80">
            Tap to enable camera access. iOS asks once per site.
          </p>
          <button
            type="button"
            onClick={startCamera}
            disabled={starting}
            className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black disabled:opacity-60"
          >
            {starting ? 'Starting…' : 'Enable camera'}
          </button>
        </div>
      )}

      {ready && items.length > 0 && (
        <div className="relative z-10 mb-3 flex gap-2 overflow-x-auto px-4">
          {items.map((i) => (
            <Thumb key={i.id} item={i} />
          ))}
        </div>
      )}

      {ready && (
        <div className="relative z-10 flex justify-center pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-2">
          <button
            type="button"
            aria-label="Snap receipt"
            onClick={onSnap}
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-white/10 backdrop-blur transition active:scale-95"
          >
            <span className="h-14 w-14 rounded-full bg-white" />
          </button>
        </div>
      )}
    </div>
  );
}

function Thumb({ item }: { item: ScanItem }) {
  const body = (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-white/30 bg-black/40">
      {item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : null}
      <StatusBadge status={item.status} />
    </div>
  );
  if (item.status === 'done' || item.status === 'duplicate') {
    return <Link href={`/receipts/${item.receiptId}`}>{body}</Link>;
  }
  return body;
}

function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    queued: 'bg-white/30',
    uploading: 'bg-amber-400 animate-pulse',
    done: 'bg-emerald-500',
    duplicate: 'bg-sky-500',
    failed: 'bg-rose-500',
  };
  return (
    <span
      className={`absolute right-1 top-1 inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/40 ${styles[status]}`}
      aria-label={status}
    />
  );
}
