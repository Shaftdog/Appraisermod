/**
 * Upload progress indicator component
 */

import { CheckCircle, XCircle, Upload, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface PhotoUploadProgressProps {
  upload: {
    id: string;
    file: File;
    progress: number;
    status: 'uploading' | 'processing' | 'complete' | 'error';
    error?: string;
  };
}

export function PhotoUploadProgress({ upload }: PhotoUploadProgressProps) {
  const { file, progress, status, error } = upload;

  const getStatusIcon = () => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'complete':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'uploading':
        return `Uploading... ${progress}%`;
      case 'processing':
        return 'Processing...';
      case 'complete':
        return 'Complete';
      case 'error':
        return error || 'Upload failed';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return 'blue';
      case 'complete':
        return 'green';
      case 'error':
        return 'red';
    }
  };

  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="flex items-center gap-3">
        {/* File icon/thumbnail */}
        <div className="flex-shrink-0">
          {getStatusIcon()}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium truncate" title={file.name}>
              {file.name}
            </p>
            <span className="text-xs text-muted-foreground ml-2">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>

          {/* Progress bar */}
          {(status === 'uploading' || status === 'processing') && (
            <div className="mt-2">
              <Progress 
                value={status === 'uploading' ? progress : 100} 
                className="h-2"
              />
            </div>
          )}

          {/* Status text */}
          <p 
            className={cn(
              "text-xs mt-1",
              status === 'error' && "text-destructive",
              status === 'complete' && "text-green-600",
              (status === 'uploading' || status === 'processing') && "text-muted-foreground"
            )}
          >
            {getStatusText()}
          </p>
        </div>
      </div>
    </div>
  );
}