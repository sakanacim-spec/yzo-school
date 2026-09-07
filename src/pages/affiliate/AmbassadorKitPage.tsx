import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Printer, ArrowLeft, FileText,
  HelpCircle, DollarSign, Award, Users, BookOpen, ShieldCheck, Phone,
  Sparkles, QrCode, CreditCard, Building2, Share2, Download, AlertCircle, RefreshCw
} from 'lucide-react';
import yziowLogo from '../../assets/yziow-logo.png';
import { API_BASE_URL } from '../../config';
import { getSortedCountries, getCountryByCode } from '../../data/countries';

export interface CycleRateInfo {
  label: string;
  monthly: number | null;
}

export interface PublicPricingResponse {
  country: string;
  currency: string;
  currency_symbol: string;
  currency_minor_unit: number;
  locale?: string | null;
  pricing_version: string;
  effective_from?: string | null;
  cycles: {
    maternelle_primaire: CycleRateInfo;
    college_secondaire: CycleRateInfo;
    superieur_formation: CycleRateInfo;
  };
}

export function formatPublicCycleRate(
  cycleInfo: CycleRateInfo | undefined,
  pricing: PublicPricingResponse | null,
  status: 'idle' | 'loading' | 'success' | 'not_configured' | 'error'
): string {
  if (status === 'loading') return 'Chargement...';
  if (status === 'error') return 'Tarif indisponible';
  if (status === 'not_configured') return 'Tarification sur devis';
  if (!pricing || !cycleInfo || typeof cycleInfo.monthly !== 'number' || cycleInfo.monthly <= 0) {
    return status === 'idle' ? 'Sélectionner un pays' : 'Tarification sur devis';
  }
  const minor = pricing.currency_minor_unit || 0;
  const realAmount = minor > 0 ? cycleInfo.monthly / Math.pow(10, minor) : cycleInfo.monthly;
  const locale = pricing.locale || 'fr-FR';
  const numStr = minor === 0
    ? Math.round(realAmount).toLocaleString(locale)
    : realAmount.toLocaleString(locale, { minimumFractionDigits: minor, maximumFractionDigits: minor });

  return `${numStr} ${pricing.currency_symbol || pricing.currency}`;
}

