import { Building2, Check, Moon, Palette, Sun, Upload, AlertCircle, Loader2, Bell, Store, Languages, Zap, Eye, EyeOff, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { PageHeader } from "./app-shell";
import { usePos } from "./pos-context";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences, useUpdateTheme, useUpdateAccentColor, useUpdateLanguage, useUpdateAIModel } from "@/hooks/useUserPreferences";
import { AI_MODELS, ALLOWED_AI_MODELS } from "@/constants/ai-models";
import { useBusiness, useUploadBusinessLogo } from "@/hooks/useBusiness";
import { useNotificationPreferences, useToggleSalesNotifications, useToggleProductNotifications, useToggleSoundNotifications } from "@/hooks/useNotifications";
import { useAICredentials, useSaveAICredentials, useDeleteAICredentials, useTestAIConnection } from "@/hooks/useAICredentials";
import { businessService } from "@/services/business.service";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type BusinessFormData = {
  name: string;
  tax_id: string;
  address: string;
  phone: string;
};

export function SettingsScreen() {
  const { dark, setDark, language, setLanguage, t, accentColor, setAccentColor } = usePos();
  const { user } = useAuth();
  const [error, setError] = useState<string>("");
  const [localAccentColor, setLocalAccentColor] = useState(accentColor);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // AI Credentials state
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('claude-3-5-haiku-20241022');
  const { data: aiCredentials } = useAICredentials(user?.id || null);
  const saveApiKeyMutation = useSaveAICredentials(user?.id || null);
  const deleteApiKeyMutation = useDeleteAICredentials(user?.id || null);
  const testConnectionMutation = useTestAIConnection(user?.id || null);

  // Business form state
  const [isEditingBusiness, setIsEditingBusiness] = useState(false);
  const [isSavingBusiness, setIsSavingBusiness] = useState(false);
  const [formData, setFormData] = useState<BusinessFormData>({
    name: "",
    tax_id: "",
    address: "",
    phone: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setLocalAccentColor(accentColor);
  }, [accentColor]);

  // Datos
  const { data: preferences } = useUserPreferences(user?.id || null);
  const { data: business } = useBusiness();
  const { data: notificationPrefs } = useNotificationPreferences(user?.id || null);

  // Mutaciones
  const updateThemeMutation = useUpdateTheme(user?.id || null);
  const updateAccentColorMutation = useUpdateAccentColor(user?.id || null);
  const updateLanguageMutation = useUpdateLanguage(user?.id || null);
  const updateAIModelMutation = useUpdateAIModel(user?.id || null);
  const uploadLogomutation = useUploadBusinessLogo();
  const toggleSalesNotificationsMutation = useToggleSalesNotifications(user?.id || null);
  const toggleProductNotificationsMutation = useToggleProductNotifications(user?.id || null);
  const toggleSoundNotificationsMutation = useToggleSoundNotifications(user?.id || null);

  const handleThemeChange = async (newDark: boolean) => {
    try {
      setError("");
      setDark(newDark);
      await updateThemeMutation.mutateAsync(newDark ? 'dark' : 'light');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar tema");
    }
  };

  const handleLanguageChange = async (newLanguage: 'es' | 'en' | 'ca') => {
    try {
      setError("");
      setLanguage(newLanguage);
      await updateLanguageMutation.mutateAsync(newLanguage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar idioma");
    }
  };

  const handleAIModelChange = async (newModelId: string) => {
    try {
      setError("");
      await updateAIModelMutation.mutateAsync(newModelId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar modelo de IA");
    }
  };

  const handleAccentColorChange = async (color: string) => {
    try {
      setError("");
      setLocalAccentColor(color);
      setAccentColor(color);
      await updateAccentColorMutation.mutateAsync(color);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar color");
    }
  };

  const handleEditBusiness = () => {
    if (business) {
      setFormData({
        name: business.name || "",
        tax_id: business.tax_id || "",
        address: business.address || "",
        phone: business.phone || "",
      });
    } else {
      setFormData({ name: "", tax_id: "", address: "", phone: "" });
    }
    setLogoFile(null);
    setLogoPreviewUrl(null);
    setIsEditingBusiness(true);
    setError("");
  };

  const handleCancelBusiness = () => {
    setIsEditingBusiness(false);
    setFormData({ name: "", tax_id: "", address: "", phone: "" });
    setLogoFile(null);
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl(null);
    }
    setError("");
  };

  const handleFormChange = (field: keyof BusinessFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoFile(file);
    const url = URL.createObjectURL(file);
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoPreviewUrl(url);
  };

  const handleSaveBusiness = async () => {
    try {
      setError("");

      // Validar que name no esté vacío
      if (!formData.name.trim()) {
        setError("El nombre del negocio es requerido");
        setIsSavingBusiness(false);
        return;
      }

      setIsSavingBusiness(true);

      let businessId = business?.id;
      console.log("[BUSINESS SAVE] businessId:", businessId);
      console.log("[BUSINESS SAVE] formData:", formData);

      const updateData = {
        name: formData.name.trim(),
        tax_id: formData.tax_id.trim() || null,
        address: formData.address.trim() || null,
        phone: formData.phone.trim() || null,
      };

      console.log("[BUSINESS SAVE] updateData (to send):", updateData);

      // Always UPDATE if business exists (never INSERT again - singleton pattern)
      if (businessId) {
        console.log("[BUSINESS SAVE] UPDATE START - id:", businessId, "payload:", updateData);
        await businessService.update(businessId, updateData as any);
        console.log("[BUSINESS SAVE] UPDATE SUCCESS");
      } else {
        // Only CREATE once if no business exists yet
        console.log("[BUSINESS SAVE] CREATE START - payload:", updateData);
        const newBusiness = await businessService.create(updateData as any);
        console.log("[BUSINESS SAVE] CREATE SUCCESS - result:", newBusiness);
        businessId = newBusiness.id;
      }

      // Si hay logo nuevo, subirlo
      if (logoFile && businessId) {
        console.log("[BUSINESS LOGO] UPLOAD START - businessId:", businessId, "file:", logoFile.name);
        await uploadLogomutation.mutateAsync({ businessId, file: logoFile });
        console.log("[BUSINESS LOGO] UPLOAD SUCCESS");
      }

      // Limpiar preview
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
        setLogoPreviewUrl(null);
      }

      // Refetch business
      console.log("[BUSINESS SAVE] REFETCH START");
      await queryClient.refetchQueries({ queryKey: ["business"] });
      console.log("[BUSINESS SAVE] REFETCH SUCCESS");

      // Salir de edición
      setIsEditingBusiness(false);
      setFormData({ name: "", tax_id: "", address: "", phone: "" });
      setLogoFile(null);
      console.log("[BUSINESS SAVE] COMPLETE");
    } catch (err) {
      console.error("[BUSINESS SAVE] ERROR:", err);
      setError(err instanceof Error ? err.message : "Error al guardar datos");
    } finally {
      setIsSavingBusiness(false);
    }
  };

  const handleToggleSalesNotifications = async (enabled: boolean) => {
    try {
      setError("");
      await toggleSalesNotificationsMutation.mutateAsync(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar preferencias");
    }
  };

  const handleToggleProductNotifications = async (enabled: boolean) => {
    try {
      setError("");
      await toggleProductNotificationsMutation.mutateAsync(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar preferencias");
    }
  };

  const handleToggleSoundNotifications = async (enabled: boolean) => {
    try {
      setError("");
      await toggleSoundNotificationsMutation.mutateAsync(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar preferencias");
    }
  };

  const handleSaveApiKey = async () => {
    try {
      setError("");
      if (!apiKeyInput.trim()) {
        setError("La clave API no puede estar vacía");
        return;
      }
      await saveApiKeyMutation.mutateAsync({ apiKey: apiKeyInput, modelId: selectedModel });
      setApiKeyInput("");
      setShowApiKey(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar clave API");
    }
  };

  const handleDeleteApiKey = async () => {
    try {
      setError("");
      await deleteApiKeyMutation.mutateAsync();
      setApiKeyInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar clave API");
    }
  };

  const handleTestConnection = async () => {
    try {
      setError("");
      const result = await testConnectionMutation.mutateAsync();
      if (result.valid) {
        alert("✅ Conexión válida con Anthropic");
      } else {
        setError(result.error || "Conexión inválida");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al probar conexión");
    }
  };

  const currentTheme = preferences?.theme === 'dark' ? 'dark' : 'light';

  return (
    <>
      <PageHeader title={t("settings")} subtitle="Personaliza el sistema y los dispositivos del punto de venta" />
      {error && (
        <div className="mx-6 mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      <Tabs defaultValue="appearance" orientation="vertical" className="grid grid-cols-[210px_1fr] gap-6">
        <TabsList className="h-fit flex-col items-stretch bg-transparent p-0">
          <TabsTrigger value="appearance" className="justify-start">
            <Palette />
            Apariencia
          </TabsTrigger>
          <TabsTrigger value="business" className="justify-start">
            <Store />
            Negocio
          </TabsTrigger>
          <TabsTrigger value="notifications" className="justify-start">
            <Bell />
            Notificaciones
          </TabsTrigger>
          <TabsTrigger value="ai" className="justify-start">
            <Zap />
            Inteligencia artificial
          </TabsTrigger>
        </TabsList>
        <div className="max-w-3xl rounded-lg border bg-card p-6">
          <TabsContent value="appearance" className="mt-0 space-y-7">
            <div>
              <h2 className="text-sm font-bold">Tema</h2>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">Elige cómo quieres ver TPV PRO.</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`flex h-20 items-center gap-3 rounded-md border p-4 text-left transition-colors ${
                    currentTheme === 'light' ? "border-primary bg-primary/5" : "hover:bg-muted"
                  }`}
                  onClick={() => handleThemeChange(false)}
                  disabled={updateThemeMutation.isPending}
                >
                  <Sun />
                  <span>
                    <b className="block text-sm">Modo claro</b>
                    <small className="text-muted-foreground">Luminoso y limpio</small>
                  </span>
                  {currentTheme === 'light' && <Check className="ml-auto text-primary" />}
                </button>
                <button
                  className={`flex h-20 items-center gap-3 rounded-md border p-4 text-left transition-colors ${
                    currentTheme === 'dark' ? "border-primary bg-primary/5" : "hover:bg-muted"
                  }`}
                  onClick={() => handleThemeChange(true)}
                  disabled={updateThemeMutation.isPending}
                >
                  <Moon />
                  <span>
                    <b className="block text-sm">Modo oscuro</b>
                    <small className="text-muted-foreground">Cómodo con poca luz</small>
                  </span>
                  {currentTheme === 'dark' && <Check className="ml-auto text-primary" />}
                </button>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-bold">Color de acento</h2>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">Color principal para acciones y selecciones.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => document.getElementById('accent-color-picker')?.click()}
                  className="h-9 w-9 cursor-pointer rounded-full border-2 border-muted-foreground transition-transform hover:scale-110"
                  style={{ backgroundColor: localAccentColor }}
                  title="Selector de color personalizado"
                />
                <input
                  id="accent-color-picker"
                  type="color"
                  value={localAccentColor}
                  onChange={(e) => handleAccentColorChange(e.target.value)}
                  className="hidden"
                />
              </div>
            </div>

            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Languages size={17} />
                Idioma
              </h2>
              <Select value={language} onValueChange={(v) => handleLanguageChange(v as 'es' | 'en' | 'ca')}>
                <SelectTrigger className="mt-3 w-64" disabled={updateLanguageMutation.isPending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ca">Català</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="business" className="mt-0">
            <h2 className="text-sm font-bold">Datos del negocio</h2>
            <p className="mt-1 text-xs text-muted-foreground">Información que aparece en tus tickets.</p>
            <div className="mt-6 flex items-center gap-4">
              <div className="place-items-center bg-transparent rounded-md overflow-hidden" style={{ aspectRatio: "1/1", width: "80px", height: "80px", display: "grid" }}>
                {isEditingBusiness && logoPreviewUrl ? (
                  <img src={logoPreviewUrl} alt="Logo Preview" className="w-full h-full object-contain" />
                ) : business?.logo_url ? (
                  <img src={`${business.logo_url}?v=${business?.updated_at || ''}`} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center gap-1">
                    <Upload size={16} />
                    <span className="text-xs">Sube tu logo</span>
                  </div>
                )}
              </div>
              {isEditingBusiness && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isSavingBusiness}
                  >
                    {isSavingBusiness ? <Loader2 className="mr-2 animate-spin" /> : <Upload className="mr-2" />}
                    Cambiar logo
                  </Button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoSelect}
                    className="hidden"
                  />
                </>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input
                  disabled={!isEditingBusiness}
                  value={isEditingBusiness ? formData.name : (business?.name || "")}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="Nombre del negocio"
                  className={isEditingBusiness ? "focus-visible:ring-accent" : ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label>NIF</Label>
                <Input
                  disabled={!isEditingBusiness}
                  value={isEditingBusiness ? formData.tax_id : (business?.tax_id || "")}
                  onChange={(e) => handleFormChange('tax_id', e.target.value)}
                  placeholder="NIF/CIF"
                  className={isEditingBusiness ? "focus-visible:ring-accent" : ""}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Dirección</Label>
                <Input
                  disabled={!isEditingBusiness}
                  value={isEditingBusiness ? formData.address : (business?.address || "")}
                  onChange={(e) => handleFormChange('address', e.target.value)}
                  placeholder="Dirección completa"
                  className={isEditingBusiness ? "focus-visible:ring-accent" : ""}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Teléfono</Label>
                <Input
                  disabled={!isEditingBusiness}
                  value={isEditingBusiness ? formData.phone : (business?.phone || "")}
                  onChange={(e) => handleFormChange('phone', e.target.value)}
                  placeholder="Teléfono"
                  className={isEditingBusiness ? "focus-visible:ring-accent" : ""}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              {!isEditingBusiness ? (
                <Button onClick={handleEditBusiness}>Editar</Button>
              ) : (
                <>
                  <Button
                    onClick={handleSaveBusiness}
                    disabled={isSavingBusiness}
                  >
                    {isSavingBusiness ? <Loader2 className="mr-2 animate-spin" /> : <Check className="mr-2" size={18} />}
                    Guardar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelBusiness}
                    disabled={isSavingBusiness}
                  >
                    Cancelar
                  </Button>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-0 space-y-4">
            <h2 className="text-sm font-bold">Preferencias de notificaciones</h2>
            <p className="text-xs text-muted-foreground">Elige qué notificaciones deseas recibir.</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border p-4">
                <div>
                  <b className="text-sm">Notificaciones de ventas</b>
                  <p className="text-xs text-muted-foreground">Recibe alertas cuando se registre una nueva venta</p>
                </div>
                <Switch
                  checked={notificationPrefs?.sales_enabled ?? false}
                  onCheckedChange={handleToggleSalesNotifications}
                  disabled={toggleSalesNotificationsMutation.isPending}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-4">
                <div>
                  <b className="text-sm">Notificaciones de productos</b>
                  <p className="text-xs text-muted-foreground">Recibe alertas cuando se agreguen nuevos productos</p>
                </div>
                <Switch
                  checked={notificationPrefs?.products_enabled ?? false}
                  onCheckedChange={handleToggleProductNotifications}
                  disabled={toggleProductNotificationsMutation.isPending}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-4">
                <div>
                  <b className="text-sm">Sonido de notificaciones</b>
                  <p className="text-xs text-muted-foreground">Reproduce un sonido cuando llega una notificación</p>
                </div>
                <Switch
                  checked={notificationPrefs?.sound_enabled ?? true}
                  onCheckedChange={handleToggleSoundNotifications}
                  disabled={toggleSoundNotificationsMutation.isPending}
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="ai" className="mt-0 space-y-8">
            {/* Mi propia API Key de Anthropic */}
            <div className="border-b pb-6">
              <h2 className="text-sm font-bold mb-1">Mi API Key de Anthropic</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Introduce tu propia clave para usar tu cuenta de Anthropic. Se almacena de forma segura sin exponerse.
              </p>

              {aiCredentials ? (
                <div className="space-y-3">
                  <div className="rounded-lg bg-green-50 dark:bg-green-950 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <div className="text-xs">
                        <p className="font-semibold text-green-900 dark:text-green-100">Clave configurada</p>
                        <p className="text-muted-foreground">Última actualización: {new Date(aiCredentials.updated_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Modelo seleccionado</Label>
                    <Select
                      value={aiCredentials.model_id}
                      onValueChange={(modelId) => {
                        // TODO: Update model selection via API
                      }}
                    >
                      <SelectTrigger className="w-full">
                        {AI_MODELS[aiCredentials.model_id as keyof typeof AI_MODELS] ? (
                          <span>{AI_MODELS[aiCredentials.model_id as keyof typeof AI_MODELS].name}</span>
                        ) : (
                          <SelectValue />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {ALLOWED_AI_MODELS.map((modelId) => {
                          const model = AI_MODELS[modelId];
                          return (
                            <SelectItem key={modelId} value={modelId}>
                              <span className="font-semibold">{model.name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">— {model.recommendedFor}</span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={testConnectionMutation.isPending}
                    >
                      {testConnectionMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Probar conexión
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteApiKey}
                      disabled={deleteApiKeyMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar clave
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="api-key" className="text-xs font-semibold">
                      Clave API
                    </Label>
                    <div className="relative">
                      <input
                        id="api-key"
                        type={showApiKey ? "text" : "password"}
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="sk-ant-..."
                        className="w-full px-3 py-2 border rounded-md bg-background text-sm pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Obtén tu clave en <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline">console.anthropic.com</a>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="model-select" className="text-xs font-semibold">
                      Modelo de Claude
                    </Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger id="model-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALLOWED_AI_MODELS.map((modelId) => {
                          const model = AI_MODELS[modelId];
                          return (
                            <SelectItem key={modelId} value={modelId}>
                              {model.name}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleSaveApiKey}
                    disabled={saveApiKeyMutation.isPending || !apiKeyInput.trim()}
                    className="w-full"
                  >
                    {saveApiKeyMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Guardar clave
                  </Button>
                </div>
              )}
            </div>

            {/* Modelo por defecto del sistema */}
            <div>
              <h2 className="text-sm font-bold">Procesamiento de documentos (predeterminado)</h2>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">
                Elige el modelo de Claude para procesar facturas y albaranes cuando no uses tu propia API Key.
              </p>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="ai-model-select" className="text-xs font-semibold">
                    Modelo de IA
                  </Label>
                  <Select
                    value={preferences?.ai_model_id || 'claude-haiku-5-5'}
                    onValueChange={handleAIModelChange}
                    disabled={updateAIModelMutation.isPending}
                  >
                    <SelectTrigger id="ai-model-select" className="mt-2 w-full">
                      {preferences?.ai_model_id && AI_MODELS[preferences.ai_model_id as keyof typeof AI_MODELS] ? (
                        <span>{AI_MODELS[preferences.ai_model_id as keyof typeof AI_MODELS].name}</span>
                      ) : (
                        <SelectValue />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {ALLOWED_AI_MODELS.map((modelId) => {
                        const model = AI_MODELS[modelId];
                        return (
                          <SelectItem key={modelId} value={modelId}>
                            <span className="font-semibold">{model.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">— {model.recommendedFor}</span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {preferences?.ai_model_id && AI_MODELS[preferences.ai_model_id as keyof typeof AI_MODELS] && (
                  <div className="rounded-lg bg-muted p-4 space-y-2">
                    <h3 className="text-xs font-semibold">
                      {AI_MODELS[preferences.ai_model_id as keyof typeof AI_MODELS].name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {AI_MODELS[preferences.ai_model_id as keyof typeof AI_MODELS].description}
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                      <p>
                        <strong>Entrada:</strong> €{AI_MODELS[preferences.ai_model_id as keyof typeof AI_MODELS].inputCostPerMillion.toFixed(2)}/millón de tokens
                      </p>
                      <p>
                        <strong>Salida:</strong> €{AI_MODELS[preferences.ai_model_id as keyof typeof AI_MODELS].outputCostPerMillion.toFixed(2)}/millón de tokens
                      </p>
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-500 pt-2 border-t italic">
                      El coste real depende del documento y de los tokens consumidos. Se muestra solo a efectos informativos.
                    </p>
                  </div>
                )}

                {updateAIModelMutation.isPending && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    Guardando...
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}