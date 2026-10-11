import { Link } from 'react-router-dom';

const NotFoundPage = () => (
  <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
    <h1 className="text-4xl font-bold">404</h1>
    <p className="max-w-md text-sm opacity-70">That page does not exist.</p>
    <Link to="/" className="btn btn-primary">
      Back to dashboard
    </Link>
  </div>
);

export default NotFoundPage;