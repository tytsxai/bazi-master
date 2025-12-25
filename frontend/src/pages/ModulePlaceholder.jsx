export default function ModulePlaceholder({ title, description }) {
  return (
    <main id="main-content" tabIndex={-1} className="px-6 pb-16">
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-3xl text-gold-400">{title}</h1>
        <p className="mt-3 text-white/70">{description}</p>
        <p className="mt-6 text-sm text-white/60">This module is under construction in the current build.</p>
      </section>
    </main>
  );
}
