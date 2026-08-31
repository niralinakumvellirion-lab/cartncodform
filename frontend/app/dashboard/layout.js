import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { BACKEND_URL } from '../../lib/api';

async function getStores() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/stores`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    return [];
  }
}

export default async function DashboardLayout({ children }) {
  const stores = await getStores();

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar stores={stores} />
      <main className="flex flex-1 flex-col overflow-x-auto bg-white px-8 py-8">
        <AuthGuard>{children}</AuthGuard>
      </main>
    </div>
  );
}
