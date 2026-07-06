import React, { useEffect } from 'react';
import { ArrowLeft, Shield, FileText, Scale } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { t } from '../../utils/i18n';
import type { Language } from '../../types';

export type LegalPageType = 'cgu' | 'privacy' | 'legal';

interface LegalPageProps {
  type: LegalPageType;
  onBack: () => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({ type, onBack }) => {
  const { language } = useLanguage();

  const CONTENT = {
    cgu: {
      title: t(language as Language, 'public.legal.cgu.title') || "Conditions Générales d'Utilisation",
      icon: <FileText className="w-8 h-8 text-[#f97316]" />,
      sections: [
        {
          title: t(language as Language, 'public.legal.cgu.sec1.title') || "1. Acceptation des conditions",
          content: t(language as Language, 'public.legal.cgu.sec1.content') || "En accédant à la plateforme Yziow, vous acceptez d'être lié par les présentes conditions générales d'utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser nos services."
        },
        {
          title: t(language as Language, 'public.legal.cgu.sec2.title') || "2. Description du service",
          content: t(language as Language, 'public.legal.cgu.sec2.content') || "Yziow fournit une plateforme complète de gestion scolaire permettant le suivi des élèves, des paiements, des présences et la communication entre les différents acteurs de la vie scolaire."
        },
        {
          title: t(language as Language, 'public.legal.cgu.sec3.title') || "3. Engagements de l'utilisateur",
          content: t(language as Language, 'public.legal.cgu.sec3.content') || "L'utilisateur s'engage à fournir des informations exactes lors de son inscription, à maintenir la confidentialité de ses identifiants de connexion, et à utiliser la plateforme dans le respect des lois en vigueur."
        },
        {
          title: t(language as Language, 'public.legal.cgu.sec4.title') || "4. Propriété intellectuelle",
          content: t(language as Language, 'public.legal.cgu.sec4.content') || "Tous les contenus, logos, marques et éléments logiciels de la plateforme Yziow sont notre propriété exclusive. Toute reproduction non autorisée est strictement interdite."
        },
        {
          title: t(language as Language, 'public.legal.cgu.sec5.title') || "5. Modification des services",
          content: t(language as Language, 'public.legal.cgu.sec5.content') || "Nous nous réservons le droit de modifier, suspendre ou interrompre temporairement ou définitivement le service, sans préavis, pour des raisons de maintenance ou de mise à jour."
        }
      ]
    },
    privacy: {
      title: t(language as Language, 'public.legal.privacy.title') || "Politique de Confidentialité",
      icon: <Shield className="w-8 h-8 text-[#f97316]" />,
      sections: [
        {
          title: t(language as Language, 'public.legal.privacy.sec1.title') || "1. Collecte des données",
          content: t(language as Language, 'public.legal.privacy.sec1.content') || "Nous collectons uniquement les données strictement nécessaires au bon fonctionnement de la plateforme (noms, coordonnées, notes, présences, historique de paiement). Ces données sont fournies par les établissements partenaires."
        },
        {
          title: t(language as Language, 'public.legal.privacy.sec2.title') || "2. Utilisation des données",
          content: t(language as Language, 'public.legal.privacy.sec2.content') || "Les données collectées sont utilisées exclusivement pour fournir le service Yziow (génération de bulletins, envoi de notifications, reçus de paiement). Nous ne vendons en aucun cas vos données personnelles à des tiers."
        },
        {
          title: t(language as Language, 'public.legal.privacy.sec3.title') || "3. Sécurité des données",
          content: t(language as Language, 'public.legal.privacy.sec3.content') || "Toutes les données transitant sur notre plateforme sont chiffrées de bout en bout avec les standards de sécurité les plus élevés. Nos serveurs garantissent une protection optimale contre toute tentative d'intrusion."
        },
        {
          title: t(language as Language, 'public.legal.privacy.sec4.title') || "4. Droits des utilisateurs",
          content: t(language as Language, 'public.legal.privacy.sec4.content') || "Conformément à la réglementation sur la protection des données, vous disposez d'un droit d'accès, de rectification et de suppression de vos données personnelles."
        },
        {
          title: t(language as Language, 'public.legal.privacy.sec5.title') || "5. Cookies",
          content: t(language as Language, 'public.legal.privacy.sec5.content') || "Nous utilisons uniquement les cookies techniques nécessaires au maintien de votre session et à la sécurité de l'application. Aucun cookie de pistage publicitaire n'est utilisé."
        }
      ]
    },
    legal: {
      title: t(language as Language, 'public.legal.mentions.title') || "Mentions Légales",
      icon: <Scale className="w-8 h-8 text-[#f97316]" />,
      sections: [
        {
          title: t(language as Language, 'public.legal.mentions.sec1.title') || "1. Éditeur de la plateforme",
          content: t(language as Language, 'public.legal.mentions.sec1.content') || "La plateforme Yziow est éditée par YZIOW CORP, une entreprise de technologies éducatives (EdTech).\n\nAdresses : Espagne & Bénin (Cotonou)\nEmail : contact@yziow.com\nTéléphone : +34 647 563 748 / +229 01 97 76 99 91"
        },
        {
          title: t(language as Language, 'public.legal.mentions.sec2.title') || "2. Hébergement",
          content: t(language as Language, 'public.legal.mentions.sec2.content') || "L'hébergement de la plateforme est assuré par des fournisseurs Cloud reconnus, garantissant la haute disponibilité et la sécurité des infrastructures, en respectant les normes de souveraineté des données."
        },
        {
          title: t(language as Language, 'public.legal.mentions.sec3.title') || "3. Accréditations",
          content: t(language as Language, 'public.legal.mentions.sec3.content') || "Yziow met en œuvre tous les moyens nécessaires pour assurer la sécurité des paiements intégrés et agit en conformité avec les directives locales sur les transactions électroniques."
        },
        {
          title: t(language as Language, 'public.legal.mentions.sec4.title') || "4. Droit applicable",
          content: t(language as Language, 'public.legal.mentions.sec4.content') || "Les présentes mentions légales sont soumises au droit du Bénin. En cas de litige, les tribunaux compétents seront ceux du siège social de l'entreprise."
        }
      ]
    }
  };

  const content = CONTENT[type];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [type]);

  return (
    <div className="min-h-screen bg-slate-50 font-['Poppins'] text-slate-800 selection:bg-orange-500 selection:text-white pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all duration-300">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-[#f97316] transition-colors font-bold text-sm"
          >
            <ArrowLeft className="w-5 h-5" /> {t(language as Language, 'public.backToHome') || "Retour à l'accueil"}
          </button>
        </div>
      </header>

      <section className="relative pt-16 pb-16 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="max-w-4xl mx-auto px-6 relative z-10">
          
          <div className="mb-12 flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center shrink-0">
              {content.icon}
            </div>
            <div>
              <h2 className="text-sm font-black text-[#f97316] tracking-widest uppercase mb-1">{t(language as Language, 'public.legal.info') || "Informations Légales"}</h2>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                {content.title}
              </h1>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 md:p-12 border border-slate-100 shadow-xl shadow-slate-200/50 space-y-12">
            {content.sections.map((section, idx) => (
              <div key={idx} className="space-y-4">
                <h3 className="text-xl font-black text-slate-800">{section.title}</h3>
                <p className="text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">
                  {section.content}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center text-sm font-bold text-slate-400">
            {t(language as Language, 'public.legal.lastUpdate') || "Dernière mise à jour : Juillet 2026"}
          </div>
        </div>
      </section>
    </div>
  );
};
