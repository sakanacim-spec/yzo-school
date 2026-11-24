import React, { useEffect, useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { isAdminRole } from '../utils/rolePermissions';
import { directorApi, DirectorLinkRequest } from '../services/directorApi';
import {
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  RefreshCw,
  Loader2,
  GraduationCap,
  Users,
  Calendar,
  Clock,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  MessageSquare
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const DemandesRattachement: React.FC = () => {
  const user = useStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [requests, setRequests] = useState<DirectorLinkRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modale de rejet
  const [rejectingRequest, setRejectingRequest] = useState<DirectorLinkRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionCode, setRejectionCode] = useState('OTHER');
  const [rejectionError, setRejectionError] = useState('');

  // Modale de confirmation d'approbation
  const [approvingRequest, setApprovingRequest] = useState<DirectorLinkRequest | null>(null);

  // Modale de révocation
  const [revokingRequest, setRevokingRequest] = useState<DirectorLinkRequest | null>(null);
  const [revocationReason, setRevocationReason] = useState('');
  const [revocationError, setRevocationError] = useState('');

  const isAuthorized = isAdminRole(user?.role);

  const fetchRequests = async (targetPage = page, tab = activeTab) => {
    if (!isAuthorized) return;
    setLoading(true);
    setError(null);
    try {
      const data = tab === 'pending'
        ? await directorApi.listRequests(targetPage, limit)
        : await directorApi.listApprovedRequests(targetPage, limit);
      setRequests(data.requests || []);
      setTotal(data.total || 0);
      setPage(data.page || targetPage);
    } catch (err: any) {
      console.error('Erreur chargement demandes:', err);
      setError(err?.error || 'Erreur lors du chargement des demandes de rattachement.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests(1, activeTab);
  }, [user?.schoolSlug, user?.role, activeTab]);

  const handleTabChange = (tab: 'pending' | 'approved') => {
    if (tab === activeTab || loading) return;
    setActiveTab(tab);
    setSearchTerm('');
    setError(null);
    setSuccessMessage(null);
  };

  const handleApprove = async () => {
    if (!approvingRequest || actionLoading) return;
    const reqId = approvingRequest.id;
    setActionLoading(reqId);
    setError(null);
    setSuccessMessage(null);

    try {
      await directorApi.approveRequest(reqId);
      setSuccessMessage(`La demande de rattachement pour "${approvingRequest.student_name}" a été approuvée avec succès.`);
      setApprovingRequest(null);
      await fetchRequests(page, activeTab);
    } catch (err: any) {
      console.error('Erreur approbation:', err);
      if (err?.error === 'INVALID_STATUS_TRANSITION') {
        setError("Cette demande a déjà été traitée ou n'est plus en attente.");
      } else {
        setError(err?.error || "Erreur lors de l'approbation de la demande.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingRequest || actionLoading) return;
    const trimmedReason = rejectionReason.trim();
    if (!trimmedReason) {
      setRejectionError('Le motif de rejet est obligatoire.');
      return;
    }

    const reqId = rejectingRequest.id;
    setActionLoading(reqId);
    setRejectionError('');
    setError(null);
    setSuccessMessage(null);

    try {
      await directorApi.rejectRequest(reqId, trimmedReason, rejectionCode);
      setSuccessMessage(`La demande de rattachement pour "${rejectingRequest.student_name}" a été rejetée.`);
      setRejectingRequest(null);
      setRejectionReason('');
      setRejectionCode('OTHER');
      await fetchRequests(page, activeTab);
    } catch (err: any) {
      console.error('Erreur rejet:', err);
      if (err?.error === 'INVALID_STATUS_TRANSITION') {
        setError("Cette demande a déjà été traitée ou n'est plus en attente.");
      } else {
        setError(err?.error || 'Erreur lors du rejet de la demande.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async () => {
    if (!revokingRequest || actionLoading) return;
    const trimmedReason = revocationReason.trim();
    if (!trimmedReason) {
      setRevocationError('Le motif de révocation est obligatoire.');
      return;
    }

    const reqId = revokingRequest.id;
    setActionLoading(reqId);
    setRevocationError('');
    setError(null);
    setSuccessMessage(null);

    try {
      await directorApi.revokeRequest(reqId, trimmedReason);
      setSuccessMessage(`Le rattachement pour "${revokingRequest.student_name}" a été révoqué avec succès.`);
      setRevokingRequest(null);
      setRevocationReason('');
      await fetchRequests(page, activeTab);
    } catch (err: any) {
      console.error('Erreur révocation:', err);
      if (err?.error === 'INVALID_STATUS_TRANSITION') {
        setError("Ce rattachement n'est plus actif ou a déjà été révoqué.");
      } else {
        setError(err?.error || 'Erreur lors de la révocation du rattachement.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const filteredRequests = useMemo(() => {
    if (!searchTerm.trim()) return requests;
    const q = searchTerm.toLowerCase().trim();
    return requests.filter(
      (r) =>
        (r.student_name || '').toLowerCase().includes(q) ||
        (r.parent_name || '').toLowerCase().includes(q)
    );
  }, [requests, searchTerm]);

  const totalPages = Math.ceil(total / limit) || 1;

  if (!isAuthorized) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-white rounded-3xl border border-slate-100 shadow-sm text-center">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Accès restreint</h2>
        <p className="text-slate-500 max-w-md text-sm">
          Cette page est réservée aux membres de la direction (Directeur, Directeur Général, Administrateur).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-500/10 text-amber-600 rounded-2xl flex items-center justify-center">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                Demandes de rattachement Parent–Enfant
              </h1>
              <p className="text-sm text-slate-500">
                {activeTab === 'pending'
                  ? `${total} demande${total > 1 ? 's' : ''} en attente de validation pour votre établissement.`
                  : `${total} rattachement${total > 1 ? 's' : ''} actif${total > 1 ? 's' : ''} pour votre établissement.`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par élève ou parent..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
            />
          </div>
          <button
            onClick={() => fetchRequests(page, activeTab)}
            disabled={loading}
            className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors disabled:opacity-50"
            title="Rafraîchir les demandes"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Onglets Navigation ── */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => handleTabChange('pending')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          Demandes en attente
          {activeTab === 'pending' && total > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
              {total}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange('approved')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'approved'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Rattachements actifs
          {activeTab === 'approved' && total > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">
              {total}
            </span>
          )}
        </button>
      </div>

      {/* ── Alertes de succès / erreur ── */}
      {successMessage && (
        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 text-xs font-bold"
          >
            Fermer
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-600 hover:text-rose-800 text-xs font-bold"
          >
            Fermer
          </button>
        </div>
      )}

      {/* ── Liste des demandes ── */}
      {loading && requests.length === 0 ? (
        <div className="min-h-[300px] flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin mb-3" />
          <p className="text-slate-500 text-sm">Chargement des données en cours...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="min-h-[300px] flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-100 shadow-sm text-center">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">
            {searchTerm
              ? 'Aucun résultat trouvé'
              : activeTab === 'pending'
              ? 'Aucune demande en attente'
              : 'Aucun rattachement actif'}
          </h3>
          <p className="text-slate-500 text-sm max-w-md">
            {searchTerm
              ? `Aucune demande ne correspond à "${searchTerm}".`
              : activeTab === 'pending'
              ? 'Toutes les demandes de rattachement parent–enfant pour cet établissement ont été traitées.'
              : 'Aucun rattachement parent–enfant actif répertorié pour cet établissement.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRequests.map((req) => {
              const formattedDate = req.requested_at
                ? (() => {
                    try {
                      return format(new Date(req.requested_at), 'dd MMM yyyy à HH:mm', { locale: fr });
                    } catch {
                      return req.requested_at;
                    }
                  })()
                : 'Date inconnue';

              const isPendingVerification = req.status === 'pending_verification';
              const isApproved = req.status === 'approved';

              return (
                <div
                  key={req.id}
                  className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    {/* Top: Status & Date */}
                    <div className="flex items-center justify-between">
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Actif
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                            isPendingVerification
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          {isPendingVerification ? 'En vérification' : 'En attente'}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formattedDate}
                      </span>
                    </div>

                    {/* Student Info */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <GraduationCap className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Élève</p>
                        <p className="font-bold text-slate-800 text-base truncate">{req.student_name || 'Élève inconnu'}</p>
                      </div>
                    </div>

                    {/* Parent Info */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Parent demandeur</p>
                        <p className="font-medium text-slate-700 text-sm truncate">{req.parent_name || 'Parent inconnu'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {activeTab === 'pending' ? (
                    <div className="pt-4 mt-4 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => setApprovingRequest(req)}
                        disabled={actionLoading !== null}
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approuver
                      </button>
                      <button
                        onClick={() => {
                          setRejectingRequest(req);
                          setRejectionReason('');
                          setRejectionError('');
                          setRejectionCode('OTHER');
                        }}
                        disabled={actionLoading !== null}
                        className="flex-1 py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        Rejeter
                      </button>
                    </div>
                  ) : (
                    <div className="pt-4 mt-4 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => {
                          setRevokingRequest(req);
                          setRevocationReason('');
                          setRevocationError('');
                        }}
                        disabled={actionLoading !== null}
                        className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        Révoquer le rattachement
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100">
              <span className="text-xs text-slate-500">
                Page {page} sur {totalPages} ({total} élément{total > 1 ? 's' : ''})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchRequests(page - 1, activeTab)}
                  disabled={page <= 1 || loading}
                  className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => fetchRequests(page + 1, activeTab)}
                  disabled={page >= totalPages || loading}
                  className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modale de Confirmation d'Approbation ── */}
      {approvingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-800">Confirmer l'approbation</h3>
              <p className="text-slate-600 text-sm">
                Souhaitez-vous valider le rattachement de l'élève{' '}
                <span className="font-bold text-slate-800">{approvingRequest.student_name}</span> au parent{' '}
                <span className="font-bold text-slate-800">{approvingRequest.parent_name}</span> ?
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setApprovingRequest(null)}
                disabled={actionLoading !== null}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading !== null}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all shadow-sm shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === approvingRequest.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Validation...
                  </>
                ) : (
                  'Confirmer'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale de Rejet avec Motif Obligatoire ── */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <XCircle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-slate-800">Rejeter la demande de rattachement</h3>
              <p className="text-slate-500 text-xs">
                Élève : <span className="font-bold text-slate-700">{rejectingRequest.student_name}</span> | Parent :{' '}
                <span className="font-bold text-slate-700">{rejectingRequest.parent_name}</span>
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Catégorie du motif
                </label>
                <select
                  value={rejectionCode}
                  onChange={(e) => setRejectionCode(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="OTHER">Autre motif</option>
                  <option value="PHONE_MISMATCH">Numéro de téléphone ne correspondant pas au dossier</option>
                  <option value="UNKNOWN_STUDENT">Élève non identifié ou non inscrit</option>
                  <option value="INCORRECT_IDENTITY">Identité parentale non vérifiée</option>
                  <option value="DUPLICATE_LINK">Rattachement redondant ou contesté</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Motif détaillé (obligatoire) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => {
                    setRejectionReason(e.target.value);
                    if (rejectionError) setRejectionError('');
                  }}
                  rows={3}
                  placeholder="Expliquez la raison du rejet..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                {rejectionError && (
                  <p className="text-rose-600 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {rejectionError}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setRejectingRequest(null)}
                disabled={actionLoading !== null}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading !== null || !rejectionReason.trim()}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition-all shadow-sm shadow-rose-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === rejectingRequest.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Rejet...
                  </>
                ) : (
                  'Confirmer le rejet'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale de Révocation avec Motif Obligatoire ── */}
      {revokingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <XCircle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-slate-800">Révoquer le rattachement</h3>
              <p className="text-slate-500 text-xs">
                Élève : <span className="font-bold text-slate-700">{revokingRequest.student_name}</span> | Parent :{' '}
                <span className="font-bold text-slate-700">{revokingRequest.parent_name}</span>
              </p>
              <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-left mt-2">
                Attention : Cette action administrative dissocie immédiatement l'élève du parent au niveau de cet établissement.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Motif de révocation (obligatoire) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={revocationReason}
                  onChange={(e) => {
                    setRevocationReason(e.target.value);
                    if (revocationError) setRevocationError('');
                  }}
                  rows={3}
                  placeholder="Expliquez la raison administrative de la révocation..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                {revocationError && (
                  <p className="text-rose-600 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {revocationError}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setRevokingRequest(null)}
                disabled={actionLoading !== null}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleRevoke}
                disabled={actionLoading !== null || !revocationReason.trim()}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition-all shadow-sm shadow-rose-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === revokingRequest.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Révocation...
                  </>
                ) : (
                  'Confirmer la révocation'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
