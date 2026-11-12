'use client';

import { useEffect, useRef, useState } from 'react';
import { CameraOff, Flashlight } from 'lucide-react';
import { cn } from '@/lib/cn';

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

type CameraError = 'denied' | 'unavailable' | 'failed';

/**
 * Edge-to-edge camera with the corner guide. Fills its parent (give it a height or flex-1).
 * `paused` keeps the last frame visible but stops the stream and decoding (a lookup is running).
 */
export function CameraScanner({
  onDetected,
  paused,
  hint = 'Arahkan ke QR di label',
  actions,
  className,
}: {
  onDetected: (code: string) => void;
  paused: boolean;
  /** One line over the camera telling what to aim at. */
  hint?: string;
  /** Extra controls over the bottom of the camera (left side), e.g. "Pakai scanner". */
  actions?: React.ReactNode;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });

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
        setError('unavailable');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'failed');
        return;
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setError(null);

      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorch({ supported: caps.torch === true, on: false });

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
      trackRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [paused, attempt]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch((t) => ({ ...t, on }));
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  if (error) {
    return (
      <div className={cn('flex flex-col gap-4 px-4 py-4', className)}>
        <div className="flex flex-col items-center gap-2.5 rounded-xl bg-surface-muted px-4 py-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-xl bg-danger-soft text-danger">
            <CameraOff size={28} strokeWidth={1.75} aria-hidden />
          </span>
          <h2 className="text-h2">{error === 'denied' ? 'Kamera belum diizinkan' : 'Kamera tidak bisa dibuka'}</h2>
          <p className="text-small text-text-muted">
            {error === 'denied'
              ? 'Konveko butuh kamera untuk membaca QR label.'
              : error === 'unavailable'
                ? 'Perangkat atau browser ini tidak punya kamera yang bisa dipakai.'
                : 'Mungkin sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.'}
          </p>
        </div>
        {error === 'denied' && (
          <div>
            <h3 className="mb-1.5 text-h3">Cara mengizinkan di Chrome</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-small">
              <li>Ketuk ikon di kiri alamat web (gembok atau pengaturan).</li>
              <li>Pilih Izin, lalu Kamera: Izinkan.</li>
              <li>Kembali ke sini dan ketuk Coba lagi.</li>
            </ol>
          </div>
        )}
        {error !== 'unavailable' && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
            className="h-12 rounded-md bg-primary font-semibold text-primary-foreground"
          >
            Coba lagi
          </button>
        )}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    );
  }

  return (
    <div className={cn('relative min-h-64 w-full overflow-hidden bg-[#2B302D]', className)}>
      <video ref={videoRef} playsInline muted className={cn('absolute inset-0 size-full object-cover', paused && 'opacity-60')} />
      {/* corner guide, the one highlight on this screen (DESIGN §6); green while a code is looked up */}
      <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[62%] max-w-72 -translate-x-1/2 -translate-y-1/2">
        {paused ? (
          <span className="absolute inset-0 rounded-xl border-[3px] border-success" />
        ) : (
          ['left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-md', 'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-md',
            'left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-md', 'right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-md'].map((pos) => (
            <span key={pos} className={`absolute size-9 border-highlight ${pos}`} />
          ))
        )}
      </div>
      <p className="absolute inset-x-0 top-3 text-center">
        <span className={cn('inline-block rounded-md px-3 py-2 text-small font-medium text-white', paused ? 'bg-success' : 'bg-text')}>
          {paused ? 'QR terbaca' : hint}
        </span>
      </p>
      {(actions || torch.supported) && (
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          <div className="flex gap-2">{actions}</div>
          {torch.supported && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-pressed={torch.on}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-md px-3.5 text-small font-medium',
                torch.on ? 'bg-highlight text-white' : 'bg-surface text-text',
              )}
            >
              <Flashlight size={20} strokeWidth={1.75} aria-hidden />
              Senter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
