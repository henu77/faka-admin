'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/admin', label: '仪表盘', icon: '📊' },
  { href: '/admin/keys', label: '卡密', icon: '🔑' },
  { href: '/admin/tasks', label: '任务', icon: '📋' },
  { href: '/admin/xianyu-multi', label: '闲鱼发卡', icon: '🐟' },
  { href: '/admin/settings', label: '设置', icon: '⚙️' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/admin/login') {
      setChecking(false);
      return;
    }
    fetch('/api/auth').then((res) => {
      if (res.ok) {
        setAuthed(true);
      } else {
        router.replace('/admin/login');
      }
      setChecking(false);
    });
  }, [pathname, router]);

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>;
  }

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (!authed) return null;

  const handleLogout = () => {
    document.cookie = 'admin_token=; Path=/; Max-Age=0';
    router.replace('/admin/login');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-white border-r flex-col">
        <div className="p-4 border-b">
          <h2 className="font-bold text-lg">发卡管理</h2>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm transition ${
                pathname === item.href
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="p-2 border-t">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-left rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            退出登录
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex z-50">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center py-2 text-xs transition ${
              pathname === item.href
                ? 'text-blue-600 font-medium'
                : 'text-gray-500'
            }`}
          >
            <span className="text-lg mb-0.5">{item.icon}</span>
            {item.label}
          </a>
        ))}
        <button
          onClick={handleLogout}
          className="flex-1 flex flex-col items-center py-2 text-xs text-gray-400"
        >
          <span className="text-lg mb-0.5">🚪</span>
          退出
        </button>
      </nav>
    </div>
  );
}
