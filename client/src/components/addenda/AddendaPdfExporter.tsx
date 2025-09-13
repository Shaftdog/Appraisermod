/**
 * PDF Export integration for AddendaExportBar
 * Converts addenda documents to PDF using pdf-lib
 */

import { useState } from 'react';
import { Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  generateAddendaPdf,
  GenerateAddendaInput,
  GenerateResult
} from '@/lib/pdf/addendaPdf';
import { uploadAddendaPdf } from '@/lib/photoApi';
import { PdfExportOptions } from '@/config/pdf';
import { PDFExportSettings } from '@/types/addenda';
import { PhotoAddenda, PhotoMeta } from '@/types/photos';
import { isAuthError } from '@/lib/photoApi';
import { AUTH_BANNER_MESSAGE } from '@/config/auth';

interface AddendaPdfExporterProps {
  orderId: string;
  addenda: PhotoAddenda;
  photosById: Record<string, PhotoMeta>;
  settings: PDFExportSettings;
  onExportComplete?: (result: GenerateResult & { pdfPath: string }) => void;
  onExportError?: (error: Error) => void;
  children?: React.ReactNode;
  className?: string;
}

interface ExportState {
  status: 'idle' | 'generating' | 'uploading' | 'success' | 'error';
  progress?: string;
  result?: GenerateResult & { pdfPath: string };
  error?: string;
}

/**
 * Convert PDFExportSettings to PdfExportOptions
 */
function convertExportSettings(settings: PDFExportSettings): Partial<PdfExportOptions> {
  const dpiTargetMap = { low: 150, medium: 220, high: 300 };
  
  return {
    pageSize: 'LETTER',
    orientation: 'portrait',
    marginPt: 36,
    dpiTarget: dpiTargetMap[settings.quality],
    drawHeader: true,
    drawFooter: true,
    watermark: settings.watermark?.text ? {
      text: settings.watermark.text,
      opacity: settings.watermark.opacity,
      angleDeg: settings.watermark.position === 'center' ? 45 : 30,
      size: undefined // Use default
    } : null,
    caption: { fontSize: 9, maxLines: 2 }
  };
}

export function AddendaPdfExporter({
  orderId,
  addenda,
  photosById,
  settings,
  onExportComplete,
  onExportError,
  children,
  className
}: AddendaPdfExporterProps) {
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle' });
  const { toast } = useToast();

  const handleExport = async () => {
    try {
      setExportState({ status: 'generating', progress: 'Generating PDF...' });

      // Convert settings and prepare input
      const pdfOptions = convertExportSettings(settings);
      const input: GenerateAddendaInput = {
        orderId,
        addenda,
        photosById,
        options: pdfOptions,
        meta: {
          title: settings.title,
          author: settings.author,
          subject: settings.subject,
          keywords: settings.keywords
        }
      };

      // Generate PDF
      const result = await generateAddendaPdf(input);
      
      setExportState({ 
        status: 'uploading', 
        progress: `Uploading PDF (${(result.bytes / 1024 / 1024).toFixed(1)} MB)...` 
      });

      // Upload to server
      const uploadResult = await uploadAddendaPdf(orderId, result.blob);
      
      const finalResult = {
        ...result,
        pdfPath: uploadResult.pdfPath
      };

      setExportState({ 
        status: 'success', 
        result: finalResult,
        progress: 'Export complete!'
      });

      // Show success toast
      toast({
        title: "PDF Export Complete",
        description: `Generated ${result.pageCount} page PDF (${(result.bytes / 1024 / 1024).toFixed(1)} MB)`,
      });

      // Create download link
      const downloadUrl = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(downloadUrl);

      onExportComplete?.(finalResult);

    } catch (error: any) {
      console.error('PDF export failed:', error);
      
      let errorMessage = 'Failed to generate PDF';
      
      if (isAuthError(error)) {
        errorMessage = 'Authentication failed. Please check your login status.';
        toast({
          title: "Authentication Error",
          description: AUTH_BANNER_MESSAGE,
          variant: "destructive",
        });
      } else if (error.message) {
        errorMessage = error.message;
      }

      setExportState({ 
        status: 'error', 
        error: errorMessage 
      });

      toast({
        title: "Export Failed",
        description: errorMessage,
        variant: "destructive",
      });

      onExportError?.(error);
    }
  };

  const isLoading = exportState.status === 'generating' || exportState.status === 'uploading';

  return (
    <div className={className}>
      {children ? (
        <div onClick={handleExport}>
          {children}
        </div>
      ) : (
        <Button 
          onClick={handleExport} 
          disabled={isLoading}
          data-testid="button-export-pdf"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {exportState.progress || 'Exporting...'}
            </>
          ) : exportState.status === 'success' ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Export Complete
            </>
          ) : exportState.status === 'error' ? (
            <>
              <AlertCircle className="h-4 w-4 mr-2" />
              Export Failed
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </>
          )}
        </Button>
      )}
      
      {/* Progress indicator */}
      {exportState.progress && (
        <div className="mt-2 text-sm text-muted-foreground">
          {exportState.progress}
        </div>
      )}
      
      {/* Success info */}
      {exportState.status === 'success' && exportState.result && (
        <div className="mt-2 text-sm text-green-600">
          Generated {exportState.result.pageCount} page PDF 
          ({(exportState.result.bytes / 1024 / 1024).toFixed(1)} MB)
        </div>
      )}
      
      {/* Error info */}
      {exportState.status === 'error' && exportState.error && (
        <div className="mt-2 text-sm text-red-600">
          {exportState.error}
        </div>
      )}
    </div>
  );
}