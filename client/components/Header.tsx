import { Link } from "react-router-dom";

export default function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 backdrop-blur bg-black/30 border-b border-white/6">
      <div className="container mx-auto flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">A</div>
          <div>
            <div className="text-sm font-semibold">Neuron 3D</div>
            <div className="text-xs text-white/60">Cinematic</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="text-sm text-white/90 hover:text-white/100">
            Home
          </Link>
          <a
            href="https://adaline.ai"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-white/60 hover:text-white/80"
          >
            About
          </a>
          <Link
            to="/"
            className="ml-2 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20"
          >
            Try Demo
          </Link>
        </nav>

        <div className="md:hidden">
          <Link
            to="/"
            className="rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white"
          >
            Demo
          </Link>
        </div>
      </div>
    </header>
  );
}
