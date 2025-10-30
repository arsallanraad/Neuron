export default function Footer() {
  return (
    <footer className="mt-24 border-t border-white/6 bg-black/5">
      <div className="container mx-auto px-6 py-8 text-center text-sm text-white/60">
        © {new Date().getFullYear()} Adaline — Crafted cinematic scroll experiences
      </div>
    </footer>
  );
}
