import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, RotateCcw } from 'lucide-react';
import { VersionSnapshot } from '@/types';
import { compareObjects, generateJsonDiff, copyToClipboard, DiffResult } from '@/lib/diff';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface VersionDiffViewerProps {
  versions: VersionSnapshot[];
  currentData: Record<string, any>;
  onClose: () => void;
  open: boolean;
}

export function VersionDiffViewer({ versions, currentData, onClose, open }: VersionDiffViewerProps) {
  const [fromVersion, setFromVersion] = useState<string>('');
  const [toVersion, setToVersion] = useState<string>('current');
  const [viewMode, setViewMode] = useState<'field' | 'json'>('field');
  const { toast } = useToast();

  // Initialize default versions
  useState(() => {
    if (versions.length > 0) {
      setFromVersion(versions[0]?.id || '');
    }
  });

  const versionOptions = [
    { id: 'current', label: 'Current (Unsaved)', data: currentData },
    ...versions.map(v => ({ 
      id: v.id, 
      label: `${v.label} • ${new Date(v.createdAt).toLocaleDateString()} ${new Date(v.createdAt).toLocaleTimeString()}`,
      data: v.data 
    }))
  ];

  const fromData = versionOptions.find(v => v.id === fromVersion)?.data || {};
  const toData = versionOptions.find(v => v.id === toVersion)?.data || {};

  const fieldDiffs = useMemo(() => {
    return compareObjects(fromData, toData);
  }, [fromData, toData]);

  const jsonDiff = useMemo(() => {
    return generateJsonDiff(fromData, toData);
  }, [fromData, toData]);

  const handleCopyDiff = async () => {
    try {
      const content = viewMode === 'field' 
        ? JSON.stringify(fieldDiffs, null, 2)
        : jsonDiff;
      
      await copyToClipboard(content);
      toast({
        title: "Copied to clipboard",
        description: "Diff content has been copied to your clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy diff to clipboard.",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: DiffResult['status']) => {
    switch (status) {
      case 'added':
        return 'bg-green-100 text-green-800';
      case 'removed':
        return 'bg-red-100 text-red-800';
      case 'changed':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatValue = (value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="w-full max-w-4xl max-h-[90vh] overflow-hidden" data-testid="dialog-version-diff">
        <DialogHeader>
          <DialogTitle>Version History & Diff Viewer</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Version Comparison Controls */}
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Compare From</label>
              <Select value={fromVersion} onValueChange={setFromVersion}>
                <SelectTrigger data-testid="select-from-version">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {versionOptions.map(version => (
                    <SelectItem key={version.id} value={version.id}>
                      {version.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Compare To</label>
              <Select value={toVersion} onValueChange={setToVersion}>
                <SelectTrigger data-testid="select-to-version">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {versionOptions.map(version => (
                    <SelectItem key={version.id} value={version.id}>
                      {version.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">View Mode</label>
              <div className="flex bg-muted rounded-lg p-1">
                <button
                  onClick={() => setViewMode('field')}
                  className={cn(
                    "flex-1 py-2 px-3 text-sm font-medium rounded transition-colors",
                    viewMode === 'field' 
                      ? "bg-background text-foreground" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="button-field-view"
                >
                  Field View
                </button>
                <button
                  onClick={() => setViewMode('json')}
                  className={cn(
                    "flex-1 py-2 px-3 text-sm font-medium rounded transition-colors",
                    viewMode === 'json' 
                      ? "bg-background text-foreground" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="button-json-view"
                >
                  Raw JSON
                </button>
              </div>
            </div>
          </div>

          {/* Diff Controls */}
          <div className="flex items-center gap-3">
            <Button onClick={handleCopyDiff} data-testid="button-copy-diff">
              <Copy className="w-4 h-4 mr-2" />
              Copy Diff
            </Button>
            <Button variant="secondary" disabled data-testid="button-restore-version">
              <RotateCcw className="w-4 h-4 mr-2" />
              Restore Version
            </Button>
          </div>

          {/* Diff Content */}
          {viewMode === 'field' ? (
            <div className="space-y-4" data-testid="content-field-diff">
              {fieldDiffs.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  No differences found between selected versions.
                </div>
              ) : (
                <div className="bg-background border border-border rounded-lg p-4">
                  <h4 className="font-medium text-foreground mb-3">Field Changes</h4>
                  <div className="space-y-2 text-sm">
                    {fieldDiffs.map((diff, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <span className="w-32 text-muted-foreground font-mono">
                          {diff.field}:
                        </span>
                        <span className={cn("px-2 py-1 rounded text-xs font-medium", getStatusColor(diff.status))}>
                          {diff.status.charAt(0).toUpperCase() + diff.status.slice(1)}
                        </span>
                        {diff.status === 'changed' && (
                          <>
                            <span className="text-red-600 line-through font-mono text-xs">
                              {formatValue(diff.oldValue)}
                            </span>
                            <span className="text-green-600 font-medium font-mono text-xs">
                              → {formatValue(diff.newValue)}
                            </span>
                          </>
                        )}
                        {diff.status === 'added' && (
                          <span className="text-green-600 font-medium font-mono text-xs">
                            {formatValue(diff.newValue)}
                          </span>
                        )}
                        {diff.status === 'removed' && (
                          <span className="text-red-600 line-through font-mono text-xs">
                            {formatValue(diff.oldValue)}
                          </span>
                        )}
                        {diff.status === 'unchanged' && (
                          <span className="text-foreground font-mono text-xs">
                            {formatValue(diff.newValue)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4" data-testid="content-json-diff">
              <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm overflow-x-auto max-h-96">
                <pre className="whitespace-pre-wrap">
                  {jsonDiff || 'No differences found between selected versions.'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
