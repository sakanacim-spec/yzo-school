"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SAAS_REGISTRY } from "../../config/saas-registry";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.oziow.com";

function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSaas = searchParams.get("saas") || "yziow";

  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedSaasId, setSelectedSaasId] = useState(preselectedSaas);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [country, setCountry] = useState("FRA");
  const [currency, setCurrency] = useState("EUR");

  // Auto-generate slug from organization name
  const handleOrgNameChange = (name: string) => {
    setOrgName(name);
    const generatedSlug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setOrgSlug(generatedSlug);
  };

  const handleSlugChange = (rawSlug: string) => {
    const sanitized = rawSlug
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9-]+/g, "");
    setOrgSlug(sanitized);
  };

  const selectedSaas = SAAS_REGISTRY.find((s) => s.id === selectedSaasId) || SAAS_REGISTRY[0];

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (step === 1) {
      if (!email || !password) {
        setError("Veuillez saisir votre email et un mot de passe.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      if (!orgName || !orgSlug) {
        setError("Veuillez saisir le nom de votre organisation.");
        return;
      }
      setStep(4);
    }
  };

  const handleProvision = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/v1/onboarding/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          orgName,
          orgSlug,
          saasId: selectedSaasId,
          country,
          currency,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.message && data.message.toLowerCase().includes("email")) {
          setStep(1);
        }
        throw new Error(data.message || "Erreur lors de la création de l'espace professionnel.");
      }

      // Stocker l'information du tenant créé en local
      localStorage.setItem("oziow_current_tenant", JSON.stringify(data.tenant));
      localStorage.setItem("oziow_active_app", JSON.stringify(data.activeApp));

      // Redirection vers le Hub Client
      router.push(`/hub?slug=${data.tenant.slug}`);
    } catch (err: any) {
      setError(err.message || "Erreur de connexion avec le serveur.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="section mx-auto max-w-3xl" style={{ paddingTop: "3rem" }}>
      {/* Header */}
      <div className="text-center mb-8">
        <span className="section-label">Auto-Provisioning Instantané</span>
        <h1 className="text-3xl font-extrabold text-white sm:text-4xl mt-2">
          Créer mon espace professionnel
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Rejoignez la plateforme OZIOW et déployez votre application métier en 4 étapes simples.
        </p>
      </div>

      {/* Wizard Progress Bar */}
      <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
        {[
          { num: 1, label: "Identifiants" },
          { num: 2, label: "SaaS Métier" },
          { num: 3, label: "Organisation" },
          { num: 4, label: "Activation 14j" },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step === s.num
                  ? "bg-indigo-500 text-white ring-4 ring-indigo-500/20"
                  : step > s.num
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-white/5 text-slate-500"
              }`}
            >
              {step > s.num ? "✓" : s.num}
            </span>
            <span className={`text-xs font-medium hidden sm:inline ${step === s.num ? "text-white" : "text-slate-500"}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-400">
          ⚠️ {error}
        </div>
      )}

      {/* STEP 1 : IDENTIFIANTS */}
      {step === 1 && (
        <form onSubmit={handleNext} className="glass-card p-8 space-y-6">
          <h2 className="text-xl font-bold text-white">1. Vos Identifiants Administrateur</h2>
          <p className="text-xs text-slate-400">
            Ce compte sera le propriétaire principal du Tenant et disposera du rôle ADMIN.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Adresse Email Professionnelle</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="directeur@etablissement.com"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Mot de Passe</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <button type="submit" className="btn-primary w-full text-center">
            Continuer → Choix du SaaS Métier
          </button>
        </form>
      )}

      {/* STEP 2 : CHOIX DU SAAS MÉTIER */}
      {step === 2 && (
        <form onSubmit={handleNext} className="glass-card p-8 space-y-6">
          <h2 className="text-xl font-bold text-white">2. Choisissez votre Application Métier</h2>
          <p className="text-xs text-slate-400">
            Sélectionnez le premier SaaS à installer sur votre espace. Vous pourrez en ajouter d&apos;autres ultérieurement.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {SAAS_REGISTRY.map((saas) => (
              <div
                key={saas.id}
                onClick={() => setSelectedSaasId(saas.id)}
                className={`cursor-pointer rounded-xl border p-4 transition-all ${
                  selectedSaasId === saas.id
                    ? "border-indigo-500 bg-indigo-500/15 ring-2 ring-indigo-500/30"
                    : "border-white/10 bg-white/5 opacity-70 hover:opacity-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{saas.icon}</span>
                  <div>
                    <h3 className="font-bold text-white text-base">{saas.name}</h3>
                    <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold">{saas.categoryLabel}</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-400 line-clamp-2">{saas.tagline}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-4 pt-4 border-t border-white/5">
            <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1 text-center">
              ← Retour
            </button>
            <button type="submit" className="btn-primary flex-1 text-center">
              Continuer → Informations Organisation
            </button>
          </div>
        </form>
      )}

      {/* STEP 3 : INFORMATIONS ORGANISATION */}
      {step === 3 && (
        <form onSubmit={handleNext} className="glass-card p-8 space-y-6">
          <h2 className="text-xl font-bold text-white">3. Votre Espace &amp; Tenant</h2>
          <p className="text-xs text-slate-400">
            Configurez le nom de votre établissement ou entreprise. Un identifiant public (slug) sera généré.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Nom de l&apos;Organisation / Établissement</label>
            <input
              type="text"
              required
              value={orgName}
              onChange={(e) => handleOrgNameChange(e.target.value)}
              placeholder="Ex: Groupe Scolaire Lumière ou Clinique Sainte-Marie"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Identifiant Public Tenant (Slug)</label>
            <input
              type="text"
              required
              value={orgSlug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="ex: groupe-scolaire-lumiere"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-mono text-indigo-300 focus:border-indigo-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Futur sous-domaine : <strong className="text-slate-400">{orgSlug || "nom"}.oziow.com</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Pays</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white focus:outline-none"
              >
                <option value="FRA">France (€)</option>
                <option value="SEN">Sénégal (FCFA)</option>
                <option value="CIV">Côte d&apos;Ivoire (FCFA)</option>
                <option value="CMR">Cameroun (FCFA)</option>
                <option value="MAR">Maroc (MAD)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Devise</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white focus:outline-none"
              >
                <option value="EUR">Euro (€)</option>
                <option value="XOF">Franc CFA (FCFA)</option>
                <option value="USD">US Dollar ($)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t border-white/5">
            <button type="button" onClick={() => setStep(2)} className="btn-secondary flex-1 text-center">
              ← Retour
            </button>
            <button type="submit" className="btn-primary flex-1 text-center">
              Continuer → Confirmation 14j
            </button>
          </div>
        </form>
      )}

      {/* STEP 4 : CONFIRMATION & ACTIVATION 14J */}
      {step === 4 && (
        <div className="glass-card p-8 space-y-6 border-indigo-500/30">
          <h2 className="text-xl font-bold text-white">4. Confirmation de votre Essai Gratuit 14 Jours</h2>

          <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Compte Admin :</span>
              <span className="font-bold text-white">{email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Organisation :</span>
              <span className="font-bold text-white">{orgName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Slug Tenant :</span>
              <span className="font-mono text-indigo-300">{orgSlug}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">SaaS Activé :</span>
              <span className="font-bold text-emerald-400">{selectedSaas.icon} {selectedSaas.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Modules Requis :</span>
              <span className="text-xs text-slate-300">{selectedSaas.modules.join(", ")}</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
            <span className="text-xs font-bold text-emerald-400">
              🎉 Aucune carte bancaire requise — Accès immédiat pendant 14 jours
            </span>
          </div>

          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => setStep(3)} className="btn-secondary flex-1 text-center" disabled={loading}>
              ← Retour
            </button>
            <button type="button" onClick={handleProvision} disabled={loading} className="btn-primary flex-1 text-center">
              {loading ? "Création de votre espace en cours..." : "🚀 Créer mon Espace Etablissement"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="section text-center py-20 text-slate-400">Chargement de l&apos;assistant...</div>}>
      <OnboardingWizard />
    </Suspense>
  );
}
