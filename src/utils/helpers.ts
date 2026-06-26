import { Student, Cycle, StatusPaiement, DashboardStats, ClassStats } from '../types';
import { useStore } from '../store/useStore';
import { COUNTRIES } from '../data/countries';

export const generateId = (): string => {
  // Use a proper UUID v4 format to avoid "invalid input syntax for type uuid" error in Supabase
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const getCycleFromClasse = (classe: string): Cycle => {
  return useStore.getState().getCycle(classe);
};

export const getEcolageFromClasse = (classe: string): number => {
  return useStore.getState().getEcolage(classe);
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

export const formatMontant = (montant: number, currency?: string): string => {
  const actualCurrency = currency || useStore.getState().currency || 'FCFA';
  const formatted = new Intl.NumberFormat('fr-FR').format(montant);
  return formatted.replace(/\u202F|\u00A0/g, ' ') + ' ' + actualCurrency;
};

export const formatPhoneNumber = (phone: string, countryCode: string | null = null): string => {
  const cleaned = (phone || '').replace(/\D/g, '');
  
  if (!countryCode) return '+' + cleaned;
  
  // Chercher l'indicatif du pays
  const country = COUNTRIES.find((c: any) => c.code === countryCode);
  const dialCode = country ? country.dialCode.replace('+', '') : '';

  let localPhone = cleaned;
  if (localPhone.startsWith('0')) localPhone = localPhone.substring(1);
  
  if (dialCode && localPhone.startsWith(dialCode)) {
    return '+' + localPhone;
  }
  
  return '+' + dialCode + localPhone;
};

export const calculateDashboardStats = (students: Student[]): DashboardStats => {
  const stats: DashboardStats = {
    totalEleves: students.length,
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
  const classes = useStore.getState().classes.map(c => c.name);
  
  return classes.map(classe => {
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

export const generateWhatsAppLink = (phone: string, message: string, countryCode: string | null = null): string => {
  const formattedPhone = formatPhoneNumber(phone, countryCode).replace('+', '');
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
};

export const sendBulkSMS = async (recipients: { phone: string; message: string }[]): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    // Dans un vrai environnement de production, on ferait un appel API POST ici
    // vers Twilio, Infobip, ou un fournisseur SMS local.
    // Exemple : 
    // await fetch('/api/sms/send-bulk', { method: 'POST', body: JSON.stringify({ recipients }) });
    
    // Simulation du temps d'envoi réseau
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log(`[SMS Simulator] ${recipients.length} messages envoyés avec succès.`);
    return { success: true, count: recipients.length };
  } catch (error: any) {
    console.error('Erreur lors de l\'envoi des SMS:', error);
    return { success: false, count: 0, error: error.message };
  }
};
