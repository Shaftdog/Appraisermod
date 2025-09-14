/**
 * Discriminated union types for Addenda elements
 * Replaces complex union with type-safe discriminated approach
 */

export type AddendaElement =
  | { kind: 'photo'; photoId: string; caption?: string; id: string }
  | { kind: 'text'; html: string; style?: 'small' | 'normal' | 'large'; id: string };

export interface AddendaCell { 
  element?: AddendaElement;
}

/**
 * Type-safe element update function
 * Prevents kind transitions and ensures type safety
 */
export function updateElement(el: AddendaElement, patch: Partial<AddendaElement>): AddendaElement {
  switch (el.kind) {
    case 'photo': {
      const { kind, photoId, caption, id } = el;
      const next = { kind, photoId, caption, id, ...patch } as Partial<Extract<AddendaElement, {kind:'photo'}>>;
      
      if (next.kind && next.kind !== 'photo') {
        throw new Error('Invalid kind transition: cannot change photo to ' + next.kind);
      }
      
      return { 
        kind: 'photo', 
        id: next.id ?? id,
        photoId: next.photoId ?? photoId, 
        caption: next.caption ?? caption 
      } as const;
    }
    case 'text': {
      const { kind, html, style, id } = el;
      const next = { kind, html, style, id, ...patch } as Partial<Extract<AddendaElement, {kind:'text'}>>;
      
      if (next.kind && next.kind !== 'text') {
        throw new Error('Invalid kind transition: cannot change text to ' + next.kind);
      }
      
      return { 
        kind: 'text', 
        id: next.id ?? id,
        html: next.html ?? html, 
        style: next.style ?? style ?? 'normal' 
      } as const;
    }
  }
}

/**
 * Migration function for legacy addenda elements
 * Infers kind from existing properties
 */
export function migrateLegacyElement(legacy: any): AddendaElement {
  // If already has kind, validate and return
  if (legacy.kind) {
    if (legacy.kind === 'photo' && legacy.photoId) {
      return {
        kind: 'photo',
        id: legacy.id || crypto.randomUUID(),
        photoId: legacy.photoId,
        caption: legacy.caption
      };
    }
    if (legacy.kind === 'text' && legacy.html) {
      return {
        kind: 'text',
        id: legacy.id || crypto.randomUUID(),
        html: legacy.html,
        style: legacy.style || 'normal'
      };
    }
  }

  // Infer kind from properties
  if (legacy.photoId) {
    return {
      kind: 'photo',
      id: legacy.id || crypto.randomUUID(),
      photoId: legacy.photoId,
      caption: legacy.caption
    };
  }
  
  if (legacy.html || legacy.content) {
    return {
      kind: 'text',
      id: legacy.id || crypto.randomUUID(),
      html: legacy.html || legacy.content || '',
      style: legacy.style || 'normal'
    };
  }

  throw new Error('Cannot migrate legacy element: no recognizable properties');
}

/**
 * Type guard functions
 */
export function isPhotoElement(el: AddendaElement): el is Extract<AddendaElement, {kind: 'photo'}> {
  return el.kind === 'photo';
}

export function isTextElement(el: AddendaElement): el is Extract<AddendaElement, {kind: 'text'}> {
  return el.kind === 'text';
}
