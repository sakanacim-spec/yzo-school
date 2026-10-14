import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import {
  directorApi,
  DirectorLinkRequest,
  DirectorApiError,
} from '../services/directorApi';
import {
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  User,
  GraduationCap,
  Calendar,
  ShieldAlert,
} from 'lucide-react';
import { format } from 'date-fns';

const ALLOWED_ROLES = ['admin', 'directeur', 'directeur_general'];

export interface DirectorLinkRequestsProps {
  onCountChange?: (count: number) => void;
}

export const DirectorLinkRequests: React.FC<DirectorLinkRequestsProps> = ({ onCountChange }) => {
  const user = useStore((s) => s.user);

  // Vérification de sécurité des rôles autorisés (comptable et autres rôles strictement exclus)
  const isAuthorized = user?.role && ALLOWED_ROLES.includes(user.role);

  const [requests, setRequests] = useState<DirectorLinkRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Protection contre les doubles soumissions pendant une opération
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Modales d'action
  const [approvingRequest, setApprovingRequest] = useState<DirectorLinkRequest | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<DirectorLinkRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionReasonCode, setRejectionReasonCode] = useState('OTHER');
  const [reasonFieldError, setReasonFieldError] = useState<string | null>(null);

  const fetchRequests = useCallback(async (isSilent = false, preserveError = false) => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }

    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    if (!preserveError) {
      setErrorMessage(null);
    }

    try {
      const data = await directorApi.listRequests(page, limit);
      setRequests(data.requests || []);
      setTotal(data.total || 0);
      if (onCountChange) {
        onCountChange(data.total || 0);
      }
    } catch (err: any) {
      console.error('[DirectorLinkRequests] Erreur chargement demandes:', err);
      const msg = err instanceof DirectorApiError
        ? err.message
        : "Impossible de joindre le serveur pour charger les demandes.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthorized, page, limit, onCountChange]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Exécution de l'approbation confirmée
  const handleConfirmApprove = async () => {
    if (!approvingRequest || actionInProgressId) return;

    const reqId = approvingRequest.id;
    setActionInProgressId(reqId);
    setErrorMessage(null);
    setSuccessBanner(null);

    try {
      const res = await directorApi.approveRequest(reqId);
      setApprovingRequest(null);
      const isAlready = res.status === 'already_approved';
      setSuccessBanner(
        isAlready
          ? `La demande a été validée (déjà approuvée antérieurement).`
          : `Demande de rattachement approuvée avec succès.`
      );
      await fetchRequests(true);
    } catch (err: any) {
      console.error('[DirectorLinkRequests] Erreur approbation:', err);
      if (err instanceof DirectorApiError) {
        if (err.status === 409) {
          setErrorMessage(err.message);
          setApprovingRequest(null);
          await fetchRequests(true, true);
          return;
        }
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Une erreur réseau est survenue lors de l'approbation. Veuillez réessayer.");
      }
    } finally {
      setActionInProgressId(null);
    }
  };

  // Exécution du rejet confirmé
  const handleConfirmReject = async () => {
    if (!rejectingRequest || actionInProgressId) return;

    const trimmedReason = rejectionReason.trim();
    if (!trimmedReason) {
      setReasonFieldError('Le motif de rejet est obligatoire et ne peut pas être vide.');
      return;
    }

    const reqId = rejectingRequest.id;
    setActionInProgressId(reqId);
    setErrorMessage(null);
    setSuccessBanner(null);
    setReasonFieldError(null);

    try {
      await directorApi.rejectRequest(reqId, trimmedReason, rejectionReasonCode);
      setRejectingRequest(null);
      setRejectionReason('');
      setRejectionReasonCode('OTHER');
      setSuccessBanner('La demande de rattachement a été rejetée.');
      await fetchRequests(true);
    } catch (err: any) {
      console.error('[DirectorLinkRequests] Erreur rejet:', err);
      if (err instanceof DirectorApiError) {
        if (err.status === 409) {
          setErrorMessage(err.message);
          setRejectingRequest(null);
          await fetchRequests(true, true);
          return;
        }
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Une erreur réseau est survenue lors du rejet. Veuillez réessayer.");
      }
    } finally {
      setActionInProgressId(null);
    }
  };

  const openRejectModal = (request: DirectorLinkRequest) => {
    setRejectingRequest(request);
    setRejectionReason('');
    setRejectionReasonCode('OTHER');
    setReasonFieldError(null);
    setErrorMessage(null);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy à HH:mm');
    } catch {
      return dateStr;
    }
  };

  // Écran d'accès refusé si rôle non autorisé
  if (!isAuthorized) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-800 mb-2">Accès restreint</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          La gestion des approbations de rattachement est strictement réservée à la direction de l'établissement.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête et actions rapides */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">
            Demandes de rattachement parent-élève
          </h3>
          <p className="text-sm text-slate-500">
            {total} demande{total > 1 ? 's' : ''} en attente de vérification pour votre établissement.
          </p>
        </div>

        <button
          onClick={() => fetchRequests(false)}
          disabled={loading || refreshing || !!actionInProgressId}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
          title="Actualiser la liste des demandes"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Messages de succès et d'erreur */}
      {successBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-600 hover:text-red-800 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* État de chargement initial */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
          <p className="text-sm text-slate-500">Chargement des demandes de rattachement...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="py-16 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-400 opacity-60" />
          <h4 className="text-base font-semibold text-slate-700 mb-1">Aucune demande en attente</h4>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Toutes les demandes de rattachement de votre établissement ont été traitées.
          </p>
        </div>
      ) : (
        /* Liste des demandes */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requests.map((req) => {
            const isProcessing = actionInProgressId === req.id;
            const isPending = req.status === 'pending' || req.status === 'pending_verification';

            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Badge statut et date */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-50 pb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        req.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : req.status === 'rejected'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {req.status === 'approved' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approuvée
                        </>
                      ) : req.status === 'rejected' ? (
                        <>
                          <XCircle className="w-3.5 h-3.5" /> Rejetée
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5" /> En attente
                        </>
                      )}
                    </span>

                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(req.requested_at)}
                    </span>
                  </div>

                  {/* Informations Parent et Élève */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-400 font-medium">Parent demandeur</p>
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {req.parent_name || 'Parent non renseigné'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
                        <GraduationCap className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-400 font-medium">Élève concerné</p>
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {req.student_name || 'Élève non renseigné'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Boutons d'action unitaire */}
                <div className="pt-4 mt-4 border-t border-slate-50 flex items-center justify-end gap-2">
                  {isPending ? (
                    <>
                      <button
                        onClick={() => openRejectModal(req)}
                        disabled={isProcessing || !!actionInProgressId}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors disabled:opacity-50"
                        title="Rejeter la demande"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Rejeter</span>
                      </button>

                      <button
                        onClick={() => setApprovingRequest(req)}
                        disabled={isProcessing || !!actionInProgressId}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
                        title="Approuver le rattachement"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Approuver</span>
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      Demande clôturée ({req.status})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination simple si applicable */}
      {total > limit && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-sm text-slate-500">
          <span>
            Page {page} sur {Math.ceil(total / limit)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * limit >= total || loading}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {/* Modale de Confirmation d'Approbation */}
      {approvingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <Check className="w-6 h-6" />
            </div>

            <h4 className="text-lg font-bold text-slate-900 mb-2">
              Confirmer l'approbation du rattachement
            </h4>

            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              Vous êtes sur le point de valider le rattachement de l'élève{' '}
              <strong className="text-slate-900 font-semibold">{approvingRequest.student_name}</strong>{' '}
              au compte du parent{' '}
              <strong className="text-slate-900 font-semibold">{approvingRequest.parent_name}</strong>.
            </p>

            <div className="bg-slate-50 rounded-2xl p-3.5 mb-5 text-xs text-slate-500 space-y-1">
              <p>• Le parent aura accès au suivi scolaire de cet élève.</p>
              <p>• Cette opération est tracée au nom de votre compte directeur.</p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setApprovingRequest(null)}
                disabled={!!actionInProgressId}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmApprove}
                disabled={!!actionInProgressId}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {actionInProgressId === approvingRequest.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Approbation...</span>
                  </>
                ) : (
                  <span>Confirmer l'approbation</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de Rejet avec Motif Obligatoire */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <X className="w-6 h-6" />
            </div>

            <h4 className="text-lg font-bold text-slate-900 mb-1">
              Rejeter la demande de rattachement
            </h4>
            <p className="text-sm text-slate-500 mb-4">
              Indiquez le motif précis pour lequel la demande de{' '}
              <strong className="text-slate-700 font-semibold">{rejectingRequest.parent_name}</strong>{' '}
              concernant l'élève{' '}
              <strong className="text-slate-700 font-semibold">{rejectingRequest.student_name}</strong> est rejetée.
            </p>

            {/* Suggestions de motifs fréquents */}
            <div className="space-y-1.5 mb-3">
              <label className="text-xs font-medium text-slate-500">
                Motifs fréquents (sélection rapide) :
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Informations d’identité non concordantes', code: 'IDENTITY_MISMATCH' },
                  { label: 'Élève non inscrit dans l’établissement', code: 'STUDENT_NOT_ENROLLED' },
                  { label: 'Demande en doublon', code: 'DUPLICATE_REQUEST' },
                ].map((sug) => (
                  <button
                    key={sug.code}
                    type="button"
                    onClick={() => {
                      setRejectionReason(sug.label);
                      setRejectionReasonCode(sug.code);
                      setReasonFieldError(null);
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    {sug.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Zone de texte obligatoire */}
            <div className="space-y-1.5 mb-5">
              <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>Motif de rejet (obligatoire) *</span>
                <span className="text-slate-400 font-normal">{rejectionReason.length} caractères</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => {
                  setRejectionReason(e.target.value);
                  if (reasonFieldError) setReasonFieldError(null);
                }}
                rows={3}
                placeholder="Expliquez la raison du rejet..."
                className={`w-full p-3 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all ${
                  reasonFieldError
                    ? 'border-rose-300 focus:ring-rose-500 bg-rose-50/30'
                    : 'border-slate-200 focus:ring-blue-500'
                }`}
              />
              {reasonFieldError && (
                <p className="text-xs font-medium text-rose-600">{reasonFieldError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectingRequest(null)}
                disabled={!!actionInProgressId}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={!rejectionReason.trim() || !!actionInProgressId}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {actionInProgressId === rejectingRequest.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Rejet en cours...</span>
                  </>
                ) : (
                  <span>Confirmer le rejet</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
