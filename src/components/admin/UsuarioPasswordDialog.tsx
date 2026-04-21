import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeSlash, ArrowClockwise, Copy, CheckCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useSetUsuarioPassword } from '@/hooks/api/use-usuarios';
import { extractApiError } from '@/lib/api';
import type { Usuario } from '@/data/types';

interface Props {
  usuario: Usuario | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MIN_LENGTH = 10;

// Matches the server schema: 10+ chars with at least one letter and one digit.
function validate(password: string, confirm: string): string | null {
  if (password.length < MIN_LENGTH) return `La contrasena debe tener al menos ${MIN_LENGTH} caracteres`;
  if (password.length > 128) return 'La contrasena no puede superar 128 caracteres';
  if (!/[A-Za-z]/.test(password)) return 'La contrasena debe incluir al menos una letra';
  if (!/[0-9]/.test(password)) return 'La contrasena debe incluir al menos un numero';
  if (password !== confirm) return 'Las contrasenas no coinciden';
  return null;
}

function generateStrongPassword(): string {
  // 14 chars, uppercase + lowercase + digit + symbol. The char set avoids
  // visually ambiguous glyphs (I, l, 1, O, 0) so ops can dictate it over the
  // phone without mistakes.
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%&*+=-';
  const all = lower + upper + digits + symbols;

  const bytes = new Uint8Array(28);
  crypto.getRandomValues(bytes);

  const picks: string[] = [
    upper[bytes[0]! % upper.length]!,
    lower[bytes[1]! % lower.length]!,
    digits[bytes[2]! % digits.length]!,
    symbols[bytes[3]! % symbols.length]!,
  ];

  for (let i = 4; i < 14; i++) {
    picks.push(all[bytes[i]! % all.length]!);
  }

  // Fisher-Yates shuffle so the required-class chars do not always land in the
  // first 4 positions.
  for (let i = picks.length - 1; i > 0; i--) {
    const j = bytes[14 + i]! % (i + 1);
    [picks[i], picks[j]] = [picks[j]!, picks[i]!];
  }

  return picks.join('');
}

export function UsuarioPasswordDialog({ usuario, open, onOpenChange }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const setPasswordMut = useSetUsuarioPassword();

  useEffect(() => {
    if (open) {
      setPassword('');
      setConfirm('');
      setReveal(false);
      setCopied(false);
    }
  }, [open]);

  const error = useMemo(() => {
    if (!password && !confirm) return null;
    return validate(password, confirm);
  }, [password, confirm]);

  const canSubmit = !error && password.length > 0 && !setPasswordMut.isPending;

  const handleGenerate = () => {
    const pw = generateStrongPassword();
    setPassword(pw);
    setConfirm(pw);
    setReveal(true);
  };

  const handleCopy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success('Contrasena copiada al portapapeles');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('No se pudo copiar la contrasena');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario || !canSubmit) return;

    setPasswordMut.mutate(
      { id: usuario.id, password },
      {
        onSuccess: () => {
          toast.success(`Contrasena actualizada para ${usuario.email}. Compartila por un canal seguro.`);
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(extractApiError(err, 'No se pudo actualizar la contrasena'));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Establecer nueva contrasena</DialogTitle>
          <DialogDescription>
            {usuario
              ? `Vas a definir una nueva contrasena para ${usuario.nombre} (${usuario.email}). No se envia ningun email, compartila por un canal seguro.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="pw" className="text-[13px]">Nueva contrasena</Label>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={handleGenerate}>
                <ArrowClockwise size={12} weight="bold" />
                Generar
              </Button>
            </div>
            <div className="relative">
              <Input
                id="pw"
                type={reveal ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="font-data pr-20"
                placeholder="Min. 10 caracteres, letras y numeros"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {reveal ? <EyeSlash size={14} weight="duotone" /> : <Eye size={14} weight="duotone" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleCopy}
                  disabled={!password}
                  aria-label="Copiar contrasena"
                >
                  {copied ? <CheckCircle size={14} weight="fill" className="text-success" /> : <Copy size={14} weight="duotone" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm" className="text-[13px]">Confirmar contrasena</Label>
            <Input
              id="pw-confirm"
              type={reveal ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="font-data"
            />
          </div>

          {error && (
            <p className="text-[12px] text-destructive" role="alert">{error}</p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {setPasswordMut.isPending ? 'Guardando...' : 'Establecer contrasena'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
