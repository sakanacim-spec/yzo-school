// ============================================================
// LANDING PAGE — Page d'accueil publique de Yziow
// ============================================================
import React, { useState } from 'react';
import { 
  GraduationCap, BookOpen, MapPin, MessageSquare, ShieldCheck, 
  Globe, CheckCircle, Mail, Phone, ArrowRight, Lock, 
  Building2, Users, Star, Megaphone, Send, Eye, EyeOff
} from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMessage) return;
    
    // Simulation d'envoi du formulaire de support / partenariat
    console.log("Contact submission:", { contactName, contactEmail, contactMessage });
    setFormSubmitted(true);
    setTimeout(() => {
      setContactName('');
      setContactEmail('');
      setContactMessage('');
      setFormSubmitted(false);
      alert("Votre message a bien été envoyé ! Notre équipe vous contactera dans les plus brefs délais.");
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-['Poppins'] text-slate-800 selection:bg-orange-500 selection:text-white scroll-smooth">
      
      {/* ──── EN-TÊTE / NAVBAR ──── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#f97316] rounded-xl flex items-center justify-center shadow-md shadow-orange-500/20">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black text-[#1e293b] tracking-tight">yziow</span>
          </div>

          {/* Desktop Links */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-semibold text-slate-600 hover:text-[#f97316] transition-colors">Fonctionnalités</a>
            <a href="#about" className="text-sm font-semibold text-slate-600 hover:text-[#f97316] transition-colors">Qui sommes-nous</a>
            <a href="#advertising" className="text-sm font-semibold text-slate-600 hover:text-[#f97316] transition-colors">Publicité & Partenariats</a>
            <a href="#contact" className="text-sm font-semibold text-slate-600 hover:text-[#f97316] transition-colors">Contact</a>
          </nav>

          <button 
            onClick={onLogin}
            className="px-6 py-2.5 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold tracking-wider shadow-lg shadow-orange-500/20 active:scale-95 transition-all flex items-center gap-2"
          >
            <Lock className="w-4 h-4" /> ACCÉDER À MON ESPACE
          </button>
        </div>
      </header>

      {/* ──── SECTION HERO ──── */}
      <section className="relative bg-gradient-to-br from-orange-50 via-white to-orange-50/30 pt-16 pb-24 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-orange-300/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4"></div>

        <div className="max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-16 relative z-10">
          {/* Left Column Text */}
          <div className="flex-1 text-center lg:text-left space-y-6">
            <div className="inline-flex items-center gap-2 bg-[#ffedd5] border border-orange-200/50 rounded-full py-1.5 px-4 text-xs font-black text-[#ea580c] tracking-wide animate-pulse">
              <Star className="w-3.5 h-3.5 fill-current" /> NOUVELLE VERSION 2026
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
              Ensemble,<br />
              <span className="text-[#f97316]">pour la réussite</span> de chaque élève.
            </h1>
            
            <p className="text-base md:text-lg text-slate-600 font-medium leading-relaxed max-w-[580px]">
              Yziow connecte les parents, les élèves, les enseignants, et les établissements pour une communication fluide, des règlements sécurisés et un suivi scolaire complet en temps réel.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
              <button 
                onClick={onLogin}
                className="w-full sm:w-auto px-8 py-4 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl text-sm font-bold tracking-wide shadow-xl shadow-orange-500/30 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
              >
                Accéder à mon espace <ArrowRight className="w-4 h-4" />
              </button>
              <a 
                href="#features"
                className="w-full sm:w-auto px-8 py-4 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-bold tracking-wide transition-all flex items-center justify-center"
              >
                Découvrir la plateforme
              </a>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-6 pt-12 border-t border-slate-200/60 max-w-[480px]">
              <div>
                <h4 className="text-3xl font-black text-slate-900">100%</h4>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sécurisé</p>
              </div>
              <div>
                <h4 className="text-3xl font-black text-slate-900">Direct</h4>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Suivi en direct</p>
              </div>
              <div>
                <h4 className="text-3xl font-black text-slate-900">SMS</h4>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notifications</p>
              </div>
            </div>
          </div>

          {/* Right Column mockup */}
          <div className="flex-1 w-full max-w-[500px] lg:max-w-none relative">
            <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 p-3 overflow-hidden">
              <div className="bg-[#fff7ed] rounded-2xl p-6 text-center space-y-4">
                <h3 className="text-xl font-black text-slate-900">Plateforme Moderne de Suivi Scolaire</h3>
                <p className="text-xs font-medium text-slate-500 leading-relaxed">
                  Consultez les notes, contrôlez les présences et restez en lien permanent avec la direction de votre école.
                </p>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-[#f97316]" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-800">Bulletins de notes</h5>
                      <p className="text-[10px] text-slate-400">Disponibles immédiatement</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-orange-100 text-[#f97316] font-bold px-2 py-1 rounded-full">En ligne</span>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-800">Suivi des Présences</h5>
                      <p className="text-[10px] text-slate-400">Notifications instantanées</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-600 font-bold px-2 py-1 rounded-full">Actif</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──── SECTION FONCTIONNALITÉS ──── */}
      <section id="features" className="py-24 bg-white scroll-mt-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto space-y-4 mb-16">
            <h2 className="text-sm font-black text-[#f97316] tracking-widest uppercase">Fonctionnalités clés</h2>
            <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
              Tout le suivi scolaire regroupé sur une seule interface
            </h3>
            <p className="text-sm text-slate-500 font-semibold leading-relaxed">
              Yziow simplifie l'éducation en automatisant la gestion académique et en améliorant l'expérience des parents.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
                <BookOpen className="w-6 h-6 text-[#f97316]" />
              </div>
              <h4 className="text-lg font-black text-slate-800 mb-3">Bulletins & Notes</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Visualisez les notes des élèves dès leur saisie par les enseignants. Téléchargez et vérifiez les bulletins officiels en format PDF sécurisé.
              </p>
            </div>

            {/* Card 2 */}
            <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
                <MapPin className="w-6 h-6 text-[#f97316]" />
              </div>
              <h4 className="text-lg font-black text-slate-800 mb-3">Présences & Absences</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Suivez en temps réel l'assiduité de vos enfants. Soyez immédiatement notifié en cas d'absence ou de retard injustifié.
              </p>
            </div>

            {/* Card 3 */}
            <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
                <MessageSquare className="w-6 h-6 text-[#f97316]" />
              </div>
              <h4 className="text-lg font-black text-slate-800 mb-3">Communication Directe</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Échangez directement avec la direction et les professeurs via la messagerie instantanée intégrée pour un meilleur accompagnement.
              </p>
            </div>

            {/* Card 4 */}
            <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6 text-[#f97316]" />
              </div>
              <h4 className="text-lg font-black text-slate-800 mb-3">Sécurisation des données</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Les dossiers scolaires et règlements financiers sont chiffrés et protégés contre tout accès non autorisé. Vos informations sont en sécurité.
              </p>
            </div>

            {/* Card 5 */}
            <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
                <Building2 className="w-6 h-6 text-[#f97316]" />
              </div>
              <h4 className="text-lg font-black text-slate-800 mb-3">Espaces Établissements</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Une interface complète pour les directeurs et secrétaires : gestion des inscriptions, facturation des frais, et communication de masse.
              </p>
            </div>

            {/* Card 6 */}
            <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
                <Globe className="w-6 h-6 text-[#f97316]" />
              </div>
              <h4 className="text-lg font-black text-slate-800 mb-3">Accessibilité Universelle</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Accédez à Yziow depuis n'importe quel ordinateur, tablette ou smartphone. Une interface fluide et responsive, optimisée pour tous les réseaux.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ──── SECTION QUI SOMMES-NOUS ──── */}
      <section id="about" className="py-24 bg-slate-100 border-y border-slate-200/50 scroll-mt-10">
        <div className="max-w-5xl mx-auto px-6 text-center space-y-8">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <Users className="w-8 h-8 text-[#f97316]" />
          </div>
          <h2 className="text-sm font-black text-[#f97316] tracking-widest uppercase">Qui sommes-nous ?</h2>
          <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Notre mission pour l'éducation moderne</h3>
          <p className="text-base md:text-lg text-slate-600 font-semibold leading-relaxed max-w-3xl mx-auto">
            Yziow est une plateforme née d'une vision d'excellence et d'accessibilité. Notre mission est de simplifier la gestion administrative des établissements scolaires tout en intégrant activement les parents dans le parcours éducatif de leurs enfants. Nous croyons que la réussite scolaire s'appuie sur une collaboration étroite et transparente entre l'école et la famille.
          </p>
          <div className="flex justify-center gap-6 pt-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <CheckCircle className="w-4 h-4 text-emerald-500" /> Collaboration Parents-École
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <CheckCircle className="w-4 h-4 text-emerald-500" /> Transparence Totale
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <CheckCircle className="w-4 h-4 text-emerald-500" /> Suivi Académique Rigoureux
            </div>
          </div>
        </div>
      </section>

      {/* ──── SECTION PUBLICITÉ / PARTENAIRES ──── */}
      <section id="advertising" className="py-24 bg-white scroll-mt-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto space-y-4 mb-16">
            <h2 className="text-sm font-black text-[#f97316] tracking-widest uppercase">Partenaires &amp; Visibilité</h2>
            <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
              Faites la promotion de vos services sur Yziow
            </h3>
            <p className="text-sm text-slate-500 font-semibold leading-relaxed">
              Vous êtes une librairie, une compagnie d'assurances scolaires, un vendeur d'uniformes ou un établissement partenaire ? Touchez directement votre public cible.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Promotion Explanations */}
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <Megaphone className="w-5 h-5 text-[#f97316]" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-800 mb-1">Campagnes ultra-ciblées</h4>
                  <p className="text-xs font-semibold text-slate-400 leading-relaxed">
                    Présentez vos services scolaires directement aux parents et aux administrations au bon moment de l'année (rentrée, réinscriptions, examens).
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5 text-[#f97316]" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-800 mb-1">Espaces de Bons Plans</h4>
                  <p className="text-xs font-semibold text-slate-400 leading-relaxed">
                    Proposez des offres exclusives de fournitures, de cours particuliers ou d'assurances scolaires à nos familles abonnées.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5 text-[#f97316]" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-800 mb-1">Promotion pour les Établissements</h4>
                  <p className="text-xs font-semibold text-slate-400 leading-relaxed">
                    Permettez à vos écoles partenaires de diffuser des annonces de portes ouvertes, concours ou événements auprès du réseau Yziow.
                  </p>
                </div>
              </div>
            </div>

            {/* Advertising Info Card / Form CTA */}
            <div className="bg-gradient-to-br from-[#f97316] to-[#ea580c] rounded-[32px] p-8 md:p-10 text-white relative overflow-hidden shadow-xl shadow-orange-500/20">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
              <div className="relative z-10 space-y-6">
                <h3 className="text-2xl font-black">Devenir partenaire publicitaire</h3>
                <p className="text-xs text-white/90 leading-relaxed font-semibold">
                  Intéressé pour promouvoir votre établissement ou votre marque sur notre plateforme en ligne ? Remplissez notre formulaire de contact ci-dessous ou contactez directement notre équipe commerciale.
                </p>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                  <p className="text-xs font-bold mb-1">📧 Espace commercial :</p>
                  <p className="text-sm font-semibold">partenariats@yziow.com</p>
                </div>
                <a 
                  href="#contact"
                  className="inline-flex items-center gap-2 bg-white text-[#f97316] hover:bg-orange-50 px-6 py-3 rounded-xl text-xs font-black tracking-wider transition-all"
                >
                  Envoyer une demande commerciale <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──── SECTION CONTACT & SUPPORT ──── */}
      <section id="contact" className="py-24 bg-slate-100 border-t border-slate-200/50 scroll-mt-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto space-y-4 mb-16">
            <h2 className="text-sm font-black text-[#f97316] tracking-widest uppercase">Contact &amp; Assistance</h2>
            <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Une équipe à votre écoute</h3>
            <p className="text-sm text-slate-500 font-semibold leading-relaxed">
              Une question sur nos services ? Besoin d'assistance pour votre espace personnel ? Écrivez-nous directement.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Contact Details */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm flex items-start gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-[#f97316]" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Support Technique</h4>
                  <p className="text-xs text-slate-400 font-semibold mt-1">Des questions de connexion ?</p>
                  <p className="text-xs font-bold text-slate-700 mt-2">support@yziow.com</p>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm flex items-start gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5 text-[#f97316]" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Téléphone &amp; WhatsApp</h4>
                  <p className="text-xs text-slate-400 font-semibold mt-1">Disponibles du lundi au vendredi</p>
                  <p className="text-xs font-bold text-slate-700 mt-2">+33 6 12 34 56 78</p>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm flex items-start gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-[#f97316]" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Siège Social</h4>
                  <p className="text-xs text-slate-400 font-semibold mt-1">Yziow Technologies SAS</p>
                  <p className="text-xs font-bold text-slate-700 mt-2">Paris, France</p>
                </div>
              </div>
            </div>

            {/* Contact Web Form */}
            <div className="lg:col-span-2 bg-white rounded-[32px] p-8 border border-slate-200/60 shadow-sm">
              <h3 className="text-xl font-black text-slate-900 mb-6">Nous laisser un message</h3>
              
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500">Nom Complet</label>
                    <input 
                      type="text" 
                      placeholder="Votre nom" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#f97316]/50 focus:border-[#f97316]" 
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500">Adresse Email</label>
                    <input 
                      type="email" 
                      placeholder="nom@exemple.com" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#f97316]/50 focus:border-[#f97316]" 
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500">Votre Message</label>
                  <textarea 
                    rows={4}
                    placeholder="Décrivez votre besoin (Support, Inscription école, Partenariat publicitaire...)" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#f97316]/50 focus:border-[#f97316]" 
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    required
                  />
                </div>

                <button 
                  type="submit" 
                  className="w-full py-4 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" /> ENVOYER LE MESSAGE
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ──── PIED DE PAGE / FOOTER ──── */}
      <footer className="bg-slate-900 text-white/70 py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#f97316] rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black text-white tracking-tight">yziow</span>
          </div>

          <p className="text-xs font-semibold">
            © {new Date().getFullYear()} Yziow. Tous droits réservés. Éducation connectée et simplifiée.
          </p>

          <div className="flex items-center gap-4 text-xs font-bold">
            <a href="#about" className="hover:text-white transition-colors">Politique de Confidentialité</a>
            <span>|</span>
            <a href="#contact" className="hover:text-white transition-colors">Aide &amp; Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
