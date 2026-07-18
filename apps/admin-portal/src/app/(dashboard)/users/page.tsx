"use client";

import { useQuery } from "@tanstack/react-query";
import { useOziow } from "@/hooks/useOziow";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  Badge,
  Loader,
  Button
} from "@oziow/ui";
import { Users as UsersIcon, Plus } from "lucide-react";

export default function UsersPage() {
  const oziow = useOziow();

  const { data: users, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      // Dans le MVP final ce sera oziow.users.list()
      const res = await oziow.get<any>("/v1/users");
      return res.data || [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Utilisateurs</h2>
          <p className="text-muted-foreground">Gérez les membres de votre organisation et leurs accès.</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Inviter
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Membres Actifs</CardTitle>
            <CardDescription>Liste de tous les utilisateurs ayant accès à ce locataire.</CardDescription>
          </div>
          <UsersIcon className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader size={32} /></div>
          ) : error ? (
            <div className="p-4 text-red-500">Erreur de chargement: {error.message}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                      Aucun utilisateur trouvé.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user: any) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{user.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.role || 'user'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">Éditer</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
