'use client';

import { useEffect, useState } from 'react';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/tasks')
      .then((res) => res.json())
      .then((data) => {
        setStats(data.stats);
        setRecentTasks(data.tasks?.slice(0, 5) || []);
      });
  }, []);

  return (
    <div>
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">仪表盘</h1>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          <StatCard label="总任务" value={stats.total} />
          <StatCard label="待处理" value={stats.pending} color="yellow" />
          <StatCard label="已完成" value={stats.done} color="green" />
          <StatCard label="失败" value={stats.failed} color="red" />
        </div>
      )}

      <div className="bg-white rounded-xl border p-3 md:p-4">
        <h2 className="font-medium mb-3">最近任务</h2>
        {recentTasks.length === 0 ? (
          <p className="text-sm text-gray-400">暂无任务</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 font-medium">ID</th>
                    <th className="pb-2 font-medium">卡密</th>
                    <th className="pb-2 font-medium">状态</th>
                    <th className="pb-2 font-medium">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTasks.map((t: any) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-2">{t.id}</td>
                      <td className="py-2 font-mono text-xs">{t.key_str}</td>
                      <td className="py-2"><StatusBadge status={t.status} /></td>
                      <td className="py-2 text-gray-500">{t.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {recentTasks.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">#{t.id}</p>
                    <p className="text-xs text-gray-500 font-mono">{t.key_str}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={t.status} />
                    <p className="text-xs text-gray-400 mt-1">{t.created_at}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colors: Record<string, string> = {
    yellow: 'bg-yellow-50 text-yellow-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <div className={`p-3 md:p-4 rounded-xl border ${colors[color || ''] || 'bg-gray-50 text-gray-700'}`}>
      <p className="text-xs md:text-sm opacity-75">{label}</p>
      <p className="text-xl md:text-2xl font-bold mt-1">{value}</p>
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
