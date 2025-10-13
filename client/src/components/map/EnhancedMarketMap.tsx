import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Home, MapPin, Square, Trash2, Save, Layers, Plus, Maximize2, AlertCircle } from 'lucide-react';
import { Subject, CompProperty, type Submarket, type LatLng } from '@shared/schema';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom icons
const subjectIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const compIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface EnhancedMarketMapProps {
  subject: Subject;
  comps: CompProperty[];
  submarkets: Submarket[];
  className?: string;
  onCreateSubmarket?: (submarket: { name: string; polygon: LatLng[] }) => void;
  onUpdateSubmarket?: (id: string, updates: Partial<Submarket>) => void;
  onDeleteSubmarket?: (id: string) => void;
}

// Drawing control component
function DrawControl({ 
  onPolygonCreated 
}: { 
  onPolygonCreated: (polygon: LatLng[]) => void 
}) {
  const map = useMap();
  const drawControlRef = useRef<L.Control.Draw | null>(null);

  useEffect(() => {
    if (!map) return;

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          shapeOptions: {
            color: '#3b82f6',
            weight: 2,
            fillOpacity: 0.2
          }
        },
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    });

    map.addControl(drawControl);
    drawControlRef.current = drawControl;

    map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      drawnItems.addLayer(layer);
      
      if (e.layerType === 'polygon') {
        const latlngs = layer.getLatLngs()[0].map((ll: L.LatLng) => ({
          lat: ll.lat,
          lng: ll.lng
        }));
        onPolygonCreated(latlngs);
      }
    });

    return () => {
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, onPolygonCreated]);

  return null;
}

