// src/pages/superadmin/DonationProposalsManagement.tsx
// Vue SuperAdmin complète de gestion, filtrage, consultation et transition des propositions de mécénat.
// Entièrement internationalisée avec le système i18n existant.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Filter, RefreshCw, Eye, AlertTriangle, CheckCircle2,
  XCircle, ChevronLeft, ChevronRight, Inbox, Loader2, Building2,
  Calendar, MapPin
} from 'lucide-react';
import type {
  DonationProposalItem,
  DonationProposalDetail,
  DonationProposalStatus
} from '../../types/donationProposalAdmin.ts';
import {
  DONATION_PROPOSAL_STATUSES,
  STATUS_METADATA,
  OFFICIAL_SECTORS,
  getStatusLabel
} from '../../types/donationProposalAdmin.ts';
import {
  donationProposalAdminApi,
  StatusConflictError,
  InvalidTransitionError,
  ProposalNotFoundError,
  UnauthorizedError,
  ForbiddenError
} from '../../services/donationProposalAdminApi.ts';
import { DonationProposalDetails } from './donationProposals/DonationProposalDetails.tsx';
import { DonationStatusDialog } from './donationProposals/DonationStatusDialog.tsx';
import { getCountryName } from '../../data/countries.ts';
import { useStore } from '../../store/useStore.ts';
import { t } from '../../i18n/index.ts';
import type { Language } from '../../i18n/index.ts';

