import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CaretLeft } from '@phosphor-icons/react';
import { EnvioWizard } from '@/components/admin/EnvioWizard';

const EnvioNew = () => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/envios')}
          className="gap-1.5"
        >
          <CaretLeft size={14} weight="duotone" />
          Volver
        </Button>
      </div>

      <EnvioWizard />
    </div>
  );
};

export default EnvioNew;
