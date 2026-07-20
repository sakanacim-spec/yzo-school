"use client";

import { useState } from "react";
import { SAAS_REGISTRY, SaaSProduct } from "../../config/saas-registry";

export function ThreeLayerArchitecture() {
  const [selectedSaas, setSelectedSaas] = useState<SaaSProduct>(SAAS_REGISTRY[0]);

  return (
    <section className="section relative overflow-hidden" aria-labelledby="architecture-3-layers">
      <div className="text-center">
        <span className="section-label">Chaîne de Valeur Complète</span>
        <h2 id="architecture-3-layers" className="section-title mt-4">
          Une architecture <span className="gradient-text">à 3 niveaux</span>
        </h2>
        <p className="section-subtitle mx-auto text-center">
          Découvrez comment la puissance du Moteur OZIOW propulse les SaaS Métiers pour délivrer de la valeur directement aux clients finaux.
        </p>
      </div>

      <div className="mt-16 space-y-6">
        {/* COUCHE 1 : PLATEFORME OZIOW */}
        <div className="glass-card p-6 border-indigo-500/30 bg-indigo-950/20 relative">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white font-black text-xl">O</div>
              <div>
                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">Couche 1 — Infrastructure Core</span>
                <h3 className="text-xl font-bold text-white">Le Moteur OZIOW (Platform Engine)</h3>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">🔒 Multi-Tenant RLS</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">🤖 IA Concierge Vector RAG</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">🔑 Auth &amp; RBAC</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">💳 Billing Engine</span>
            </div>
          </div>
        </div>

        {/* FLÈCHE DE LIAISON 1 */}
        <div className="flex justify-center text-indigo-400 text-2xl animate-bounce">↓</div>

        {/* COUCHE 2 : SAAS MÉTIERS */}
        <div className="glass-card p-6 border-purple-500/30 bg-purple-950/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <span className="text-xs font-semibold text-purple-400 uppercase tracking-widest">Couche 2 — Solutions Verticales</span>
              <h3 className="text-xl font-bold text-white">Les SaaS Métiers (Directs &amp; Éditeurs Tiers)</h3>
            </div>
            <span className="text-xs text-slate-400">Cliquez sur un SaaS pour voir ses utilisateurs finaux ↓</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {SAAS_REGISTRY.map((saas) => (
              <button
                key={saas.id}
                onClick={() => setSelectedSaas(saas)}
                className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                  selectedSaas.id === saas.id
                    ? "border-indigo-500 bg-indigo-500/20 text-white ring-2 ring-indigo-500/40"
                    : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white"
                }`}
              >
                <span className="text-2xl">{saas.icon}</span>
                <div className="overflow-hidden">
                  <div className="font-bold text-sm truncate">{saas.name}</div>
                  <div className="text-[10px] opacity-70 truncate">{saas.category}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* FLÈCHE DE LIAISON 2 */}
        <div className="flex justify-center text-emerald-400 text-2xl animate-bounce">↓</div>

        {/* COUCHE 3 : CLIENTS FINAUX */}
        <div className="glass-card p-6 border-emerald-500/30 bg-emerald-950/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                Couche 3 — Impact Métier pour {selectedSaas.name}
              </span>
              <h3 className="text-xl font-bold text-white">Les Clients Finaux &amp; Utilisateurs</h3>
              <p className="mt-1 text-sm text-slate-400">{selectedSaas.description}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedSaas.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-slate-400"}`}>
              {selectedSaas.status === "active" ? "✅ Solution Active" : "🚀 En Préparation"}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {selectedSaas.targetAudience.map((audience) => (
              <div key={audience} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                <span className="text-sm font-semibold text-emerald-300">👥 {audience}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
