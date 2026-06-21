'use client';

export function saveAuth(token: string, user: object) {
  localStorage.setItem('tms_token', token);
  localStorage.setItem('tms_user', JSON.stringify(user));
}

export function getUser() {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem('tms_user');
  return u ? JSON.parse(u) : null;
}

export function logout() {
  localStorage.removeItem('tms_token');
  localStorage.removeItem('tms_user');
  window.location.href = '/login';
}

export function isAuthenticated() {
  return !!localStorage.getItem('tms_token');
}
