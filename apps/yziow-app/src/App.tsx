import { useState } from 'react';
import { useAuth, Button, Input, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge, Loader } from '@oziow/ui';
import { useYziow } from './providers/YziowProvider';
import { Bot, GraduationCap, Users, Settings } from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import '@oziow/ui/theme.css';
import './index.css';

function App() {
  const { session, user, supabase, signOut } = useAuth();
  const { config, userRoles, isLoading, hasPermission } = useYziow();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentView, setCurrentView] = useState<'dashboard' | 'admin'>('dashboard');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }
  };

  if (session && user) {
    if (isLoading) return <div className="flex justify-center p-20"><Loader size={48} /></div>;

    const isTeacher = hasPermission('grade_students') || userRoles.some(r => r.name === 'Enseignant');
    const isStudent = hasPermission('view_own_grades') || userRoles.some(r => r.name === 'Élève');
    const roleName = userRoles[0]?.name || "Visiteur";

    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card px-8 py-4 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-primary cursor-pointer" onClick={() => setCurrentView('dashboard')} />
            <div>
              <h1 className="text-xl font-bold cursor-pointer" onClick={() => setCurrentView('dashboard')}>Yziow Education</h1>
              <p className="text-sm text-muted-foreground">Espace {roleName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {hasPermission('manage_school_settings') && (
              <Button variant="ghost" className="gap-2" onClick={() => setCurrentView(currentView === 'admin' ? 'dashboard' : 'admin')}>
                <Settings className="h-4 w-4" /> Administration
              </Button>
            )}
            <Badge variant="secondary">{user.email}</Badge>
            <Button variant="outline" size="sm" onClick={signOut}>Déconnexion</Button>
          </div>
        </header>

        <main className="p-8 max-w-7xl mx-auto space-y-6">
          {currentView === 'admin' ? (
            <AdminPanel />
          ) : (
            <>
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Tableau de bord</h2>
                {isTeacher && (
                  <Button className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                    <Bot className="h-4 w-4" />
                    Assistant {config.terminology.teacher}
                  </Button>
                )}
              </div>

          {isTeacher && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Mes {config.terminology.classroom}s</CardTitle>
                  <CardDescription>Gérez vos {config.terminology.student}s et évaluations</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Saisir des notes</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Absences</CardTitle>
                  <CardDescription>Appel de vos {config.terminology.student}s</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="secondary" className="w-full">Faire l'appel</Button>
                </CardContent>
              </Card>
            </div>
          )}

          {isStudent && (
            <Card className="max-w-3xl">
              <CardHeader>
                <CardTitle>Mon Bulletin</CardTitle>
                <CardDescription>Notes selon le système : {config.grading_system.type}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matière</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Appréciation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Mathématiques</TableCell>
                      <TableCell><Badge>14 / {config.grading_system.passing_score * 2}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">Bon trimestre.</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {!isTeacher && !isStudent && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Aucun profil métier détecté (ni {config.terminology.teacher}, ni {config.terminology.student}).</p>
                <p>Contactez la direction de votre établissement.</p>
              </CardContent>
            </Card>
          )}
          </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <GraduationCap className="h-12 w-12 text-primary mx-auto mb-2" />
          <CardTitle className="text-2xl font-bold">Yziow Portal</CardTitle>
          <CardDescription>Portail éducatif multi-pays</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email institutionnel</label>
              <Input id="email" type="email" placeholder="nom@etablissement.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Mot de passe</label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full">Connexion</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
