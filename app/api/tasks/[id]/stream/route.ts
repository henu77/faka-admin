import { NextRequest } from 'next/server';
import { getTaskById } from '@/lib/tasks';

interface ClientConnection {
  controller: ReadableStreamDefaultController;
  lastEventId: number;
}

const clients = new Map<number, Set<ClientConnection>>();
let eventIdCounter = 0;

function getNextEventId(): number {
  return ++eventIdCounter;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const taskId = parseInt(id);

  // 获取 Last-Event-ID 用于断线重连
  const lastEventIdHeader = request.headers.get('Last-Event-ID');
  const lastEventId = lastEventIdHeader ? parseInt(lastEventIdHeader) : 0;

  const stream = new ReadableStream({
    start(controller) {
      if (!clients.has(taskId)) {
        clients.set(taskId, new Set());
      }

      const connection: ClientConnection = {
        controller,
        lastEventId,
      };

      clients.get(taskId)!.add(connection);

      // 立即发送当前任务状态
      const task = getTaskById(taskId);
      if (task) {
        const eventId = getNextEventId();
        controller.enqueue(`id: ${eventId}\ndata: ${JSON.stringify(task)}\n\n`);
      }

      // 定期发送心跳，防止连接超时（每 15 秒）
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(`: heartbeat\n\n`);
        } catch (e) {
          clearInterval(heartbeatInterval);
        }
      }, 15000);

      // 保存 interval ID 以便在连接关闭时清理
      (connection as any).heartbeatInterval = heartbeatInterval;
    },
    cancel(controller) {
      const set = clients.get(taskId);
      if (set) {
        for (const conn of set) {
          if (conn.controller === controller) {
            clearInterval((conn as any).heartbeatInterval);
            set.delete(conn);
            break;
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export function notifyTaskUpdate(taskId: number, task: any) {
  const connections = clients.get(taskId);
  if (connections) {
    const eventId = getNextEventId();
    const message = `id: ${eventId}\ndata: ${JSON.stringify(task)}\n\n`;

    const deadConnections: ClientConnection[] = [];

    connections.forEach((conn) => {
      try {
        conn.controller.enqueue(message);
        conn.lastEventId = eventId;
      } catch (e) {
        deadConnections.push(conn);
      }
    });

    // 清理已断开的连接
    deadConnections.forEach((conn) => {
      clearInterval((conn as any).heartbeatInterval);
      connections.delete(conn);
    });
  }
}
