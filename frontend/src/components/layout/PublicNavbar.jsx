import { Link } from 'react-router-dom';
import { GraduationCap, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/**
 * Sun/Moon toggle wired to the app's real ThemeContext:
 * `theme` is one of THEMES ids ('fantasy' = light, 'learnprep-dark' = dark)
 * and `setTheme(id)` is the only setter. No toggleTheme exists here.
 */
export default function PublicNavbar() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'learnprep-dark';

  return (
    <header className="mx-auto w-full max-w-6xl px-6 py-4 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2 text-primary">
        <GraduationCap size={30} />
        <span className="text-xl font-semibold text-base-content">LearnPrep</span>
      </Link>

      <nav className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center rounded-full bg-base-300/60 p-1">
          <button
            type="button"
            onClick={() => isDark && setTheme('fantasy')}
            aria-label="Light mode"
            aria-pressed={!isDark}
            className={`btn btn-circle btn-sm btn-ghost ${!isDark ? 'bg-base-100 text-primary' : ''}`}
          >
            <Sun size={18} />
          </button>
          <button
            type="button"
            onClick={() => !isDark && setTheme('learnprep-dark')}
            aria-label="Dark mode"
            aria-pressed={isDark}
            className={`btn btn-circle btn-sm btn-ghost ${isDark ? 'bg-base-100 text-primary' : ''}`}
          >
            <Moon size={18} />
          </button>
        </div>

        <Link to="/login" className="btn btn-outline btn-sm sm:btn-md">
          Login
        </Link>
        <Link to="/register" className="btn btn-primary btn-sm sm:btn-md">
          Register
        </Link>
      </nav>
    </header>
  );
}
