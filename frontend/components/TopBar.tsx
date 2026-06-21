'use client';
import { usePathname } from 'next/navigation';

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/fleet': 'Vehicle Management',
  '/drivers': 'Driver Management',
  '/trips': 'Trip Management',
  '/fuel': 'Fuel Management',
  '/costing': 'Trip Settlement',
  '/maintenance': 'Maintenance',
  '/compliance': 'Compliance',
  '/analytics': 'Analytics & Reports',
  '/alerts': 'Alerts & Notifications',
  '/users': 'User Management',
  '/toll': 'Toll Reconciliation',
};

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const title = titles[pathname] || 'TransportMS';

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 fixed top-0 right-0 left-0 md:left-64 z-30">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-slate-800">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden sm:block text-xs text-slate-400">
          {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <div className="w-px h-4 bg-slate-200 hidden sm:block" />
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs text-slate-600 font-medium">Live</span>
      </div>
    </header>
  );
}
