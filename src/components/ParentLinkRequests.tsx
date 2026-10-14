import React, { useState, useEffect, useCallback } from 'react';
import { parentApi, ParentLinkRequest } from '../services/parentApi';
import { useStore } from '../store/useStore';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Building2,
  GraduationCap,
  Calendar,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';

export interface ParentLinkRequestsProps {
  className?: string;
  refreshTrigger?: number; // Pour forcer un rafraîchissement depuis le composant parent
}

export const ParentLinkRequests: React.FC<ParentLinkRequestsProps> = ({ className = '', refreshTrigger = 0 }) => {
  const user = useStore((s) => s.user);
  const isParent = user?.role === 'parent';

  const [requests, setRequests] = useState<ParentLinkRequest[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const limit = 10;

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchRequests = useCallback(async (isSilent = false) => {
    if (!isParent) {
      setLoading(false);
      return;
    }

    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setErrorMessage(null);

    try {
      const data = await parentApi.getLinkRequests(page, limit);
      setRequests(data.requests || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      console.error('[ParentLinkRequests] Erreur chargement demandes:', err);
      setErrorMessage(
        err?.error ||
        err?.message ||
        'Impossible de charger vos demandes de rattachement. Veuillez vérifier votre connexion.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isParent, page, limit]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests, refreshTrigger]);

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy à HH:mm');
    } catch {
      return dateStr;
    }
  };

  if (!isParent) {
    return null;
  }

  // Si aucune demande et chargement terminé sans erreur, on n'encombre pas l'écran inutilement
  if (!loading && requests.length === 0 && !errorMessage) {
    return null;
  }

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-[28px] p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-5 ${className}`}>
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
              Mes demandes de rattachement
            </h3>
            <p className="text-xs text-slate-400">
              Suivi en temps réel de vos demandes transmises aux établissements scolaires.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchRequests(false)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 px-3 py-1.5 self-start sm:self-auto bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
          title="Actualiser le statut de mes demandes"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Erreur réseau ou serveur */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchRequests(false)}
            className="text-red-700 underline font-semibold hover:text-red-900 ml-2 shrink-0"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* État de chargement initial */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-10">
          <Loader2 className="w-7 h-7 animate-spin text-blue-600 mb-2" />
          <p className="text-xs text-slate-400">Chargement de vos demandes de rattachement...</p>
        </div>
      ) : (
        /* Liste des demandes */
        <div className="space-y-3">
          {requests.map((req) => {
            const isPending = req.status === 'pending' || req.status === 'pending_verification';
            const isApproved = req.status === 'approved';
            const isRejected = req.status === 'rejected';
            const isRevoked = req.status === 'revoked';

            return (
              <div
                key={req.id}
                className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/70"
              >
                {/* Infos principales : Élève et Établissement */}
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4 text-blue-600 shrink-0" />
                      {req.student_name || 'Élève non renseigné'}
                    </span>
                    {req.student_class && (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                        Classe : {req.student_class}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <strong className="font-semibold text-slate-700 dark:text-slate-300">
                        {req.school_name || req.school_slug}
                      </strong>
                    </span>

                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      Demandé le {formatDate(req.requested_at)}
                    </span>
                  </div>

                  {/* Motif de rejet explicite (uniquement si rejected et présent) */}
                  {isRejected && req.rejection_reason && (
                    <div className="mt-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl p-3 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-rose-900 dark:text-rose-100">
                          Motif communiqué par l'établissement :
                        </p>
                        <p className="mt-0.5">{req.rejection_reason}</p>
                      </div>
                    </div>
                  )}

                  {/* Message informatif pour les demandes en attente */}
                  {isPending && (
                    <p className="text-[11px] text-slate-400 italic flex items-center gap-1">
                      <Info className="w-3 h-3 shrink-0" />
                      L'accès au suivi scolaire sera actif dès l'approbation formelle de la direction.
                    </p>
                  )}
                </div>

                {/* Badge de statut */}
                <div className="shrink-0 self-start md:self-center">
                  {isApproved && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approuvée
                    </span>
                  )}

                  {isRejected && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                      <XCircle className="w-3.5 h-3.5" />
                      Rejetée
                    </span>
                  )}

                  {isPending && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                      <Clock className="w-3.5 h-3.5" />
                      {req.status === 'pending_verification' ? 'En vérification' : 'En attente'}
                    </span>
                  )}

                  {isRevoked && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                      <XCircle className="w-3.5 h-3.5" />
                      Révoquée
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination si total > limit */}
      {total > limit && (
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
          <span>
            {requests.length} sur {total} demande{total > 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Précédent</span>
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * limit >= total || loading}
              className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 flex items-center gap-1"
            >
              <span>Suivant</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
