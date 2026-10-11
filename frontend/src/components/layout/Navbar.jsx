import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from './ThemeToggle';

const linkClass = ({ isActive }) =>
  isActive ? 'tab tab-active' : 'tab';

const Navbar = () => {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="navbar sticky top-0 z-40 border-b border-base-300 bg-base-100">
      <div className="navbar-start">
        <div className="dropdown lg:hidden">
          <button type="button" tabIndex={0} className="btn btn-ghost" aria-label="Open menu">
            <Menu size={20} aria-hidden="true" />
          </button>
          <ul tabIndex={0} className="menu dropdown-content z-50 mt-3 w-56 rounded-box bg-base-100 p-2 shadow">
            <li>
              <NavLink to="/" className={linkClass}>
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/tests" className={linkClass}>
                Tests
              </NavLink>
            </li>
            <li>
              <NavLink to="/leaderboard" className={linkClass}>
                Leaderboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/bookmarks" className={linkClass}>
                Bookmarks
              </NavLink>
            </li>
            {isAdmin && (
              <li>
                <NavLink to="/admin" className={linkClass}>
                  Admin
                </NavLink>
              </li>
            )}
          </ul>
        </div>
        <Link to="/" className="btn btn-ghost text-xl font-semibold">
          LearnPrep
        </Link>
      </div>

      <nav className="navbar-center hidden lg:flex">
        <div className="tabs tabs-box">
          <NavLink to="/" className={linkClass} end>
            Dashboard
          </NavLink>
          <NavLink to="/tests" className={linkClass}>
            Tests
          </NavLink>
          <NavLink to="/leaderboard" className={linkClass}>
            Leaderboard
          </NavLink>
          <NavLink to="/bookmarks" className={linkClass}>
            Bookmarks
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={linkClass}>
              Admin
            </NavLink>
          )}
        </div>
      </nav>

      <div className="navbar-end gap-1">
        <ThemeToggle />
        {user && (
          <div className="dropdown dropdown-end">
            <button type="button" tabIndex={0} className="btn btn-ghost btn-sm">
              <span className="max-w-32 truncate">{user.name}</span>
              <span className="badge badge-sm badge-primary">{user.role}</span>
            </button>
            <ul tabIndex={0} className="menu dropdown-content z-50 mt-3 w-52 rounded-box bg-base-100 p-2 shadow">
              <li className="menu-title">
                <span>{user.username}</span>
              </li>
              <li>
                <button type="button" onClick={onLogout}>
                  Log out
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;