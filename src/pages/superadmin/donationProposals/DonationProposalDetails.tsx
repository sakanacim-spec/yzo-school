// src/pages/superadmin/donationProposals/DonationProposalDetails.tsx
// Volet latéral / Plein écran mobile affichant le détail complet d'une proposition et son historique d'audit.
// Entièrement internationalisé avec le système i18n existant.

import React, { useEffect, useRef } from 'react';
import {
  X, Building2, User, Mail, Phone, Globe, MapPin,
  FileText, Shield, Clock, ExternalLink, ArrowRight,
  Archive, CheckCircle2, XCircle
} from 'lucide-react';
import type {
  DonationProposalDetail,
  DonationProposalStatus
} from '../../../types/donationProposalAdmin.ts';
import {
  STATUS_METADATA,
  STATUS_TRANSITIONS,
  OFFICIAL_SECTORS,
  SUPPORT_TYPE_LABELS,
  getStatusLabel,
  getActionLabel
} from '../../../types/donationProposalAdmin.ts';
import { getCountryName } from '../../../data/countries.ts';
import { useStore } from '../../../store/useStore.ts';
import { t } from '../../../i18n/index.ts';
import type { Language } from '../../../i18n/index.ts';

interface DonationProposalDetailsProps {
  proposal: DonationProposalDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onInitiateTransition: (targetStatus: DonationProposalStatus) => void;
}

function formatDate(isoStr: string | null | undefined, locale = 'fr-FR'): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  } catch (_) {
    return isoStr;
  }
}

