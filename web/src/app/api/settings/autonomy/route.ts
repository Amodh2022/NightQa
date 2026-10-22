import { autonomyRoute } from '@/lib/autonomy-request';
import { handleSettingsPost } from '@/lib/settings-route';

export async function POST(req: Request): Promise<Response> {
  return handleSettingsPost(req, autonomyRoute);
}
