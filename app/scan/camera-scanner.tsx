'use client';

import { useEffect, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';

// BarcodeDetector is not in the TS DOM lib yet.
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

type Decoder = (video: HTMLVideoElement) => Promise<string | null>;

const SCAN_INTERVAL_MS = 200;

/** Native BarcodeDetector (Chrome Android), else ZXing wasm (self-hosted). */
async function createDecoder(): Promise<Decoder> {
  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats()).includes('qr_code')) {
    const detector = new Native({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }

  const { prepareZXingModule, readBarcodes } = await import('zxing-wasm/reader');
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? '/vendor/zxing_reader.wasm' : prefix + path,
    },
    fireImmediately: true,
  });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!ctx || !video.videoWidth) return null;
    // Downscale: QR labels are large in frame, and smaller frames decode faster.
    const scale = Math.min(1, 720 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const results = await readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), {
      formats: ['QRCode'],
      maxNumberOfSymbols: 1,
      tryHarder: true,
    });
    const hit = results.find((r) => r.isValid);
    return hit ? hit.text : null;
  };
}

export function CameraScanner({
  onDetected,
  paused,
  fallback = 'Ketik kode bundle di bawah.',
}: {
  onDetected: (code: string) => void;
  paused: boolean;
  /** What to do instead when the camera cannot be used (shown after the error). */
  fallback?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (paused) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(`Kamera tidak tersedia di perangkat ini. ${fallback}`);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        const denied = e instanceof DOMException && e.name === 'NotAllowedError';
        setError(
          denied
            ? `Izin kamera ditolak. Izinkan kamera di pengaturan browser. ${fallback}`
            : `Kamera tidak bisa dibuka. ${fallback}`,
        );
        return;
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setError(null);

      const decode = await createDecoder();
      const tick = async () => {
        if (cancelled) return;
        try {
          const code = await decode(video);
          if (code && !cancelled) {
            onDetectedRef.current(code);
            return; // parent pauses us; effect re-runs on resume
          }
        } catch {
          // a single bad frame is fine; keep scanning
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [paused, fallback]);

  return (
    <div className="relative aspect-[4/5] max-h-[60dvh] w-full overflow-hidden rounded-xl border border-border bg-surface-muted">
      <video ref={videoRef} playsInline muted className="size-full object-cover" />
      {/* corner guide, the one highlight on this screen (DESIGN §6) */}
      <div aria-hidden className="pointer-events-none absolute inset-[18%]">
        {['left-0 top-0 border-l-2 border-t-2', 'right-0 top-0 border-r-2 border-t-2',
          'left-0 bottom-0 border-l-2 border-b-2', 'right-0 bottom-0 border-r-2 border-b-2'].map((pos) => (
          <span key={pos} className={`absolute size-8 rounded-sm border-highlight ${pos}`} />
        ))}
      </div>
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-muted px-6 text-center text-text-muted">
          <CameraOff size={24} strokeWidth={1.5} aria-hidden />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
