import type { Metadata } from 'next';
import { DeviceSettings } from '@/components/scan/device-settings';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Perangkat scan' };

/** Desk entry (sidebar: Pengaturan > Perangkat scan). Same component as /scan/perangkat. */
export default function DeskDevicePage() {
  return (
    <>
      <PageHeader title="Perangkat scan" description="Cara scan di komputer ini: kamera atau scanner USB/Bluetooth." />
      <DeviceSettings className="mt-6 max-w-2xl" />
    </>
  );
}
