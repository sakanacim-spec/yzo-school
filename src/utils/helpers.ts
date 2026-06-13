import { Student, StatusPaiement, DashboardStats, ClassStats } from '../types';
import { getEcolage, getCycle, CLASS_CONFIG } from '../data/classConfig';

export const generateId = (): string => {
  // Use a proper UUID v4 format to avoid "invalid input syntax for type uuid" error in Supabase
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const getCycleFromClasse = (classe: string): 'Primaire' | 'Collège' | 'Lycée' => {
  return getCycle(classe);
};

export const getEcolageFromClasse = (classe: string): number => {
  return getEcolage(classe);
};

export const getStatusPaiement = (student: Student, seuil: number = 70): StatusPaiement => {
  if (student.restant === 0) return 'solde';
  
  const pourcentagePaye = (student.dejaPaye / student.ecolage) * 100;
  
  if (pourcentagePaye >= seuil) return 'tranche_validee';
  if (pourcentagePaye > 0) return 'tranche_partielle';
  return 'non_solde';
};

export const getStatusLabel = (status: StatusPaiement): string => {
  const labels: Record<StatusPaiement, string> = {
    solde: 'Soldé',
    tranche_validee: '2ème Tranche Validée',
    tranche_partielle: 'Tranche Partielle',
    non_solde: 'Non Soldé'
  };
  return labels[status];
};

export const getStatusColor = (status: StatusPaiement): string => {
  const colors: Record<StatusPaiement, string> = {
    solde: 'bg-green-500',
    tranche_validee: 'bg-blue-500',
    tranche_partielle: 'bg-yellow-500',
    non_solde: 'bg-red-500'
  };
  return colors[status];
};

export const formatMontant = (montant: number): string => {
  return new Intl.NumberFormat('fr-FR').format(montant) + ' FCFA';
};

export const formatPhoneTogo = (phone: string): string => {
  const cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('228')) {
    return '+' + cleaned;
  }
  return '+228' + cleaned;
};

export const calculateDashboardStats = (students: Student[]): DashboardStats => {
  const stats: DashboardStats = {
    totalEleves: students.length,
    totalPrimaire: students.filter(s => s.cycle === 'Primaire').length,
    totalCollege: students.filter(s => s.cycle === 'Collège').length,
    totalLycee: students.filter(s => s.cycle === 'Lycée').length,
    totalEcolageAttendu: students.reduce((sum, s) => sum + s.ecolage, 0),
    totalDejaPaye: students.reduce((sum, s) => sum + s.dejaPaye, 0),
    totalRestant: students.reduce((sum, s) => sum + s.restant, 0),
    tauxRecouvrement: 0,
    elevesSoldes: students.filter(s => s.restant === 0).length,
    elevesNonSoldes: students.filter(s => s.restant > 0).length
  };
  
  if (stats.totalEcolageAttendu > 0) {
    stats.tauxRecouvrement = Math.round((stats.totalDejaPaye / stats.totalEcolageAttendu) * 100);
  }
  
  return stats;
};

export const calculateClassStats = (students: Student[]): ClassStats[] => {
  const allClasses = CLASS_CONFIG.map(c => c.name);
  
  return allClasses.map(classe => {
    const classStudents = students.filter(s => s.classe === classe);
    const ecolageTotal = classStudents.reduce((sum, s) => sum + s.ecolage, 0);
    const paye = classStudents.reduce((sum, s) => sum + s.dejaPaye, 0);
    const restant = classStudents.reduce((sum, s) => sum + s.restant, 0);
    const effectif = classStudents.length;

    return {
      classe,
      cycle: getCycleFromClasse(classe),
      totalEleves: effectif,
      effectif,
      totalEcolage: ecolageTotal,
      ecolageTotal,
      totalPaye: paye,
      paye,
      totalRestant: restant,
      restant,
      tauxRecouvrement: ecolageTotal > 0 ? Math.round((paye / ecolageTotal) * 100) : 0
    };
  }).filter(c => c.effectif > 0);
};

export const generateWhatsAppLink = (phone: string, message: string): string => {
  const formattedPhone = formatPhoneTogo(phone).replace('+', '');
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
};
