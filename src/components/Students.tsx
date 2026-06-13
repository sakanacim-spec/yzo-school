import { useState, useMemo, useRef } from 'react';
import { useStore } from '../store/useStore';
import { parseExcelFile, exportToExcel } from '../utils/excelUtils';
import { generateReceipt, generateStudentCard } from '../utils/pdfUtils';
import { Student, Payment } from '../types';
import { CLASSES } from '../data/classes';
import { formatMontant, getCycleFromClasse, getEcolageFromClasse } from '../utils/helpers';
import {
  Search,
  Upload,
  Download,
  Plus,
  Edit2,
  Trash2,
  FileText,
  X,
  Check,
  Filter,
  Eye,
  CreditCard,
  Users,
  AlertCircle
} from 'lucide-react';

export default function Students() {
  const { students, setStudents, addStudent, updateStudent, deleteStudent, addPayment, settings } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterCycle, setFilterCycle] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState<Partial<Student>>({
    nom: '',
    prenom: '',
    classe: '',
    telephone: '',
    sexe: 'M',
    redoublant: false,
    ecoleProvenance: '',
    ecolage: 0,
    dejaPaye: 0,
    restant: 0,
    recu: '',
    paiements: []
  });

  const [paymentData, setPaymentData] = useState<Partial<Payment>>({
    montant: 0,
    mode: 'Espèces',
    reference: '',
    commentaire: ''
  });

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = search === '' || 
        s.nom.toLowerCase().includes(search.toLowerCase()) ||
        s.prenom.toLowerCase().includes(search.toLowerCase()) ||
        s.classe.toLowerCase().includes(search.toLowerCase());
      
      const matchClass = filterClass === '' || s.classe === filterClass;
      
      const matchCycle = filterCycle === '' || 
        CLASSES.find(c => c.nom === s.classe)?.cycle === filterCycle;
      
      const matchStatus = filterStatus === '' ||
        (filterStatus === 'solde' && s.restant === 0) ||
        (filterStatus === 'nonsolde' && s.restant > 0);
      
      return matchSearch && matchClass && matchCycle && matchStatus;
    });
  }, [students, search, filterClass, filterCycle, filterStatus]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const importedStudents = await parseExcelFile(file);
      setStudents(importedStudents);
      alert(`✅ ${importedStudents.length} élèves importés avec succès !`);
    } catch (error) {
      alert('❌ Erreur lors de l\'importation du fichier');
      console.error(error);
    }
    setIsLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExport = () => {
    exportToExcel(filteredStudents, `eleves_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const openAddModal = () => {
    setFormData({
      nom: '',
      prenom: '',
      classe: '',
      telephone: '',
      sexe: 'M',
      redoublant: false,
      ecoleProvenance: '',
      ecolage: 0,
      dejaPaye: 0,
      restant: 0,
      recu: '',
      paiements: []
    });
    setIsEditing(false);
    setShowModal(true);
  };

  const openEditModal = (student: Student, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormData({ ...student });
    setSelectedStudent(student);
    setIsEditing(true);
    setShowModal(true);
  };

  const openPaymentModal = (student: Student, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedStudent(student);
    setPaymentData({
      montant: 0,
      mode: 'Espèces',
      reference: `REC-${Date.now()}`,
      commentaire: ''
    });
    setShowPaymentModal(true);
  };

  const openDetailModal = (student: Student, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedStudent(student);
    setShowDetailModal(true);
  };

  const handleSaveStudent = () => {
    if (!formData.nom || !formData.prenom || !formData.classe) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    const classInfo = CLASSES.find(c => c.nom === formData.classe);
    const ecolage = formData.ecolage || classInfo?.ecolage || 0;
    const restant = Math.max(0, ecolage - (formData.dejaPaye || 0));

    if (isEditing && selectedStudent) {
      updateStudent(selectedStudent.id, {
        ...formData,
        ecolage,
        restant
      });
    } else {
      const newStudent: Student = {
        id: `student-${Date.now()}`,
        nom: formData.nom || '',
        prenom: formData.prenom || '',
        classe: formData.classe || '',
        telephone: formData.telephone || '',
        sexe: (formData.sexe as 'M' | 'F') || 'M',
        redoublant: formData.redoublant || false,
        ecoleProvenance: formData.ecoleProvenance || '',
        ecolage,
        dejaPaye: formData.dejaPaye || 0,
        restant,
        recu: formData.recu || '',
        cycle: getCycleFromClasse(formData.classe || ''),
        status: restant === 0 ? 'Soldé' : restant <= ecolage * 0.3 ? 'Non soldé' : 'Partiel',
        historiquesPaiements: [],
        paiements: [],
        dateInscription: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      addStudent(newStudent);
    }
    setShowModal(false);
  };

  const handleSavePayment = () => {
    if (!selectedStudent || !paymentData.montant) {
      alert('Veuillez entrer un montant');
      return;
    }

    const payment: Payment = {
      id: `payment-${Date.now()}`,
      studentId: selectedStudent.id,
      date: new Date().toISOString().split('T')[0],
      montant: paymentData.montant || 0,
      mode: (paymentData.mode as Payment['mode']) || 'Espèces',
      reference: paymentData.reference || '',
      commentaire: paymentData.commentaire || '',
      recu: `REC-${Date.now()}`
    };

    addPayment(selectedStudent.id, payment);
    setShowPaymentModal(false);
    alert('✅ Paiement enregistré avec succès !');
  };

  const handleDelete = (student: Student, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Supprimer ${student.nom} ${student.prenom} ?`)) {
      deleteStudent(student.id);
    }
  };

  const handleGenerateReceipt = (student: Student, e: React.MouseEvent) => {
    e.stopPropagation();
    generateReceipt(student, settings);
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' ' + settings.currency;
  };

  const uniqueClasses = [...new Set(students.map(s => s.classe))].sort();

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header actions */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx,.xls"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium shadow-sm hover:bg-blue-700 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2 text-sm"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">{isLoading ? 'Importation...' : 'Importer Excel'}</span>
            <span className="sm:hidden">{isLoading ? '...' : 'Import'}</span>
          </button>
          <button
            onClick={handleExport}
            disabled={students.length === 0}
            className="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium shadow-sm hover:bg-gray-300 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exporter</span>
            <span className="sm:hidden">Export</span>
          </button>
          <button
            onClick={openAddModal}
            className="px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium shadow-sm hover:bg-green-700 hover:shadow-md transition-all inline-flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Ajouter</span>
            <span className="sm:hidden">+</span>
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-white rounded-xl shadow-sm border border-gray-100">
          <Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
          <span className="text-xs sm:text-sm text-gray-600">
            <span className="font-bold text-gray-800">{filteredStudents.length}</span> élève(s) sur <span className="font-bold">{students.length}</span>
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Filter className="w-5 h-5 text-blue-600" />
          </div>
          <span className="font-semibold text-gray-800">Filtres de recherche</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un élève..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-12"
            />
          </div>
          <select
            value={filterCycle}
            onChange={(e) => setFilterCycle(e.target.value)}
            className="select"
          >
            <option value="">🎓 Tous les cycles</option>
            <option value="Primaire">📚 Primaire</option>
            <option value="Collège">📖 Collège</option>
            <option value="Lycée">🎯 Lycée</option>
          </select>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="select"
          >
            <option value="">📋 Toutes les classes</option>
            {uniqueClasses.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="select"
          >
            <option value="">📊 Tous les statuts</option>
            <option value="solde">✅ Soldés</option>
            <option value="nonsolde">⚠️ Non soldés</option>
          </select>
        </div>
      </div>

      {/* Students table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
        {filteredStudents.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-3xl flex items-center justify-center">
              {students.length === 0 ? (
                <Upload className="w-12 h-12 text-blue-400" />
              ) : (
                <AlertCircle className="w-12 h-12 text-amber-400" />
              )}
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              {students.length === 0 ? 'Aucun élève enregistré' : 'Aucun résultat trouvé'}
            </h3>
            <p className="text-gray-500 mb-6">
              {students.length === 0 
                ? 'Importez un fichier Excel pour commencer à gérer vos élèves.'
                : 'Modifiez vos filtres pour voir plus de résultats.'
              }
            </p>
            {students.length === 0 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-primary"
              >
                <Upload className="w-4 h-4" />
                Importer un fichier Excel
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left py-3 sm:py-4 px-3 sm:px-4 font-semibold text-xs sm:text-sm text-gray-700">Élève</th>
                  <th className="text-left py-3 sm:py-4 px-3 sm:px-4 font-semibold text-xs sm:text-sm text-gray-700 hidden md:table-cell">Classe</th>
                  <th className="text-left py-3 sm:py-4 px-3 sm:px-4 font-semibold text-xs sm:text-sm text-gray-700 hidden lg:table-cell">Téléphone</th>
                  <th className="text-right py-3 sm:py-4 px-3 sm:px-4 font-semibold text-xs sm:text-sm text-gray-700 hidden sm:table-cell">Écolage</th>
                  <th className="text-right py-3 sm:py-4 px-3 sm:px-4 font-semibold text-xs sm:text-sm text-gray-700 hidden sm:table-cell">Payé</th>
                  <th className="text-right py-3 sm:py-4 px-3 sm:px-4 font-semibold text-xs sm:text-sm text-gray-700">Restant</th>
                  <th className="text-center py-3 sm:py-4 px-3 sm:px-4 font-semibold text-xs sm:text-sm text-gray-700">Statut</th>
                  <th className="text-center py-3 sm:py-4 px-3 sm:px-4 font-semibold text-xs sm:text-sm text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStudents.map((student, index) => (
                  <tr 
                    key={student.id} 
                    className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                    style={{animationDelay: `${index * 0.02}s`}}
                  >
                    <td className="py-3 sm:py-4 px-3 sm:px-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-md flex-shrink-0 ${
                          student.sexe === 'F' 
                            ? 'bg-gradient-to-br from-pink-400 to-rose-500' 
                            : 'bg-gradient-to-br from-blue-400 to-indigo-500'
                        }`}>
                          {student.nom.charAt(0)}{student.prenom.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-800 text-sm truncate">{student.nom} {student.prenom}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            {student.classe}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 sm:py-4 px-3 sm:px-4 hidden md:table-cell">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-700">
                        {student.classe}
                      </span>
                    </td>
                    <td className="py-3 sm:py-4 px-3 sm:px-4 text-gray-600 text-xs sm:text-sm hidden lg:table-cell">{student.telephone || '—'}</td>
                    <td className="py-3 sm:py-4 px-3 sm:px-4 text-right font-medium text-gray-700 text-xs sm:text-sm hidden sm:table-cell">{formatMoney(student.ecolage)}</td>
                    <td className="py-3 sm:py-4 px-3 sm:px-4 text-right font-semibold text-green-600 text-xs sm:text-sm hidden sm:table-cell">{formatMoney(student.dejaPaye)}</td>
                    <td className="py-3 sm:py-4 px-3 sm:px-4 text-right font-semibold text-red-600 text-xs sm:text-sm">
                      {student.restant === 0 ? '—' : formatMoney(student.restant)}
                    </td>
                    <td className="py-3 sm:py-4 px-3 sm:px-4 text-center">
                      {student.restant === 0 ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                          ✓ Soldé
                        </span>
                      ) : student.dejaPaye > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                          Partiel
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          Non payé
                        </span>
                      )}
                    </td>
                    <td className="py-3 sm:py-4 px-3 sm:px-4">
                      <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                        <button
                          onClick={(e) => openDetailModal(student, e)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Voir détails"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => openPaymentModal(student, e)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-green-600 hover:bg-green-100 rounded-lg transition-all"
                          title="Ajouter paiement"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleGenerateReceipt(student, e)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-purple-600 hover:bg-purple-100 rounded-lg transition-all"
                          title="Générer reçu"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => openEditModal(student, e)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-100 rounded-lg transition-all"
                          title="Modifier"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(student, e)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-all"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isEditing ? 'bg-amber-100' : 'bg-green-100'}`}>
                  {isEditing ? <Edit2 className="w-6 h-6 text-amber-600" /> : <Plus className="w-6 h-6 text-green-600" />}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    {isEditing ? 'Modifier l\'élève' : 'Nouvel élève'}
                  </h2>
                  <p className="text-sm text-gray-500">Remplissez les informations ci-dessous</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nom *</label>
                  <input
                    type="text"
                    value={formData.nom || ''}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    className="input"
                    placeholder="Nom de famille"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Prénom *</label>
                  <input
                    type="text"
                    value={formData.prenom || ''}
                    onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                    className="input"
                    placeholder="Prénom"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Classe *</label>
                  <select
                    value={formData.classe || ''}
                    onChange={(e) => {
                      const classInfo = CLASSES.find(c => c.nom === e.target.value);
                      setFormData({ 
                        ...formData, 
                        classe: e.target.value,
                        ecolage: classInfo?.ecolage || 0
                      });
                    }}
                    className="select"
                  >
                    <option value="">Sélectionner une classe</option>
                    {CLASSES.map(c => (
                      <option key={c.nom} value={c.nom}>{c.nom} ({c.cycle}) - {formatMoney(c.ecolage)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Téléphone</label>
                  <input
                    type="tel"
                    value={formData.telephone || ''}
                    onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                    className="input"
                    placeholder="+225 00 00 00 00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Sexe</label>
                  <select
                    value={formData.sexe || 'M'}
                    onChange={(e) => setFormData({ ...formData, sexe: e.target.value as 'M' | 'F' })}
                    className="select"
                  >
                    <option value="M">👨 Masculin</option>
                    <option value="F">👩 Féminin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Redoublant</label>
                  <select
                    value={formData.redoublant ? 'oui' : 'non'}
                    onChange={(e) => setFormData({ ...formData, redoublant: e.target.value === 'oui' })}
                    className="select"
                  >
                    <option value="non">Non</option>
                    <option value="oui">Oui</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">École de provenance</label>
                  <input
                    type="text"
                    value={formData.ecoleProvenance || ''}
                    onChange={(e) => setFormData({ ...formData, ecoleProvenance: e.target.value })}
                    className="input"
                    placeholder="Nom de l'ancienne école"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Écolage</label>
                  <input
                    type="number"
                    value={formData.ecolage || 0}
                    onChange={(e) => setFormData({ ...formData, ecolage: Number(e.target.value) })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Déjà payé</label>
                  <input
                    type="number"
                    value={formData.dejaPaye || 0}
                    onChange={(e) => setFormData({ ...formData, dejaPaye: Number(e.target.value) })}
                    className="input"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50">
              <button onClick={() => setShowModal(false)} className="btn btn-secondary">
                Annuler
              </button>
              <button onClick={handleSaveStudent} className="btn btn-success">
                <Check className="w-4 h-4" />
                {isEditing ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Nouveau paiement</h2>
                  <p className="text-sm text-gray-500">{selectedStudent.nom} {selectedStudent.prenom}</p>
                </div>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Classe:</span>
                  <span className="font-semibold">{selectedStudent.classe}</span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-gray-600">Reste à payer:</span>
                  <span className="font-bold text-xl text-red-600">{formatMoney(selectedStudent.restant)}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Montant *</label>
                <input
                  type="number"
                  value={paymentData.montant || ''}
                  onChange={(e) => setPaymentData({ ...paymentData, montant: Number(e.target.value) })}
                  max={selectedStudent.restant}
                  className="input text-lg font-semibold"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Mode de paiement</label>
                <select
                  value={paymentData.mode || 'Espèces'}
                  onChange={(e) => setPaymentData({ ...paymentData, mode: e.target.value as Payment['mode'] })}
                  className="select"
                >
                  <option value="Espèces">💵 Espèces</option>
                  <option value="Chèque">📝 Chèque</option>
                  <option value="Virement">🏦 Virement</option>
                  <option value="Mobile Money">📱 Mobile Money</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Référence</label>
                <input
                  type="text"
                  value={paymentData.reference || ''}
                  onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                  className="input"
                  placeholder="Numéro de référence"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Commentaire</label>
                <textarea
                  value={paymentData.commentaire || ''}
                  onChange={(e) => setPaymentData({ ...paymentData, commentaire: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="Notes additionnelles..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50">
              <button onClick={() => setShowPaymentModal(false)} className="btn btn-secondary">
                Annuler
              </button>
              <button onClick={handleSavePayment} className="btn btn-success">
                <Check className="w-4 h-4" />
                Enregistrer le paiement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">Fiche élève</h2>
              <button onClick={() => setShowDetailModal(false)} className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {/* Header with avatar */}
              <div className="flex items-start gap-6 mb-8">
                <div className={`w-24 h-24 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-xl ${
                  selectedStudent.sexe === 'F' 
                    ? 'bg-gradient-to-br from-pink-400 to-rose-500' 
                    : 'bg-gradient-to-br from-blue-400 to-indigo-500'
                }`}>
                  {selectedStudent.nom.charAt(0)}{selectedStudent.prenom.charAt(0)}
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-800">{selectedStudent.nom} {selectedStudent.prenom}</h3>
                  <p className="text-gray-500 mb-2">{selectedStudent.classe}</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedStudent.restant === 0 ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">
                        {settings.badgeParentResponsable}
                      </span>
                    ) : selectedStudent.dejaPaye >= selectedStudent.ecolage * 0.5 ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700">
                        {settings.badge2emeTranche}
                      </span>
                    ) : null}
                    {selectedStudent.redoublant && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-700">
                        Redoublant
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500 mb-1">📞 Téléphone</p>
                  <p className="font-semibold">{selectedStudent.telephone || '—'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500 mb-1">{selectedStudent.sexe === 'F' ? '👩' : '👨'} Sexe</p>
                  <p className="font-semibold">{selectedStudent.sexe === 'F' ? 'Féminin' : 'Masculin'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500 mb-1">🔄 Redoublant</p>
                  <p className="font-semibold">{selectedStudent.redoublant ? 'Oui' : 'Non'}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500 mb-1">🏫 École de provenance</p>
                  <p className="font-semibold">{selectedStudent.ecoleProvenance || '—'}</p>
                </div>
              </div>

              {/* Financial Section */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-100 mb-8">
                <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="text-xl">💰</span> Situation financière
                </h4>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                    <p className="text-sm text-gray-500">Écolage</p>
                    <p className="text-xl font-bold text-gray-800">{formatMoney(selectedStudent.ecolage)}</p>
                  </div>
                  <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                    <p className="text-sm text-gray-500">Payé</p>
                    <p className="text-xl font-bold text-green-600">{formatMoney(selectedStudent.dejaPaye)}</p>
                  </div>
                  <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                    <p className="text-sm text-gray-500">Restant</p>
                    <p className="text-xl font-bold text-red-600">
                      {selectedStudent.restant === 0 ? '✓ SOLDÉ' : formatMoney(selectedStudent.restant)}
                    </p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Progression du paiement</span>
                    <span className="font-semibold">{Math.round((selectedStudent.dejaPaye / selectedStudent.ecolage) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-green-500 transition-all duration-1000"
                      style={{ width: `${Math.min(100, (selectedStudent.dejaPaye / selectedStudent.ecolage) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Payment History */}
              <div>
                <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="text-xl">📋</span> Historique des paiements
                </h4>
                {selectedStudent.paiements && selectedStudent.paiements.length > 0 ? (
                  <div className="space-y-3">
                    {selectedStudent.paiements.map((p: Payment, index: number) => (
                      <div key={p.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors" style={{animationDelay: `${index * 0.1}s`}}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                            <Check className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-bold text-green-600">{formatMoney(p.montant)}</p>
                            <p className="text-sm text-gray-500">{p.date} • {p.mode}</p>
                          </div>
                        </div>
                        <span className="text-sm text-gray-400 font-mono">{p.reference}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-xl">
                    <p className="text-gray-500">Aucun paiement enregistré</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50">
              <button 
                onClick={() => generateStudentCard(selectedStudent, settings)} 
                className="btn btn-secondary"
              >
                <FileText className="w-4 h-4" />
                Fiche PDF
              </button>
              <button 
                onClick={() => generateReceipt(selectedStudent, settings)} 
                className="btn btn-primary"
              >
                <FileText className="w-4 h-4" />
                Reçu PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
