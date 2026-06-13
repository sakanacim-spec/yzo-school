import React from 'react';
import { Shield, Eye, Lock, FileText, X, Check, Globe, Sparkles } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* Overlay de flou artistique */}
      <div 
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Conteneur principal Premium */}
      <div className="relative w-full max-w-3xl h-[85vh] bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header avec dégradé et éclats */}
        <div className="relative px-6 py-8 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button 
              onClick={onClose}
              className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Charte de Confidentialité
                <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
              </h2>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                Protection des données scolaires & familiales
              </p>
            </div>
          </div>
        </div>

        {/* Corps du texte défilant */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8 custom-scrollbar text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
          
          {/* Introduction */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
            <p className="font-medium text-slate-800 dark:text-slate-200">
              Chez <span className="font-bold text-amber-500">GestioSchool</span>, nous croyons que la vie privée de vos enfants et la sécurité de vos données financières et académiques sont fondamentales. Cette politique vous explique comment les données sont collectées, stockées, protégées et isolées dans notre système multi-établissement.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              Dernière mise à jour : Mai 2026. Conforme aux standards internationaux de protection des données (RGPD / RPD).
            </p>
          </div>

          {/* 1. Isolation multi-tenant */}
          <section className="space-y-3">
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              1. Isolation Strictement Multi-École (SaaS)
            </h3>
            <p>
              Notre plateforme applique une architecture d'isolation physique et logique des bases de données. Chaque établissement scolaire dispose de son propre jeu de tables de données hermétiques (indexées par un identifiant d'école unique).
            </p>
            <ul className="space-y-2 pl-4 border-l-2 border-amber-500/30">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-1" />
                <span>Aucun administrateur, parent, professeur ou élève d'une école A ne peut visualiser, modifier ou intercepter les données d'une école B.</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-1" />
                <span>Les connexions et sessions sont scellées par des jetons cryptographiques JWT contenant l'identifiant unique de l'école.</span>
              </li>
            </ul>
          </section>

          {/* 2. Données collectées */}
          <section className="space-y-3">
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-500" />
              2. Quelles données collectons-nous ?
            </h3>
            <p>
              Les données stockées sur la plateforme sont exclusivement destinées à la gestion administrative, pédagogique et financière de l'établissement :
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                <h4 className="font-bold text-slate-950 dark:text-white text-xs uppercase tracking-wider mb-2">Informations Académiques</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Noms, prénoms, classes, cycles, notes, bulletins scolaires, pointages de présence/absence des élèves et photos d'identité.
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                <h4 className="font-bold text-slate-950 dark:text-white text-xs uppercase tracking-wider mb-2">Données de Facturation</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Frais d'écolage dus, historiques des paiements effectués, reçus de scolarité délivrés et statuts de recouvrement.
                </p>
              </div>
            </div>
          </section>

          {/* 3. Sécurité des données */}
          <section className="space-y-3">
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-500" />
              3. Sécurité & Confidentialité
            </h3>
            <p>
              La sécurité est notre priorité absolue :
            </p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-600 dark:text-slate-300 font-bold">
                  01
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Zéro Partage Tiers</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Vos données ne sont jamais vendues, louées, partagées ou analysées par des tiers ou des régies publicitaires.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-600 dark:text-slate-300 font-bold">
                  02
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Chiffrement de bout en bout</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Tous les flux réseaux sont chiffrés via HTTPS/TLS. Les données sensibles stockées en base Supabase bénéficient de pare-feux et de politiques RLS de niveau professionnel.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-600 dark:text-slate-300 font-bold">
                  03
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Contrôle d'accès strict</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Seuls les personnels habilités de votre établissement (comptables, directeurs, surveillants) et vous-mêmes (via votre espace Parent sécurisé) peuvent accéder à ces dossiers.</p>
                </div>
              </li>
            </ul>
          </section>

          {/* 4. Droits des utilisateurs */}
          <section className="space-y-3">
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-amber-500" />
              4. Vos Droits (Accès, Rectification, Suppression)
            </h3>
            <p>
              Conformément à la réglementation sur la protection de la vie privée, vous disposez d'un droit d'accès, de rectification et de suppression des informations nominatives vous concernant.
            </p>
            <p>
              Pour exercer ces droits, vous pouvez contacter directement l'administration de votre établissement ou envoyer un courriel à notre assistance technique.
            </p>
          </section>

          {/* Footer légal */}
          <div className="pt-6 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400">
            GestioSchool est hébergé sur des serveurs sécurisés et utilise la technologie Supabase Postgres.
          </div>
        </div>

        {/* Footer avec bouton OK */}
        <div className="px-6 py-5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
          >
            J'ai compris
          </button>
        </div>

      </div>
    </div>
  );
};
