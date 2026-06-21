// Central permission matrix — defines which roles can access which pages.
// Sidebar filters nav items using this. Layout guards redirects on direct URL access.

export const PAGE_ROLES: Record<string, string[]> = {
  '/dashboard':   ['Super Admin', 'Fleet Manager', 'Dispatcher', 'Accountant', 'Viewer'],
  '/fleet':       ['Super Admin', 'Fleet Manager', 'Dispatcher', 'Viewer'],
  '/drivers':     ['Super Admin', 'Fleet Manager', 'Dispatcher', 'Viewer'],
  '/trips':       ['Super Admin', 'Fleet Manager', 'Dispatcher', 'Viewer'],
  '/fuel':        ['Super Admin', 'Fleet Manager', 'Accountant', 'Viewer'],
  '/costing':     ['Super Admin', 'Fleet Manager', 'Accountant', 'Viewer'],
  '/accounts':    ['Super Admin', 'Accountant'],
  '/maintenance': ['Super Admin', 'Fleet Manager', 'Viewer'],
  '/tyres':       ['Super Admin', 'Fleet Manager', 'Viewer'],
  '/spares':      ['Super Admin', 'Fleet Manager', 'Viewer'],
  '/compliance':  ['Super Admin', 'Fleet Manager', 'Viewer'],
  '/verification':['Super Admin', 'Fleet Manager', 'Viewer'],
  '/toll':        ['Super Admin', 'Fleet Manager', 'Dispatcher', 'Accountant', 'Viewer'],
  '/petty-cash':  ['Super Admin', 'Dispatcher', 'Accountant', 'Viewer'],
  '/analytics':   ['Super Admin', 'Fleet Manager', 'Accountant', 'Viewer'],
  '/alerts':      ['Super Admin', 'Fleet Manager', 'Dispatcher', 'Viewer'],
  '/chat':        ['Super Admin', 'Fleet Manager', 'Dispatcher', 'Accountant', 'Viewer'],
  '/users':       ['Super Admin'],
  '/audit-log':   ['Super Admin'],
};

export function canAccess(role: string | undefined, href: string): boolean {
  if (!role) return false;
  const allowed = PAGE_ROLES[href];
  if (!allowed) return true;
  return allowed.includes(role);
}
