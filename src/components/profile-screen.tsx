import { useState, useRef, useEffect } from "react";
import { Loader2, Upload, AlertCircle, Eye, EyeOff, CheckCircle } from "lucide-react";
import { PageHeader } from "./app-shell";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useUpdateFullName, useUploadAvatar, useChangePassword, useUpdateEmail } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ProfileScreen() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id || null);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [newEmail, setNewEmail] = useState(user?.email || "");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const updateFullNameMutation = useUpdateFullName(user?.id || null);
  const uploadAvatarMutation = useUploadAvatar(user?.id || null);
  const changePasswordMutation = useChangePassword();
  const updateEmailMutation = useUpdateEmail();

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
  }, [profile?.full_name]);

  useEffect(() => {
    if (user?.email) setNewEmail(user.email);
  }, [user?.email]);

  const handleUpdateFullName = async () => {
    try {
      setError("");
      if (!fullName.trim()) {
        setError("El nombre no puede estar vacío");
        return;
      }
      await updateFullNameMutation.mutateAsync(fullName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar nombre");
    }
  };

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setError("");
      setSuccess("");
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadAvatarMutation.mutateAsync(file);
      setSuccess("Avatar actualizado correctamente");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir avatar");
    }
  };

  const handleChangePassword = async () => {
    try {
      setError("");
      setSuccess("");
      if (!newPassword || !confirmPassword) {
        setError("Completa todos los campos de contraseña");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Las nuevas contraseñas no coinciden");
        return;
      }
      if (newPassword.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres");
        return;
      }
      await changePasswordMutation.mutateAsync({ oldPassword: currentPassword, newPassword });
      setSuccess("Contraseña actualizada correctamente");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cambiar contraseña");
    }
  };

  const handleChangeEmail = async () => {
    try {
      setError("");
      setSuccess("");
      if (!newEmail) {
        setError("Ingresa un email");
        return;
      }
      if (newEmail === user?.email) {
        setError("El email es el mismo que el actual");
        return;
      }
      await updateEmailMutation.mutateAsync(newEmail);
      setSuccess("Email actualizado correctamente. Verifica tu nuevo email");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cambiar email");
    }
  };

  return (
    <>
      <PageHeader title="Perfil" subtitle="Gestiona tu información personal y configuración de cuenta" />
      {error && (
        <div className="mx-6 mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {success && (
        <div className="mx-6 mb-4 flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-sm text-green-700">
          ✅ {success}
        </div>
      )}
      <Tabs defaultValue="general" className="mx-6 grid gap-6">
        <TabsList className="w-fit">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="account">Cuenta</TabsTrigger>
        </TabsList>

        <div className="max-w-2xl rounded-lg border bg-card p-6">
          <TabsContent value="general" className="mt-0 space-y-6">
            <div>
              <h2 className="mb-4 text-sm font-bold">Avatar</h2>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-full overflow-hidden bg-muted">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.full_name || "Avatar"} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                      {(profile?.full_name || user?.email)?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadAvatarMutation.isPending}
                >
                  {uploadAvatarMutation.isPending ? <Loader2 className="mr-2 animate-spin" /> : <Upload className="mr-2" />}
                  Cambiar avatar
                </Button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadAvatar}
                  className="hidden"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <div className="flex gap-2">
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre completo"
                />
                <Button
                  onClick={handleUpdateFullName}
                  disabled={updateFullNameMutation.isPending || fullName === profile?.full_name}
                >
                  {updateFullNameMutation.isPending ? <Loader2 className="animate-spin" /> : "Guardar"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled placeholder="Tu email" />
              <p className="text-xs text-muted-foreground">El email se sincroniza con tu cuenta de Supabase Auth</p>
            </div>
          </TabsContent>

          <TabsContent value="account" className="mt-0 space-y-6">
            <div>
              <h2 className="mb-4 text-sm font-bold">Cambiar Email</h2>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Nuevo Email</Label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="nuevo@email.com"
                    />
                    <Button
                      onClick={handleChangeEmail}
                      disabled={updateEmailMutation.isPending || newEmail === user?.email}
                    >
                      {updateEmailMutation.isPending ? <Loader2 className="animate-spin" /> : "Actualizar"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Se enviará un email de confirmación a tu nuevo correo</p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="mb-4 text-sm font-bold">Cambiar Contraseña</h2>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Contraseña Actual</Label>
                  <Input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Contraseña actual"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nueva Contraseña</Label>
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nueva contraseña (mín. 6 caracteres)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirmar Contraseña</Label>
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmar nueva contraseña"
                  />
                </div>
                <Button
                  onClick={handleChangePassword}
                  disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                  className="w-full"
                >
                  {changePasswordMutation.isPending ? <Loader2 className="mr-2 animate-spin" /> : "Cambiar Contraseña"}
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4">
              <h3 className="mb-2 text-sm font-bold">Información de la cuenta</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID:</span>
                  <code className="font-mono">{user?.id?.slice(0, 12)}...</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email Auth:</span>
                  <span>{user?.email}</span>
                </div>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}
