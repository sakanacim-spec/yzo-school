"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SHARED_SAAS_REGISTRY } from "@saas/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.oziow.com";

function HubContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") || "ecole-lumiere";

  const [activeTab, setActiveTab] = useState<string>("apps");
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Essayer de charger depuis localStorage ou depuis l'API par slug
    const savedTenantStr = localStorage.getItem("oziow_current_tenant");
    if (savedTenantStr) {
      try {
        const parsed = JSON.parse(savedTenantStr);
        if (parsed && parsed.slug === slug) {
          setTenant(parsed);
          setLoading(false);
          return;
        }
      } catch (e) {
        // ignore
      }
    }

    // Sinon charger depuis l'API backend
    fetch(`${API_BASE_URL}/v1/onboarding/tenant?slug=${slug}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.id) {
          setTenant(data);
        } else {
          setTenant({
            id: "mock-tenant-id",
            slug: slug,
            name: slug.replace(/-/g, " ").toUpperCase(),
            status: "trial",
            country: "FRA",
            currency: "EUR",
          });
        }
      })
      .catch(() => {
        setTenant({
          id: "mock-tenant-id",
          slug: slug,
          name: slug.replace(/-/g, " ").toUpperCase(),
          status: "trial",
          country: "FRA",
          currency: "EUR",
        });
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const activeApps = SHARED_SAAS_REGISTRY.filter((s) => s.id === "yziow");

  return (
    <div className="section mx-auto max-w-6xl" style={{ paddingTop: "3rem" }}>
      {/* HEADER HUB CLIENT */}
      <div className="glass-card p-6 border-indigo-500/30 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">
            Hub Client — Centre de Contrôle
          </span>
          <h1 className="text-2xl font-extrabold text-white mt-1">
            {loading ? "Chargement..." : tenant?.name || "Mon Organisation"}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tenant Slug : <code className="text-indigo-300 font-mono">{slug}</code>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
            🟢 Status: {tenant?.status === "trial" ? "Essai Gratuit 14j" : "Actif"}
          </span>
          <a
            href="https://admin.oziow.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary py-2 px-4 text-xs font-bold"
          >
            Ouvrir mon SaaS (Yziow) →
          </a>
        </div>
      </div>

      {/* NAVIGATION SECTIONS HUB */}
      <div className="flex border-b border-white/10 mb-8 overflow-x-auto gap-2">
        {[
          { id: "apps", label: "📱 Mes Applications", count: "1" },
          { id: "modules", label: "🧩 Mes Modules", count: "3" },
          { id: "org", label: "🏢 Mon Organisation" },
          { id: "billing", label: "💳 Mon Abonnement", tag: "Phase 2B" },
          { id: "users", label: "👥 Mes Utilisateurs" },
          { id: "support", label: "🛠️ Support & SLA" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap pb-3 px-4 text-sm font-medium border-b-2 transition-all ${
              activeTab === tab.id
                ? "border-indigo-500 text-white font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
            {tab.count && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">{tab.count}</span>}
            {tab.tag && <span className="ml-2 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-300 font-bold">{tab.tag}</span>}
          </button>
        ))}
      </div>

      {/* TAB 1 : MES APPLICATIONS */}
      {activeTab === "apps" && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-white">SaaS Métiers Installés</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {activeApps.map((saas) => (
              <div key={saas.id} className="glass-card p-6 border-emerald-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-4xl">{saas.icon}</span>
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                    Actif (Essai 14j)
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-white">{saas.name}</h3>
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mt-1">{saas.categoryLabel}</p>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">{saas.description}</p>
                
                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Modules : {saas.modules.join(", ")}</span>
                  <a href="https://admin.oziow.com" target="_blank" rel="noopener noreferrer" className="btn-primary text-xs py-1.5 px-3">
                    Lancer Yziow
                  </a>
                </div>
              </div>
            ))}

            <div className="glass-card p-6 border-dashed border-white/20 flex flex-col items-center justify-center text-center opacity-70 hover:opacity-100 transition-opacity">
              <span className="text-3xl mb-2">➕</span>
              <h3 className="font-bold text-white text-base">Installer un nouveau SaaS</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">Explorez la Marketplace pour ajouter Mediow, Shopow ou un SaaS tiers.</p>
              <Link href="/marketplace" className="btn-secondary text-xs mt-4">
                Parcourir la Marketplace
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2 : MES MODULES */}
      {activeTab === "modules" && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-white">Modules &amp; Extensions du Tenant</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5 border-indigo-500/20">
              <span className="text-3xl">🤖</span>
              <h3 className="font-bold text-white text-base mt-2">IA Concierge &amp; RAG</h3>
              <p className="text-xs text-slate-400 mt-1">Actif sur le tenant</p>
              <span className="mt-4 inline-block text-[10px] text-emerald-400 font-bold">✅ Actif</span>
            </div>
            <div className="glass-card p-5 border-indigo-500/20">
              <span className="text-3xl">🔒</span>
              <h3 className="font-bold text-white text-base mt-2">Multi-Tenant RLS</h3>
              <p className="text-xs text-slate-400 mt-1">Isolation PostgreSQL stricte</p>
              <span className="mt-4 inline-block text-[10px] text-emerald-400 font-bold">✅ Actif</span>
            </div>
            <div className="glass-card p-5 border-indigo-500/20">
              <span className="text-3xl">🔔</span>
              <h3 className="font-bold text-white text-base mt-2">Notifications Hub</h3>
              <p className="text-xs text-slate-400 mt-1">Email, SMS &amp; Push</p>
              <span className="mt-4 inline-block text-[10px] text-emerald-400 font-bold">✅ Actif</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3 : MON ORGANISATION */}
      {activeTab === "org" && (
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-bold text-white">Informations sur l&apos;Organisation</h2>
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <span className="text-slate-400 block text-xs">Nom de l&apos;Établissement</span>
              <strong className="text-white text-base">{tenant?.name}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-xs">Slug Public</span>
              <strong className="text-indigo-300 font-mono text-base">{slug}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-xs">Pays</span>
              <strong className="text-white">{tenant?.country || "FRA"}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-xs">Devise</span>
              <strong className="text-white">{tenant?.currency || "EUR"}</strong>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4 : ABONNEMENT (PLACEHOLDER PHASE 2B) */}
      {activeTab === "billing" && (
        <div className="glass-card p-8 text-center space-y-4 border-indigo-500/30">
          <span className="text-4xl">💳</span>
          <h2 className="text-xl font-bold text-white">Gestion de l&apos;Abonnement &amp; Factures</h2>
          <p className="text-sm text-slate-400 max-w-lg mx-auto">
            Vous êtes actuellement en <strong>Essai Gratuit (14 jours)</strong>. Le moteur de facturation avec support Stripe &amp; Paystack Mobile Money sera activé dans la Phase 2B.
          </p>
          <span className="inline-block rounded-full bg-indigo-500/20 px-4 py-1.5 text-xs font-bold text-indigo-300">
            Prévu pour la Phase 2B (Billing Engine)
          </span>
        </div>
      )}

      {/* TAB 5 : UTILISATEURS */}
      {activeTab === "users" && (
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-bold text-white">Membres &amp; Rôles de l&apos;Organisation</h2>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold">A</div>
              <div>
                <div className="font-bold text-white">Administrateur Propriétaire</div>
                <div className="text-xs text-slate-400">Compte Admin Tenant</div>
              </div>
            </div>
            <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-300">TENANT_ADMIN</span>
          </div>
        </div>
      )}

      {/* TAB 6 : SUPPORT */}
      {activeTab === "support" && (
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-bold text-white">Assistance Technique &amp; SLA</h2>
          <p className="text-sm text-slate-400">Besoin d&apos;aide pour configurer votre SaaS Yziow ou votre IA Concierge ?</p>
          <Link href="/contact" className="btn-primary text-xs">
            Contacter le Support 24/7
          </Link>
        </div>
      )}
    </div>
  );
}

export default function HubPage() {
  return (
    <Suspense fallback={<div className="section text-center py-20 text-slate-400">Chargement du Hub Client...</div>}>
      <HubContent />
    </Suspense>
  );
}
