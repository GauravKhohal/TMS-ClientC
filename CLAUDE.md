# TMS (Transport Management System) — Agent Guide — Client C

**This is a separate, standalone deployment forked from the TMS-ClientB codebase for a
specific client.** It has its own database, hosting (Railway/Vercel), and JWT secret —
fully isolated from TMS-1, TMS-ClientB, and any other client's deployment. Features here
are expected to diverge (different modules/workflows) — do not assume parity with other
deployments.

**Status:** MVP prototype, mock in-memory data, production-ready frontend/backend structure.  
**Stack:** Next.js 16.2.6 + Express.js 5 + TypeScript + Tailwind CSS + Recharts  
**Ports:** Backend 5001, Frontend 3000  
**Repo:** TODO — set to this client's GitHub repo URL once created

---

## Quick Start

```bash
# Terminal 1: Backend
cd backend && npm install && npm start  # http://localhost:5001

# Terminal 2: Frontend  
cd frontend && npm install && npm run dev  # http://localhost:3001
```

**Test Login:** `admin@tms.in` / `tms@1234`

---

## Architecture at a Glance

### Backend (`/backend/server.js`)
- Express.js REST API with JWT auth (7-day expiration)
- All data in-memory (`/backend/data/mockData.js`) — resets on restart
- Endpoints: `/api/auth/login`, `/api/dashboard`, `/api/fleet`, `/api/drivers`, `/api/trips`, `/api/fuel`, `/api/maintenance`, `/api/compliance`, `/api/alerts`, `/api/costing`, `/api/analytics`, `/api/users`, `/api/toll/routes`, `/api/toll/reconciliation`, `/api/city-suggest`, `/api/calc-distance`
- Auth middleware checks `Authorization: Bearer <token>` header
- All responses are mocked; no database
- City data: `/backend/data/indianCities.js` — 110+ Indian cities with lat/lng for distance calc
- Distance calc: OSRM routing engine (free, no API key needed)
- PORT, JWT_SECRET, FRONTEND_URL configurable via `.env`

### Frontend (`/frontend/app`)
- **Next.js App Router** with route groups (`(dashboard)`)
- **Client-side auth** via `localStorage` (`tms_token`, `tms_user`)
- Protected routes in `(dashboard)/layout.tsx` — redirects to `/login` if no token
- All pages: `'use client'` directive (interactive)
- State: Pure React hooks (useState/useEffect), no Redux/Context
- API calls via `/frontend/lib/api.ts` wrapper around fetch()
- City autocomplete via `/frontend/lib/cities.ts` — client-side, instant, no API call needed
- API base URL via `NEXT_PUBLIC_API_URL` env var (falls back to `http://localhost:5001/api`)
- Styling: Tailwind CSS 4, no custom CSS files

---

## Key Patterns

### Adding a New Page

1. **Create the page component** at `/frontend/app/(dashboard)/[feature]/page.tsx`
2. **Define interfaces** at the top (for data types)
3. **Extract Tailwind constants** (INPUT, SELECT, color mappings)
4. **Implement standard flow:**
   ```tsx
   const [data, setData] = useState<Type[]>([]);
   const [loading, setLoading] = useState(true);
   const [mounted, setMounted] = useState(false);  // For Recharts

   useEffect(() => {
     setMounted(true);
     api.[feature]().then(setData).catch(console.error).finally(() => setLoading(false));
   }, []);

   if (loading) return <Spinner />;

   return (
     <div className="space-y-5">
       {mounted && <ChartComponents />}  // Always gate charts with mounted check
       <DataTable />
       <Modal />
     </div>
   );
   ```

3. **Add modal for add/edit:**
   - Use `fixed inset-0 bg-black/50` overlay
   - Controlled inputs with `onChange`
   - Show success toast after submit
   - Reset form and close modal on success

4. **Wire up the API** in `/backend/server.js` (mock endpoint) and `/frontend/lib/api.ts` (client wrapper)

