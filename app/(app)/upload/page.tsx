import { Dropzone } from '@/components/upload/dropzone';
import { PairPanel } from '@/components/upload/pair-panel';

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Upload a receipt</h1>
        <p className="text-sm text-muted-foreground">
          Drop an image, take a photo, or pick a PDF. We&rsquo;ll extract the
          merchant, total, date, and line items.
        </p>
      </header>
      <Dropzone />
      <PairPanel />
    </div>
  );
}