export const AmbassadorKitPage: React.FC = () => {
  const [activeDoc, setActiveDoc] = useState<string>('prospectus');
  const sortedCountries = useMemo(() => getSortedCountries('fr'), []);

  // 1. Ordre de priorité pour le pays : URL ?country=XX > profil local > aucun fallback silencieux
  const [selectedCountry, setSelectedCountry] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlCountry = urlParams.get('country');
      if (urlCountry && /^[A-Za-z]{2}$/.test(urlCountry.trim())) {
        return urlCountry.trim().toUpperCase();
      }
      const stored = localStorage.getItem('affiliate_country');
      if (stored && /^[A-Za-z]{2}$/.test(stored.trim())) {
        return stored.trim().toUpperCase();
      }
    }
    return '';
  });

  const [pricingData, setPricingData] = useState<PublicPricingResponse | null>(null);
  const [pricingStatus, setPricingStatus] = useState<'idle' | 'loading' | 'success' | 'not_configured' | 'error'>('idle');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string>('');

  const requestIdRef = useRef<number>(0);

  // Détection du pays de l'ambassadeur connecté s'il n'est pas déjà choisi
  useEffect(() => {
    if (selectedCountry) return;
    const token = localStorage.getItem('affiliate_token');
    if (!token) return;
    fetch(`${API_BASE_URL}/affiliate/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data?.affiliate?.country && /^[A-Za-z]{2}$/.test(data.affiliate.country)) {
          const c = data.affiliate.country.trim().toUpperCase();
          localStorage.setItem('affiliate_country', c);
          setSelectedCountry(c);
        }
      })
      .catch(() => {});
  }, [selectedCountry]);

  // Chargement autoritaire des tarifs officiels depuis le backend
  const fetchPricing = useCallback(async (countryCode: string) => {
    if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) {
      setPricingData(null);
      setPricingStatus('idle');
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setPricingStatus('loading');

    try {
      const res = await fetch(`${API_BASE_URL}/public/pricing/${countryCode}`);
      if (currentRequestId !== requestIdRef.current) return;

      if (res.status === 200) {
        const data: PublicPricingResponse = await res.json();
        if (currentRequestId !== requestIdRef.current) return;
        setPricingData(data);
        setPricingStatus('success');
      } else if (res.status === 404) {
        if (currentRequestId !== requestIdRef.current) return;
        setPricingData(null);
        setPricingStatus('not_configured');
      } else {
        if (currentRequestId !== requestIdRef.current) return;
        setPricingData(null);
        setPricingStatus('error');
      }
    } catch {
      if (currentRequestId !== requestIdRef.current) return;
      setPricingData(null);
      setPricingStatus('error');
    }
  }, []);

  useEffect(() => {
    if (selectedCountry) {
      fetchPricing(selectedCountry);
    } else {
      setPricingData(null);
      setPricingStatus('idle');
    }
  }, [selectedCountry, fetchPricing]);

  const selectedCountryInfo = selectedCountry ? getCountryByCode(selectedCountry) : undefined;

  // Montants formatés selon les unités mineures
  const ratePrimaireText = formatPublicCycleRate(pricingData?.cycles?.maternelle_primaire, pricingData, pricingStatus);
  const rateSecondaireText = formatPublicCycleRate(pricingData?.cycles?.college_secondaire, pricingData, pricingStatus);
  const rateSuperieurText = formatPublicCycleRate(pricingData?.cycles?.superieur_formation, pricingData, pricingStatus);

  const ratePrimaireHeading = pricingStatus === 'success'
    ? `À partir de ${ratePrimaireText} / élève / mois`
    : pricingStatus === 'not_configured'
      ? 'Tarification sur devis'
      : pricingStatus === 'loading'
        ? 'Chargement des tarifs...'
        : pricingStatus === 'error'
          ? 'Tarifs temporairement indisponibles'
          : 'Sélectionnez un pays pour afficher les tarifs';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setPdfError('');
    setIsGeneratingPdf(true);

    const container = document.querySelector('.print-container') as HTMLElement | null;
    if (!container) {
      setIsGeneratingPdf(false);
      setPdfError('Impossible de trouver le document à exporter.');
      return;
    }

    const ALLOWED_DOCS = [
      'prospectus', 'communique', 'guide', 'scripts', 'courrier_ecole',
      'courrier_banque', 'courrier_entreprise', 'tarifs_partenaires',
      'faq', 'tarifs', 'comparatif', 'charte', 'suivi', 'attestation'
    ];
    const safeDoc = ALLOWED_DOCS.includes(activeDoc) ? activeDoc : 'document';
    const safeCountry = /^[A-Z]{2}$/.test(selectedCountry) ? selectedCountry : 'GLOBAL';
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `${safeDoc}-yziow-${safeCountry}-${dateStr}.pdf`;

    let cloneContainer: HTMLElement | null = null;
    try {
      const { jsPDF } = await import('jspdf');

      // Cloner hors écran avec largeur A4 fixe
      cloneContainer = container.cloneNode(true) as HTMLElement;
      cloneContainer.style.width = '794px';
      cloneContainer.style.maxWidth = '794px';
      cloneContainer.style.position = 'fixed';
      cloneContainer.style.left = '0';
      cloneContainer.style.top = '0';
      cloneContainer.style.zIndex = '-9999';
      cloneContainer.style.background = '#ffffff';
      cloneContainer.style.color = '#0f172a';
      document.body.appendChild(cloneContainer);

      // Attendre le chargement des images du clone
      const images = Array.from(cloneContainer.querySelectorAll('img'));
      await Promise.all(
        images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );

      // Fonction robuste de conversion des fonctions modernes de couleur (oklch, oklab, lab, lch, color) -> rgba via pixel canvas 2D
      const colorCanvas = document.createElement('canvas');
      colorCanvas.width = 1;
      colorCanvas.height = 1;
      const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
      const colorCache = new Map<string, string>();
      const MODERN_COLOR_REGEX = /(?:oklch|oklab|lab|lch|color)\([^()]*(?:\([^()]*\)[^()]*)*\)/gi;
      const hasModernColor = (s: string) => /(?:oklch|oklab|lab|lch|color)\(/i.test(s);

      const convertModernColorToRgba = (colorStr: string): string => {
        if (!colorStr || typeof colorStr !== 'string' || !hasModernColor(colorStr)) {
          return colorStr;
        }
        return colorStr.replace(MODERN_COLOR_REGEX, (match) => {
          if (colorCache.has(match)) return colorCache.get(match)!;
          if (!colorCtx) return '#1e293b';
          try {
            colorCtx.clearRect(0, 0, 1, 1);
            colorCtx.fillStyle = '#000000';
            colorCtx.fillStyle = match;
            colorCtx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
            const rgba = `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`;
            colorCache.set(match, rgba);
            return rgba;
          } catch {
            return '#1e293b';
          }
        });
      };

      // Pré-conversion de tous les éléments du clone avant export
      const allElements = [cloneContainer, ...Array.from(cloneContainer.querySelectorAll('*'))] as HTMLElement[];
      const colorProps = [
        'color', 'backgroundColor',
        'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
        'outlineColor', 'fill', 'stroke'
      ] as const;

      allElements.forEach(el => {
        if (!el.style) return;
        const cs = window.getComputedStyle(el);
        colorProps.forEach(prop => {
          const val = cs[prop];
          if (val && typeof val === 'string' && hasModernColor(val)) {
            el.style[prop] = convertModernColorToRgba(val);
          }
        });
      });

      // Attendre le chargement des polices si disponible
      if (document.fonts && (document.fonts as any).ready) {
        try {
          await (document.fonts as any).ready;
        } catch {
          // Continuer si l'API des polices échoue
        }
      }

      const doc = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: 'a4'
      });

      await new Promise<void>((resolve, reject) => {
        try {
          doc.html(cloneContainer!, {
            callback: (pdfInstance) => {
              try {
                const blob = pdfInstance.output('blob');
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                  if (link.parentNode) {
                    link.parentNode.removeChild(link);
                  }
                  URL.revokeObjectURL(blobUrl);
                }, 2000);
                resolve();
              } catch (err) {
                reject(err);
              }
            },
            x: 0,
            y: 0,
            width: 595,
            windowWidth: 794,
            autoPaging: 'text',
            html2canvas: {
              scale: 595 / 794,
              useCORS: true,
              logging: false,
              onclone: (clonedDoc: Document) => {
                // 1. Remplacer les <link rel="stylesheet"> par une feuille <style> nettoyée sans aucune couleur moderne
                try {
                  let combinedCss = '';
                  Array.from(document.styleSheets).forEach(sheet => {
                    try {
                      const rules = Array.from((sheet as CSSStyleSheet).cssRules || []);
                      rules.forEach(rule => {
                        combinedCss += rule.cssText + '\n';
                      });
                    } catch {
                      // Feuilles externes ignorées
                    }
                  });

                  if (combinedCss) {
                    const sanitizedCss = convertModernColorToRgba(combinedCss);
                    const links = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
                    links.forEach(link => {
                      if (link.parentNode) link.parentNode.removeChild(link);
                    });

                    const styleEl = clonedDoc.createElement('style');
                    styleEl.textContent = sanitizedCss;
                    clonedDoc.head.appendChild(styleEl);
                  }
                } catch (cssErr) {
                  console.warn('Erreur remplacement feuilles de style:', cssErr);
                }

                // 2. Remplacer les couleurs modernes dans les balises <style> existantes
                const styles = clonedDoc.querySelectorAll('style');
                styles.forEach(st => {
                  if (st.textContent && hasModernColor(st.textContent)) {
                    st.textContent = convertModernColorToRgba(st.textContent);
                  }
                });

                // Intercepter getComputedStyle pour html2canvas
                const win = clonedDoc.defaultView || window;
                const origGetComputedStyle = win.getComputedStyle;
                win.getComputedStyle = function(this: any, el: Element, pseudo?: string | null) {
                  const res = origGetComputedStyle.call(this, el, pseudo);
                  return new Proxy(res, {
                    get(target: any, prop: string | symbol) {
                      if (prop === 'getPropertyValue') {
                        return (key: string) => {
                          const val = target.getPropertyValue(key);
                          return typeof val === 'string' && hasModernColor(val) ? convertModernColorToRgba(val) : val;
                        };
                      }
                      const orig = target[prop];
                      if (typeof orig === 'string' && hasModernColor(orig)) {
                        return convertModernColorToRgba(orig);
                      }
                      if (typeof orig === 'function') {
                        return orig.bind(target);
                      }
                      return orig;
                    }
                  });
                } as any;
              }
            }
          });
        } catch (callErr) {
          reject(callErr);
        }
      });
    } catch (err: any) {
      console.error('Erreur export PDF:', err);
      setPdfError('Échec de la génération du fichier PDF. Veuillez réessayer ou utiliser "Imprimer en PDF".');
    } finally {
      if (cloneContainer && cloneContainer.parentNode) {
        cloneContainer.parentNode.removeChild(cloneContainer);
      }
      setIsGeneratingPdf(false);
    }
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
            <div className="flex items-center gap-3">
              <img src={yziowLogo} alt="Logo Yziow" className="h-8 w-auto object-contain" />
              <div>
                <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider block">Kit Ambassadeur & Prospectus</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* SÉLECTEUR ACCESSIBLE DU PAYS PROSPECTÉ */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 shadow-inner">
              <label htmlFor="prospect-country-select" className="text-xs font-bold text-slate-400 whitespace-nowrap flex items-center gap-1.5">
                <span>🌍</span>
                <span className="hidden sm:inline">Pays prospecté :</span>
              </label>
              <select
                id="prospect-country-select"
                name="prospect_country"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="bg-slate-800 text-white font-bold text-xs rounded-lg px-2.5 py-1 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                aria-label="Pays de l'établissement prospecté"
              >
                <option value="">-- Choisir un pays --</option>
                {sortedCountries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name_fr} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <button
              id="download-pdf-btn"
              data-testid="download-pdf-btn"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className={`px-4 py-2.5 font-bold rounded-xl text-xs sm:text-sm transition flex items-center gap-2 border ${
                isGeneratingPdf
                  ? 'bg-slate-800 text-slate-500 border-slate-800 cursor-not-allowed'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Download className={`w-4 h-4 ${isGeneratingPdf ? 'animate-bounce text-slate-500' : 'text-orange-400'}`} />
              <span>{isGeneratingPdf ? 'Génération du PDF...' : 'Télécharger le PDF'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-xl text-xs sm:text-sm transition shadow-lg shadow-orange-500/30 flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer en PDF</span>
            </button>
          </div>
        </div>

        {/* Message d'erreur PDF si échec */}
        {pdfError && (
          <div className="max-w-7xl mx-auto mt-2 p-2 bg-red-950/80 border border-red-800 rounded-xl text-xs text-red-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{pdfError}</span>
            </div>
            <button onClick={() => setPdfError('')} className="text-red-400 hover:text-white font-bold ml-2">✕</button>
          </div>
        )}

        {/* Message statut tarification si erreur réseau/serveur */}
        {pricingStatus === 'error' && (
          <div className="max-w-7xl mx-auto mt-2 p-2 bg-amber-950/80 border border-amber-800 rounded-xl text-xs text-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Impossible de charger les tarifs officiels pour ce pays.</span>
            </div>
            <button
              onClick={() => selectedCountry && fetchPricing(selectedCountry)}
              className="px-2 py-1 bg-amber-800 hover:bg-amber-700 text-white font-bold rounded-lg flex items-center gap-1 text-[11px]"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Réessayer</span>
            </button>
          </div>
        )}

        <div className="max-w-7xl mx-auto mt-4 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {[
            { id: 'prospectus', label: '📄 Prospectus Flyer Yziow', icon: Sparkles },
            { id: 'communique', label: '📢 Communiqué Recrutement Réseaux', icon: Share2 },
            { id: 'guide', label: '📘 Guide de Formation', icon: BookOpen },
            { id: 'scripts', label: '🗣️ Scripts de Prospection', icon: Phone },
            { id: 'courrier_ecole', label: '✉️ Courrier Établissements', icon: Building2 },
            { id: 'courrier_banque', label: '🏦 Courrier Banques', icon: CreditCard },
            { id: 'courrier_entreprise', label: '🏢 Courrier Entreprises (RSE)', icon: Share2 },
            { id: 'tarifs_partenaires', label: '📊 Plaquette Tarifs Pub & Partenaires', icon: DollarSign },
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
        {/* Bandeau officiel du pays prospecté (inclus dans l'impression et le PDF généré) */}
        <div className="mb-6 p-4 bg-slate-100 rounded-2xl border border-slate-300 text-xs text-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-base">🌍</span>
            <span>
              Tarification applicable aux établissements situés en : <strong>{selectedCountryInfo ? `${selectedCountryInfo.name_fr} (${selectedCountryInfo.code})` : selectedCountry || 'Non spécifié'}</strong>
            </span>
          </div>
          {pricingStatus === 'success' && pricingData && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold text-[11px]">
              Devise : {pricingData.currency} ({pricingData.currency_symbol}) • Grille active
            </span>
          )}
          {pricingStatus === 'not_configured' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-100 text-orange-800 rounded-lg font-bold text-[11px]">
              Tarification sur devis
            </span>
          )}
          {pricingStatus === 'error' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg font-bold text-[11px]">
              Impossible de charger les tarifs. Réessayez.
            </span>
          )}
          {pricingStatus === 'idle' && (
            <span className="text-slate-500 italic text-[11px]">
              Sélectionnez un pays ci-dessus pour afficher les montants
            </span>
          )}
        </div>

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
                Pourquoi les établissements scolaires choisissent <span className="text-orange-600">Yziow</span> ?
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
                <h3 className="text-xl font-bold">{ratePrimaireHeading}</h3>
                <p className="text-xs text-slate-400">Aucun frais d'installation. Payez uniquement pour les élèves inscrits.</p>
              </div>
              <div className="flex gap-3 shrink-0">
                <div className="px-4 py-2 bg-slate-800 rounded-xl text-center border border-slate-700">
                  <div className="text-xs text-slate-400 font-medium">Maternelle/Primaire</div>
                  <div className="text-sm font-bold text-orange-400">
                    {pricingStatus === 'success' ? `${ratePrimaireText} / mois` : ratePrimaireText}
                  </div>
                </div>
                <div className="px-4 py-2 bg-slate-800 rounded-xl text-center border border-slate-700">
                  <div className="text-xs text-slate-400 font-medium">Collège/Lycée</div>
                  <div className="text-sm font-bold text-orange-400">
                    {pricingStatus === 'success' ? `${rateSecondaireText} / mois` : rateSecondaireText}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Prospectus & Contact */}
            <div className="border-t border-slate-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <img src={yziowLogo} alt="Logo Yziow" className="h-5 w-auto object-contain" />
                <span className="font-bold text-slate-900">Yziow Education Platform</span>
                <span>— www.yziow.com</span>
              </div>
              <div className="font-bold text-orange-600 bg-orange-50 px-4 py-2 rounded-xl border border-orange-200">
                📞 Contact Ambassadeur : +229 01 97 76 99 91 / contact@yziow.com
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 14 : COMMUNIQUÉS RECRUTEMENT RÉSEAUX SOCIAUX        */}
        {/* ============================================================ */}
        {activeDoc === 'communique' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8 font-sans">
            <div className="border-b border-slate-200 pb-6 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-orange-600 uppercase tracking-widest">Kit Communication Réseaux Sociaux</span>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Communiqués de Recrutement d'Ambassadeurs Yziow</h1>
              </div>
              <Share2 className="w-10 h-10 text-orange-500" />
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Utilisez ces modèles de textes officiels prêts à publier sur vos pages Facebook, comptes LinkedIn, groupes WhatsApp, Telegram, Instagram et TikTok pour recruter vos ambassadeurs.
            </p>

            {/* VERSION 1 : FACEBOOK & LINKEDIN */}
            <div className="space-y-3 bg-slate-900 text-white p-6 sm:p-8 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">📢 Version 1 : Facebook & LinkedIn (Officiel & Attrayant)</span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-mono">Format Long</span>
              </div>
              <div className="text-xs text-slate-200 font-mono leading-relaxed bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                <p>🚀 <strong>RECRUTEMENT MASSIF : DEVENEZ AMBASSADEUR AGRÉÉ YZIOW EDUCATION !</strong> 🎓</p>
                <p>Vous souhaitez générer des revenus récurrents et construire une vraie carrière dans la digitalisation de l'éducation en Afrique et à l'international ?</p>
                <p>La plateforme SaaS <strong>Yziow Education</strong> (solution N°1 de gestion scolaire : bulletins PDF certifiés, présences par QR Code, comptabilité & levée de fonds) lance sa grande campagne de recrutement d'Ambassadeurs Commercials !</p>
                <p>💼 <strong>Vos Missions :</strong><br/>
                • Présenter la solution Yziow aux Directeurs d'Écoles, Collèges, Lycées et Universités.<br/>
                • Offrir aux établissements un accès d'essai 100% GRATUIT de 14 jours.<br/>
                • Accompagner les écoles dans leur transformation numérique.</p>
                <p>💰 <strong>Vos Avantages & Rémunération :</strong><br/>
                • Commissions récurrentes à vie sur chaque abonnement souscrit.<br/>
                • Retraits instantanés par Mobile Money (MTN, Moov, Orange, Wave) ou Virement bancaire.<br/>
                • Formation complète, scripts de vente et kit marketing offerts.<br/>
                • Attestation officielle et badge d'Ambassadeur agréé Yziow.</p>
                <p>📲 <strong>Comment postuler ?</strong><br/>
                Inscrivez-vous gratuitement en 2 minutes sur notre portail Ambassadeurs :<br/>
                👉 <strong>https://yziow.com/ambassadeur</strong></p>
                <p>#Yziow #Education #Recrutement #Ambassadeur #Opportunite #SaaS #Afrique #Digitalisation</p>
              </div>
            </div>

            {/* VERSION 2 : WHATSAPP & TELEGRAM */}
            <div className="space-y-3 bg-slate-900 text-white p-6 sm:p-8 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">📲 Version 2 : WhatsApp & Telegram (Court & Viral)</span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-mono">Format Express</span>
              </div>
              <div className="text-xs text-slate-200 font-mono leading-relaxed bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                <p>🔥 <strong>OPPORTUNITÉ UNIQUE DE REVENUS — RECRUTEMENT AMBASSADEURS YZIOW !</strong> 🎓</p>
                <p>Tu veux gagner de l'argent régulièrement en aidant les écoles de ta ville à se digitaliser ?</p>
                <p>Rejoins l'équipe des Ambassadeurs <strong>Yziow Education</strong> !</p>
                <p>✅ Aucun frais d'installation<br/>
                ✅ Offre 14 jours d'essai GRATUIT aux directeurs d'écoles<br/>
                ✅ Perçois des commissions sur chaque école qui s'abonne<br/>
                ✅ Retrait direct sur ton compte Mobile Money !</p>
                <p>👉 Cliquez ici pour vous inscrire immédiatement :<br/>
                <strong>https://yziow.com/ambassadeur</strong></p>
                <p>Places limitées par ville/région. Partage à tes amis motivés ! 🚀</p>
              </div>
            </div>

            {/* VERSION 3 : TIKTOK & REELS (SCRIPT VIDÉO) */}
            <div className="space-y-3 bg-slate-900 text-white p-6 sm:p-8 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">🎬 Version 3 : Script Vidéo TikTok / Reels / Shorts (30 à 45 secondes)</span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-mono">Vidéo Face Caméra</span>
              </div>
              <div className="text-xs text-slate-200 font-mono leading-relaxed bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                <p><strong>[Visuel : Face caméra dynamique avec le logo Yziow en fond ou sur le téléphone]</strong></p>
                <p>🎙️ <em>"Si tu cherches une opportunité sérieuse pour gagner des revenus récurrents cette année, écoute ça jusqu'au bout !"</em></p>
                <p>🎙️ <em>"La plateforme scolaire Yziow recrute des Ambassadeurs dans toutes les villes. Ton rôle ? Présenter la plateforme aux directeurs d'écoles pour qu'ils gèrent leurs bulletins PDF et leurs présences QR Code."</em></p>
                <p>🎙️ <em>"Tu leur offres 14 jours d'essai 100% gratuits, et dès qu'ils s'abonnent, tu touches une commission chaque mois directement sur ton Mobile Money !"</em></p>
                <p>🎙️ <em>"Clique sur le lien dans ma bio ou va sur yziow.com/ambassadeur pour t'inscrire gratuitement !"</em></p>
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
                    <p className="text-xs text-red-800 mt-1">
                      Réponse : "Le tarif est {pricingStatus === 'success' ? `de seulement ${ratePrimaireText} par élève et par mois` : pricingStatus === 'not_configured' ? 'adapté sur devis selon la taille de votre école' : 'très accessible'}. L'école gagne 10x plus en temps et en sécurité des reçus."
                    </p>
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
              <img src={yziowLogo} alt="Logo Yziow" className="h-10 w-auto object-contain" />
            </div>

            {/* Carte dynamique pour le pays prospecté */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 space-y-4 border-l-4 border-orange-500">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">
                  Tarifs Applicables au Pays Prospecté : {selectedCountryInfo ? `${selectedCountryInfo.flag} ${selectedCountryInfo.name_fr} (${selectedCountryInfo.code})` : selectedCountry || 'Non sélectionné'}
                </span>
                {pricingData && (
                  <span className="text-xs font-mono text-slate-400">
                    Devise : {pricingData.currency} ({pricingData.currency_symbol}) • v{pricingData.pricing_version}
                  </span>
                )}
              </div>

              {pricingStatus === 'loading' && (
                <p className="text-sm text-slate-300">Chargement des tarifs officiels...</p>
              )}

              {pricingStatus === 'idle' && (
                <p className="text-sm text-slate-400">
                  Veuillez sélectionner un pays prospecté dans la barre supérieure pour afficher les montants exacts dans sa devise officielle.
                </p>
              )}

              {pricingStatus === 'not_configured' && (
                <div className="space-y-1">
                  <h4 className="text-base font-black text-orange-400">Tarification sur devis</h4>
                  <p className="text-xs text-slate-300">
                    Ce pays n'a pas de grille standard automatique préconfigurée. Les établissements de cette zone bénéficient d'une tarification sur devis sur mesure.
                  </p>
                </div>
              )}

              {pricingStatus === 'error' && (
                <p className="text-sm text-amber-400">
                  Impossible de charger les tarifs. Réessayez.
                </p>
              )}

              {pricingStatus === 'success' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-center">
                    <div className="text-xs text-slate-400 font-medium">Maternelle & Primaire</div>
                    <div className="text-lg font-black text-orange-400 mt-1">{ratePrimaireText}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">par élève / mois</div>
                  </div>
                  <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-center">
                    <div className="text-xs text-slate-400 font-medium">Collège & Secondaire</div>
                    <div className="text-lg font-black text-orange-400 mt-1">{rateSecondaireText}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">par élève / mois</div>
                  </div>
                  <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-center">
                    <div className="text-xs text-slate-400 font-medium">Supérieur & Formation</div>
                    <div className="text-lg font-black text-orange-400 mt-1">{rateSuperieurText}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">par élève / mois</div>
                  </div>
                </div>
              )}
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
              <img src={yziowLogo} alt="Logo Yziow" className="h-12 w-auto object-contain mx-auto mb-2" />
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
                <img src={yziowLogo} alt="Logo Yziow" className="h-12 w-auto object-contain" />
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

        {/* ============================================================ */}
        {/* DOCUMENT 10 : COURRIER OFFICIEL ÉTABLISSEMENTS SCOLAIRES      */}
        {/* ============================================================ */}
        {activeDoc === 'courrier_ecole' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-6 font-serif leading-relaxed text-sm">
            {/* Entête Officiel Yziow */}
            <div className="flex justify-between items-start border-b-2 border-orange-500 pb-6 font-sans">
              <div className="space-y-1">
                <div className="flex items-center gap-3 text-slate-900 font-black text-xl">
                  <img src={yziowLogo} alt="Logo Yziow" className="h-8 w-auto object-contain" />
                  <span>YZIOW EDUCATION</span>
                </div>
                <p className="text-xs text-slate-500">Plateforme SaaS de Gestion Scolaire & Pédagogique</p>
                <p className="text-xs text-slate-500">Siège : Cotonou, Bénin | contact@yziow.com | www.yziow.com</p>
              </div>
              <div className="text-right text-xs text-slate-500 font-mono">
                <p>Date : __ / __ / 2026</p>
                <p>Réf : YZIOW-PROP-2026/01</p>
              </div>
            </div>

            {/* Destinataire */}
            <div className="flex justify-end font-sans">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs space-y-1 w-72">
                <p className="font-bold text-slate-900">À l'attention de Monsieur/Madame le Directeur</p>
                <p className="text-slate-700">Établissement : [Nom de l'École / Collège / Lycée]</p>
                <p className="text-slate-600">Ville / Pays : [Ville, Pays]</p>
              </div>
            </div>

            {/* Objet */}
            <div className="bg-orange-50 border-l-4 border-orange-500 p-3 font-sans rounded-r-xl">
              <strong className="text-orange-950 font-bold">OBJET :</strong> <span className="text-orange-900">Proposition de modernisation numérique de votre établissement & Offre d'Essai Gratuit 14 Jours</span>
            </div>

            {/* Corps du courrier */}
            <div className="space-y-4 text-slate-800 text-sm">
              <p>Monsieur/Madame le Directeur,</p>
              <p>
                Nous avons l'honneur de vous présenter <strong>Yziow Education</strong>, la plateforme SaaS d'excellence conçue spécifiquement pour répondre aux défis quotidiens de gestion des établissements scolaires en Afrique et à l'international.
              </p>
              <p>
                La gestion manuelle des bulletins, le suivi des présences et la comptabilité sur registres papiers engendrent de nombreuses heures de calculs, un risque d'erreurs et des pertes de données. Yziow apporte une réponse moderne et sécurisée à travers :
              </p>
              
              <ul className="list-disc pl-6 space-y-2 font-sans text-xs">
                <li><strong>Génération instantanée de bulletins PDF certifiés :</strong> Calcul automatique des moyennes, rangs et appréciations pédagogiques en 1 clic.</li>
                <li><strong>Pointage des présences par QR Code :</strong> Appel automatique à l'entrée avec un simple smartphone et notification en temps réel aux parents.</li>
                <li><strong>Gestion financière & reçus automatiques :</strong> Suivi des scolarités, alertes impayés et reçus imprimables infalsifiables.</li>
                <li><strong>Module de Levée de Fonds & Dons (Yziow Pay) :</strong> Outil de crowdfunding intégré permettant à votre école de financer ses projets de construction ou d'équipements informatiques.</li>
              </ul>

              <p>
                Afin de vous permettre de mesurer concrètement les bénéfices de notre solution, nous avons le plaisir de vous offrir une <strong>période d'essai 100% gratuite de 14 jours</strong>, sans aucun engagement et sans carte bancaire.
              </p>
              <p>
                Notre Ambassadeur agréé se tient à votre entière disposition pour planifier une démonstration de 15 minutes dans vos locaux ou en visioconférence.
              </p>
              <p>
                Dans l'attente de votre réponse, nous vous prions d'agréer, Monsieur/Madame le Directeur, l'expression de nos salutations distinguées.
              </p>
            </div>

            {/* Signature & Cachet */}
            <div className="pt-8 flex justify-between items-end font-sans text-xs border-t border-slate-200">
              <div className="space-y-1">
                <p className="font-bold text-slate-900">L'Ambassadeur Agréé Yziow</p>
                <p className="text-slate-600">Nom & Prénom : ____________________</p>
                <p className="text-slate-600">Contact / Tél : ____________________</p>
              </div>
              <div className="text-center space-y-2">
                <p className="font-bold text-slate-900">Pour la Direction Générale Yziow</p>
                <div className="w-32 h-16 border border-dashed border-orange-300 rounded-xl flex items-center justify-center text-[10px] text-orange-400">
                  Cachet & Signature
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 11 : COURRIER OFFICIEL BANQUES & ÉTABLISSEMENTS FINANCIERS */}
        {/* ============================================================ */}
        {activeDoc === 'courrier_banque' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-6 font-serif leading-relaxed text-sm">
            <div className="flex justify-between items-start border-b-2 border-orange-500 pb-6 font-sans">
              <div className="space-y-1">
                <div className="flex items-center gap-3 text-slate-900 font-black text-xl">
                  <img src={yziowLogo} alt="Logo Yziow" className="h-8 w-auto object-contain" />
                  <span>YZIOW EDUCATION</span>
                </div>
                <p className="text-xs text-slate-500">Direction des Partenariats Financiers & Yziow Pay</p>
                <p className="text-xs text-slate-500">contact@yziow.com | www.yziow.com</p>
              </div>
              <div className="text-right text-xs text-slate-500 font-mono">
                <p>Date : __ / __ / 2026</p>
                <p>Réf : YZIOW-BANK-2026/02</p>
              </div>
            </div>

            <div className="flex justify-end font-sans">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs space-y-1 w-80">
                <p className="font-bold text-slate-900">À l'attention de Monsieur/Madame le Directeur Général</p>
                <p className="text-slate-700">Établissement Bancaire : [Nom de la Banque / Institution Financial]</p>
                <p className="text-slate-600">Direction des Crédits & Engagements</p>
              </div>
            </div>

            <div className="bg-orange-50 border-l-4 border-orange-500 p-3 font-sans rounded-r-xl">
              <strong className="text-orange-950 font-bold">OBJET :</strong> <span className="text-orange-900">Demande de Partenariat Stratégique — Solutions de Financement Scolaire & Crédits Équipement</span>
            </div>

            <div className="space-y-4 text-slate-800 text-sm">
              <p>Monsieur/Madame le Directeur Général,</p>
              <p>
                La plateforme SaaS <strong>Yziow Education</strong> regroupe aujourd'hui un réseau en forte croissance d'établissements scolaires (écoles maternelles, primaires, collèges, lycées, universités et centres de formation) et de dizaines de milliers de parents d'élèves.
              </p>
              <p>
                Dans le cadre de l'extension de notre écosystème de services, nous sollicitons un **partenariat institutionnel avec votre établissement bancaire** autour de trois axes stratégiques :
              </p>

              <ol className="list-decimal pl-6 space-y-2 font-sans text-xs">
                <li><strong>Lignes de crédits d'équipement aux écoles :</strong> Proposer des facilités de prêt à taux préférentiel pour l'acquisition de bus scolaires, ordinateurs et constructions d'infrastructures pour les écoles inscrites sur Yziow.</li>
                <li><strong>Crédits de scolarité pour les parents :</strong> Offrir des micro-crédits de rentrée scolaire aux parents d'élèves gérant leurs paiements via Yziow Pay.</li>
                <li><strong>Ouverture de comptes & reversements sécurisés :</strong> Interconnexion bancaire pour les opérations de reversement des abonnements et collectes de dons de nos écoles partenaires.</li>
              </ol>

              <p>
                Ce partenariat offrira à votre banque une visibilité directe et prioritaire auprès d'un portefeuille qualifié de fondateurs d'écoles et de familles à fort pouvoir d'achat.
              </p>
              <p>
                Nous serions honorés d'organiser une réunion de cadrage dans vos locaux pour vous présenter nos données d'impact et les modalités de convention.
              </p>
              <p>
                Veuillez agréer, Monsieur/Madame le Directeur Général, l'assurance de notre haute considération.
              </p>
            </div>

            <div className="pt-8 flex justify-between items-end font-sans text-xs border-t border-slate-200">
              <div className="space-y-1">
                <p className="font-bold text-slate-900">Direction Générale Yziow</p>
                <p className="text-slate-600">Global Marketing and Technology</p>
              </div>
              <div className="text-center space-y-2">
                <div className="w-32 h-16 border border-dashed border-orange-300 rounded-xl flex items-center justify-center text-[10px] text-orange-400">
                  Cachet Officiel
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 12 : COURRIER OFFICIEL ENTREPRISES & MÉCÈNES (RSE)  */}
        {/* ============================================================ */}
        {activeDoc === 'courrier_entreprise' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-6 font-serif leading-relaxed text-sm">
            <div className="flex justify-between items-start border-b-2 border-orange-500 pb-6 font-sans">
              <div className="space-y-1">
                <div className="flex items-center gap-3 text-slate-900 font-black text-xl">
                  <img src={yziowLogo} alt="Logo Yziow" className="h-8 w-auto object-contain" />
                  <span>YZIOW EDUCATION</span>
                </div>
                <p className="text-xs text-slate-500">Direction de l'Impact Social & Mécénat RSE</p>
                <p className="text-xs text-slate-500">contact@yziow.com | www.yziow.com</p>
              </div>
              <div className="text-right text-xs text-slate-500 font-mono">
                <p>Date : __ / __ / 2026</p>
                <p>Réf : YZIOW-RSE-2026/03</p>
              </div>
            </div>

            <div className="flex justify-end font-sans">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs space-y-1 w-80">
                <p className="font-bold text-slate-900">À l'attention de la Direction Générale / RSE</p>
                <p className="text-slate-700">Entreprise : [Nom de l'Entreprise / Société Partner]</p>
                <p className="text-slate-600">Direction Communication & Engagements RSE</p>
              </div>
            </div>

            <div className="bg-orange-50 border-l-4 border-orange-500 p-3 font-sans rounded-r-xl">
              <strong className="text-orange-950 font-bold">OBJET :</strong> <span className="text-orange-900">Demande de Partenariat RSE & Sponsoring — Programme "Éducation Numérique & Bourses Scolaires"</span>
            </div>

            <div className="space-y-4 text-slate-800 text-sm">
              <p>Madame, Monsieur le Directeur,</p>
              <p>
                Dans le cadre de votre Responsabilité Sociétale des Entreprises (RSE) et de votre engagement en faveur de l'éducation et de la jeunesse, la plateforme <strong>Yziow Education</strong> vous invite à devenir partenaire officiel de notre programme d'accès au numérique pour les écoles.
              </p>
              <p>
                À travers notre module certifié de **Levée de Fonds & Dons (Yziow Pay)**, des dizaines d'écoles soumettent chaque mois des projets à fort impact communautaire : bourses d'études pour élèves méritants démunis, équipement en ordinateurs, accès à l'eau potable et rénovation de salles de classe.
              </p>
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-sans text-xs space-y-2">
                <p className="font-bold text-slate-900">Avantages exclusifs pour votre Entreprise :</p>
                <p>• <strong>Visibilité de marque Premium :</strong> Logo de votre entreprise affiché comme Mécène Premium sur la plateforme Yziow devant des milliers de parents et directeurs.</p>
                <p>• <strong>Rapport d'Impact Certifié :</strong> Traçabilité à 100% de vos dons avec attestations de mécénat téléchargeables.</p>
                <p>• <strong>Valorisation RSE :</strong> Contenu média personnalisé (photos, vidéos de remise d'équipements aux écoles) pour vos canaux de communication.</p>
              </div>

              <p>
                Nous nous tenons à votre disposition pour vous présenter les différentes formules de sponsoring (Sponsor Gold, Parrain d'Écoles, Fonds de Bourses).
              </p>
              <p>
                Espérant pouvoir compter votre noble entreprise parmi les bâtisseurs de l'éducation de demain, nous vous prions d'agréer l'expression de nos sentiments les plus distingués.
              </p>
            </div>

            <div className="pt-8 flex justify-between items-end font-sans text-xs border-t border-slate-200">
              <div className="space-y-1">
                <p className="font-bold text-slate-900">Direction de l'Impact Social Yziow</p>
                <p className="text-slate-600">Global Marketing and Technology</p>
              </div>
              <div className="text-center space-y-2">
                <div className="w-32 h-16 border border-dashed border-orange-300 rounded-xl flex items-center justify-center text-[10px] text-orange-400">
                  Cachet Officiel
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* DOCUMENT 13 : PLAQUETTE TARIFS PUBLICITÉ & PARTENAIRES B2B     */}
        {/* ============================================================ */}
        {activeDoc === 'tarifs_partenaires' && (
          <div className="bg-white text-slate-900 rounded-3xl p-8 sm:p-12 shadow-2xl border border-slate-200 space-y-8 font-sans">
            {/* Header Plaquette */}
            <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 text-white rounded-3xl p-8 sm:p-10 relative overflow-hidden shadow-xl border border-orange-500/20">
              <div className="relative z-10 space-y-3 text-center sm:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-xs font-black uppercase tracking-wider border border-orange-500/30">
                  📊 Offres Commerciales & Sponsoring B2B 2026
                </div>
                <h1 className="text-2xl sm:text-4xl font-black text-white">
                  Plaquette Tarifaire Partenaires <span className="text-orange-500">& Publicité</span>
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm max-w-2xl">
                  Bénéficiez d'une visibilité ciblée auprès de milliers de Directeurs d'Écoles, Enseignants, Parents d'Élèves et Établissements Scolaires connectés au quotidien sur Yziow.
                </p>
              </div>
            </div>

            {/* 🏦 SECTION 1 : BANQUES & ÉTABLISSEMENTS FINANCIERS */}
            <div className="space-y-4">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-2">
                <span>🏦 1. BANQUES & INSTITUTIONS FINANCIÈRES</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 border-2 border-orange-500/40 rounded-2xl p-6 space-y-4 shadow-sm relative">
                  <div className="absolute -top-3 right-4 bg-orange-500 text-slate-950 text-[10px] font-black uppercase px-3 py-1 rounded-full shadow">
                    ⭐ Emplacement Premium
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900">Pack Banque Gold — Page d'Accueil</h3>
                    <p className="text-xs text-slate-500 mt-1">Logo & Bannière officielle sur la Landing Page principale (yziow.com)</p>
                  </div>
                  <div className="text-2xl font-black text-orange-600">
                    250.000 FCFA <span className="text-xs font-bold text-slate-500">/ mois</span>
                  </div>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                    <li>Logo affiché dans la section "Écosystème de Partenaires Premium"</li>
                    <li>Redirection directe vers vos offres de crédit scolaire</li>
                    <li>Statut "Partenaire Financier Officiel Yziow"</li>
                    <li>Réduction de 20% sur l'abonnement annuel (2.400.000 FCFA / an)</li>
                  </ul>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                  <div>
                    <h3 className="font-black text-base text-slate-900">Pack Banque Silver — Pages Secondaires</h3>
                    <p className="text-xs text-slate-500 mt-1">Affichage dans les Eespaces Privés (Dashboard Directeur & Parents)</p>
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    150.000 FCFA <span className="text-xs font-bold text-slate-500">/ mois</span>
                  </div>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                    <li>Bannière ciblée sur l'Espace Comptabilité & Reversements</li>
                    <li>Présence sur l'Espace Parent dans la rubrique Paiements</li>
                    <li>Orientation prioritaire des écoles pour l'ouverture de compte</li>
                    <li>Abonnement annuel à 1.500.000 FCFA / an</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 📡 SECTION 2 : OPÉRATEURS TÉLÉCOMS & MOBILE MONEY (MTN, MOOV, CELTIS...) */}
            <div className="space-y-4">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-2">
                <span>📡 2. OPÉRATEURS TÉLÉCOMS & MOBILE MONEY (MTN, MOOV, CELTIS)</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 border-2 border-orange-500/40 rounded-2xl p-6 space-y-4 shadow-sm relative">
                  <div className="absolute -top-3 right-4 bg-orange-500 text-slate-950 text-[10px] font-black uppercase px-3 py-1 rounded-full shadow">
                    ⭐ Emplacement Premium
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900">Pack Télécom Gold — Page d'Accueil</h3>
                    <p className="text-xs text-slate-500 mt-1">Affichage Logo & Promotion Offres Internet Écoles sur yziow.com</p>
                  </div>
                  <div className="text-2xl font-black text-orange-600">
                    300.000 FCFA <span className="text-xs font-bold text-slate-500">/ mois</span>
                  </div>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                    <li>Visibilité exclusive sur la page d'accueil principale</li>
                    <li>Mise en valeur du service Mobile Money (MTN MoMo / Moov Money / Celtis Cash)</li>
                    <li>Incitations et promotions auprès des établissements scolaires partenaires</li>
                    <li>Tarif annuel privilégié : 3.000.000 FCFA / an</li>
                  </ul>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                  <div>
                    <h3 className="font-black text-base text-slate-900">Pack Télécom Silver — Module Yziow Pay</h3>
                    <p className="text-xs text-slate-500 mt-1">Intégration visuelle dans le tunnel de paiement de scolarité</p>
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    200.000 FCFA <span className="text-xs font-bold text-slate-500">/ mois</span>
                  </div>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                    <li>Logo affiché en priorité lors du règlement de la scolarité par les parents</li>
                    <li>Mentions sur les reçus PDF de paiement de scolarité</li>
                    <li>Abonnement annuel à 2.000.000 FCFA / an</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 🏢 SECTION 3 : ENTREPRISES, MAROQUINERIES, LIBRAIRIES & RSE */}
            <div className="space-y-4">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-2">
                <span>🏢 3. ENTREPRISES & MECÈNES RSE (Fournitures, Équipements, Mobilier)</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                  <div>
                    <h3 className="font-black text-base text-slate-900">Pack Entreprise Gold — Page d'Accueil</h3>
                    <p className="text-xs text-slate-500 mt-1">Logo & lien vers votre catalogue d'équipements sur la Landing Page</p>
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    150.000 FCFA <span className="text-xs font-bold text-slate-500">/ mois</span>
                  </div>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                    <li>Affichage Logo dans la section Partenaires d'Accueil</li>
                    <li>Lien direct vers votre site ou contact commercial</li>
                    <li>Tarif annuel : 1.500.000 FCFA / an</li>
                  </ul>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                  <div>
                    <h3 className="font-black text-base text-slate-900">Pack Entreprise Silver — Espace Dons & Crowdfunding</h3>
                    <p className="text-xs text-slate-500 mt-1">Affichage sponsor sur la page des campagnes de levée de fonds scolaires</p>
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    80.000 FCFA <span className="text-xs font-bold text-slate-500">/ mois</span>
                  </div>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                    <li>Bannière Sponsor RSE sur la page des projets à financer</li>
                    <li>Attestation officielle de partenariat d'impact éducatif</li>
                    <li>Tarif annuel : 800.000 FCFA / an</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Footer Tarifs */}
            <div className="border-t border-slate-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600 font-mono">
              <div>Pour toute réservation d'emplacement publicitaire : contact@yziow.com</div>
              <div className="font-bold text-orange-600">Direction Commerciale Yziow Education</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AmbassadorKitPage;
