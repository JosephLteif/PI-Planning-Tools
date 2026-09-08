import { handleApiRequest } from './routes/api-router.js';
import { json } from './services/common.js';

export async function handleApi(request, env) {
  try {
    return await handleApiRequest(request, env);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status >= 500) console.error('Pointline API error', error);
    return json({ error: status >= 500 ? 'The Pointline service is temporarily unavailable' : error.message }, status);
  }
}
