"use client";

import { useState } from "react";
import { useAuth } from "@oziow/ui";
import { Button, Input, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@oziow/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { supabase } = useAuth();
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        alert(error.message);
      } else {
        window.location.href = "/dashboard";
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Oziow Admin Portal</CardTitle>
          <CardDescription>Entrez vos identifiants pour accéder au dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Email
              </label>
              <Input 
                id="email" 
                type="email" 
                placeholder="admin@oziow.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Mot de passe
              </label>
              <Input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">Se connecter</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
