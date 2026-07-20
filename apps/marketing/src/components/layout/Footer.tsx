import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-zinc-950 text-slate-400" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Col 1: Brand & Status */}
          <div className="col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white font-bold text-xl">O</div>
              <span className="font-bold text-xl tracking-tight text-white">OZIOW</span>
            </Link>
            <p className="text-sm leading-relaxed text-slate-400 max-w-sm">
              La plateforme SaaS officielle permettant de découvrir, lancer, commercialiser et gérer vos applications métiers intelligentes.
            </p>
            <div className="flex items-center gap-2 pt-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <Link href="/statut" className="text-xs font-semibold text-emerald-400 hover:underline">
                Tous les systèmes opérationnels (SLA 99.99%)
              </Link>
            </div>
          </div>

          {/* Col 2: Solutions */}
          <div>
            <h3 className="text-sm font-semibold leading-6 text-white">SaaS Métiers</h3>
            <ul role="list" className="mt-4 space-y-3 text-sm">
              <li><Link href="/solutions#yziow" className="hover:text-white">Yziow (Scolaire)</Link></li>
              <li><Link href="/solutions#mediow" className="hover:text-white">Mediow (Santé)</Link></li>
              <li><Link href="/solutions#shopow" className="hover:text-white">Shopow (Commerce)</Link></li>
              <li><Link href="/marketplace" className="hover:text-white">Tous les SaaS</Link></li>
            </ul>
          </div>

          {/* Col 3: Écosystème */}
          <div>
            <h3 className="text-sm font-semibold leading-6 text-white">Écosystème</h3>
            <ul role="list" className="mt-4 space-y-3 text-sm">
              <li><Link href="/publishers" className="hover:text-white">Éditeurs Tiers</Link></li>
              <li><Link href="/partenaires" className="hover:text-white">Partenaires</Link></li>
              <li><Link href="/developpeurs" className="hover:text-white">Développeurs &amp; APIs</Link></li>
              <li><Link href="/communaute" className="hover:text-white">Communauté</Link></li>
              <li><Link href="/ressources" className="hover:text-white">Ressources</Link></li>
            </ul>
          </div>

          {/* Col 4: Plateforme & Légal */}
          <div>
            <h3 className="text-sm font-semibold leading-6 text-white">Plateforme</h3>
            <ul role="list" className="mt-4 space-y-3 text-sm">
              <li><Link href="/tarifs" className="hover:text-white">Tarifs</Link></li>
              <li><Link href="/docs" className="hover:text-white">Documentation</Link></li>
              <li><a href="https://admin.oziow.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">Portail Admin</a></li>
              <li><Link href="/confidentialite" className="hover:text-white">Confidentialité</Link></li>
              <li><Link href="/cgu" className="hover:text-white">CGU</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>&copy; {new Date().getFullYear()} OZIOW Platform. Tous droits réservés.</p>
          <p className="italic">Protéger, propulser et étendre vos solutions métiers.</p>
        </div>
      </div>
    </footer>
  );
}
