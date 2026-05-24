import { getQueueLength, isProcessing } from '@/lib/queue';

export async function GET() {
  return Response.json({
    queueLength: getQueueLength(),
    processing: isProcessing(),
  });
}
