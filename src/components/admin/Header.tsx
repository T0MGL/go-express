import { Bell, SignOut, GearSix, Command, List } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { GlobalSearch } from './GlobalSearch';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-color';

interface HeaderProps {
  scrolled?: boolean;
  onMenuClick?: () => void;
}

export const Header = ({ scrolled, onMenuClick }: HeaderProps) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const displayName = user?.nombre ?? 'Admin';
  const initials = getInitials(displayName);
  const avatarTone = getAvatarColor(displayName);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className={cn(
      'h-12 border-b border-border/30 bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-40 transition-[box-shadow,border-color] duration-200',
      scrolled && 'header-scrolled'
    )}>
      <div className="flex items-center gap-2 flex-1 max-w-md">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onMenuClick}
          aria-label="Abrir menu"
        >
          <List size={18} weight="bold" />
        </Button>
        <div className="flex-1">
          <GlobalSearch />
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        {/* Keyboard shortcut hint */}
        <div className="hidden lg:flex items-center gap-1 mr-2 text-muted-foreground/40">
          <kbd className="kbd">
            <Command size={9} weight="bold" />
          </kbd>
          <kbd className="kbd">K</kbd>
        </div>

        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Notificaciones">
          <Bell size={17} weight="duotone" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 h-8 pl-1.5 pr-2 ml-0.5">
              <Avatar className="h-6 w-6">
                <AvatarFallback className={cn(avatarTone.bg, avatarTone.text, 'text-[10px] font-semibold')}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-[13px] font-medium hidden md:inline">
                {user?.nombre ?? 'Admin'}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user?.nombre ?? 'Administrador'}</p>
              <p className="text-xs text-muted-foreground">{user?.email ?? ''}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/admin/configuracion')}>
              <GearSix size={16} weight="duotone" className="mr-2" />
              Configuración
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
              <SignOut size={16} weight="duotone" className="mr-2" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
