import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ToolbarProps {
  onVersionsClick: () => void;
}

export function Toolbar({ onVersionsClick }: ToolbarProps) {
  return (
    <div className="flex items-center gap-3">
      <Button 
        variant="secondary" 
        onClick={onVersionsClick}
        data-testid="button-versions"
      >
        <Clock className="w-4 h-4 mr-2" />
        Versions
      </Button>
    </div>
  );
}
