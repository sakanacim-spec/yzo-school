// src/pages/superadmin/donationProposals/DonationStatusDialog.tsx
// Modale accessible de confirmation de transition de statut avec note d'audit.
// Entièrement internationalisée avec le système i18n existant.

import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import {
  DonationProposalStatus,
  STATUS_METADATA,
  getStatusLabel
} from '../../../types/donationProposalAdmin.ts';
import { useStore } from '../../../store/useStore.ts';
import { t } from '../../../i18n/index.ts';
import type { Language } from '../../../i18n/index.ts';

interface DonationStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (note: string | null) => Promise<void>;
  currentStatus: DonationProposalStatus;
  targetStatus: DonationProposalStatus;
  reference: string;
  isSubmitting: boolean;
}

export const DonationStatusDialog: React.FC<DonationStatusDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentStatus,
  targetStatus,
  reference,
  isSubmitting
}) => {
  const { language } = useStore();
  const tr = (key: string, vars?: any) => t(language as Language, key, vars);

  const [note, setNote] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const isSubmittingRef = useRef(false);

  const currentMeta = STATUS_METADATA[currentStatus];
  const targetMeta = STATUS_METADATA[targetStatus];
  const currentLabel = getStatusLabel(currentStatus, tr);
  const targetLabel = getStatusLabel(targetStatus, tr);

  // Réinitialisation de la note à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setNote('');
      // Focus après ouverture
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Gestion de la touche Échap et piégeage du focus
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const trimmed = note.trim();
    try {
      await onConfirm(trimmed.length > 0 ? trimmed : null);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const charsCount = note.length;
  const isOverLimit = charsCount > 1000;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      aria-modal="true"
      role="dialog"
      aria-labelledby="status-dialog-title"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 id="status-dialog-title" className="text-lg font-bold text-white flex items-center gap-2">
              {tr('superadmin.donationProposals.dialog.title') || 'Changer le statut de la proposition'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {tr('superadmin.donationProposals.dialog.caseRef', { ref: reference }) || `Dossier : ${reference}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            aria-label={tr('superadmin.donationProposals.dialog.closeAria') || 'Fermer la boîte de dialogue'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transition récapitulative */}
        <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>{tr('superadmin.donationProposals.dialog.currentStatus') || 'Statut actuel'}</span>
            <span>{tr('superadmin.donationProposals.dialog.targetStatus') || 'Nouveau statut'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${currentMeta.badgeClass}`}>
              {currentLabel}
            </span>
            <span className="text-slate-500 font-bold">→</span>
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${targetMeta.badgeClass}`}>
              {targetLabel}
            </span>
          </div>
        </div>

        {/* Formulaire de note */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="audit-note-input" className="text-xs font-semibold text-slate-300">
                {tr('superadmin.donationProposals.dialog.noteLabel') || "Note d'audit administratif"}{' '}
                <span className="text-slate-500 font-normal">
                  {tr('superadmin.donationProposals.dialog.optional') || '(facultative)'}
                </span>
              </label>
              <span className={`text-[11px] font-mono ${isOverLimit ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                {charsCount} / 1000
              </span>
            </div>
            <textarea
              id="audit-note-input"
              ref={textareaRef}
              rows={4}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
              placeholder={tr('superadmin.donationProposals.dialog.notePlaceholder') || 'Indiquez la raison ou la référence de la décision administrative...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none disabled:opacity-50"
            />
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {tr('superadmin.donationProposals.dialog.permanentNotice') || "Cette note sera consignée de manière permanente dans le journal d'audit append-only."}
            </p>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {tr('superadmin.donationProposals.dialog.cancel') || 'Annuler'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isOverLimit}
              className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{tr('superadmin.donationProposals.dialog.submitting') || 'Enregistrement...'}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{tr('superadmin.donationProposals.dialog.confirm') || 'Confirmer la transition'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
