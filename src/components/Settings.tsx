import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Save, School, FileText, Bell, Percent } from 'lucide-react';

export const Settings = () => {
  const { settings, updateSettings, user } = useStore();
  const [formData, setFormData] = useState(settings);
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-8 sm:p-12 text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl font-semibold text-red-600">Accès refusé</h2>
          <p className="text-gray-500 text-sm sm:text-base mt-2">Seuls les administrateurs peuvent accéder aux paramètres.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="page-header">
        <h1>Paramètres</h1>
        <p className="text-gray-500 text-sm sm:text-base">Configuration de l'application</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Informations de l'école */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
              <School className="w-5 h-5 text-blue-600" />
              Informations de l'école
            </h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nom de l'école
                </label>
                <input
                  type="text"
                  value={formData.nomEcole}
                  onChange={(e) => setFormData({ ...formData, nomEcole: e.target.value })}
                  className="w-full"
                />
              </div>
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Année scolaire
                </label>
                <input
                  type="text"
                  value={formData.anneScolaire}
                  onChange={(e) => setFormData({ ...formData, anneScolaire: e.target.value })}
                  placeholder="2024-2025"
                  className="w-full"
                />
              </div>
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Adresse
                </label>
                <input
                  type="text"
                  value={formData.adresse}
                  onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                  className="w-full"
                />
              </div>
              <div className="form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={formData.telephone}
                  onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                  className="w-full"
                />
              </div>
              <div className="md:col-span-2 form-group">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Messages personnalisés */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600" />
              Messages personnalisés pour PDF
            </h2>
          </div>
          <div className="card-body space-y-4 sm:space-y-6">
            <div className="form-group">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Message de remerciement (élèves soldés)
                </span>
              </label>
              <textarea
                rows={3}
                value={formData.messageRemerciement}
                onChange={(e) => setFormData({ ...formData, messageRemerciement: e.target.value })}
                className="w-full"
              />
            </div>
            <div className="form-group">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  Message de rappel (élèves non soldés)
                </span>
              </label>
              <textarea
                rows={3}
                value={formData.messageRappel}
                onChange={(e) => setFormData({ ...formData, messageRappel: e.target.value })}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Paramètres de paiement */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Percent className="w-5 h-5 text-purple-600" />
              Paramètres de paiement
            </h2>
          </div>
          <div className="card-body">
            <div className="max-w-md">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Seuil de validation 2ème tranche (%)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Pourcentage minimum payé pour valider la 2ème tranche
              </p>
              <div className="flex items-center gap-4 mb-4">
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={formData.seuilDeuxiemeTranche}
                  onChange={(e) => setFormData({ ...formData, seuilDeuxiemeTranche: parseInt(e.target.value) })}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <span className="font-bold text-lg text-purple-600 w-16 text-right">
                  {formData.seuilDeuxiemeTranche}%
                </span>
              </div>
              <div className="p-3 sm:p-4 bg-purple-50 border border-purple-100 rounded-lg">
                <p className="text-xs sm:text-sm text-purple-800">
                  <strong>Règle actuelle:</strong> Un élève ayant payé ≥{formData.seuilDeuxiemeTranche}% de son écolage
                  obtient le badge "2ème Tranche Validée" sur son reçu.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Informations sur les tarifs */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Bell className="w-5 h-5 text-orange-600" />
              Informations sur les tarifs
            </h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-green-50 border border-green-100 p-3 sm:p-4 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-2 text-sm sm:text-base">Primaire</h3>
                <ul className="text-xs sm:text-sm text-green-700 space-y-1">
                  <li>CP1, CP2, CE1, CE2, CM1: <strong>50 000 FCFA</strong></li>
                  <li>CI, CI 1, CI 2, CM2: <strong>55 000 FCFA</strong></li>
                </ul>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-3 sm:p-4 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2 text-sm sm:text-base">Collège</h3>
                <ul className="text-xs sm:text-sm text-blue-700 space-y-1">
                  <li>6EME, 5EME, 4EME: <strong>60 000 FCFA</strong></li>
                  <li>3EME: <strong>70 000 FCFA</strong></li>
                </ul>
              </div>
              <div className="bg-purple-50 border border-purple-100 p-3 sm:p-4 rounded-lg">
                <h3 className="font-semibold text-purple-800 mb-2 text-sm sm:text-base">Lycée</h3>
                <ul className="text-xs sm:text-sm text-purple-700 space-y-1">
                  <li>2nde S, 2nde A4: <strong>75 000 FCFA</strong></li>
                  <li>1er A4, 1er D: <strong>85 000 FCFA</strong></li>
                  <li>Tle A4, Tle D: <strong>95 000 FCFA</strong></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Submit button */}
        <div className="flex flex-col sm:flex-row sm:justify-end gap-3 sm:gap-4">
          {saved && (
            <div className="flex items-center gap-2 text-green-600 font-medium py-2 px-3 bg-green-50 border border-green-200 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Paramètres enregistrés !
            </div>
          )}
          <button
            type="submit"
            className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            Enregistrer les paramètres
          </button>
        </div>
      </form>
    </div>
  );
};
