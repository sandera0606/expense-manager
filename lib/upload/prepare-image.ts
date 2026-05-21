// Anthropic's vision API gets unhappy with very large or oddly-encoded
// images. Downscale every image to at most MAX_EDGE px on the long edge and
// re-encode as JPEG before upload. PDFs (and anything non-image) pass
// through untouched.

export const MAX_EDGE = 1568;
export const JPEG_QUALITY = 0.85;

export async function prepareImage(file: File): Promise<File> {
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

export async function canvasToJpegFile(
  canvas: HTMLCanvasElement,
  filename: string,
  quality = JPEG_QUALITY
): Promise<File | null> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  );
  if (!blob) return null;
  return new File([blob], filename, { type: 'image/jpeg' });
}
