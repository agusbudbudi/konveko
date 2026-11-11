import type { Metadata } from 'next';
import { DeviceSettings } from '@/components/scan/device-settings';
import { BackButton } from './back-button';

export const metadata: Metadata = { title: 'Perangkat scan' };

/** Phone / SUNMI entry (gear icon in the scan header). The desk entry is /pengaturan/perangkat. */
export default function ScanDevicePage() {
  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-10">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="text-h2">Perangkat scan</h1>
      </div>
      <DeviceSettings />
    </main>
  );
}
