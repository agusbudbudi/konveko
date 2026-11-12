import type { Metadata } from 'next';
import { DeviceSettings } from '@/components/scan/device-settings';
import { BackButton } from './back-button';

export const metadata: Metadata = { title: 'Setup scanner' };

/**
 * Opened from the Akun tab: key log and setup guide for a new scanner. The input choice and
 * scan test live on the Akun tab itself. The desk entry (/pengaturan/perangkat) shows all of it.
 */
export default function ScanDevicePage() {
  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-10">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="text-h2">Log tombol dan setup scanner</h1>
      </div>
      <DeviceSettings part="advanced" />
    </main>
  );
}
