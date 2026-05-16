'use client';

import { useState } from 'react';

export default function QueryPage() {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setData(null);

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error || '查询失败');
        return;
      }

      setData(result);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">查询卡密状态</h1>
          <p className="mt-2 text-sm md:text-base text-gray-500">输入卡密查看使用情况和下载记录</p>
        </div>

        <form onSubmit={handleQuery} className="bg-white rounded-xl shadow-sm border p-4 md:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">卡密</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="输入您的卡密"
              required
              className="w-full px-3 py-2.5 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition text-sm md:text-base"
          >
            {loading ? '查询中...' : '查询'}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {data && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border p-4 md:p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 md:gap-4 text-sm">
              <div>
                <span className="text-gray-500 text-xs">类型</span>
                <p className="font-medium">{data.key.is_super ? '超级卡密' : '普通卡密'}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">状态</span>
                <p className="font-medium">{data.key.status === 'active' ? '有效' : '已禁用'}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">已用 / 总次数</span>
                <p className="font-medium">
                  {data.key.used_count} / {data.key.is_super ? '无限' : data.key.max_uses}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">剩余次数</span>
                <p className="font-medium">{data.key.is_super ? '无限' : data.key.remaining}</p>
              </div>
            </div>

            {data.tasks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">导出记录</h3>
                <div className="space-y-2">
                  {data.tasks.map((task: any) => (
                    <div key={task.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm text-gray-600">{task.url}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{task.created_at}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            task.status === 'done' ? 'bg-green-100 text-green-700' :
                            task.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {task.status === 'done' ? '完成' : task.status === 'failed' ? '失败' : '处理中'}
                          </span>
                        </div>
                      </div>
                      {task.status === 'done' && (
                        <a
                          href={`/api/download/${task.id}`}
                          className="inline-block mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg font-medium"
                        >
                          下载
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 text-center">
          <a href="/" className="text-sm text-blue-600 hover:underline">返回导出页</a>
        </div>
      </div>
    </div>
  );
}
