import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

/** App shell. The test engine renders its own chrome, so it opts out via its route. */
const Layout = () => (
  <div className="min-h-screen bg-base-200">
    <Navbar />
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <Outlet />
    </main>
  </div>
);

export default Layout;