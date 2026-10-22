import { explorationRoute } from '@/lib/profiles-request';
import { handleSettingsPost } from '@/lib/settings-route';

export async function POST(req: Request): Promise<Response> {
  return handleSettingsPost(req, explorationRoute);
}
