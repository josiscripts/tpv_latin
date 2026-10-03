import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Eye, EyeOff, Store, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';

export function LoginScreen() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate({ to: '/' });
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="animate-spin">
          <Store size={48} className="text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <div className="grid size-16 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg">
            <Store size={32} />
          </div>
        </div>

        {/* Título */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">Mercado Central</h1>
          <p className="mt-2 text-sm text-slate-400">TPV PRO</p>
        </div>

        {/* Tarjeta de login */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 shadow-xl">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Error message */}
            {error && (
              <div className="flex gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-4">
                <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="text-sm font-medium text-slate-300">Correo electrónico</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@tienda.com"
                disabled={isLoading}
                className="mt-2 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-sm font-medium text-slate-300">Contraseña</label>
              <div className="relative mt-2">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            {/* Login button */}
            <Button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full"
            >
              {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </Button>
          </form>

          {/* Info message */}
          <p className="mt-6 text-center text-xs text-slate-500">
            Ingresa tus credenciales para acceder al sistema TPV
          </p>
        </div>
      </div>
    </div>
  );
}
