'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'faka_last_form';
const TUTORIAL_KEY = 'faka_tutorial_seen';

const URL_PATTERN = /^https:\/\/www\.anygen\.io\/task\/[a-zA-Z0-9-]+-[a-zA-Z0-9]+\?share_id=\d+$/;

function loadSavedForm() {
  if (typeof window === 'undefined') return { url: '', email: '', key: '' };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : { url: '', email: '', key: '' };
  } catch {
    return { url: '', email: '', key: '' };
  }
}

function saveForm(url: string, email: string, key: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, email, key }));
  } catch {
    // ignore
  }
}

function hasSeenTutorial(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return true;
  }
}

function markTutorialSeen() {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    // ignore
  }
}

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ taskId: number; status: string } | null>(null);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);
  const [taskStatus, setTaskStatus] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  const [showUrlWarning, setShowUrlWarning] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const [queueProcessing, setQueueProcessing] = useState(false);

  // Load saved form on mount
  useEffect(() => {
    const saved = loadSavedForm();
    if (saved.url) setUrl(saved.url);
    if (saved.email) setEmail(saved.email);
    if (saved.key) setKey(saved.key);
  }, []);

  // Show tutorial if first visit
  useEffect(() => {
    if (!hasSeenTutorial()) {
      setShowTutorial(true);
    }
  }, []);

  // Poll queue status (only when user has an active task)
  useEffect(() => {
    if (!polling) return;
    const fetchQueue = async () => {
      try {
        const res = await fetch('/api/queue');
        if (res.ok) {
          const data = await res.json();
          setQueueLength(data.queueLength);
          setQueueProcessing(data.processing);
        }
      } catch {
        // ignore
      }
    };
    fetchQueue();
    const interval = setInterval(fetchQueue, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  // Save form on change
  useEffect(() => {
    if (url || email || key) saveForm(url, email, key);
  }, [url, email, key]);

  const dismissTutorial = () => {
    markTutorialSeen();
    setShowTutorial(false);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Validate URL format
    if (!URL_PATTERN.test(url.trim())) {
      setShowUrlWarning(true);
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setTaskStatus('');

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, url: url.trim(), email: email.trim() }),
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

  const handleRetry = () => {
    setError('');
    setResult(null);
    setTaskStatus('');
    handleSubmit();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">PPT 导出服务</h1>
          <p className="mt-2 text-sm md:text-base text-gray-500">输入卡密和链接，自动导出 PPT</p>
        </div>

        {/* Queue status bar — only show when current user is waiting */}
        {polling && (queueLength > 0 || queueProcessing) && (
          <div className="mb-4 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-center">
            <p className="text-sm text-amber-700">
              {queueProcessing
                ? `当前有 ${queueLength + 1} 个任务在处理/排队中`
                : `当前有 ${queueLength} 个任务排队中`}
            </p>
          </div>
        )}

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
            <p className="mt-1 text-xs text-gray-400">格式：https://www.anygen.io/task/xxx-xxx?share_id=数字</p>
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
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={handleRetry}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition"
            >
              一键重试
            </button>
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

        {result && taskStatus === 'pending' && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            排队中{queueLength > 0 ? `（前面还有 ${queueLength} 个任务）` : ''}，请稍候...
          </div>
        )}

        {result && taskStatus === 'processing' && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            正在处理中，请稍候...
          </div>
        )}

        <div className="mt-6 text-center">
          <a href="/query" className="text-sm text-blue-600 hover:underline">查询卡密状态</a>
        </div>
      </div>

      {/* Tutorial modal */}
      {showTutorial && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={dismissTutorial}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">使用教程</h2>
              <p className="text-sm text-gray-600 mb-4">
                请按照下图所示获取 AnyGen 分享链接，将链接粘贴到输入框中即可导出 PPT。
              </p>
              <img
                src="/jiaocheng1.jpg"
                alt="教程：如何获取 AnyGen 分享链接"
                className="w-full rounded-lg border"
              />
              <button
                onClick={dismissTutorial}
                className="mt-5 w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* URL format warning modal */}
      {showUrlWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowUrlWarning(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-lg font-bold">!</div>
                <h2 className="text-lg font-bold text-gray-900">链接格式不正确</h2>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                请输入正确的 AnyGen 分享链接，格式如下：
              </p>
              <code className="block text-xs bg-gray-50 p-2 rounded-lg text-gray-700 mb-4 break-all">
                https://www.anygen.io/task/xxx-xxx?share_id=数字
              </code>
              <p className="text-xs text-gray-400 mb-4">
                请参考使用教程中的步骤获取正确的分享链接。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowUrlWarning(false);
                    setShowTutorial(true);
                  }}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  查看教程
                </button>
                <button
                  onClick={() => setShowUrlWarning(false)}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
                >
                  重新填写
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
