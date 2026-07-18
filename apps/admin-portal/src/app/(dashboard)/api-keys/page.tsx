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
import { Key, Plus, Trash2 } from "lucide-react";

export default function ApiKeysPage() {
  const oziow = useOziow();

  const { data: keys, isLoading, error } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await oziow.get<any>("/v1/api-keys");
      return res.data || [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Clés API</h2>
          <p className="text-muted-foreground">Gérez les clés d'accès M2M pour vos applications.</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nouvelle Clé
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Vos Clés Actives</CardTitle>
            <CardDescription>Les clés API permettent à des services externes de communiquer avec votre tenant.</CardDescription>
          </div>
          <Key className="h-5 w-5 text-muted-foreground" />
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
                  <TableHead>Nom</TableHead>
                  <TableHead>Environnement</TableHead>
                  <TableHead>Préfixe</TableHead>
                  <TableHead>Créée le</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                      Aucune clé API trouvée.
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map((key: any) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        <Badge variant={key.environment === "production" ? "default" : "secondary"}>
                          {key.environment}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{key.prefix}••••••••</TableCell>
                      <TableCell>{new Date(key.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
