import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl font-bold text-muted-foreground">404</span>
        </div>
        <h1 className="font-display text-xl font-bold mb-2">Pagina no encontrada</h1>
        <p className="text-sm text-muted-foreground mb-6">
          La pagina que buscas no existe o fue movida. Verifica la URL o volve al inicio.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            Volver atras
          </Button>
          <Button size="sm" onClick={() => navigate('/')}>
            Ir al inicio
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
