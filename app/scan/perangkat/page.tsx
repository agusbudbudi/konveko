import type { Metadata } from 'next';
import { DeviceSettings } from './device-settings';

export const metadata: Metadata = { title: 'Perangkat scan' };

export default function DevicePage() {
  return <DeviceSettings />;
}
