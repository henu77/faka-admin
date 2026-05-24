'use client';

import { useEffect, useState, useCallback } from 'react';

interface Account {
  account_id: string;
  status: string;
  error_msg?: string;
  created_at: string;
  updated_at: string;
}

interface LogEntry {
  id: number;
  account_id: string;
  chat_id: string;
  buyer_id: string;
  key: string;
  message: string;
  created_at: string;
}

export default function XianyuMultiPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ accountId: '', cookies: '' });

  const flash = (text: string, type: 'ok' | 'err') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const refreshAccounts = useCallback(() => {
    fetch('/api/xianyu-multi')
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts || []));
  }, []);

  const refreshLogs = useCallback((accountId: string) => {
    fetch(`/api/xianyu-multi?accountId=${accountId}`)
      .then((r) => r.json())
      .then((data) => setLogs(data.logs || []));
  }, []);

  useEffect(() => {
    refreshAccounts();
    const t = setInterval(refreshAccounts, 5000);
    return () => clearInterval(t);
  }, [refreshAccounts]);

  useEffect(() => {
    if (selectedAccount) {
      refreshLogs(selectedAccount);
      const t = setInterval(() => refreshLogs(selectedAccount), 5000);
      return () => clearInterval(t);
    }
  }, [selectedAccount, refreshLogs]);

  const handleAddAccount = async () => {
    if (!formData.accountId.trim() || !formData.cookies.trim()) {
      flash('请填写账号ID和Cookie', 'err');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/xianyu-multi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', ...formData }),
    });
    setLoading(false);
    const json = await res.json();
    if (json.success) {
      flash('账号已添加', 'ok');
      setFormData({ accountId: '', cookies: '' });
      setShowAddForm(false);
      refreshAccounts();
    } else {
      flash(json.error || '添加失败', 'err');
    }
  };

  const handleRemoveAccount = async (accountId: string) => {
    if (!confirm(`确定要删除账号 ${accountId} 吗？`)) return;
    setLoading(true);
    const res = await fetch('/api/xianyu-multi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', accountId }),
    });
    setLoading(false);
    const json = await res.json();
    if (json.success) {
      flash('账号已删除', 'ok');
      if (selectedAccount === accountId) setSelectedAccount(null);
      refreshAccounts();
    } else {
      flash(json.error || '删除失败', 'err');
    }
  };

  const handleStartAccount = async (accountId: string) => {
    setLoading(true);
    const res = await fetch('/api/xianyu-multi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', accountId }),
    });
    setLoading(false);
    const json = await res.json();
    if (json.success) {
      flash('连接已启动', 'ok');
      refreshAccounts();
    } else {
      flash(json.error || '启动失败', 'err');
    }
  };

  const handleStopAccount = async (accountId: string) => {
    setLoading(true);
    const res = await fetch('/api/xianyu-multi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop', accountId }),
    });
    setLoading(false);
    const json = await res.json();
    if (json.success) {
      flash('连接已断开', 'ok');
      refreshAccounts();
    } else {
      flash(json.error || '断开失败', 'err');
    }
  };

  const statusLabel: Record<string, { text: string; color: string }> = {
    disconnected: { text: '未连接', color: 'bg-gray-200 text-gray-600' },
    connecting: { text: '连接中...', color: 'bg-yellow-100 text-yellow-700' },
    connected: { text: '已连接', color: 'bg-green-100 text-green-700' },
    error: { text: '连接错误', color: 'bg-red-100 text-red-700' },
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">闲鱼多账号自动发卡</h1>

      {/* 使用说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <h3 className="text-base font-bold text-blue-800 mb-3">自动回复模板设置说明</h3>
        <div className="space-y-2 text-sm text-blue-700">
          <p>
            <span className="font-medium">网站链接：</span>
            <code className="mx-1 px-1.5 py-0.5 bg-blue-100 rounded text-xs font-mono">https://你的域名/</code>
            （即 PPT 导出服务首页，买家在此输入卡密和 AnyGen 链接）
          </p>
          <p>
            <span className="font-medium">获取链接教程：</span>
            网站首页首次访问时会弹出教程图，请将教程中的获取方式一并告知买家。
          </p>
          <div className="mt-3 pt-3 border-t border-blue-200">
            <p className="font-medium text-blue-800 mb-1">注意事项：</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>买家需提供 <strong>AnyGen 分享链接</strong>（格式：<code className="px-1 bg-blue-100 rounded text-xs">https://www.anygen.io/task/xxx-xxx?share_id=数字</code>）</li>
              <li>请确保卡密库存充足，可在「卡密管理」页面查看和生成</li>
              <li>Cookie 过期后需重新获取并更新，否则无法自动回复</li>
              <li>建议使用小号操作，避免主账号被限制</li>
            </ul>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {/* 账号列表 */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">账号列表</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
          >
            {showAddForm ? '取消' : '添加账号'}
          </button>
        </div>

        {showAddForm && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">账号ID</label>
                <input
                  type="text"
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  placeholder="例如：account_001"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cookie 字符串</label>
                <textarea
                  value={formData.cookies}
                  onChange={(e) => setFormData({ ...formData, cookies: e.target.value })}
                  rows={3}
                  placeholder="从 goofish.com 浏览器复制完整 Cookie 粘贴到此处"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <button
                onClick={handleAddAccount}
                disabled={loading}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 transition"
              >
                {loading ? '处理中...' : '确认添加'}
              </button>
            </div>
          </div>
        )}

        {accounts.length === 0 ? (
          <p className="text-sm text-gray-400">暂无账号，请添加</p>
        ) : (
          <div className="space-y-2">
            {accounts.map((acc) => {
              const st = statusLabel[acc.status] || statusLabel.disconnected;
              const isSelected = selectedAccount === acc.account_id;
              return (
                <div
                  key={acc.account_id}
                  className={`p-4 border rounded-lg cursor-pointer transition ${
                    isSelected ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                  onClick={() => setSelectedAccount(acc.account_id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{acc.account_id}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                        {st.text}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {acc.status === 'connected' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStopAccount(acc.account_id);
                          }}
                          disabled={loading}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 disabled:opacity-50 transition"
                        >
                          断开
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartAccount(acc.account_id);
                          }}
                          disabled={loading || acc.status === 'connecting'}
                          className="px-3 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 disabled:opacity-50 transition"
                        >
                          启动
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveAccount(acc.account_id);
                        }}
                        disabled={loading}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300 disabled:opacity-50 transition"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  {acc.error_msg && (
                    <p className="text-xs text-red-600 mt-1">{acc.error_msg}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    更新于 {new Date(acc.updated_at).toLocaleString('zh-CN')}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 发卡记录 */}
      {selectedAccount && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-bold mb-4">
            账号 {selectedAccount} 的发卡记录
          </h2>
          {logs.length === 0 ? (
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
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('zh-CN')}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{log.chat_id}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-blue-600">{log.key}</td>
                      <td className="py-2 text-gray-600 text-xs max-w-[200px] truncate">
                        {log.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
