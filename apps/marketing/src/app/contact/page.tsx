"use client";

import { useState } from "react";


const subjects = [
  "Demander une démo",
  "Question sur les tarifs",
  "Partenariat",
  "Support technique",
  "Autre",
];

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <>
      {/* ─── HERO ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden grid-pattern">
        <div className="glow-indigo -top-40 right-1/4 animate-pulse-glow" />
        <div className="section text-center" style={{ paddingBottom: "3rem" }}>
          <span className="section-label">Contact</span>
          <h1 className="section-title mt-6">
            Parlons de votre <span className="gradient-text">projet</span>
          </h1>
          <p className="section-subtitle mx-auto text-center">
            Une question ? Un projet ? Remplissez le formulaire ci-dessous et
            notre équipe vous répondra sous 24 heures.
          </p>
        </div>
      </section>

      {/* ─── FORM ─────────────────────────────────────────── */}
      <section className="border-t border-white/5">
        <div className="section">
          <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-5">
            {/* Form */}
            <div className="lg:col-span-3">
              {submitted ? (
                <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
                  <span className="text-5xl">✅</span>
                  <h2 className="mt-6 text-xl font-bold text-white">
                    Message envoyé avec succès !
                  </h2>
                  <p className="mt-3 text-sm text-slate-400">
                    Notre équipe vous répondra dans les plus brefs délais.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                        Nom complet
                      </label>
                      <input
                        id="name"
                        type="text"
                        required
                        placeholder="Jean Dupont"
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                        Adresse email
                      </label>
                      <input
                        id="email"
                        type="email"
                        required
                        placeholder="jean@exemple.com"
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-slate-300 mb-2">
                      Sujet
                    </label>
                    <select
                      id="subject"
                      required
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="" className="bg-slate-900">Sélectionnez un sujet</option>
                      {subjects.map((s) => (
                        <option key={s} value={s} className="bg-slate-900">
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="organization" className="block text-sm font-medium text-slate-300 mb-2">
                      Organisation (optionnel)
                    </label>
                    <input
                      id="organization"
                      type="text"
                      placeholder="Nom de votre école, clinique, ONG..."
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">
                      Message
                    </label>
                    <textarea
                      id="message"
                      required
                      rows={5}
                      placeholder="Décrivez votre projet ou votre question..."
                      className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <button type="submit" className="btn-primary w-full sm:w-auto">
                    Envoyer le message
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  </button>
                </form>
              )}
            </div>

            {/* Info Panel */}
            <div className="space-y-6 lg:col-span-2">
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  📧 Email
                </h3>
                <p className="mt-2 text-base text-white">contact@oziow.com</p>
              </div>
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  ⏱️ Temps de Réponse
                </h3>
                <p className="mt-2 text-base text-white">Sous 24 heures (jours ouvrés)</p>
              </div>
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  🌍 Localisation
                </h3>
                <p className="mt-2 text-base text-white">Europe (Serveurs Francfort, DE)</p>
                <p className="mt-1 text-sm text-slate-400">Conformité RGPD</p>
              </div>
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  🔗 Liens Utiles
                </h3>
                <ul className="mt-3 space-y-2">
                  <li>
                    <a href="/docs" className="text-sm text-indigo-400 hover:text-indigo-300">
                      Documentation →
                    </a>
                  </li>
                  <li>
                    <a href="/tarifs" className="text-sm text-indigo-400 hover:text-indigo-300">
                      Tarifs →
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://api.oziow.com/v1/health"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-indigo-400 hover:text-indigo-300"
                    >
                      Statut API →
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
