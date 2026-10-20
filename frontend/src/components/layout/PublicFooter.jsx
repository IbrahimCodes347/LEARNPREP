import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';

const CONTACT_EMAIL = 'your-email@example.com';

export default function PublicFooter() {
  return (
    <footer className="bg-base-200 border-t border-base-300">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col gap-6 md:flex-row md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <GraduationCap size={26} />
            <span className="text-lg font-semibold text-base-content">LearnPrep</span>
          </div>
          <p className="mt-3 max-w-xs opacity-70">
            Your trusted digital partner for mastering academic and competitive examinations.
          </p>
          <p className="mt-4 text-sm opacity-60">
            &copy; {new Date().getFullYear()} LearnPrep. All rights reserved.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 self-start">
          <Link to="/" className="link link-hover">Home</Link>
          <Link to="/login" className="link link-hover">Login</Link>
          <Link to="/register" className="link link-hover">Register</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="link link-hover">Contact</a>
        </nav>
      </div>
    </footer>
  );
}
