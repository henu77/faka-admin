import { NextRequest } from 'next/server';
import { getTaskById } from '@/lib/tasks';

const clients = new Map<number, Set<ReadableStreamDefaultController>>();

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const taskId = parseInt(id);

  const stream = new ReadableStream({
    start(controller) {
      if (!clients.has(taskId)) {
        clients.set(taskId, new Set());
      }
      clients.get(taskId)!.add(controller);

      const task = getTaskById(taskId);
      if (task) {
        controller.enqueue(`data: ${JSON.stringify(task)}\n\n`);
      }
    },
    cancel(controller) {
      const set = clients.get(taskId);
      if (set) set.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export function notifyTaskUpdate(taskId: number, task: any) {
  const controllers = clients.get(taskId);
  if (controllers) {
    const message = `data: ${JSON.stringify(task)}\n\n`;
    controllers.forEach((controller) => {
      try {
        controller.enqueue(message);
      } catch (e) {
        controllers.delete(controller);
      }
    });
  }
}