### Forms & Modals
- All add/edit forms in modals, never inline
- Extract field styles to constants: `const INPUT = "w-full px-3 py-2 border..."`
- Use controlled inputs: `value={form.field}` + `onChange`
- Show loading spinner during submit: `await new Promise(r => setTimeout(r, 600))`
- Show success toast with auto-dismiss: `setTimeout(() => setToast(''), 3000)`

### Recharts & SSR
**Critical:** Recharts crashes during Next.js SSR pre-rendering (ResizeObserver not available server-side).

**Solution:** Gate all chart components with `mounted` state:
```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);  // Sets to true only on client

return (
  <>
    {mounted && (
      <ResponsiveContainer>
        <BarChart data={data}>...</BarChart>
      </ResponsiveContainer>
    )}
  </>
);
```

This ensures charts only render after hydration. ✓ Applied to: dashboard, fuel, costing, analytics pages.

### Tables & Lists
- Search: `.toLowerCase().includes()` pattern
- Filter with count badges showing how many items in each category
- Hover effects: `hover:bg-slate-50`
- Status badges with color mapping (green/yellow/red/blue)
- Inline action buttons (Edit, Delete, Resolve, etc.)

### Status & Color Mappings
```javascript
const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-100 text-green-700',
  Inactive: 'bg-slate-100 text-slate-500',
  Pending: 'bg-yellow-100 text-yellow-700',
};
```

---

## Common Gotchas

### 1. Recharts SSR Crash
- **Symptom:** Page appears blank when loaded
- **Cause:** Recharts requires browser APIs (`ResizeObserver`) unavailable during SSR
- **Fix:** Always use `mounted` state pattern; gate charts with `{mounted && <Chart />}`

### 2. Next.js 16.2.6 Breaking Changes
- This version has significant API changes from typical Next.js docs
- Check `/frontend/node_modules/next/dist/docs/` for accurate docs
- `getServerSideProps` and `getStaticProps` don't exist in App Router — use `useEffect` instead

### 3. CORS in Development
- Backend has CORS enabled for all origins in dev (`FRONTEND_URL` not set)
- In production, set `FRONTEND_URL=https://your-vercel-url.vercel.app` in backend env
- Frontend base URL set via `NEXT_PUBLIC_API_URL` env var (see `frontend/.env.local`)

### 4. JWT Token Expiration
- Tokens expire after **7 days** (changed from 8h)
- No refresh token logic — user must log in again if token expires
- Token stored in `localStorage` as `tms_token`

### 5. Port Conflicts
- Backend runs on **5001** (set via `PORT` env var or default)
- Frontend runs on 3001: `npm run dev` (configured in package.json)
- Check `netstat -ano | findstr :5001` to find blocking processes on Windows

### 6. Mock Data Resets
- All data is in-memory; **resets on server restart**
- No persistence — changes are lost when backend stops
- This is intentional for MVP; swap `mockData.js` for a real DB when ready

---

## File Structure Summary

```
TMS/
├── backend/
│   ├── server.js              # Express server, all API routes
│   ├── data/
│   │   ├── mockData.js        # Mock data (vehicles, trips, drivers, etc.)
│   │   └── indianCities.js    # 110+ Indian cities with lat/lng for distance calc
│   ├── .env                   # MAPPLS_KEY, JWT_SECRET, FRONTEND_URL (not committed)
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── (dashboard)/       # Protected route group
│   │   │   ├── layout.tsx     # Auth guard, Sidebar, TopBar
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── fleet/page.tsx
│   │   │   ├── drivers/page.tsx
│   │   │   ├── trips/page.tsx
│   │   │   ├── fuel/page.tsx
│   │   │   ├── maintenance/page.tsx
│   │   │   ├── compliance/page.tsx
│   │   │   ├── costing/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   ├── alerts/page.tsx
│   │   │   ├── toll/page.tsx  # Toll calculator + reconciliation
│   │   │   └── users/page.tsx
│   │   ├── login/page.tsx
│   │   ├── globals.css        # Tailwind entry point
│   │   └── layout.tsx         # Root layout
│   ├── lib/
│   │   ├── api.ts             # API client wrapper (all endpoints)
│   │   ├── auth.ts            # localStorage helpers
│   │   └── cities.ts          # Client-side Indian city search (instant autocomplete)
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx
│   ├── .env.local             # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_MAPPLS_KEY (not committed)
│   ├── package.json
│   └── tsconfig.json
└── CLAUDE.md (this file)
```