export const DonationProposalDetails: React.FC<DonationProposalDetailsProps> = ({
  proposal,
  isOpen,
  onClose,
  onInitiateTransition
}) => {
  const { language } = useStore();
  const tr = (key: string, vars?: any) => t(language as Language, key, vars);

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Gestion Échap et piégeage focus
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href]:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    closeBtnRef.current?.focus();

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !proposal) return null;

  const currentMeta = STATUS_METADATA[proposal.status];
  const currentLabel = getStatusLabel(proposal.status, tr);
  const allowedTransitions = STATUS_TRANSITIONS[proposal.status] || [];

  const sectorObj = OFFICIAL_SECTORS.find((s) => s.value === proposal.sector);
  const sectorLabel = sectorObj ? sectorObj.label : proposal.sector;
  const supportTypeLabel = SUPPORT_TYPE_LABELS[proposal.support_type] || proposal.support_type;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="proposal-details-title"
    >
      <div
        ref={drawerRef}
        className="w-full md:max-w-2xl lg:max-w-3xl h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête fixe */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm sm:text-base font-bold text-white bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">
                {proposal.reference}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${currentMeta.badgeClass}`}>
                {currentLabel}
              </span>
            </div>
            <h2 id="proposal-details-title" className="text-xl font-bold text-white">
              {proposal.company_name}
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            aria-label={tr('superadmin.donationProposals.details.closeAria') || 'Fermer la fiche détaillée'}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Corps défilable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-slate-300">
          {/* Actions disponibles selon la machine d'état */}
          {allowedTransitions.length > 0 ? (
            <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  {tr('superadmin.donationProposals.details.allowedActionsTitle') || 'Actions administratives possibles'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {tr('superadmin.donationProposals.details.currentStatus', { status: currentLabel }) || `Statut : ${currentLabel}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {allowedTransitions.map((target) => {
                  const targetLabel = getActionLabel(target, tr);
                  let btnColor = 'bg-slate-800 text-slate-200 hover:bg-slate-700';
                  let Icon = ArrowRight;

                  if (target === 'under_review') {
                    btnColor = 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20';
                    Icon = Clock;
                  } else if (target === 'approved') {
                    btnColor = 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20';
                    Icon = CheckCircle2;
                  } else if (target === 'rejected') {
                    btnColor = 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20';
                    Icon = XCircle;
                  } else if (target === 'archived') {
                    btnColor = 'bg-slate-700 hover:bg-slate-600 text-white';
                    Icon = Archive;
                  }

                  return (
                    <button
                      key={target}
                      type="button"
                      onClick={() => onInitiateTransition(target)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${btnColor}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{targetLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
              <Archive className="w-4 h-4 text-slate-500 shrink-0" />
              <span>{tr('superadmin.donationProposals.details.archivedNotice') || "Ce dossier est archivé. Aucune action supplémentaire n'est disponible."}</span>
            </div>
          )}

          {/* Coordonnées & Responsable */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-blue-400" />
              <span>{tr('superadmin.donationProposals.details.contactSection') || 'Contact & Porteur du projet'}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-slate-500 block">
                  {tr('superadmin.donationProposals.details.fullName') || 'Nom complet'}
                </span>
                <span className="font-semibold text-white">{proposal.full_name}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">
                  {tr('superadmin.donationProposals.details.role') || 'Fonction / Rôle'}
                </span>
                <span className="font-semibold text-white">{proposal.role}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">
                  {tr('superadmin.donationProposals.details.email') || 'Email professionnel'}
                </span>
                <a
                  href={`mailto:${proposal.email}`}
                  className="text-blue-400 hover:underline flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span>{proposal.email}</span>
                </a>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">
                  {tr('superadmin.donationProposals.details.phone') || 'Téléphone'}
                </span>
                <a
                  href={`tel:${proposal.phone}`}
                  className="text-emerald-400 hover:underline flex items-center gap-1.5"
                >
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span>{proposal.phone}</span>
                </a>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">
                  {tr('superadmin.donationProposals.details.country') || 'Pays'}
                </span>
                <span className="flex items-center gap-1.5 text-white">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {getCountryName(proposal.country)}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">
                  {tr('superadmin.donationProposals.details.targetMarkets') || 'Marchés ciblés'}
                </span>
                <span className="text-white">{proposal.target_markets}</span>
              </div>
              {proposal.website && (
                <div className="sm:col-span-2">
                  <span className="text-xs text-slate-500 block">
                    {tr('superadmin.donationProposals.details.website') || 'Site internet'}
                  </span>
                  <a
                    href={proposal.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline inline-flex items-center gap-1.5"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{proposal.website}</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Informations Métier & Secteur */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>{tr('superadmin.donationProposals.details.sectorSection') || 'Secteur & Cadre Réglementaire'}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-slate-500 block">
                  {tr('superadmin.donationProposals.details.mainSector') || 'Secteur principal'}
                </span>
                <span className="font-semibold text-white">{sectorLabel}</span>
              </div>
              {proposal.sub_sector && (
                <div>
                  <span className="text-xs text-slate-500 block">
                    {tr('superadmin.donationProposals.details.subSector') || 'Sous-secteur'}
                  </span>
                  <span className="font-semibold text-white">{proposal.sub_sector}</span>
                </div>
              )}
              {proposal.license && (
                <div className="sm:col-span-2">
                  <span className="text-xs text-slate-500 block">
                    {tr('superadmin.donationProposals.details.license') || 'Agrément / Licence'}
                  </span>
                  <span className="font-mono text-xs bg-slate-800 px-2.5 py-1 rounded text-slate-200">
                    {proposal.license}
                  </span>
                </div>
              )}
              {proposal.organization_type && (
                <div>
                  <span className="text-xs text-slate-500 block">
                    {tr('superadmin.donationProposals.details.orgType') || "Type d'organisation"}
                  </span>
                  <span className="text-white">{proposal.organization_type}</span>
                </div>
              )}
              {proposal.regulation_declaration && (
                <div>
                  <span className="text-xs text-slate-500 block">
                    {tr('superadmin.donationProposals.details.regulatedActivity') || 'Activité réglementée déclarée'}
                  </span>
                  <span className="text-white">
                    {proposal.regulation_declaration === 'yes'
                      ? (tr('superadmin.donationProposals.details.regulatedYes') || 'Oui')
                      : (tr('superadmin.donationProposals.details.regulatedNo') || 'Non')}
                  </span>
                </div>
              )}
              {proposal.other_sector_details && (
                <div className="sm:col-span-2">
                  <span className="text-xs text-slate-500 block">
                    {tr('superadmin.donationProposals.details.sectorDetails') || 'Détails secteur'}
                  </span>
                  <span className="text-slate-200">{proposal.other_sector_details}</span>
                </div>
              )}
            </div>
          </div>

          {/* Description du Projet & Type de Soutien */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              <span>{tr('superadmin.donationProposals.details.proposalSection') || 'Proposition de soutien'}</span>
            </h3>

            <div>
              <span className="text-xs text-slate-500 block mb-1">
                {tr('superadmin.donationProposals.details.supportType') || 'Type de soutien envisagé'}
              </span>
              <span className="inline-block px-3 py-1 rounded-lg text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {supportTypeLabel}
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-500 block mb-1.5">
                {tr('superadmin.donationProposals.details.projectDescription') || 'Description détaillée du projet'}
              </span>
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm whitespace-pre-wrap leading-relaxed font-sans">
                {proposal.project_description}
              </div>
            </div>
          </div>

          {/* Notes internes administratives (Lecture seule) */}
          {proposal.internal_notes && (
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <span>{tr('superadmin.donationProposals.details.internalNotesSection') || 'Notes internes de révision'}</span>
              </h3>
              <p className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-sm italic">
                "{proposal.internal_notes}"
              </p>
            </div>
          )}

          {/* Historique chronologique d'audit */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>
                  {tr('superadmin.donationProposals.details.auditTrailSection', { count: proposal.audit_trail.length }) ||
                    `Journal d'audit administratif (${proposal.audit_trail.length})`}
                </span>
              </h3>
              <span className="text-[11px] text-slate-500">
                {tr('superadmin.donationProposals.details.appendOnly') || 'Append-only'}
              </span>
            </div>

            {proposal.audit_trail.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">
                {tr('superadmin.donationProposals.details.auditEmpty') || "Aucune modification d'état enregistrée pour cette proposition."}
              </p>
            ) : (
              <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {proposal.audit_trail.map((log) => {
                  const oldLabel = getStatusLabel(log.old_status, tr);
                  const newLabel = getStatusLabel(log.new_status, tr);

                  return (
                    <div key={log.id} className="relative space-y-1">
                      {/* Pastille timeline */}
                      <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-slate-900" />

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-semibold text-white">
                          {oldLabel} → {newLabel}
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-400">
                          {tr('superadmin.donationProposals.details.byActor', { actor: log.actor_name }) || (
                            <>Par <span className="font-medium text-slate-300">{log.actor_name}</span></>
                          )}
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-400">{formatDate(log.created_at)}</span>
                      </div>

                      {log.note && (
                        <p className="text-xs text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 mt-1.5 italic">
                          "{log.note}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Horodatages techniques */}
          <div className="pt-2 text-xs text-slate-500 flex flex-wrap gap-x-6 gap-y-1">
            <span>
              {tr('superadmin.donationProposals.details.createdOn', { date: formatDate(proposal.created_at) }) || `Créée le : ${formatDate(proposal.created_at)}`}
            </span>
            <span>
              {tr('superadmin.donationProposals.details.updatedOn', { date: formatDate(proposal.updated_at) }) || `Dernière modification : ${formatDate(proposal.updated_at)}`}
            </span>
            {proposal.reviewed_at && (
              <span>
                {tr('superadmin.donationProposals.details.reviewedOn', { date: formatDate(proposal.reviewed_at) }) || `Révisée le : ${formatDate(proposal.reviewed_at)}`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