// Fit bounds control component
function FitBoundsControl({ 
  subject, 
  comps 
}: { 
  subject: Subject; 
  comps: CompProperty[] 
}) {
  const map = useMap();

  const fitAllMarkers = () => {
    const bounds = L.latLngBounds([]);
    
    // Add subject to bounds
    bounds.extend([subject.latlng.lat, subject.latlng.lng]);
    
    // Add all comps to bounds
    comps.forEach(comp => {
      bounds.extend([comp.latlng.lat, comp.latlng.lng]);
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  useEffect(() => {
    // Trigger fit on mount if comps exist
    if (comps.length > 0) {
      fitAllMarkers();
    }
  }, []); // Only run once on mount

  return null;
}

export function EnhancedMarketMap({
  subject,
  comps,
  submarkets,
  className,
  onCreateSubmarket,
  onUpdateSubmarket,
  onDeleteSubmarket
}: EnhancedMarketMapProps) {
  const [newSubmarketName, setNewSubmarketName] = useState('');
  const [pendingPolygon, setPendingPolygon] = useState<LatLng[] | null>(null);
  const [selectedSubmarket, setSelectedSubmarket] = useState<string | null>(null);

  const center: [number, number] = [subject.latlng.lat, subject.latlng.lng];

  const handlePolygonCreated = (polygon: LatLng[]) => {
    setPendingPolygon(polygon);
  };

  const handleSaveSubmarket = () => {
    if (!pendingPolygon || !newSubmarketName.trim() || !onCreateSubmarket) return;

    onCreateSubmarket({
      name: newSubmarketName.trim(),
      polygon: pendingPolygon
    });

    setNewSubmarketName('');
    setPendingPolygon(null);
  };

  const handleDeleteSubmarket = (id: string) => {
    if (onDeleteSubmarket) {
      onDeleteSubmarket(id);
      if (selectedSubmarket === id) {
        setSelectedSubmarket(null);
      }
    }
  };

  // Calculate colors for submarkets
  const getSubmarketColor = (index: number) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return colors[index % colors.length];
  };

  return (
    <Card className={cn("flex flex-col h-full", className)} data-testid="enhanced-market-map">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Market Analysis Map
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" data-testid="comp-count">
              <MapPin className="h-3 w-3 mr-1" />
              {comps.length} Comp{comps.length !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="secondary" data-testid="submarket-count">
              <Square className="h-3 w-3 mr-1" />
              {submarkets.length} Submarket{submarkets.length !== 1 ? 's' : ''}
            </Badge>
            {comps.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Trigger fit bounds manually
                  const mapElement = document.querySelector('.leaflet-container') as any;
                  if (mapElement && mapElement._leaflet_map) {
                    const map = mapElement._leaflet_map;
                    const bounds = L.latLngBounds([]);
                    bounds.extend([subject.latlng.lat, subject.latlng.lng]);
                    comps.forEach(comp => bounds.extend([comp.latlng.lat, comp.latlng.lng]));
                    if (bounds.isValid()) {
                      map.fitBounds(bounds, { padding: [50, 50] });
                    }
                  }
                }}
                data-testid="button-fit-all-markers"
              >
                <Maximize2 className="h-4 w-4 mr-1" />
                Fit All
              </Button>
            )}
          </div>
        </div>

        {/* New Submarket Input */}
        {pendingPolygon && (
          <div className="flex items-end gap-2 pt-2">
            <div className="flex-1">
              <Label htmlFor="submarket-name" className="text-xs">Submarket Name</Label>
              <Input
                id="submarket-name"
                value={newSubmarketName}
                onChange={(e) => setNewSubmarketName(e.target.value)}
                placeholder="e.g., Downtown Core, West Side"
                className="h-8"
                data-testid="input-submarket-name"
              />
            </div>
            <Button
              size="sm"
              onClick={handleSaveSubmarket}
              disabled={!newSubmarketName.trim()}
              className="h-8"
              data-testid="button-save-submarket"
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 p-0 flex flex-col">
        {/* Info Alert when comps are loaded */}
        {comps.length > 0 && (
          <Alert className="mx-4 mt-4 mb-2" data-testid="comps-info-alert">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {comps.length} comparable{comps.length !== 1 ? 's' : ''} loaded on map. Use the <strong>"Fit All"</strong> button above to zoom and view all markers.
              {comps.length === 0 && " Go to the Comps tab to import ATTOM closed sales data."}
            </AlertDescription>
          </Alert>
        )}
        
        {/* Map Container */}
        <div className="flex-1 relative min-h-[400px]">
          <MapContainer
            center={center}
            zoom={14}
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Drawing Controls */}
            <DrawControl onPolygonCreated={handlePolygonCreated} />
            
            {/* Fit Bounds Control - Auto-zoom to show all markers */}
            <FitBoundsControl subject={subject} comps={comps} />

            {/* Subject Property Marker */}
            <Marker position={[subject.latlng.lat, subject.latlng.lng]} icon={subjectIcon}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold flex items-center gap-1">
                    <Home className="h-4 w-4" />
                    Subject Property
                  </div>
                  <div className="text-gray-600 mt-1">{subject.address}</div>
                </div>
              </Popup>
            </Marker>

            {/* Comp Markers */}
            {comps.map((comp) => (
              <Marker
                key={comp.id}
                position={[comp.latlng.lat, comp.latlng.lng]}
                icon={compIcon}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      Comparable
                    </div>
                    <div className="text-gray-600 mt-1">{comp.address}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      ${comp.salePrice?.toLocaleString()}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Submarket Polygons */}
            {submarkets.map((submarket, index) => {
              // Convert GeoJSON coordinates to Leaflet LatLng format
              // GeoJSON uses [lng, lat], Leaflet uses [lat, lng]
              const positions = submarket.polygon.geometry.coordinates[0].map(
                (coord: number[]) => [coord[1], coord[0]] as [number, number]
              );
              
              return (
                <Polygon
                  key={submarket.id}
                  positions={positions}
                  pathOptions={{
                    color: getSubmarketColor(index),
                    weight: 2,
                    fillOpacity: selectedSubmarket === submarket.id ? 0.3 : 0.15
                  }}
                  eventHandlers={{
                    click: () => setSelectedSubmarket(submarket.id)
                  }}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">{submarket.name}</div>
                      {submarket.description && (
                        <div className="text-gray-600 text-xs mt-1">{submarket.description}</div>
                      )}
                    </div>
                  </Popup>
                </Polygon>
              );
            })}

            {/* Pending Polygon Preview */}
            {pendingPolygon && (
              <Polygon
                positions={pendingPolygon.map(p => [p.lat, p.lng])}
                pathOptions={{
                  color: '#10b981',
                  weight: 3,
                  fillOpacity: 0.25,
                  dashArray: '10, 10'
                }}
              />
            )}
          </MapContainer>
        </div>

        {/* Submarket List */}
        {submarkets.length > 0 && (
          <div className="border-t p-4 bg-gray-50 dark:bg-gray-900">
            <div className="text-sm font-medium mb-2">Submarkets</div>
            <div className="space-y-1">
              {submarkets.map((submarket, index) => (
                <div
                  key={submarket.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded border cursor-pointer transition-colors",
                    selectedSubmarket === submarket.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                      : "border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                  onClick={() => setSelectedSubmarket(submarket.id)}
                  data-testid={`submarket-item-${submarket.id}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getSubmarketColor(index) }}
                    />
                    <span className="text-sm font-medium">{submarket.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSubmarket(submarket.id);
                    }}
                    className="h-6 w-6 p-0"
                    data-testid={`button-delete-${submarket.id}`}
                  >
                    <Trash2 className="h-3 w-3 text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        {submarkets.length === 0 && !pendingPolygon && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950 border-t border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-2 text-sm text-blue-900 dark:text-blue-100">
              <Square className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Draw your first submarket</div>
                <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Use the polygon tool in the top-right corner to draw a boundary around a market area
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
