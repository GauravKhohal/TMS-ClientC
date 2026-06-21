'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { saveAuth } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@tms.in');
  const [password, setPassword] = useState('tms@1234');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api.login(email, password);
      saveAuth(data.token, data.user);
      router.push('/dashboard');
    } catch {
      setError('Invalid credentials. Try admin@tms.in / tms@1234');
    } finally {
      setLoading(false);
    }
  }

  const demoUsers = [
    { label: 'Super Admin', email: 'admin@tms.in' },
    { label: 'Fleet Manager', email: 'priya@tms.in' },
    { label: 'Dispatcher', email: 'karan@tms.in' },
    { label: 'Accountant', email: 'nisha@tms.in' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 shadow-lg text-slate-900 text-3xl font-bold">
            T
          </div>
          <h1 className="text-2xl font-bold text-white">TransportMS</h1>
          <p className="text-slate-400 text-sm mt-1">Enterprise Fleet Management Platform</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">Sign in to your account</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                required
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo users */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wide">Quick Login (Demo)</p>
            <div className="grid grid-cols-2 gap-2">
              {demoUsers.map(u => (
                <button
                  key={u.email}
                  onClick={() => setEmail(u.email)}
                  className="text-xs px-3 py-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 rounded-lg text-slate-600 text-left transition-colors"
                >
                  <div className="font-medium">{u.label}</div>
                  <div className="text-slate-400 truncate">{u.email}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3 text-center">All accounts use password: <span className="font-mono font-medium text-slate-600">tms@1234</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
