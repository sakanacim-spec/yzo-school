"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navigation = [
    { name: "Accueil", href: "/" },
    { name: "SaaS Métiers", href: "/solutions" },
    { name: "Marketplace", href: "/marketplace" },
    { name: "Éditeurs Tiers", href: "/publishers" },
    { name: "Tarifs", href: "/tarifs" },
    { name: "Développeurs", href: "/developpeurs" },
    { name: "Blog", href: "/blog" },
  ];

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${isScrolled ? "bg-zinc-950/80 backdrop-blur-md border-b border-white/5" : "bg-transparent"}`}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between p-4 sm:px-6 lg:px-8" aria-label="Global">
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5 flex items-center gap-2">
            <span className="sr-only">OZIOW</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white font-bold text-xl">O</div>
            <div className="flex flex-col">
              <span className="font-bold text-xl tracking-tight text-white leading-none">OZIOW</span>
              <span className="text-[9px] font-semibold uppercase tracking-widest text-indigo-400">Platform</span>
            </div>
          </Link>
        </div>

        <div className="flex lg:hidden">
          <button type="button" className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-slate-400" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            <span className="sr-only">Ouvrir le menu principal</span>
            {isMobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>

        <div className="hidden lg:flex lg:gap-x-7">
          {navigation.map((item) => (
            <Link key={item.name} href={item.href} className={`text-sm font-medium transition-colors hover:text-white ${pathname === item.href ? "text-white font-semibold" : "text-slate-400"}`}>
              {item.name}
            </Link>
          ))}
        </div>

        <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-4 items-center">
          <Link href="/connexion" className="text-sm font-semibold leading-6 text-slate-300 hover:text-white transition-colors">Connexion</Link>
          <Link href="/marketplace" className="rounded-full bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-400 ring-1 ring-inset ring-indigo-500/20 hover:bg-indigo-500/20 transition-all">Lancer un SaaS</Link>
        </div>
      </nav>

      {/* Menu Mobile */}
      {isMobileMenuOpen && (
        <div className="lg:hidden glass-panel absolute inset-x-0 top-full p-4 border-b border-white/5 shadow-2xl">
          <div className="space-y-1">
            {navigation.map((item) => (
              <Link key={item.name} href={item.href} onClick={() => setIsMobileMenuOpen(false)} className={`block rounded-lg px-3 py-2 text-base font-semibold leading-7 ${pathname === item.href ? "bg-white/5 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
                {item.name}
              </Link>
            ))}
          </div>
          <div className="mt-4 border-t border-white/5 pt-4 space-y-2">
            <Link href="/connexion" onClick={() => setIsMobileMenuOpen(false)} className="block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-slate-400 hover:bg-white/5 hover:text-white">Connexion</Link>
            <Link href="/marketplace" onClick={() => setIsMobileMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-base font-semibold leading-7 text-indigo-400 bg-indigo-500/10 text-center mt-2">Lancer un SaaS</Link>
          </div>
        </div>
      )}
    </header>
  );
}
