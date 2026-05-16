'use client';

import { useState } from 'react';

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ taskId: number; status: string } | null>(null);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);
  const [taskStatus, setTaskStatus] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    setTaskStatus('');

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, url, email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '提交失败');
        return;
      }

      setResult(data);
      setTaskStatus('pending');
      setPolling(true);
      pollStatus(data.taskId);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = (taskId: number) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/download/${taskId}`, { method: 'HEAD' });
        if (res.ok) {
          setTaskStatus('done');
          setPolling(false);
          clearInterval(interval);
          return;
        }
        const taskRes = await fetch(`/api/tasks/${taskId}`);
        if (taskRes.ok) {
          const taskData = await taskRes.json();
          setTaskStatus(taskData.task?.status || 'unknown');
          if (taskData.task?.status === 'failed') {
            setError(taskData.task?.error_msg || '导出失败');
            setPolling(false);
            clearInterval(interval);
          }
        }
      } catch {
        // ignore
      }
    }, 3000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">PPT 导出服务</h1>
          <p className="mt-2 text-sm md:text-base text-gray-500">输入卡密和链接，自动导出 PPT</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-4 md:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">AnyGen 链接</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.anygen.io/task/..."
              required
              className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">接收邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

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
            disabled={loading || polling}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm md:text-base"
          >
            {loading ? '提交中...' : polling ? '导出中，请稍候...' : '开始导出'}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {result && taskStatus === 'done' && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700 font-medium mb-2">导出完成！</p>
            <a
              href={`/api/download/${result.taskId}`}
              className="inline-block px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
            >
              下载 PPT
            </a>
          </div>
        )}

        {result && (taskStatus === 'processing' || taskStatus === 'pending') && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            正在处理中，请稍候...
          </div>
        )}

        <div className="mt-6 text-center">
          <a href="/query" className="text-sm text-blue-600 hover:underline">查询卡密状态</a>
        </div>
      </div>
    </div>
  );
}