export const DonationProposalsManagement: React.FC = () => {
  const { language, logout } = useStore();
  const tr = useCallback((key: string, vars?: any) => t(language as Language, key, vars), [language]);

  // États de liste et pagination
  const [items, setItems] = useState<DonationProposalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  // Filtres
  const [statusFilter, setStatusFilter] = useState<DonationProposalStatus | ''>('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // États de chargement et alertes
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fiche détaillée
  const [selectedProposal, setSelectedProposal] = useState<DonationProposalDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Dialogue de transition
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<DonationProposalStatus | null>(null);
  const [isSubmittingTransition, setIsSubmittingTransition] = useState(false);

  // Références pour la gestion des requêtes, le focus et le cycle de vie
  const isMountedRef = useRef(true);
  const lastRequestIdRef = useRef(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

  // Temporisation (debounce) de la recherche à 300 ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setOffset(0); // Réinitialisation de la pagination lors d'une nouvelle recherche
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Chargement des données de la liste
  const fetchProposals = useCallback(async () => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;
    const currentRequestId = ++lastRequestIdRef.current;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await donationProposalAdminApi.getProposals(
        {
          status: statusFilter,
          sector: sectorFilter,
          search: debouncedSearch,
          limit,
          offset
        },
        abortController.signal
      );

      // Protection contre les réponses désynchronisées ou composant démonté
      if (!isMountedRef.current || currentRequestId !== lastRequestIdRef.current) {
        return;
      }

      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      if (!isMountedRef.current || currentRequestId !== lastRequestIdRef.current) {
        return;
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        return; // Requête annulée normalement
      }

      if (err instanceof UnauthorizedError) {
        logout();
        return;
      }

      if (err instanceof ForbiddenError) {
        setErrorMsg(tr('superadmin.donationProposals.messages.forbidden') || 'Accès refusé. Vos droits SuperAdmin ne sont plus valides.');
        return;
      }

      setErrorMsg(tr('superadmin.donationProposals.messages.loadError') || 'Impossible de charger les propositions de mécénat. Veuillez réessayer.');
    } finally {
      if (isMountedRef.current && currentRequestId === lastRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [statusFilter, sectorFilter, debouncedSearch, limit, offset, logout, tr]);

  // Cycle de vie : chargement initial et démontage
  useEffect(() => {
    isMountedRef.current = true;
    fetchProposals();

    return () => {
      isMountedRef.current = false;
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
    };
  }, [fetchProposals]);

  // Consultation d'une proposition
  const handleOpenDetails = async (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    triggerButtonRef.current = e.currentTarget;
    setIsLoadingDetail(true);
    setErrorMsg(null);

    try {
      const detail = await donationProposalAdminApi.getProposalById(id);
      if (!isMountedRef.current) return;

      setSelectedProposal(detail);
      setIsDetailsOpen(true);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;

      if (err instanceof ProposalNotFoundError) {
        await fetchProposals();
        if (isMountedRef.current) {
          setErrorMsg(tr('superadmin.donationProposals.messages.proposalNotFound') || 'Cette proposition n\'existe plus ou n\'est plus disponible.');
        }
      } else if (err instanceof UnauthorizedError) {
        logout();
      } else {
        setErrorMsg(tr('superadmin.donationProposals.messages.loadError') || 'Erreur lors du chargement de la proposition.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingDetail(false);
      }
    }
  };

  // Fermeture de la fiche détaillée et restitution du focus
  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
    setSelectedProposal(null);
    setTimeout(() => {
      triggerButtonRef.current?.focus();
    }, 50);
  };

  // Déclenchement du flux de transition
  const handleInitiateTransition = (target: DonationProposalStatus) => {
    setTargetStatus(target);
    setIsStatusDialogOpen(true);
  };

  // Confirmation de la transition de statut
  const isSubmittingTransitionRef = useRef(false);
  const handleConfirmTransition = async (note: string | null) => {
    if (!selectedProposal || !targetStatus || isSubmittingTransition || isSubmittingTransitionRef.current) return;

    isSubmittingTransitionRef.current = true;
    setIsSubmittingTransition(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await donationProposalAdminApi.updateProposalStatus(selectedProposal.id, {
        expected_status: selectedProposal.status,
        new_status: targetStatus,
        note
      });

      if (!isMountedRef.current) return;

      const targetLabel = getStatusLabel(targetStatus, tr);
      setSuccessMsg(
        tr('superadmin.donationProposals.messages.statusUpdated', { status: targetLabel }) ||
        `Statut mis à jour avec succès vers « ${targetLabel} ».`
      );

      // Fermeture du dialogue
      setIsStatusDialogOpen(false);
      setTargetStatus(null);

      // Rechargement des données fraîches
      const freshDetail = await donationProposalAdminApi.getProposalById(selectedProposal.id);
      if (isMountedRef.current) {
        setSelectedProposal(freshDetail);
        await fetchProposals();
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;

      if (err instanceof StatusConflictError) {
        setIsStatusDialogOpen(false);
        setTargetStatus(null);

        // Rechargement immédiat pour aligner l'état
        try {
          const freshDetail = await donationProposalAdminApi.getProposalById(selectedProposal.id);
          if (isMountedRef.current) setSelectedProposal(freshDetail);
        } catch (_) {
          setIsDetailsOpen(false);
        }
        await fetchProposals();

        if (isMountedRef.current) {
          setErrorMsg(
            tr('superadmin.donationProposals.messages.statusConflict') ||
            'Conflit d\'état : cette proposition a été modifiée en parallèle par un autre administrateur. Les données ont été actualisées.'
          );
        }
      } else if (err instanceof InvalidTransitionError) {
        setErrorMsg(
          tr('superadmin.donationProposals.messages.invalidTransition') ||
          'Transition de statut non autorisée pour cette proposition.'
        );
      } else if (err instanceof ProposalNotFoundError) {
        setIsStatusDialogOpen(false);
        setIsDetailsOpen(false);
        await fetchProposals();

        if (isMountedRef.current) {
          setErrorMsg(
            tr('superadmin.donationProposals.messages.proposalNotFound') ||
            'Cette proposition n\'existe plus.'
          );
        }
      } else if (err instanceof UnauthorizedError) {
        logout();
      } else {
        setErrorMsg(
          tr('superadmin.donationProposals.messages.genericError') ||
          'Une erreur est survenue lors du changement de statut.'
        );
      }
    } finally {
      isSubmittingTransitionRef.current = false;
      if (isMountedRef.current) {
        setIsSubmittingTransition(false);
      }
    }
  };

  // Calculs de pagination
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Région d'accessibilité pour les annonces live */}
      <div className="sr-only" aria-live="polite" role="status">
        {successMsg || errorMsg}
      </div>

      {/* En-tête et statistiques rapides */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3">
            <span>🤝 {tr('superadmin.donationProposals.title') || 'Propositions de mécénat & dons'}</span>
            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-bold border border-blue-500/30">
              {tr('superadmin.donationProposals.totalBadge', { total }) || `${total} dossier${total > 1 ? 's' : ''}`}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {tr('superadmin.donationProposals.subtitle') || 'Examen administratif, validation de partenariat et suivi d\'audit append-only.'}
          </p>
        </div>

        <button
          type="button"
          onClick={fetchProposals}
          disabled={isLoading}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-all flex items-center gap-2 self-start sm:self-auto disabled:opacity-50"
          aria-label={tr('superadmin.donationProposals.refreshAria') || 'Actualiser les propositions tout en conservant les filtres actifs'}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{tr('superadmin.donationProposals.refresh') || 'Actualiser'}</span>
        </button>
      </div>

      {/* Bannières d'alerte / feedback */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-400/80 hover:text-emerald-300 p-1"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchProposals}
              className="px-3 py-1 bg-rose-600/30 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold transition-all"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-rose-400/80 hover:text-rose-300 p-1"
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Barre de contrôle : recherche et filtres */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4">
        {/* Recherche textuelle */}
        <div>
          <label htmlFor="search-proposals" className="text-xs font-semibold text-slate-400 block mb-1">
            {tr('superadmin.donationProposals.searchLabel') || 'Recherche'}
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="search-proposals"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={tr('superadmin.donationProposals.searchPlaceholder') || 'Réf, entreprise, nom...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Filtre par statut */}
        <div>
          <label htmlFor="filter-status" className="text-xs font-semibold text-slate-400 block mb-1">
            {tr('superadmin.donationProposals.statusFilterLabel') || 'Statut'}
          </label>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as DonationProposalStatus | '');
              setOffset(0);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{tr('superadmin.donationProposals.allStatuses') || 'Tous les statuts'}</option>
            {DONATION_PROPOSAL_STATUSES.map((st) => (
              <option key={st} value={st}>
                {getStatusLabel(st, tr)}
              </option>
            ))}
          </select>
        </div>

        {/* Filtre par secteur */}
        <div>
          <label htmlFor="filter-sector" className="text-xs font-semibold text-slate-400 block mb-1">
            {tr('superadmin.donationProposals.sectorFilterLabel') || 'Secteur'}
          </label>
          <select
            id="filter-sector"
            value={sectorFilter}
            onChange={(e) => {
              setSectorFilter(e.target.value);
              setOffset(0);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{tr('superadmin.donationProposals.allSectors') || 'Tous les secteurs'}</option>
            {OFFICIAL_SECTORS.map((sec) => (
              <option key={sec.value} value={sec.value}>
                {sec.label}
              </option>
            ))}
          </select>
        </div>

        {/* Taille de page */}
        <div>
          <label htmlFor="filter-limit" className="text-xs font-semibold text-slate-400 block mb-1">
            {tr('superadmin.donationProposals.perPageLabel') || 'Par page'}
          </label>
          <select
            id="filter-limit"
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value, 10));
              setOffset(0);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={10}>{tr('superadmin.donationProposals.perPageOption', { count: 10 }) || '10 par page'}</option>
            <option value={20}>{tr('superadmin.donationProposals.perPageOption', { count: 20 }) || '20 par page'}</option>
            <option value={50}>{tr('superadmin.donationProposals.perPageOption', { count: 50 }) || '50 par page'}</option>
          </select>
        </div>
      </div>

      {/* Tableau des propositions */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="text-sm font-medium">
              {tr('superadmin.donationProposals.loading') || 'Chargement des propositions de mécénat...'}
            </span>
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Inbox className="w-12 h-12 text-slate-600 stroke-[1.5]" />
            <p className="text-base font-semibold text-slate-300">
              {tr('superadmin.donationProposals.emptyTitle') || 'Aucune proposition trouvée'}
            </p>
            <p className="text-xs text-slate-500">
              {statusFilter || sectorFilter || debouncedSearch
                ? (tr('superadmin.donationProposals.emptySearchHelp') || 'Essayez de modifier ou réinitialiser vos critères de recherche.')
                : (tr('superadmin.donationProposals.emptyNoneHelp') || 'Aucune proposition de don n\'a encore été soumise par des partenaires.')}
            </p>
            {(statusFilter || sectorFilter || debouncedSearch) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('');
                  setSectorFilter('');
                  setSearchInput('');
                  setOffset(0);
                }}
                className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all"
              >
                {tr('superadmin.donationProposals.resetFilters') || 'Réinitialiser les filtres'}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">{tr('superadmin.donationProposals.table.reference') || 'Référence'}</th>
                  <th className="py-3.5 px-4">{tr('superadmin.donationProposals.table.companyAndContact') || 'Entreprise & Porteur'}</th>
                  <th className="py-3.5 px-4">{tr('superadmin.donationProposals.table.sector') || 'Secteur'}</th>
                  <th className="py-3.5 px-4">{tr('superadmin.donationProposals.table.country') || 'Pays'}</th>
                  <th className="py-3.5 px-4">{tr('superadmin.donationProposals.table.status') || 'Statut'}</th>
                  <th className="py-3.5 px-4">{tr('superadmin.donationProposals.table.receivedOn') || 'Reçue le'}</th>
                  <th className="py-3.5 px-4 text-right">{tr('superadmin.donationProposals.table.action') || 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
                {items.map((item) => {
                  const meta = STATUS_METADATA[item.status];
                  const statusLabel = getStatusLabel(item.status, tr);
                  const secObj = OFFICIAL_SECTORS.find((s) => s.value === item.sector);
                  const displaySector = secObj ? secObj.label : item.sector;

                  let createdDateStr = '—';
                  try {
                    createdDateStr = new Intl.DateTimeFormat('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    }).format(new Date(item.created_at));
                  } catch (_) {}

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Référence */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-white bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
                          {item.reference}
                        </span>
                      </td>

                      {/* Entreprise & Contact */}
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-white text-sm">{item.company_name}</p>
                        <p className="text-slate-400 text-[11px]">
                          {item.full_name} <span className="text-slate-500">({item.role})</span>
                        </p>
                      </td>

                      {/* Secteur */}
                      <td className="py-3.5 px-4 max-w-xs truncate" title={displaySector}>
                        <span className="text-slate-200">{displaySector}</span>
                        {item.sub_sector && (
                          <span className="block text-[10px] text-slate-500">
                            {tr('superadmin.donationProposals.table.subSector', { sub: item.sub_sector }) || `Sous-secteur : ${item.sub_sector}`}
                          </span>
                        )}
                      </td>

                      {/* Pays */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-slate-500" />
                          {getCountryName(item.country)}
                        </span>
                      </td>

                      {/* Statut */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta.badgeClass}`}>
                          {statusLabel}
                        </span>
                      </td>

                      {/* Date de réception */}
                      <td className="py-3.5 px-4 text-slate-400">
                        {createdDateStr}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => handleOpenDetails(item.id, e)}
                          disabled={isLoadingDetail}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                          aria-label={tr('superadmin.donationProposals.table.viewAria', { ref: item.reference }) || `Consulter la proposition ${item.reference}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{tr('superadmin.donationProposals.table.view') || 'Consulter'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Barre de pagination */}
        {!isLoading && total > 0 && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              {tr('superadmin.donationProposals.pagination.displaying', {
                from: offset + 1,
                to: Math.min(offset + limit, total),
                total
              }) || (
                <>
                  Affichage de <span className="text-white font-bold">{offset + 1}</span> à{' '}
                  <span className="text-white font-bold">{Math.min(offset + limit, total)}</span> sur{' '}
                  <span className="text-white font-bold">{total}</span> propositions
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="mr-2">
                {tr('superadmin.donationProposals.pagination.pageInfo', { current: currentPage, total: totalPages }) || (
                  <>Page <span className="font-bold text-white">{currentPage}</span> sur {totalPages}</>
                )}
              </span>
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={!hasPrev || isLoading}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                aria-label={tr('superadmin.donationProposals.pagination.previousAria') || 'Page précédente'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setOffset(offset + limit)}
                disabled={!hasNext || isLoading}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                aria-label={tr('superadmin.donationProposals.pagination.nextAria') || 'Page suivante'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Volet latéral de détail */}
      <DonationProposalDetails
        proposal={selectedProposal}
        isOpen={isDetailsOpen}
        onClose={handleCloseDetails}
        onInitiateTransition={handleInitiateTransition}
      />

      {/* Dialogue de confirmation de changement de statut */}
      {selectedProposal && targetStatus && (
        <DonationStatusDialog
          isOpen={isStatusDialogOpen}
          onClose={() => setIsStatusDialogOpen(false)}
          onConfirm={handleConfirmTransition}
          currentStatus={selectedProposal.status}
          targetStatus={targetStatus}
          reference={selectedProposal.reference}
          isSubmitting={isSubmittingTransition}
        />
      )}
    </div>
  );
};
