import React, { useState, useEffect } from 'react';
import { personnelApi } from '../services/personnelApi';
import { Users, UserPlus, Trash2, Loader2, Shield } from 'lucide-react';
import { useStore } from '../store/useStore';
import { t, Language } from '../i18n';

export const GestionPersonnel = () => {
  const language = useStore((s) => s.language as Language);
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('superviseur'); // Par défaut surveillant
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchPersonnel = async () => {
    try {
      setLoading(true);
      const data = await personnelApi.getPersonnel();
      setPersonnel(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPersonnel();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!nom || !telephone || !password) {
      setError(t(language, 'common.requiredFields') || 'Tous les champs sont requis.');
      return;
    }

    setSubmitting(true);
    try {
      await personnelApi.createPersonnel({ nom, telephone, password, role });
      setNom('');
      setTelephone('');
      setPassword('');
      await fetchPersonnel();
    } catch (err: any) {
      setError(err?.error || t(language, 'staff.createError') || 'Erreur lors de la création du compte.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t(language, 'staff.deleteConfirm') || "Voulez-vous vraiment supprimer cet agent de l'établissement ?")) return;
    try {
      await personnelApi.deletePersonnel(id);
      await fetchPersonnel();
    } catch (err: any) {
      alert(err?.error || err?.message || t(language, 'staff.deleteError') || "Erreur lors de la suppression.");
    }
  };

  const roleLabel = (r: string) => {
    switch (r) {
      case 'admin': return t(language, 'staff.roleAdmin') || 'Administrateur (Complet)';
      case 'censeur': return t(language, 'staff.roleCensor') || 'Censeur';
      case 'secretaire': return t(language, 'staff.roleSecretary') || 'Secrétaire';
      case 'superviseur': return t(language, 'staff.roleSupervisor') || 'Surveillant (Gardien - Scan)';
      case 'comptable': return t(language, 'staff.roleAccountant') || 'Comptable';
      default: return r;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
      <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-indigo-600" />
        {t(language, 'staff.title') || 'Gestion du Personnel (Comptes Administratifs)'}
      </h3>
      <p className="text-xs text-gray-500 mb-6">
        {t(language, 'staff.description') || 'Créez les accès pour vos collaborateurs. Les Surveillants ont accès au système de scan des cartes et les Censeurs/Admins ont accès aux fonctionnalités avancées.'}
      </p>

      {/* Formulaire de création */}
      <form onSubmit={handleSubmit} className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-4 mb-8">
        <h4 className="text-sm font-semibold text-indigo-800 flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" /> {t(language, 'staff.addStaff') || 'Ajouter un collaborateur'}
        </h4>
        
        {error && <div className="p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 font-medium">{error}</div>}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{t(language, 'staff.fullName') || 'Nom et Prénom'}</label>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder={t(language, 'staff.nameEx') || "Ex: Jean Dupont"} className="w-full text-sm border-gray-200 rounded-lg focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{t(language, 'staff.phoneId') || 'Téléphone (Identifiant)'}</label>
            <input type="text" value={telephone} onChange={e => setTelephone(e.target.value)} placeholder={t(language, 'staff.phoneEx') || "Ex: 90000000"} className="w-full text-sm border-gray-200 rounded-lg focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{t(language, 'staff.password') || 'Mot de passe'}</label>
            <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder={t(language, 'staff.passwordEx') || "Ex: secret123"} className="w-full text-sm border-gray-200 rounded-lg focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">{t(language, 'staff.roleAccess') || "Rôle d'accès"}</label>
            <select value={role} onChange={e => setRole(e.target.value)} className="w-full text-sm border-gray-200 rounded-lg focus:ring-indigo-500 bg-white">
              <option value="superviseur">{t(language, 'staff.roleSupervisorDesc') || 'Surveillant (Scans de cartes uniquement)'}</option>
              <option value="secretaire">{t(language, 'staff.roleSecretaryDesc') || 'Secrétaire (Saisie, Inscriptions, Reçus)'}</option>
              <option value="censeur">{t(language, 'staff.roleCensorDesc') || 'Censeur (Outils académiques)'}</option>
              <option value="comptable">{t(language, 'staff.roleAccountantDesc') || 'Comptable (Finances)'}</option>
              <option value="admin">{t(language, 'staff.roleAdminDesc') || 'Administrateur (Gestion globale)'}</option>
            </select>
          </div>
        </div>
        
        <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition flex items-center gap-2">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {t(language, 'staff.createAccount') || 'Créer le compte'}
        </button>
      </form>

      {/* Liste du personnel */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-gray-400" />
          {t(language, 'staff.existingAccounts') || 'Comptes existants'}
        </h4>
        
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : personnel.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">{t(language, 'staff.noAccounts') || "Aucun point d'accès créé pour le moment."}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {personnel.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl bg-gray-50 hover:bg-white transition-colors">
                <div>
                  <h5 className="text-sm font-bold text-gray-800">{p.nom}</h5>
                  <p className="text-xs text-gray-500">📞 {p.telephone} — <span className="text-indigo-600 font-semibold">{roleLabel(p.role)}</span></p>
                </div>
                <button onClick={() => handleDelete(p.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer ce compte">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