---

## Development Workflow

### Adding a Feature
1. **Define data structure** in `/backend/data/mockData.js`
2. **Add API endpoint** in `/backend/server.js`
3. **Add API client** in `/frontend/lib/api.ts`
4. **Create page component** at `/frontend/app/(dashboard)/[feature]/page.tsx`
5. **Test:** Log in, navigate to page, verify data loads, test add/edit/delete flows

### Running Tests
- No test suite configured; rely on manual browser testing
- Console logs for debugging (check browser DevTools)

### Building for Production
```bash
cd frontend && npm run build && npm start  # Serves on port 3001
cd backend && npm start                     # Serves on port 5001
```

### Deployment
- **Frontend → Vercel**: set `NEXT_PUBLIC_API_URL=https://<railway-url>/api`
- **Backend → Railway**: set `MAPPLS_KEY`, `JWT_SECRET`, `FRONTEND_URL` env vars
- Both auto-deploy on `git push origin main`

---

## Credentials & Test Data

**Admin Login:**
- Email: `admin@tms.in`
- Password: `tms@1234`

**Mock Data Samples:**
- Vehicles: V001–V008 (mix of Ashok Leyland, Volvo, Tata)
- Drivers: D001–D008 (mix of active/inactive)
- Trips: T001–T008 (various statuses: In Transit, Completed, Planned, Delayed, Cancelled)
- Fuel entries: F001–F008 (linked to vehicles)
- Maintenance: M001–M006 (Breakdown, Preventive, Tyre types)
- Alerts: A001–A008 (Speed Violation, Fitness Expired, Breakdown, etc.)
- Users: U001–U006 (5 roles: Super Admin, Fleet Manager, Dispatcher, Accountant, Viewer)
- Toll Routes: RT001–RT007 (major NH corridors with plaza-level charges)
- Toll Reconciliations: RC001–RC008 (trip-wise FASTag vs planned reconciliation)

---

## TypeScript & Type Safety

- All components use TypeScript interfaces (`Vehicle`, `Driver`, `Trip`, etc.)
- Props typed with `{ label: string; children: React.ReactNode }`
- No `any` types unless unavoidable (e.g., Recharts formatter callbacks)

---

## Tailwind CSS Specifics

**Entry point:** `/frontend/app/globals.css` with `@import "tailwindcss"`  
**No custom CSS files** — all styling via inline Tailwind classes  
**Reusable constants:**
```typescript
const INPUT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const SELECT = INPUT + " bg-white";
```

---

## When to Ask for Clarification

- If a requirement conflicts with mock data structure
- If you need to change ports or authentication flow
- If you're unsure whether to modify backend, frontend, or both
- If you need real database integration (not yet implemented)

---

## Summary: How to Be Productive

1. ✓ Always use `'use client'` for interactive components
2. ✓ Always define TypeScript interfaces at component top
3. ✓ Always gate Recharts components with `mounted` state
4. ✓ Always extract repeated Tailwind classes to constants
5. ✓ Use `/frontend/lib/api.ts` for API calls (don't use fetch directly)
6. ✓ Check authentication in `(dashboard)/layout.tsx` via localStorage
7. ✓ All forms in modals; show success toast after submit
8. ✓ Mock data resets on server restart — document this for users
9. ✓ Test in browser; console.error for debugging
10. ✓ Refer to this file for patterns; don't assume standard Next.js conventions apply
