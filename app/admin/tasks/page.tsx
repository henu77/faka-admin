'use client';

import { useEffect, useState } from 'react';

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  const loadTasks = () => {
    fetch('/api/tasks').then((r) => r.json()).then((d) => {
      setTasks(d.tasks || []);
      setStats(d.stats);
    });
  };

  useEffect(() => { loadTasks(); }, []);

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">任务历史</h1>

      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 md:gap-3 mb-4 md:mb-6">
          <MiniStat label="总计" value={stats.total} />
          <MiniStat label="待处理" value={stats.pending} />
          <MiniStat label="处理中" value={stats.processing} />
          <MiniStat label="完成" value={stats.done} />
          <MiniStat label="失败" value={stats.failed} />
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">卡密</th>
              <th className="px-4 py-3 font-medium">链接</th>
              <th className="px-4 py-3 font-medium">邮箱</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">创建时间</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">暂无任务</td></tr>
            ) : (
              tasks.map((t: any) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">{t.id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{t.key_str}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-gray-500">{t.url}</td>
                  <td className="px-4 py-3 text-gray-500">{t.email}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{t.created_at}</td>
                  <td className="px-4 py-3">
                    {t.status === 'done' && (
                      <a href={`/api/download/${t.id}`} className="text-xs text-blue-600 hover:underline">下载</a>
                    )}
                    {t.status === 'failed' && (
                      <span className="text-xs text-red-500" title={t.error_msg}>查看错误</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {tasks.length === 0 ? (
          <div className="bg-white rounded-xl border p-6 text-center text-gray-400 text-sm">暂无任务</div>
        ) : (
          tasks.map((t: any) => (
            <div key={t.id} className="bg-white rounded-xl border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">#{t.id}</span>
                <StatusBadge status={t.status} />
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <p className="truncate">{t.url}</p>
                <p>{t.email}</p>
              </div>
              <div className="flex items-center justify-between pt-1 border-t">
                <span className="text-xs text-gray-400">{t.created_at}</span>
                <div>
                  {t.status === 'done' && (
                    <a href={`/api/download/${t.id}`} className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg font-medium">下载</a>
                  )}
                  {t.status === 'failed' && (
                    <span className="text-xs text-red-500" title={t.error_msg}>错误详情</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-2 md:p-3 bg-gray-50 rounded-lg text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-base md:text-lg font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    done: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    processing: 'bg-blue-100 text-blue-700',
    pending: 'bg-yellow-100 text-yellow-700',
  };
  const labels: Record<string, string> = {
    done: '完成', failed: '失败', processing: '处理中', pending: '待处理',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {labels[status] || status}
    </span>
  );
}
