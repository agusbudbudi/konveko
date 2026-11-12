import type { Metadata } from 'next';
import { DeviceSettings } from '@/components/scan/device-settings';
import { TaskHeader } from '../scan-ui';

export const metadata: Metadata = { title: 'Setup scanner' };

/**
 * Opened from the Akun tab: key log and setup guide for a new scanner. The input choice and
 * scan test live on the Akun tab itself. The desk entry (/pengaturan/perangkat) shows all of it.
 */
export default function ScanDevicePage() {
  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pb-10">
      <TaskHeader href="/scan/akun" backLabel="Akun" title="Setup scanner" />
      <DeviceSettings part="advanced" />
    </main>
  );
}
