import React, { useState } from 'react';
import { 
  GraduationCap, Printer, ArrowLeft, FileText, 
  HelpCircle, DollarSign, Award, Users, BookOpen, ShieldCheck, Phone, 
  Sparkles, QrCode, CreditCard
} from 'lucide-react';

export const AmbassadorKitPage: React.FC = () => {
  const [activeDoc, setActiveDoc] = useState<string>('prospectus');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans print:bg-white print:text-black">
      {/* ──── STYLES D'IMPRESSION ──── */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .page-break {
            page-break-after: always;
          }
        }
      `}</style>

      {/* ──── BARRE DE NAVIGATION ET SÉLECTEUR (MASQUÉ À L'IMPRESSION) ──── */}
      <div className="no-print bg-slate-950 border-b border-slate-800 sticky top-0 z-50 px-4 py-3 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => window.location.href = '/ambassadeur/dashboard'}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition text-slate-300 flex items-center gap-2 text-xs font-bold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Retour Dashboard</span>
            </button>
            <div className="h-6 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-black text-lg text-white leading-none">yziow</h1>
                <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Kit Ambassadeur & Prospectus</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-orange-500/30 flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer en PDF</span>
            </button>
          </div>
        </div>

        {/* Onglets de sélection des documents */}
        <div className="max-w-7xl mx-auto mt-4 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {[
            { id: 'prospectus', label: '📄 Prospectus Flyer Yziow', icon: Sparkles },
            { id: 'guide', label: '📘 Guide de Formation', icon: BookOpen },
            { id: 'scripts', label: '🗣️ Scripts de Prospection', icon: Phone },
            { id: 'faq', label: '❓ FAQ Officielle', icon: HelpCircle },
            { id: 'tarifs', label: '💰 Grille Tarifaire', icon: DollarSign },
            { id: 'comparatif', label: '⚖️ Fiche Comparatif', icon: FileText },
            { id: 'charte', label: '📜 Charte Ambassadeur', icon: ShieldCheck },
            { id: 'suivi', label: '📋 Fiche de Suivi Prospection', icon: Users },
            { id: 'attestation', label: '🎖️ Attestation & Badge', icon: Award },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeDoc === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveDoc(item.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  isActive
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ──── CONTENU DES DOCUMENTS ──── */}
      <div className="max-w-5xl mx-auto p-4 sm:p-8 print-container">
        
        {/* ============================================================ */}
        {/* DOCUMENT 1 : PROSPECTUS / FLYER MARKETING HIGH QUALITY       */}
        {/* ============================================================ */}
        {activeDoc === 'prospectus' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8">
            {/* Header Prospectus */}
            <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 text-white rounded-3xl p-8 sm:p-10 relative overflow-hidden shadow-xl border border-orange-500/20">
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
                <div className="space-y-3 max-w-xl">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-xs font-black uppercase tracking-wider border border-orange-500/30">
                    🚀 La Solution SaaS N°1 de Gestion Scolaire
                  </div>
                  <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-none text-white">
                    Digitalisez votre école avec <span className="text-orange-500">Yziow</span>
                  </h1>
                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                    Gestion des élèves, bulletins certifiés PDF, présences par QR Code, comptabilité & reçus en 1 clic, et levée de fonds intégrée.
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 text-center shrink-0 w-full md:w-auto">
                  <div className="text-3xl font-black text-orange-400">14 JOURS</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-200">Essai 100% Gratuit</div>
                  <div className="text-[10px] text-slate-400 mt-1">Sans carte bancaire</div>
                  <div className="mt-3 px-4 py-2 bg-orange-500 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg">
                    Inscrivez votre école
                  </div>
                </div>
              </div>
            </div>

            {/* Pourquoi choisir Yziow ? Grid de fonctionnalités */}
            <div className="space-y-4">
              <h2 className="text-xl font-black text-slate-900 text-center uppercase tracking-wider">
                Pourquoi plus de <span className="text-orange-600">500+ Écoles</span> choisissent Yziow ?
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-600">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Bulletins PDF Certifiés</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Calcul automatique des moyennes, rangs et génération de bulletins scolaires infalsifiables téléchargeables en 1 clic.
                  </p>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-600">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Présences QR Code</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Scannez le badge élève à l'entrée avec un simple smartphone. Les parents sont notifiés instantanément sur leur espace.
                  </p>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-600">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Comptabilité & Reçus</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Suivi précis de la scolarité, gestion des impayés, génération automatique des reçus de paiement imprimables et SMS de rappel.
                  </p>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-600">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Levée de Fonds & Dons</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Financez vos projets (bâtiments, ordinateurs, bourses) grâce au module de dons sécurisé Yziow Pay. 95% reversés directement.
                  </p>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-600">
                    <Users className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Espace Parents Intuitif</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Les parents suivent les notes, l'emploi du temps et paient la scolarité en ligne en toute simplicité depuis leur téléphone.
                  </p>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-600">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900">100% Cloud & Sécurisé</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Données chiffrées, zéro risque d'incendie ou de perte de données sur cahier papier. Accessible 24/7 partout dans le monde.
                  </p>
                </div>
              </div>
            </div>

            {/* Bannière Tarification imbattable */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 border-l-4 border-orange-500">
              <div className="space-y-1 text-center md:text-left">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Grille Tarifaire Adaptée</span>
                <h3 className="text-xl font-bold">À partir de 100 FCFA / élève / mois</h3>
                <p className="text-xs text-slate-400">Aucun coût d'installation. Payez uniquement pour les élèves inscrits.</p>
              </div>
              <div className="flex gap-3 shrink-0">
                <div className="px-4 py-2 bg-slate-800 rounded-xl text-center border border-slate-700">
                  <div className="text-xs text-slate-400 font-medium">Maternelle/Primaire</div>
                  <div className="text-sm font-bold text-orange-400">100 FCFA/mois</div>
                </div>
                <div className="px-4 py-2 bg-slate-800 rounded-xl text-center border border-slate-700">
                  <div className="text-xs text-slate-400 font-medium">Collège/Lycée</div>
                  <div className="text-sm font-bold text-orange-400">150 FCFA/mois</div>
                </div>
              </div>
            </div>

            {/* Footer Prospectus & Contact */}
            <div className="border-t border-slate-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-orange-600" />
                <span className="font-bold text-slate-900">Yziow Education Platform</span>
                <span>— www.yziow.com</span>
              </div>
              <div className="font-bold text-orange-600 bg-orange-50 px-4 py-2 rounded-xl border border-orange-200">
                📞 Contact Ambassadeur : +229 01 00 00 00 / contact@yziow.com
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 2 : GUIDE DE FORMATION AMBASSADEUR                   */}
        {/* ============================================================ */}
        {activeDoc === 'guide' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8">
            <div className="border-b border-slate-200 pb-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-orange-600 uppercase tracking-widest">Document de Formation N°1</span>
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Guide de Formation Officiel de l'Ambassadeur Yziow</h1>
                </div>
                <div className="w-12 h-12 bg-orange-500 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg shrink-0">
                  Y
                </div>
              </div>
            </div>

            <div className="space-y-6 text-sm text-slate-700 leading-relaxed">
              <section className="space-y-2">
                <h2 className="text-base font-bold text-slate-900 uppercase tracking-wider text-orange-600">1. Quel est votre rôle d'Ambassadeur ?</h2>
                <p>
                  En tant qu'Ambassadeur Yziow, vous êtes le représentant officiel de notre solution SaaS auprès des établissements scolaires (Maternelles, Primaires, Collèges, Lycées, Universités, Centres de formation). Votre mission consiste à contacter les directeurs d'écoles, leur présenter Yziow et les accompagner dans la création de leur compte d'essai gratuit de 14 jours.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-bold text-slate-900 uppercase tracking-wider text-orange-600">2. Comment fonctionnent vos commissions ?</h2>
                <p>
                  Chaque fois qu'une école s'inscrit via votre <strong>lien de parrainage</strong> ou votre code ambassadeur et souscrit à un abonnement Yziow Pay, vous percevez une commission récurrente directement versée sur votre portefeuille virtuel Yziow. Vous pouvez retirer vos gains par Mobile Money ou Virement bancaire.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-slate-900 uppercase tracking-wider text-orange-600">3. La méthode de présentation en 5 minutes</h2>
                <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="flex gap-3">
                    <span className="font-bold text-orange-600">Étape 1 :</span>
                    <span><strong>Accroche :</strong> "Monsieur le Directeur, combien de temps passez-vous chaque fin de trimestre à calculer les moyennes et imprimer les bulletins ?"</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-bold text-orange-600">Étape 2 :</span>
                    <span><strong>Problème :</strong> Soulevez la pénibilité des erreurs de calcul, la perte de registres papier, les retards de paiements de scolarité.</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-bold text-orange-600">Étape 3 :</span>
                    <span><strong>Solution Yziow :</strong> Présentez la plateforme (bulletins PDF en 1 clic, scanner QR pour l'appel, reçus automatiques, levée de fonds).</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-bold text-orange-600">Étape 4 :</span>
                    <span><strong>Offre irrésistible :</strong> "L'inscription prend 2 minutes et vous bénéficiez de 14 jours d'essai 100% gratuit sans aucun engagement."</span>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-bold text-slate-900 uppercase tracking-wider text-orange-600">4. Traitement des objections courantes</h2>
                <div className="space-y-3">
                  <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r-xl">
                    <strong className="text-red-900">Objection : "C'est trop cher pour notre école."</strong>
                    <p className="text-xs text-red-800 mt-1">Réponse : "Le tarif est de seulement 100 FCFA par élève et par mois (soit le prix d'un bonbon). L'école gagne 10x plus en temps et en sécurité des reçus."</p>
                  </div>
                  <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r-xl">
                    <strong className="text-red-900">Objection : "Nous n'avons pas d'ordinateurs partout."</strong>
                    <p className="text-xs text-red-800 mt-1">Réponse : "Yziow fonctionne parfaitement sur n'importe quel smartphone Android ou iPhone. Un simple téléphone suffit pour scanner les présences et gérer la comptabilité."</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 3 : SCRIPTS DE PROSPECTION                          */}
        {/* ============================================================ */}
        {activeDoc === 'scripts' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8">
            <div className="border-b border-slate-200 pb-6">
              <span className="text-xs font-bold text-orange-600 uppercase tracking-widest">Document de Formation N°2</span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Scripts Officiels de Prospection Terrain & Téléphone</h1>
            </div>

            <div className="space-y-6 text-sm text-slate-700">
              <div className="space-y-3 bg-slate-900 text-slate-100 p-6 rounded-2xl">
                <div className="flex items-center justify-between text-orange-400 font-bold text-xs uppercase tracking-wider">
                  <span>Scenario A : Visite en Présentiel dans l'établissement</span>
                  <span>Directeur / Fondateur</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-300 italic">
                  "Bonjour Monsieur/Madame le Directeur. Je suis [Votre Nom], Ambassadeur agréé Yziow. Nous accompagnons les écoles pour automatiser les bulletins scolaires, la comptabilité et le suivi des présences par QR Code. Je viens vous offrir un accès gratuit de 14 jours pour tester la plateforme dans votre établissement. Avez-vous 5 minutes pour que je vous montre une démonstration sur mon téléphone ?"
                </p>
              </div>

              <div className="space-y-3 bg-slate-900 text-slate-100 p-6 rounded-2xl">
                <div className="flex items-center justify-between text-orange-400 font-bold text-xs uppercase tracking-wider">
                  <span>Scenario B : Message WhatsApp à envoyer aux Directeurs</span>
                  <span>Copier-Coller WhatsApp</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-300 font-mono bg-slate-950 p-4 rounded-xl border border-slate-800">
                  Bonjour M. le Directeur 🎓<br/><br/>
                  Découvrez **Yziow**, la plateforme tout-en-un de gestion scolaire :<br/>
                  ✅ Bulletins scolaires PDF automatiques<br/>
                  ✅ Pointage des présences par scanner QR Code<br/>
                  ✅ Gestion de scolarité & reçus imprimables<br/>
                  ✅ Module de levée de fonds & dons pour vos projets<br/><br/>
                  🎁 Testez gratuitement pendant 14 jours sans engagement :<br/>
                  👉 https://yziow.com/school/register<br/><br/>
                  Restant à votre disposition pour vous créer votre compte !
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 4 : FAQ OFFICIELLE AMBASSADEUR                      */}
        {/* ============================================================ */}
        {activeDoc === 'faq' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8">
            <div className="border-b border-slate-200 pb-6">
              <span className="text-xs font-bold text-orange-600 uppercase tracking-widest">Document de Formation N°3</span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Foire Aux Questions (FAQ) Ambassadeurs & Écoles</h1>
            </div>

            <div className="space-y-4 text-xs text-slate-700">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                <h3 className="font-bold text-sm text-slate-900">Q1 : L'inscription d'une école est-elle payante au départ ?</h3>
                <p>Non. Chaque école bénéficie de 14 jours d'essai gratuit complet sans carte bancaire ni frais cachés.</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                <h3 className="font-bold text-sm text-slate-900">Q2 : Quels sont les modes de paiement acceptés pour l'abonnement ?</h3>
                <p>Yziow Pay prend en charge Mobile Money (MTN, Moov, Orange, Wave), cartes bancaires Visa/Mastercard et virements.</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                <h3 className="font-bold text-sm text-slate-900">Q3 : Comment le directeur télécharge-t-il les bulletins ?</h3>
                <p>Depuis la rubrique "Bulletins", le directeur ou le secrétaire sélectionne la classe et télécharge l'ensemble des bulletins certifiés en format PDF.</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                <h3 className="font-bold text-sm text-slate-900">Q4 : Comment l'ambassadeur retire-t-il ses commissions ?</h3>
                <p>Depuis son tableau de bord Ambassadeur Yziow (section Portefeuille), l'ambassadeur clique sur "Demander un retrait" et reçoit ses fonds par Mobile Money ou Virement.</p>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 5 : GRILLE TARIFAIRE OFFICIELLE                     */}
        {/* ============================================================ */}
        {activeDoc === 'tarifs' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8">
            <div className="border-b border-slate-200 pb-6 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-orange-600 uppercase tracking-widest">Document Commercial N°1</span>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Grille Tarifaire Internationale Officielle Yziow</h1>
              </div>
              <GraduationCap className="w-10 h-10 text-orange-500" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className="p-4 rounded-tl-xl">Zone Géographique</th>
                    <th className="p-4">Maternelle & Primaire</th>
                    <th className="p-4">Collège & Secondaire</th>
                    <th className="p-4 rounded-tr-xl">Université & Supérieur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="hover:bg-slate-50">
                    <td className="p-4 font-bold text-slate-900">🌍 Zone Afrique FCFA (Bénin, Togo, CI, Sénégal...)</td>
                    <td className="p-4 text-orange-600 font-bold">100 FCFA / élève / mois</td>
                    <td className="p-4 text-orange-600 font-bold">150 FCFA / élève / mois</td>
                    <td className="p-4 text-orange-600 font-bold">200 FCFA / élève / mois</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="p-4 font-bold text-slate-900">🌍 Afrique Hors FCFA (Guinée, Nigeria, Ghana...)</td>
                    <td className="p-4 text-slate-700 font-bold">~ 0.50 USD / élève / mois</td>
                    <td className="p-4 text-slate-700 font-bold">~ 0.75 USD / élève / mois</td>
                    <td className="p-4 text-slate-700 font-bold">~ 1.00 USD / élève / mois</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="p-4 font-bold text-slate-900">🌎 Occident (Europe, USA, Canada)</td>
                    <td className="p-4 text-slate-700 font-bold">1.00 EUR / USD / mois</td>
                    <td className="p-4 text-slate-700 font-bold">1.50 EUR / USD / mois</td>
                    <td className="p-4 text-slate-700 font-bold">2.00 EUR / USD / mois</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-orange-50 border border-orange-200 p-4 rounded-2xl text-xs text-orange-900 space-y-1">
              <strong>🎉 Avantages Tarifaires :</strong>
              <p>• 10% de réduction immédiate en cas de paiement annuel comptant.</p>
              <p>• Période d'essai 100% gratuite de 14 jours disponible pour toutes les écoles.</p>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 6 : FICHE DE COMPARAISON                            */}
        {/* ============================================================ */}
        {activeDoc === 'comparatif' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8">
            <div className="border-b border-slate-200 pb-6">
              <span className="text-xs font-bold text-orange-600 uppercase tracking-widest">Document Commercial N°2</span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Yziow vs Méthodes Traditionnelles (Cahiers & Excel)</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-6 space-y-3">
                <h3 className="font-bold text-base text-red-900 flex items-center gap-2">
                  <span>❌ Gestion Traditionnelle (Papier/Excel)</span>
                </h3>
                <ul className="space-y-2 text-red-800">
                  <li>• Risque élevé d'erreurs de calcul des moyennes</li>
                  <li>• Perte de données en cas d'incendie, vol ou panne d'ordinateur</li>
                  <li>• Impression lente et manuelle bulletin par bulletin</li>
                  <li>• Suivi financier opaque et litiges de reçus avec les parents</li>
                  <li>• Impossible de faire appel aux dons internationaux</li>
                </ul>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 space-y-3">
                <h3 className="font-bold text-base text-emerald-900 flex items-center gap-2">
                  <span>✅ Plateforme SaaS Yziow</span>
                </h3>
                <ul className="space-y-2 text-emerald-800">
                  <li>• Calcul automatique sans faute des moyennes & rangs</li>
                  <li>• Données sauvegardées 24/7 sur serveur sécurisé Cloud</li>
                  <li>• Génération de bulletins PDF certifiés en 1 clic</li>
                  <li>• Suivi en temps réel des scolarités & reçus infalsifiables</li>
                  <li>• Module de levée de fonds & dons via Yziow Pay pour financer les projets</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 7 : CHARTE OFFICIELLE DE L'AMBASSADEUR              */}
        {/* ============================================================ */}
        {activeDoc === 'charte' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8">
            <div className="border-b border-slate-200 pb-6 text-center space-y-2">
              <GraduationCap className="w-12 h-12 text-orange-600 mx-auto" />
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-wider">Charte d'Éthique & Déontologie de l'Ambassadeur Yziow</h1>
              <p className="text-xs text-slate-500">Règles officielles régissant l'activité d'ambassadeur agréé Yziow</p>
            </div>

            <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
              <p><strong>Article 1 :</strong> L'Ambassadeur s'engage à présenter la plateforme Yziow avec honnêteté, courtoisie et professionnalisme.</p>
              <p><strong>Article 2 :</strong> L'Ambassadeur ne doit percevoir AUCUN argent en espèces de la part du directeur d'école au nom de Yziow. Tout paiement doit s'effectuer exclusivement via la plateforme Yziow Pay.</p>
              <p><strong>Article 3 :</strong> L'Ambassadeur perçoit une commission légitime sur les abonnements d'écoles qu'il a parrainées.</p>
              <p><strong>Article 4 :</strong> Tout manquement grave aux règles de courtoisie ou tentative de fraude entraînera la désactivation immédiate du compte ambassadeur.</p>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 8 : FICHE DE SUIVI DE PROSPECTION                   */}
        {/* ============================================================ */}
        {activeDoc === 'suivi' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8">
            <div className="border-b border-slate-200 pb-6 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-orange-600 uppercase tracking-widest">Document Administratif</span>
                <h1 className="text-2xl font-black text-slate-900">Fiche de Suivi Prospection Terrain (Imprimable)</h1>
              </div>
              <span className="text-xs text-slate-500 font-mono">Nom Ambassadeur : ______________</span>
            </div>

            <table className="w-full text-xs text-left border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="border border-slate-300 p-3">Nom Établissement</th>
                  <th className="border border-slate-300 p-3">Directeur / Contact</th>
                  <th className="border border-slate-300 p-3">Téléphone</th>
                  <th className="border border-slate-300 p-3">Date Visite</th>
                  <th className="border border-slate-300 p-3">Statut (Essai/Rappel)</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <tr key={i} className="h-10">
                    <td className="border border-slate-300 p-2"></td>
                    <td className="border border-slate-300 p-2"></td>
                    <td className="border border-slate-300 p-2"></td>
                    <td className="border border-slate-300 p-2"></td>
                    <td className="border border-slate-300 p-2"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 9 : ATTESTATION & BADGE D'AMBASSADEUR                */}
        {/* ============================================================ */}
        {activeDoc === 'attestation' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8">
            <div className="border-4 border-double border-orange-500 p-8 rounded-2xl text-center space-y-6 bg-orange-50/30">
              <div className="flex items-center justify-center gap-3">
                <GraduationCap className="w-12 h-12 text-orange-600" />
                <h1 className="text-3xl font-black tracking-tight text-slate-900">YZIOW EDUCATION</h1>
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold uppercase tracking-widest text-orange-600">Attestation d'Agrément Ambassadeur</h2>
                <p className="text-xs text-slate-500 uppercase tracking-widest">Certificat Officiel de Partenariat Commercial</p>
              </div>

              <div className="py-4 text-sm text-slate-800 leading-relaxed max-w-lg mx-auto">
                La direction générale de la plateforme SaaS <strong>Yziow Education</strong> certifie que le porteur de ce document est dûment habilité à présenter la solution Yziow aux établissements scolaires.
              </div>

              <div className="pt-6 border-t border-slate-300 flex justify-between items-center text-xs font-mono text-slate-600">
                <div>Délivré par : Direction Yziow</div>
                <div>Code Officiel : YZIOW-AMB-2026</div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
