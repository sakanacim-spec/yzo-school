
$content = @"

// ------------------------------------------------------------
// NOUVEAU: MODULE ACADEMIQUE
// ------------------------------------------------------------
import { Note } from '../types';

export interface StudentAcademicStats {
  student: Student;
  moyenne: number;
  isPassing: boolean;
}

export function computeStudentAverage(studentId: string, notes: Note[]): number {
  const studentNotes = notes.filter(n => n.eleveId === studentId);
  if (studentNotes.length === 0) return 0;

  let totalPoints = 0;
  let count = 0;

  studentNotes.forEach(n => {
    // on fait une moyenne simple de ses notes 
    // (en situation r?elle on utiliserait les coefficients des matires, mais ici on simplifie)
    let sum = 0;
    let nCount = 0;
    if (n.noteClasse !== null && n.noteClasse !== undefined) { sum += n.noteClasse; nCount++; }
    if (n.noteDevoir !== null && n.noteDevoir !== undefined) { sum += n.noteDevoir; nCount++; }
    if (n.noteCompo !== null && n.noteCompo !== undefined) { sum += n.noteCompo; nCount++; }

    if (nCount > 0) {
      totalPoints += (sum / nCount);
      count++;
    }
  });

  return count > 0 ? parseFloat((totalPoints / count).toFixed(2)) : 0;
}

export interface AcademicAnalyticsResult {
  tauxReussite: number;
  moyenneGenerale: number;
  top5: StudentAcademicStats[];
  alertes: StudentAcademicStats[];
  classAverages: { classe: string; moyenne: number }[];
}

export function computeAcademicAnalytics(students: Student[], notes: Note[]): AcademicAnalyticsResult {
  const studentStats: StudentAcademicStats[] = [];
  
  students.forEach(s => {
    const moyenne = computeStudentAverage(s.id, notes);
    // On n'inclut que les ?lves qui ont au moins une note
    const hasNotes = notes.some(n => n.eleveId === s.id);
    if (hasNotes) {
      studentStats.push({ student: s, moyenne, isPassing: moyenne >= 10 });
    }
  });

  const totalEvaluated = studentStats.length;
  const passingCount = studentStats.filter(s => s.isPassing).length;
  const tauxReussite = totalEvaluated > 0 ? Math.round((passingCount / totalEvaluated) * 100) : 0;
  
  const totalMoyenne = studentStats.reduce((acc, s) => acc + s.moyenne, 0);
  const moyenneGenerale = totalEvaluated > 0 ? parseFloat((totalMoyenne / totalEvaluated).toFixed(2)) : 0;

  const sortedStats = [...studentStats].sort((a, b) => b.moyenne - a.moyenne);
  const top5 = sortedStats.slice(0, 5);
  const alertes = sortedStats.filter(s => s.moyenne < 8);

  const classNames = Array.from(new Set(students.map(s => s.classe)));
  const classAverages = classNames.map(c => {
    const classStats = studentStats.filter(s => s.student.classe === c);
    const avg = classStats.length > 0 
      ? parseFloat((classStats.reduce((acc, s) => acc + s.moyenne, 0) / classStats.length).toFixed(2))
      : 0;
    return { classe: c, moyenne: avg };
  }).filter(c => c.moyenne > 0).sort((a, b) => b.moyenne - a.moyenne);

  return { tauxReussite, moyenneGenerale, top5, alertes, classAverages };
}
"@
Add-Content -Path .\src\services\analyticsService.ts -Value $content

