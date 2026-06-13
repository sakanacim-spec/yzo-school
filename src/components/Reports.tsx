import { useState } from 'react';
import { useStore } from '../store/useStore';
import { StatusPaiement } from '../types';
import { CLASSES_BY_CYCLE } from '../data/classConfig';
import { formatMontant, getStatusPaiement, generateWhatsAppLink } from '../utils/helpers';
import { generateReceipt, generateClassReport, generateNonSoldesReport } from '../utils/pdfService';
import {
  FileText,
  Receipt,
  Users,
  AlertTriangle,
  Download,
  ChevronRight,
  Phone
} from 'lucide-react';

export const Reports = () => {
  const { students, settings } = useStore();
  const [selectedClasse, setSelectedClasse] = useState('');

  const allClasses = [...CLASSES_BY_CYCLE.Primaire, ...CLASSES_BY_CYCLE.Collège, ...CLASSES_BY_CYCLE.Lycée];
  const nonSoldes = students.filter(s => s.restant > 0);
  const classStudents = selectedClasse ? students.filter(s => s.classe === selectedClasse) : [];

  const generateAllReceipts = (studentsList: typeof students) => {
    studentsList.forEach((s, index) => {
      setTimeout(() => {
        generateReceipt(s, settings);
      }, index * 500);
    });
  };

  const sendBulkWhatsApp = (studentsList: typeof students) => {
    const messages = studentsList.map(student => {
      let message = `Bonjour,\n\nÉlève: ${student.nom} ${student.prenom} (${student.classe})\n`;
      message += `Reste à payer: ${formatMontant(student.restant)}\n\n`;
      message += settings.messageRappel;
      message += `\n\n${settings.nomEcole}`;
      return { phone: student.telephone, message };
    });

    // Open first one immediately
    if (messages.length > 0) {
      window.open(generateWhatsAppLink(messages[0].phone, messages[0].message), '_blank');
      alert(`${messages.length} messages à envoyer. Le premier est ouvert. Copiez les autres numéros depuis la liste.`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Génération de Rapports PDF</h1>
        <p className="text-gray-500">Créez des reçus et rapports personnalisés</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rapport par classe */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Rapports par classe
          </h2>

          <div className="space-y-4">
            <select
              value={selectedClasse}
              onChange={(e) => setSelectedClasse(e.target.value)}
              className="w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Sélectionner une classe --</option>
              {allClasses.map(c => {
                const count = students.filter(s => s.classe === c).length;
                return (
                  <option key={c} value={c} disabled={count === 0}>
                    {c} ({count} élèves)
                  </option>
                );
              })}
            </select>

            {selectedClasse && classStudents.length > 0 && (
              <div className="space-y-3">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="font-medium text-blue-800">Classe: {selectedClasse}</p>
                  <p className="text-sm text-blue-600 mt-1">
                    {classStudents.length} élèves •
                    {classStudents.filter(s => s.restant === 0).length} soldés •
                    {classStudents.filter(s => s.restant > 0).length} non soldés
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => generateClassReport(students, selectedClasse, settings)}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition"
                  >
                    <FileText className="w-4 h-4" />
                    Rapport complet
                  </button>
                  <button
                    onClick={() => generateAllReceipts(classStudents)}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition"
                  >
                    <Receipt className="w-4 h-4" />
                    Tous les reçus
                  </button>
                </div>

                {/* Liste des élèves de la classe */}
                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  {classStudents.map(student => {
                    const status = getStatusPaiement(student, settings.seuilDeuxiemeTranche);
                    const statusColors: Record<StatusPaiement, string> = {
                      solde: 'bg-green-100 text-green-800',
                      tranche_validee: 'bg-blue-100 text-blue-800',
                      tranche_partielle: 'bg-yellow-100 text-yellow-800',
                      non_solde: 'bg-red-100 text-red-800'
                    };
                    const statusLabels: Record<StatusPaiement, string> = {
                      solde: 'Soldé',
                      tranche_validee: '2ème Tranche OK',
                      tranche_partielle: 'Partiel',
                      non_solde: 'Non soldé'
                    };
                    return (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-gray-50"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{student.nom} {student.prenom}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[status]}`}>
                              {statusLabels[status]}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {student.restant === 0 ? (
                              <span className="text-green-600">Soldé</span>
                            ) : (
                              <span className="text-red-500">Reste: {formatMontant(student.restant)}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => generateReceipt(student, settings)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            title="Reçu"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => window.open(generateWhatsAppLink(student.telephone, `Message pour ${student.nom}`), '_blank')}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                            title="WhatsApp"
                          >
                            <Phone className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Élèves non soldés */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Élèves non soldés ({nonSoldes.length})
          </h2>

          {nonSoldes.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>Aucun élève non soldé</p>
              <p className="text-sm mt-1">Tous les élèves ont réglé leurs frais!</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-red-50 rounded-lg p-4">
                <p className="font-medium text-red-800">
                  Total à recouvrer: {formatMontant(nonSoldes.reduce((sum, s) => sum + s.restant, 0))}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => generateNonSoldesReport(students, settings)}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-500 transition"
                >
                  <Download className="w-4 h-4" />
                  Rapport PDF
                </button>
                <button
                  onClick={() => sendBulkWhatsApp(nonSoldes)}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition"
                >
                  <Phone className="w-4 h-4" />
                  Relance WhatsApp
                </button>
              </div>

              {/* Liste des non soldés */}
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {nonSoldes
                  .sort((a, b) => b.restant - a.restant)
                  .map(student => (
                    <div
                      key={student.id}
                      className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{student.nom} {student.prenom}</p>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">{student.classe}</span>
                        </div>
                        <p className="text-xs text-red-500 mt-1">
                          Reste: {formatMontant(student.restant)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => generateReceipt(student, settings)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="Reçu"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            const message = `Bonjour,\n\nConcernant ${student.nom} ${student.prenom} (${student.classe}):\nReste à payer: ${formatMontant(student.restant)}\n\n${settings.messageRappel}\n\n${settings.nomEcole}`;
                            window.open(generateWhatsAppLink(student.telephone, message), '_blank');
                          }}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                          title="WhatsApp"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions rapides */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Actions rapides</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => generateAllReceipts(students.filter(s => s.restant === 0))}
            disabled={students.filter(s => s.restant === 0).length === 0}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-green-50 hover:border-green-200 transition group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Receipt className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-left">
                <p className="font-medium">Reçus - Élèves soldés</p>
                <p className="text-sm text-gray-500">
                  {students.filter(s => s.restant === 0).length} reçus
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-green-600" />
          </button>

          <button
            onClick={() => generateAllReceipts(students)}
            disabled={students.length === 0}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-blue-50 hover:border-blue-200 transition group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="font-medium">Tous les reçus</p>
                <p className="text-sm text-gray-500">{students.length} reçus</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />
          </button>

          <button
            onClick={() => {
              allClasses.forEach((classe, index) => {
                const classCount = students.filter(s => s.classe === classe).length;
                if (classCount > 0) {
                  setTimeout(() => {
                    generateClassReport(students, classe, settings);
                  }, index * 500);
                }
              });
            }}
            disabled={students.length === 0}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-purple-50 hover:border-purple-200 transition group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-left">
                <p className="font-medium">Rapports par classe</p>
                <p className="text-sm text-gray-500">Toutes les classes</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-purple-600" />
          </button>
        </div>
      </div>
    </div>
  );
};
