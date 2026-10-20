import { Link, Navigate } from 'react-router-dom';
import { FileText, CheckSquare, BarChart3, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import heroImg from '../assets/hero-student.svg';

const FEATURES = [
  {
    icon: FileText,
    title: 'Practice questions',
    desc: 'Test yourself topic-by-topic with thousands of targeted questions.',
  },
  {
    icon: CheckSquare,
    title: 'Mock tests',
    desc: 'Take timed, real-pattern practice examinations to build exam day endurance.',
  },
  {
    icon: BarChart3,
    title: 'Progress tracking',
    desc: 'Analyze your strengths and improve based on real performance analytics.',
  },
];

export default function Home() {
  // Real AuthContext API: { user, restoring, ... } — there is no `loading`.
  const { user, restoring } = useAuth();

  if (restoring) {
    return (
      <div className="min-h-screen grid place-items-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  // Already logged in -> skip the landing page.
  // Real paths: admin dashboard lives at /admin, student dashboard at /dashboard.
  if (user) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-base-200 text-base-content">
      <PublicNavbar />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-12 md:py-20 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              Prepare smarter.
              <br />
              Score higher.
            </h1>
            <p className="mt-5 max-w-md text-lg opacity-70">
              Notes, practice questions and mock tests for your exams, all in one place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="btn btn-primary btn-lg">
                Get started <ArrowUpRight size={18} />
              </Link>
              <Link to="/login" className="btn btn-outline btn-lg">
                Login
              </Link>
            </div>
          </div>

          <img
            src={heroImg}
            alt="Student preparing for an exam with a timer and checked test paper"
            className="w-full max-w-xl mx-auto"
          />
        </section>

        <section className="bg-base-100 border-t border-base-300">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <h2 className="text-3xl font-bold">What is LearnPrep?</h2>
            <p className="mt-3 max-w-xl opacity-70">
              LearnPrep offers your trusted digital partner for mastering academic and
              competitive examinations.
            </p>

            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="flex gap-4">
                    <div className="shrink-0 grid place-items-center size-14 rounded-xl bg-primary/10 text-primary">
                      <Icon size={26} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{feature.title}</h3>
                      <p className="mt-1 opacity-70">{feature.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
