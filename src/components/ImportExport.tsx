import { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { importExcel, exportToExcel, exportNonSoldesToExcel, exportClassToExcel } from '../utils/excelService';
import { CLASSES_BY_CYCLE as CLASSES } from '../data/classConfig';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  FileDown,
  Users,
  AlertTriangle
} from 'lucide-react';

export const ImportExport = () => {
  const { students, setStudents } = useStore();
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedClasse, setSelectedClasse] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allClasses = [...CLASSES.Primaire, ...CLASSES.Collège, ...CLASSES.Lycée];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage(null);

    try {
      const currentStudents = useStore.getState().students;
      const imported = await importExcel(file, currentStudents);
      
      if (imported.length === 0) {
        setMessage({ type: 'error', text: 'Aucun élève trouvé dans le fichier.' });
      } else {
        
        // Ask if replace or merge
        const replace = currentStudents.length === 0 || 
          confirm(`Voulez-vous remplacer les ${currentStudents.length} élèves existants par les ${imported.length} nouveaux ? (Annuler pour fusionner)`);
        
        let newStudents;
        if (replace) {
          // Seulement vider la liste des élèves pour render, on ne vide plus les présences et logs!
          // Car si on garde le même élève, on veut garder ses notes et présences.
          useStore.setState({ students: [] });
          newStudents = imported;
        } else {
          // Fusion intelligente par ID pour éviter les doublons
          const studentsMap = new Map(currentStudents.map(s => [s.id, s]));
          imported.forEach(imp => {
            studentsMap.set(imp.id, imp);
          });
          newStudents = Array.from(studentsMap.values());
        }
        
        setStudents(newStudents);

        // SYNC TO CLOUD
        const setIsSyncing = useStore.getState().setIsSyncing;
        setIsSyncing(true);
        setMessage({ type: 'success', text: `Mise à jour du serveur (${replace ? 'Mode Remplacement' : 'Mode Fusion'})...` });
        const { syncToBackend } = await import('../services/backendSync');
        const currentState = useStore.getState();
        
        // ATTENTION : On n'envoie JAMAIS replace=true au backend depuis le fichier Excel
        // sinon le backend supprimerait la totalité des notes, présences et paiements!
        const syncResult = await syncToBackend({ 
          students: newStudents,
          parents: currentState.parents
        }, false);
        setIsSyncing(false);

        if (syncResult) {
          useStore.getState().setLastSyncTimestamp(Date.now());
          
          setMessage({ 
            type: 'success', 
            text: `${imported.length} élèves importés et synchronisés avec succès !` 
          });
        } else {
          setMessage({ 
            type: 'error', 
            text: 'Importés localement mais échec de l\'enregistrement cloud.' 
          });
        }
      }
    } catch (error) {
      useStore.getState().setIsSyncing(false);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Erreur lors de l\'importation' 
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="page-header">
        <h1>Import / Export Excel</h1>
        <p className="text-gray-500 text-sm sm:text-base">Gérez vos données élèves via fichiers Excel</p>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-3 sm:p-4 rounded-lg flex items-center gap-2 sm:gap-3 text-sm sm:text-base ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Import Section */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Importer un fichier Excel
            </h2>
          </div>
          <div className="card-body space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 sm:p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="excel-upload"
              />
              <label
                htmlFor="excel-upload"
                className="cursor-pointer"
              >
                {importing ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="w-10 sm:w-12 h-10 sm:h-12 text-blue-500 animate-spin mb-2 sm:mb-4" />
                    <p className="text-sm sm:text-base text-gray-600">Importation en cours...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <FileSpreadsheet className="w-10 sm:w-12 h-10 sm:h-12 text-gray-400 mb-2 sm:mb-4" />
                    <p className="text-sm sm:text-base text-gray-600 mb-1 sm:mb-2">Cliquez ou déposez un fichier Excel</p>
                    <p className="text-xs sm:text-sm text-gray-400">.xlsx ou .xls</p>
                  </div>
                )}
              </label>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 sm:p-4">
              <h3 className="font-medium text-blue-800 mb-2 text-sm sm:text-base">Format attendu:</h3>
              <ul className="text-xs sm:text-sm text-blue-700 space-y-0.5 sm:space-y-1">
                <li>• Colonne B: NOMS</li>
                <li>• Colonne C: PRÉNOMS</li>
                <li>• Colonne D: CLASSE</li>
                <li>• Colonne E: TELEPHONE</li>
                <li>• Colonne F: SEXE (M/F)</li>
                <li>• Colonne G: REDOUBLANT (Oui/Non)</li>
                <li>• Colonne H: ÉCOLE DE PROVENANCE</li>
                <li>• Colonne I: ÉCOLAGE</li>
                <li>• Colonne J: DÉJÀ PAYÉ</li>
                <li>• Colonne K: RESTANT (ou "SOLDE")</li>
                <li>• Colonne L: REÇU</li>
              </ul>
              <p className="text-xs text-blue-600 mt-2">* Les données commencent à la ligne 2</p>
            </div>
          </div>
        </div>

        {/* Export Section */}
        {/* Export Section */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Download className="w-5 h-5" />
              Exporter les données
            </h2>
          </div>
          <div className="card-body space-y-3 sm:space-y-4">
            {/* Export All */}
            <div className="p-3 sm:p-4 border border-gray-100 rounded-lg hover:bg-gray-50 hover:shadow-sm transition">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm sm:text-base">Tous les élèves</p>
                    <p className="text-xs sm:text-sm text-gray-500">{students.length} élèves</p>
                  </div>
                </div>
                <button
                  onClick={() => exportToExcel(students, 'tous_les_eleves.xlsx')}
                  disabled={students.length === 0}
                  className="btn-success text-xs sm:text-sm whitespace-nowrap"
                >
                  <FileDown className="w-4 h-4" />
                  Exporter
                </button>
              </div>
            </div>

            {/* Export Non-Soldés */}
            <div className="p-3 sm:p-4 border border-gray-100 rounded-lg hover:bg-gray-50 hover:shadow-sm transition">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm sm:text-base">Élèves non soldés</p>
                    <p className="text-xs sm:text-sm text-gray-500">
                      {students.filter(s => s.restant > 0).length} élèves
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => exportNonSoldesToExcel(students)}
                  disabled={students.filter(s => s.restant > 0).length === 0}
                  className="btn-danger text-xs sm:text-sm whitespace-nowrap"
                >
                  <FileDown className="w-4 h-4" />
                  Exporter
                </button>
              </div>
            </div>

            {/* Export by Class */}
            <div className="p-3 sm:p-4 border border-gray-100 rounded-lg">
              <p className="font-medium text-sm sm:text-base mb-3">Exporter par classe</p>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <select
                  value={selectedClasse}
                  onChange={(e) => setSelectedClasse(e.target.value)}
                  className="flex-1 border border-gray-300 text-sm px-3 py-2.5 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sélectionner une classe</option>
                  {allClasses.map(c => (
                    <option key={c} value={c}>
                      {c} ({students.filter(s => s.classe === c).length})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => selectedClasse && exportClassToExcel(students, selectedClasse)}
                  disabled={!selectedClasse}
                  className="btn-primary text-xs sm:text-sm whitespace-nowrap"
                >
                  <FileDown className="w-4 h-4" />
                  Exporter
                </button>
              </div>
            </div>

            {/* Danger Zone: Manual Reset */}
            <div className="p-3 sm:p-4 border border-amber-100 bg-amber-50/50 rounded-lg">
              <p className="font-medium text-amber-800 text-sm sm:text-base mb-1">Maintenance & Nettoyage</p>
              <p className="text-xs text-amber-600 mb-3">Si vous voyez des doublons (750 au lieu de 350), utilisez ce bouton pour nettoyer le Cloud et renvoyer vos données locales propres.</p>
              
              <div className="flex flex-col gap-2">
                <button
                  onClick={async () => {
                    if (confirm('Voulez-vous Nettoyer le Cloud ? Les données du Cloud seront remplacées par vos données locales actuelles (sans doublons).')) {
                      setImporting(true);
                      setMessage({ type: 'success', text: 'Nettoyage du Cloud en cours...' });
                      try {
                        const { syncToBackend } = await import('../services/backendSync');
                        const state = useStore.getState();
                        const result = await syncToBackend(state, true); // true = replace
                        if (result) {
                          setMessage({ type: 'success', text: 'Cloud nettoyé et synchronisé avec succès !' });
                        } else {
                          setMessage({ type: 'error', text: 'Échec du nettoyage Cloud.' });
                        }
                      } catch (err) {
                        setMessage({ type: 'error', text: 'Erreur technique pendant le nettoyage.' });
                      } finally {
                        setImporting(false);
                      }
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-sm font-medium"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Nettoyer le Cloud (Fix Doublons)
                </button>

                <button
                  onClick={async () => {
                    if (confirm('ÊTES-VOUS SÛR ? Cela supprimera TOUS les élèves, paiements et présences du CLOUD immédiatement.')) {
                      setImporting(true);
                      const success = await useStore.getState().clearCloudStudents();
                      await useStore.getState().clearCloudPresences();
                      setImporting(false);
                      if (success) {
                        setMessage({ type: 'success', text: 'Cloud vidé avec succès.' });
                      } else {
                        setMessage({ type: 'error', text: 'Échec de la suppression cloud.' });
                      }
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 text-red-600 hover:bg-red-50 transition text-xs border border-red-100 rounded-lg"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  Réinitialisation Totale (RAZ)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-base sm:text-lg font-semibold text-gray-800">Statistiques actuelles</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="text-center p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-2xl sm:text-3xl font-bold text-blue-900">{students.length}</p>
              <p className="text-xs sm:text-sm text-blue-700 mt-1">Total élèves</p>
            </div>
            <div className="text-center p-3 sm:p-4 bg-green-50 rounded-lg border border-green-100">
              <p className="text-2xl sm:text-3xl font-bold text-green-600">
                {students.filter(s => s.restant === 0).length}
              </p>
              <p className="text-xs sm:text-sm text-green-700 mt-1">Élèves soldés</p>
            </div>
            <div className="text-center p-3 sm:p-4 bg-red-50 rounded-lg border border-red-100">
              <p className="text-2xl sm:text-3xl font-bold text-red-600">
                {students.filter(s => s.restant > 0).length}
              </p>
              <p className="text-xs sm:text-sm text-red-700 mt-1">Non soldés</p>
            </div>
            <div className="text-center p-3 sm:p-4 bg-purple-50 rounded-lg border border-purple-100">
              <p className="text-2xl sm:text-3xl font-bold text-purple-600">
                {new Set(students.map(s => s.classe)).size}
              </p>
              <p className="text-xs sm:text-sm text-purple-700 mt-1">Classes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
