'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { getUser } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { api } from '@/lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('tms_token')) {
      router.push('/login');
      return;
    }
    setReady(true);
  }, [router]);

  // Log page visit for activity tracking (fire-and-forget)
  useEffect(() => {
    if (ready && pathname) {
      api.logPageVisit(pathname).catch(() => {});
    }
  }, [pathname, ready]);

  const user = getUser();
  const hasAccess = canAccess(user?.role, pathname);

  if (!ready) return null;

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col md:ml-64">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto pt-14 px-4 pb-4 md:px-6 md:pb-6">
          {hasAccess ? children : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Access Restricted</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Your role <span className="font-medium text-slate-700">({user?.role})</span> does not have access to this page.
                </p>
                <p className="text-xs text-slate-400 mt-2">Contact your Super Admin to request access.</p>
              </div>
              <button onClick={() => router.push('/dashboard')}
                className="mt-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                Go to Dashboard
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
