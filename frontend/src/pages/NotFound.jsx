import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-gold-400/80">404</p>
      <h1 className="mt-3 font-display text-3xl text-white">The path fades into the mist.</h1>
      <Link
        to="/"
        className="mt-6 rounded-full border border-gold-400/60 px-5 py-2 text-sm text-gold-400 hover:bg-gold-400/20"
      >
        Return Home
      </Link>
    </main>
  );
}
