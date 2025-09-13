/**
 * Predefined addenda templates for common photo layouts
 */

import {
  AddendaTemplate,
  AddendaPage,
  PhotoElement,
  HeadingElement,
  TextElement,
  DEFAULT_PAGE_SETTINGS
} from '@/types/addenda';

// Template thumbnail component
export function TemplateThumbnail({ template }: { template: AddendaTemplate }) {
  return (
    <div className="w-24 h-32 bg-white border-2 border-muted rounded shadow-sm overflow-hidden">
      <div className="p-1 space-y-1">
        {/* Mock layout preview */}
        {template.category === 'interior' && (
          <>
            <div className="h-2 bg-gray-800 rounded" />
            <div className="grid grid-cols-2 gap-1">
              <div className="h-8 bg-gray-300 rounded" />
              <div className="h-8 bg-gray-300 rounded" />
            </div>
            <div className="h-1 bg-gray-200 rounded" />
          </>
        )}
        {template.category === 'exterior' && (
          <>
            <div className="h-2 bg-gray-800 rounded" />
            <div className="h-12 bg-gray-300 rounded" />
            <div className="h-1 bg-gray-200 rounded" />
          </>
        )}
        {template.category === 'comparison' && (
          <>
            <div className="h-2 bg-gray-800 rounded" />
            <div className="grid grid-cols-2 gap-1">
              <div className="h-10 bg-gray-300 rounded" />
              <div className="h-10 bg-gray-300 rounded" />
            </div>
          </>
        )}
        {template.category === 'details' && (
          <>
            <div className="h-2 bg-gray-800 rounded" />
            <div className="grid grid-cols-3 gap-1">
              <div className="h-6 bg-gray-300 rounded" />
              <div className="h-6 bg-gray-300 rounded" />
              <div className="h-6 bg-gray-300 rounded" />
            </div>
            <div className="h-1 bg-gray-200 rounded" />
          </>
        )}
        {template.category === 'overview' && (
          <>
            <div className="h-2 bg-gray-800 rounded" />
            <div className="h-8 bg-gray-300 rounded mb-1" />
            <div className="grid grid-cols-2 gap-1">
              <div className="h-4 bg-gray-300 rounded" />
              <div className="h-4 bg-gray-300 rounded" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Predefined templates
export const ADDENDA_TEMPLATES: AddendaTemplate[] = [
  {
    id: 'interior-standard',
    name: 'Interior Standard',
    description: 'Standard 2x2 grid layout for interior photos',
    category: 'interior',
    isDefault: true,
    pages: [{
      elements: [
        {
          id: 'heading-1',
          type: 'heading',
          content: 'Interior Photos',
          level: 1,
          transform: {
            position: { x: 72, y: 72 },
            dimensions: { width: 468, height: 40 }
          },
          style: {
            fontSize: 24,
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#000000',
            marginBottom: 16
          }
        } as HeadingElement,
        {
          id: 'photo-1',
          type: 'photo',
          photoId: '',
          caption: 'Living Room',
          transform: {
            position: { x: 72, y: 140 },
            dimensions: { width: 220, height: 165 }
          }
        } as PhotoElement,
        {
          id: 'photo-2', 
          type: 'photo',
          photoId: '',
          caption: 'Kitchen',
          transform: {
            position: { x: 320, y: 140 },
            dimensions: { width: 220, height: 165 }
          }
        } as PhotoElement,
        {
          id: 'photo-3',
          type: 'photo', 
          photoId: '',
          caption: 'Master Bedroom',
          transform: {
            position: { x: 72, y: 330 },
            dimensions: { width: 220, height: 165 }
          }
        } as PhotoElement,
        {
          id: 'photo-4',
          type: 'photo',
          photoId: '',
          caption: 'Master Bath',
          transform: {
            position: { x: 320, y: 330 },
            dimensions: { width: 220, height: 165 }
          }
        } as PhotoElement
      ],
      settings: { ...DEFAULT_PAGE_SETTINGS }
    }]
  },
  {
    id: 'exterior-front',
    name: 'Exterior Front View',
    description: 'Large front exterior photo with smaller detail shots',
    category: 'exterior',
    pages: [{
      elements: [
        {
          id: 'heading-1',
          type: 'heading',
          content: 'Exterior Front View',
          level: 1,
          transform: {
            position: { x: 72, y: 72 },
            dimensions: { width: 468, height: 40 }
          },
          style: {
            fontSize: 24,
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#000000',
            marginBottom: 16
          }
        } as HeadingElement,
        {
          id: 'photo-main',
          type: 'photo',
          photoId: '',
          caption: 'Front Exterior',
          transform: {
            position: { x: 72, y: 140 },
            dimensions: { width: 468, height: 350 }
          }
        } as PhotoElement,
        {
          id: 'photo-detail-1',
          type: 'photo',
          photoId: '',
          caption: 'Front Entry',
          transform: {
            position: { x: 72, y: 520 },
            dimensions: { width: 150, height: 112 }
          }
        } as PhotoElement,
        {
          id: 'photo-detail-2',
          type: 'photo',
          photoId: '',
          caption: 'Garage',
          transform: {
            position: { x: 245, y: 520 },
            dimensions: { width: 150, height: 112 }
          }
        } as PhotoElement,
        {
          id: 'photo-detail-3',
          type: 'photo',
          photoId: '',
          caption: 'Landscaping',
          transform: {
            position: { x: 418, y: 520 },
            dimensions: { width: 150, height: 112 }
          }
        } as PhotoElement
      ],
      settings: { ...DEFAULT_PAGE_SETTINGS }
    }]
  },
  {
    id: 'comparison-before-after',
    name: 'Before/After Comparison',
    description: 'Side-by-side comparison layout',
    category: 'comparison',
    pages: [{
      elements: [
        {
          id: 'heading-1',
          type: 'heading',
          content: 'Property Comparison',
          level: 1,
          transform: {
            position: { x: 72, y: 72 },
            dimensions: { width: 468, height: 40 }
          },
          style: {
            fontSize: 24,
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#000000',
            marginBottom: 16
          }
        } as HeadingElement,
        {
          id: 'heading-before',
          type: 'heading',
          content: 'Before',
          level: 2,
          transform: {
            position: { x: 72, y: 140 },
            dimensions: { width: 220, height: 30 }
          },
          style: {
            fontSize: 18,
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#000000',
            marginBottom: 8
          }
        } as HeadingElement,
        {
          id: 'heading-after',
          type: 'heading',
          content: 'After',
          level: 2,
          transform: {
            position: { x: 320, y: 140 },
            dimensions: { width: 220, height: 30 }
          },
          style: {
            fontSize: 18,
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#000000',
            marginBottom: 8
          }
        } as HeadingElement,
        {
          id: 'photo-before',
          type: 'photo',
          photoId: '',
          transform: {
            position: { x: 72, y: 190 },
            dimensions: { width: 220, height: 280 }
          }
        } as PhotoElement,
        {
          id: 'photo-after',
          type: 'photo',
          photoId: '',
          transform: {
            position: { x: 320, y: 190 },
            dimensions: { width: 220, height: 280 }
          }
        } as PhotoElement,
        {
          id: 'text-notes',
          type: 'text',
          content: 'Comparison notes and observations...',
          transform: {
            position: { x: 72, y: 500 },
            dimensions: { width: 468, height: 80 }
          },
          style: {
            fontSize: 12,
            fontWeight: 'normal',
            fontStyle: 'normal',
            textAlign: 'left',
            color: '#000000'
          }
        } as TextElement
      ],
      settings: { ...DEFAULT_PAGE_SETTINGS }
    }]
  },
  {
    id: 'details-grid',
    name: 'Detail Photos Grid',
    description: '3x2 grid for detail and feature photos',
    category: 'details',
    pages: [{
      elements: [
        {
          id: 'heading-1',
          type: 'heading',
          content: 'Property Details',
          level: 1,
          transform: {
            position: { x: 72, y: 72 },
            dimensions: { width: 468, height: 40 }
          },
          style: {
            fontSize: 24,
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#000000',
            marginBottom: 16
          }
        } as HeadingElement,
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `photo-${i + 1}`,
          type: 'photo',
          photoId: '',
          caption: `Detail ${i + 1}`,
          transform: {
            position: { 
              x: 72 + (i % 3) * 150, 
              y: 140 + Math.floor(i / 3) * 180 
            },
            dimensions: { width: 140, height: 140 }
          }
        } as PhotoElement))
      ],
      settings: { ...DEFAULT_PAGE_SETTINGS }
    }]
  },
  {
    id: 'overview-mixed',
    name: 'Property Overview',
    description: 'Mixed layout with overview and key features',
    category: 'overview',
    pages: [{
      elements: [
        {
          id: 'heading-1',
          type: 'heading',
          content: 'Property Overview',
          level: 1,
          transform: {
            position: { x: 72, y: 72 },
            dimensions: { width: 468, height: 40 }
          },
          style: {
            fontSize: 24,
            fontWeight: 'bold',
            textAlign: 'center',
            color: '#000000',
            marginBottom: 16
          }
        } as HeadingElement,
        {
          id: 'photo-main',
          type: 'photo',
          photoId: '',
          caption: 'Property Overview',
          transform: {
            position: { x: 72, y: 140 },
            dimensions: { width: 300, height: 225 }
          }
        } as PhotoElement,
        {
          id: 'text-description',
          type: 'text',
          content: 'Property description and key features:\n\n• Feature 1\n• Feature 2\n• Feature 3',
          transform: {
            position: { x: 390, y: 140 },
            dimensions: { width: 150, height: 225 }
          },
          style: {
            fontSize: 12,
            fontWeight: 'normal',
            fontStyle: 'normal',
            textAlign: 'left',
            color: '#000000'
          }
        } as TextElement,
        {
          id: 'photo-feature-1',
          type: 'photo',
          photoId: '',
          caption: 'Key Feature 1',
          transform: {
            position: { x: 72, y: 390 },
            dimensions: { width: 150, height: 112 }
          }
        } as PhotoElement,
        {
          id: 'photo-feature-2',
          type: 'photo',
          photoId: '',
          caption: 'Key Feature 2',
          transform: {
            position: { x: 245, y: 390 },
            dimensions: { width: 150, height: 112 }
          }
        } as PhotoElement,
        {
          id: 'photo-feature-3',
          type: 'photo',
          photoId: '',
          caption: 'Key Feature 3',
          transform: {
            position: { x: 418, y: 390 },
            dimensions: { width: 150, height: 112 }
          }
        } as PhotoElement
      ],
      settings: { ...DEFAULT_PAGE_SETTINGS }
    }]
  }
];

// Template categories for organization
export const TEMPLATE_CATEGORIES = [
  { id: 'interior', label: 'Interior', description: 'Indoor property photos' },
  { id: 'exterior', label: 'Exterior', description: 'Outdoor property photos' },
  { id: 'comparison', label: 'Comparison', description: 'Before/after or comparative layouts' },
  { id: 'details', label: 'Details', description: 'Feature and detail photography' },
  { id: 'overview', label: 'Overview', description: 'Property summary layouts' },
  { id: 'custom', label: 'Custom', description: 'User-created templates' }
] as const;