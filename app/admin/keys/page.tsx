'use client';

import { useEffect, useState } from 'react';

export default function KeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [showGen, setShowGen] = useState(false);
  const [genCount, setGenCount] = useState(1);
  const [genMaxUses, setGenMaxUses] = useState(1);
  const [genIsSuper, setGenIsSuper] = useState(false);
  const [genResult, setGenResult] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const loadKeys = () => {
    fetch('/api/keys').then((r) => r.json()).then((d) => setKeys(d.keys || []));
  };

  useEffect(() => { loadKeys(); }, []);

  const handleGenerate = async () => {
    setLoading(true);
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: genCount, max_uses: genMaxUses, is_super: genIsSuper }),
    });
    const data = await res.json();
    if (res.ok) {
      setGenResult(data.keys);
      loadKeys();
    }
    setLoading(false);
  };

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    await fetch(`/api/keys/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    loadKeys();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此卡密？关联的任务也会被删除。')) return;
    await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    loadKeys();
  };

  const copyKeys = () => {
    navigator.clipboard.writeText(genResult.join('\n'));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold">卡密管理</h1>
        <button
          onClick={() => { setShowGen(!showGen); setGenResult([]); }}
          className="px-3 md:px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
        >
          {showGen ? '取消' : '生成卡密'}
        </button>
      </div>

      {showGen && (
        <div className="bg-white rounded-xl border p-3 md:p-4 mb-4 md:mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">数量</label>
              <input
                type="number"
                min={1}
                max={100}
                value={genCount}
                onChange={(e) => setGenCount(Number(e.target.value))}
                className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">每卡使用次数</label>
              <input
                type="number"
                min={1}
                value={genMaxUses}
                onChange={(e) => setGenMaxUses(Number(e.target.value))}
                disabled={genIsSuper}
                className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={genIsSuper}
                  onChange={(e) => setGenIsSuper(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">超级卡密</span>
              </label>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 transition"
          >
            {loading ? '生成中...' : '确认生成'}
          </button>

          {genResult.length > 0 && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-green-700">已生成 {genResult.length} 个卡密</p>
                <button onClick={copyKeys} className="text-xs text-green-600 hover:underline">复制全部</button>
              </div>
              <div className="space-y-1">
                {genResult.map((k) => (
                  <p key={k} className="font-mono text-sm text-green-800 break-all">{k}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="px-4 py-3 font-medium">卡密</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">使用次数</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">创建时间</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">暂无卡密</td></tr>
            ) : (
              keys.map((k: any) => (
                <tr key={k.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{k.key}</td>
                  <td className="px-4 py-3">
                    {k.is_super ? (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">超级</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">普通</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{k.used_count} / {k.is_super ? '∞' : k.max_uses}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      k.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {k.status === 'active' ? '有效' : '已禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{k.created_at}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleToggleStatus(k.id, k.status)} className="text-xs text-blue-600 hover:underline">
                        {k.status === 'active' ? '禁用' : '启用'}
                      </button>
                      <button onClick={() => handleDelete(k.id)} className="text-xs text-red-600 hover:underline">删除</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {keys.length === 0 ? (
          <div className="bg-white rounded-xl border p-6 text-center text-gray-400 text-sm">暂无卡密</div>
        ) : (
          keys.map((k: any) => (
            <div key={k.id} className="bg-white rounded-xl border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm break-all">{k.key}</span>
                <div className="flex gap-1.5 shrink-0 ml-2">
                  {k.is_super ? (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">超级</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">普通</span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    k.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {k.status === 'active' ? '有效' : '已禁用'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>已用 {k.used_count} / {k.is_super ? '∞' : k.max_uses}</span>
                <span>{k.created_at}</span>
              </div>
              <div className="flex gap-2 pt-1 border-t">
                <button
                  onClick={() => handleToggleStatus(k.id, k.status)}
                  className="flex-1 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg font-medium"
                >
                  {k.status === 'active' ? '禁用' : '启用'}
                </button>
                <button
                  onClick={() => handleDelete(k.id)}
                  className="flex-1 py-1.5 text-xs text-red-600 bg-red-50 rounded-lg font-medium"
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
