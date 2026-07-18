import { useState, useEffect } from 'react';
import { useAuth, Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Input, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge, Modal } from '@oziow/ui';
import { useYziow } from '../providers/YziowProvider';
import { getPermissionsByCategory } from '../config/yziow_permissions';
import { Shield, Users, Plus, Save } from 'lucide-react';

export function AdminPanel() {
  const { supabase } = useAuth();
  const { hasPermission } = useYziow();
  const [activeTab, setActiveTab] = useState<'roles' | 'users'>('roles');
  
  // Data states
  const [roles, setRoles] = useState<any[]>([]);
  
  // Modals
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  
  // Form states
  const [roleForm, setRoleForm] = useState({
    name: '',
    code: '',
    description: '',
    permissions: {} as Record<string, boolean>
  });

  const permissionsByCategory = getPermissionsByCategory();

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('yziow_roles').select('*').order('created_at');
    if (data) setRoles(data);
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    
    // Pour le MVP on utilise le tenant_id de la session ou via RPC
    // RLS : un user avec les droits "manage_school_settings" pourrait insérer
    // En SQL RLS standard, on prend auth.jwt()->>'tenant_id'
    
    // (Dans un vrai flux, on appellerait le backend NestJS Oziow / OziowClient)
    
    setIsRoleModalOpen(false);
    alert("Simulation: Rôle " + roleForm.name + " créé avec succès.");
  };

  const togglePermission = (permId: string) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permId]: !prev.permissions[permId]
      }
    }));
  };

  if (!hasPermission('manage_school_settings')) {
    return <div className="p-8 text-center text-red-500">Accès refusé. Permission `manage_school_settings` requise.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b pb-2">
        <Button 
          variant={activeTab === 'roles' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('roles')}
          className="gap-2"
        >
          <Shield className="h-4 w-4" /> Gestion des Rôles
        </Button>
        <Button 
          variant={activeTab === 'users' ? 'default' : 'ghost'} 
          onClick={() => setActiveTab('users')}
          className="gap-2"
        >
          <Users className="h-4 w-4" /> Membres Établissement
        </Button>
      </div>

      {activeTab === 'roles' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Tenant Role Builder</CardTitle>
              <CardDescription>Créez les rôles métiers spécifiques à votre établissement.</CardDescription>
            </div>
            <Button onClick={() => setIsRoleModalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nouveau Rôle
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom (Affiché)</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Permissions actives</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                      Aucun rôle personnalisé configuré. Créez-en un pour commencer.
                    </TableCell>
                  </TableRow>
                ) : (
                  roles.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-bold">{r.name}</TableCell>
                      <TableCell><Badge variant="outline">{r.code}</Badge></TableCell>
                      <TableCell>{Object.values(r.permissions || {}).filter(Boolean).length} permissions</TableCell>
                      <TableCell><Button variant="ghost" size="sm">Éditer</Button></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'users' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Membres de la Direction & Personnel</CardTitle>
              <CardDescription>Invitez des collaborateurs et assignez-leur un ou plusieurs rôles.</CardDescription>
            </div>
            <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white">
              <Plus className="h-4 w-4" /> Inviter un membre
            </Button>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <p>L'invitation créera l'utilisateur via le moteur Oziow (Moteur SaaS)</p>
              <p>et lui attribuera les profils Yziow (Application Métier).</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MODAL CREATION DE ROLE */}
      <Modal isOpen={isRoleModalOpen} onClose={() => setIsRoleModalOpen(false)} title="Créer un rôle métier Yziow" className="sm:max-w-[700px]">
        <form onSubmit={handleRoleSubmit} className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nom du rôle (ex: Proviseur, Censeur)</label>
              <Input required value={roleForm.name} onChange={e => setRoleForm({...roleForm, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Code technique (ex: proviseur)</label>
              <Input required value={roleForm.code} onChange={e => setRoleForm({...roleForm, code: e.target.value})} />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input value={roleForm.description} onChange={e => setRoleForm({...roleForm, description: e.target.value})} />
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold border-b pb-2">Matrice des Permissions Yziow</h4>
            <div className="max-h-[300px] overflow-y-auto space-y-6 pr-4">
              {Object.entries(permissionsByCategory).map(([category, perms]) => (
                <div key={category} className="space-y-2">
                  <h5 className="text-sm font-bold text-primary">{category}</h5>
                  <div className="grid grid-cols-2 gap-2">
                    {perms.map(perm => (
                      <label key={perm.id} className="flex items-center gap-2 text-sm p-2 border rounded-md hover:bg-muted cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={!!roleForm.permissions[perm.id]}
                          onChange={() => togglePermission(perm.id)}
                          className="rounded text-primary"
                        />
                        {perm.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button type="submit" className="gap-2">
              <Save className="h-4 w-4" /> Enregistrer le rôle
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
