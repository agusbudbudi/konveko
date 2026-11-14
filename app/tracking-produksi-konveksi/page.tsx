import { TopicPage, topicMetadata } from '@/components/landing/topic-page';
import { topicByPath } from '@/components/landing/topics';

const topic = topicByPath('/tracking-produksi-konveksi');

export const metadata = topicMetadata(topic);

export default function Page() {
  return <TopicPage topic={topic} />;
}
