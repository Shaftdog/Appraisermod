import { useState } from "react";
import { MapPin, Square, Trash2, Save, ToggleLeft, ToggleRight, Home, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Subject, CompProperty, MarketPolygon } from "@shared/schema";
import { cn } from "@/lib/utils";

interface MarketMapProps {
  subject: Subject;
  comps: CompProperty[];
  polygon: MarketPolygon | null;
  restrictToPolygon: boolean;
  className?: string;
  onSavePolygon?: (polygon: MarketPolygon | null) => void;
  onToggleRestrict?: (restricted: boolean) => void;
  onFocusComp?: (compId: string) => void;
}

// Placeholder map component - will be enhanced with actual react-leaflet later
export function MarketMap({
  subject,
  comps,
  polygon,
  restrictToPolygon,
  className,
  onSavePolygon,
  onToggleRestrict,
  onFocusComp
}: MarketMapProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const compsInPolygon = polygon ? comps.filter(comp => comp.isInsidePolygon).length : comps.length;
  const totalComps = comps.length;
  const polygonArea = polygon ? "0.25" : "0"; // Placeholder area calculation

  const handleToggleRestrict = () => {
    if (onToggleRestrict) {
      onToggleRestrict(!restrictToPolygon);
    }
  };

  const handleStartDrawing = () => {
    setIsDrawing(true);
  };

  const handleSavePolygon = () => {
    if (onSavePolygon) {
      // Placeholder polygon data
      const mockPolygon: MarketPolygon = {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[[subject.latlng.lng - 0.01, subject.latlng.lat - 0.01],
                        [subject.latlng.lng + 0.01, subject.latlng.lat - 0.01],
                        [subject.latlng.lng + 0.01, subject.latlng.lat + 0.01],
                        [subject.latlng.lng - 0.01, subject.latlng.lat + 0.01],
                        [subject.latlng.lng - 0.01, subject.latlng.lat - 0.01]]]
        },
        properties: {}
      };
      onSavePolygon(mockPolygon);
      setHasUnsavedChanges(false);
      setIsDrawing(false);
    }
  };

  const handleClearPolygon = () => {
    if (onSavePolygon) {
      onSavePolygon(null);
      setHasUnsavedChanges(false);
      setIsDrawing(false);
    }
  };

  const handleFocusComp = (compId: string) => {
    if (onFocusComp) {
      onFocusComp(compId);
    }
  };

  return (
    <Card className={cn("flex flex-col h-full", className)} data-testid="market-map">
      {/* Map Controls */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Navigation className="h-5 w-5" />
            Market Area Map
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Switch
                checked={restrictToPolygon}
                onCheckedChange={handleToggleRestrict}
                data-testid="toggle-restrict-polygon"
              />
              <span className="text-gray-600 dark:text-gray-400">
                Restrict to polygon
              </span>
            </div>
          </div>
        </div>
        
        {/* Map Tools */}
        <div className="flex items-center gap-2">
          <Button
            variant={isDrawing ? "default" : "outline"}
            size="sm"
            onClick={handleStartDrawing}
            className="flex items-center gap-1"
            data-testid="draw-polygon-tool"
          >
            <Square className="h-4 w-4" />
            {isDrawing ? "Drawing..." : "Draw Polygon"}
          </Button>
          
          {polygon && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSavePolygon}
                disabled={!hasUnsavedChanges}
                className="flex items-center gap-1"
                data-testid="save-polygon"
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearPolygon}
                className="flex items-center gap-1 text-red-600 hover:text-red-700"
                data-testid="clear-polygon"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </>
          )}
        </div>
      </CardHeader>

      {/* Map Display Area */}
      <CardContent className="flex-1 p-0">
        <div className="relative h-96 bg-gray-100 dark:bg-gray-800 border rounded-lg mx-4 mb-4">
          {/* Placeholder Map Area */}
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-800 dark:to-gray-900 rounded-lg">
            <div className="text-center p-8">
              <Navigation className="h-16 w-16 mx-auto mb-4 text-blue-400 opacity-50" />
              <div className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
                Interactive Map
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                Map functionality will be available with react-leaflet integration
              </div>
              
              {/* Simulated markers for preview */}
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <Home className="h-4 w-4" />
                  <span className="text-xs">Subject</span>
                </div>
                <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <MapPin className="h-4 w-4" />
                  <span className="text-xs">Comps ({comps.length})</span>
                </div>
              </div>

              {/* Quick Focus Actions */}
              <div className="space-y-2">
                <div className="text-xs text-gray-500 mb-2">Quick Focus:</div>
                <div className="flex flex-wrap gap-1 justify-center">
                  {comps.slice(0, 6).map((comp) => (
                    <Button
                      key={comp.id}
                      variant="outline"
                      size="sm"
                      onClick={() => handleFocusComp(comp.id)}
                      className="text-xs h-6 px-2"
                      data-testid={`focus-comp-${comp.id}`}
                    >
                      {comp.address.split(' ')[0]}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* Polygon indicator */}
          {polygon && (
            <div className="absolute top-2 right-2">
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Polygon Active
              </Badge>
            </div>
          )}
        </div>

        {/* Map Stats Footer */}
        <div className="px-4 pb-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  {compsInPolygon}/{totalComps}
                </div>
                <div className="text-gray-500 dark:text-gray-400">
                  Comps {polygon ? "in polygon" : "total"}
                </div>
              </div>
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  {polygonArea} ac
                </div>
                <div className="text-gray-500 dark:text-gray-400">
                  Polygon area
                </div>
              </div>
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  {subject.address.split(',')[1]?.trim() || 'Austin, TX'}
                </div>
                <div className="text-gray-500 dark:text-gray-400">
                  Market area
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}