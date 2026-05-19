'use client';

import { useEffect, useState, useCallback } from 'react';

interface LogEntry {
  time: string;
  chatId: string;
  buyerId: string;
  key: string;
  message: string;
}

interface StatusData {
  status: string;
  myId: string;
  connected: boolean;
  logCount: number;
  savedCookies: boolean;
  logs: LogEntry[];
}

export default function XianyuPage() {
  const [cookies, setCookies] = useState('');
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const refresh = useCallback(() => {
    fetch('/api/xianyu').then((r) => r.json()).then(setData);
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [refresh]);

  const flash = (text: string, type: 'ok' | 'err') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleStart = async () => {
    if (!cookies.trim()) { flash('请输入 Cookie', 'err'); return; }
    setLoading(true);
    const res = await fetch('/api/xianyu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', cookies: cookies.trim() }),
    });
    const json = await res.json();
    setLoading(false);
    if (json.success) { flash('连接已启动', 'ok'); refresh(); }
    else flash(json.error || '启动失败', 'err');
  };

  const handleStop = async () => {
    setLoading(true);
    await fetch('/api/xianyu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
    setLoading(false);
    flash('连接已断开', 'ok');
    refresh();
  };

  const statusLabel: Record<string, { text: string; color: string }> = {
    disconnected: { text: '未连接', color: 'bg-gray-200 text-gray-600' },
    connecting: { text: '连接中...', color: 'bg-yellow-100 text-yellow-700' },
    connected: { text: '已连接', color: 'bg-green-100 text-green-700' },
    error: { text: '连接错误', color: 'bg-red-100 text-red-700' },
  };

  const st = data ? statusLabel[data.status] || statusLabel.disconnected : statusLabel.disconnected;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">闲鱼自动发卡</h1>

      {msg && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {/* 连接状态 */}
      <div className="bg-white rounded-xl border p-6 mb-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm font-medium text-gray-700">连接状态</span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.text}</span>
          {data?.myId && <span className="text-xs text-gray-400">用户 ID: {data.myId}</span>}
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Cookie 字符串</label>
          <textarea
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            rows={3}
            placeholder="从 goofish.com 浏览器复制完整 Cookie 粘贴到此处"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
          <p className="mt-1 text-xs text-gray-400">登录 goofish.com → F12 → Application → Cookies → 复制全部 Cookie</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleStart}
            disabled={loading || data?.status === 'connected'}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? '处理中...' : '启动连接'}
          </button>
          <button
            onClick={handleStop}
            disabled={loading || data?.status !== 'connected'}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50 transition"
          >
            断开连接
          </button>
        </div>
      </div>

      {/* 使用说明 */}
      <div className="bg-white rounded-xl border p-6 mb-6 max-w-2xl">
        <h2 className="text-sm font-bold text-gray-700 mb-3">使用说明</h2>
        <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
          <li>登录 goofish.com，按 F12 打开开发者工具</li>
          <li>在 Application → Cookies 中复制所有 Cookie</li>
          <li>粘贴到上方输入框，点击「启动连接」</li>
          <li>在闲鱼聊天中向买家发送「给你卡密」</li>
          <li>系统自动生成一次性卡密并发送给买家</li>
        </ol>
      </div>

      {/* 发卡记录 */}
      <div className="bg-white rounded-xl border p-6 max-w-2xl">
        <h2 className="text-sm font-bold text-gray-700 mb-3">发卡记录</h2>
        {(!data?.logs || data.logs.length === 0) ? (
          <p className="text-sm text-gray-400">暂无发卡记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">时间</th>
                  <th className="pb-2 pr-4">会话 ID</th>
                  <th className="pb-2 pr-4">卡密</th>
                  <th className="pb-2">发送内容</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{log.time}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{log.chatId}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-blue-600">{log.key}</td>
                    <td className="py-2 text-gray-600 text-xs max-w-[200px] truncate">{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
