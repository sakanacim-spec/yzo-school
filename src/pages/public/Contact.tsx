import React, { useState, useEffect } from 'react';
import { Mail, Phone, MapPin, Send, ArrowLeft } from 'lucide-react';

interface ContactProps {
  onBack: () => void;
}

export const Contact: React.FC<ContactProps> = ({ onBack }) => {
  const [contactName, setContactName] = useState('');
  const [contactCountry, setContactCountry] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMessage) return;
    
    console.log("Contact submission:", { contactName, contactCountry, contactEmail, contactMessage });
    setFormSubmitted(true);
    setTimeout(() => {
      setContactName('');
      setContactCountry('');
      setContactEmail('');
      setContactMessage('');
      setFormSubmitted(false);
      alert("Votre message a bien été envoyé ! Notre équipe vous contactera dans les plus brefs délais.");
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-['Poppins'] text-slate-800 selection:bg-orange-500 selection:text-white pb-24">
      {/* Premium Compact Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-[#f97316] transition-colors font-bold text-sm"
          >
            <ArrowLeft className="w-5 h-5" /> Retour à l'accueil
          </button>
        </div>
      </header>

      {/* Hero Content */}
      <section className="relative pt-24 pb-16 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center max-w-2xl mx-auto space-y-4 mb-16">
            <h2 className="text-sm font-black text-[#f97316] tracking-widest uppercase">Assistance & Support</h2>
            <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
              Contactez notre équipe
            </h3>
            <p className="text-sm text-slate-500 font-semibold leading-relaxed">
              Une question ? Un besoin d'accompagnement pour déployer Yziow dans votre établissement ? Remplissez le formulaire ci-dessous.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Contact Info */}
            <div className="space-y-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 shrink-0">
                  <Mail className="w-6 h-6 text-[#f97316]" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900 mb-1">Email</h4>
                  <p className="text-sm text-slate-500 font-medium">contact@yziow.com</p>
                  <p className="text-sm text-slate-500 font-medium">support@yziow.com</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 shrink-0">
                  <Phone className="w-6 h-6 text-[#f97316]" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900 mb-1">Téléphone</h4>
                  <p className="text-sm text-slate-500 font-medium">+229 00 00 00 00</p>
                  <p className="text-xs text-slate-400 mt-1">Lundi au Vendredi, 8h - 18h</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 shrink-0">
                  <MapPin className="w-6 h-6 text-[#f97316]" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900 mb-1">Bureaux</h4>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed">
                    Cotonou, Bénin<br />
                    Quartier Haie Vive
                  </p>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-xl shadow-slate-200/50">
              <form onSubmit={handleContactSubmit} className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-2 uppercase tracking-wide">Nom complet</label>
                  <input 
                    type="text" 
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-[#f97316] focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-sm font-medium"
                    placeholder="Jean Dupont"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-2 uppercase tracking-wide">Pays de résidence</label>
                  <input 
                    type="text" 
                    required
                    value={contactCountry}
                    onChange={(e) => setContactCountry(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-[#f97316] focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-sm font-medium"
                    placeholder="Ex: Bénin, Togo, France..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-2 uppercase tracking-wide">Adresse email</label>
                  <input 
                    type="email" 
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-[#f97316] focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-sm font-medium"
                    placeholder="jean@ecole.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-2 uppercase tracking-wide">Message</label>
                  <textarea 
                    required
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-[#f97316] focus:ring-2 focus:ring-orange-500/20 outline-none transition-all text-sm font-medium resize-none"
                    placeholder="Comment pouvons-nous vous aider ?"
                  ></textarea>
                </div>
                <button 
                  type="submit"
                  disabled={formSubmitted}
                  className="w-full py-4 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-xl text-sm font-bold tracking-wide shadow-lg shadow-orange-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {formSubmitted ? 'Envoi en cours...' : (
                    <>Envoyer le message <Send className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
