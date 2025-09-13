/**
 * Typed Photo API client with error handling and auth
 */

import { PhotoAPI } from '@/config/endpointPaths';
import { DEV_AUTH } from '@/config/auth';
import { apiRequest } from '@/lib/queryClient';
import { 
  PhotoMeta, 
  PhotoAddenda, 
  PhotosQcSummary, 
  BulkUpdateRequest 
} from '@/types/photos';

// API Response types
interface ApiError {
  message: string;
  errors?: any[];
}

// Auth headers for development (only when explicitly enabled)
function getDevAuthHeaders(): Record<string, string> {
  if (DEV_AUTH.enabled) {
    return { [DEV_AUTH.headerName]: DEV_AUTH.userId };
  }
  return {};
}

// Standard fetch options with session auth
function getFetchOptions(includeAuth = false): RequestInit {
  const headers = includeAuth ? getDevAuthHeaders() : {};
  return {
    credentials: 'include' as const,
    headers
  };
}

// Error handling
class PhotoApiError extends Error {
  constructor(
    message: string, 
    public status: number, 
    public errors?: any[]
  ) {
    super(message);
    this.name = 'PhotoApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let error: ApiError;
    try {
      const text = await response.text();
      error = text ? JSON.parse(text) : { message: response.statusText };
    } catch {
      error = { message: `HTTP ${response.status}: ${response.statusText}` };
    }
    
    throw new PhotoApiError(
      error.message || `Request failed with status ${response.status}`,
      response.status,
      error.errors
    );
  }
  
  // Handle empty responses (204 No Content, etc.)
  const text = await response.text();
  if (!text) {
    return null as T;
  }
  
  try {
    return JSON.parse(text);
  } catch {
    // If response is not JSON, return as string
    return text as T;
  }
}

// Handle blob responses (for PDF exports)
async function handleBlobResponse(response: Response): Promise<Blob> {
  if (!response.ok) {
    // Try to get error message from JSON if possible
    let error: ApiError;
    try {
      error = await response.json();
    } catch {
      error = { message: `HTTP ${response.status}: ${response.statusText}` };
    }
    
    throw new PhotoApiError(
      error.message || `Request failed with status ${response.status}`,
      response.status,
      error.errors
    );
  }
  
  return response.blob();
}

// Photo CRUD operations
export async function listPhotos(orderId: string): Promise<PhotoMeta[]> {
  const response = await apiRequest('GET', PhotoAPI.listPhotos(orderId));
  return response.json();
}

export async function getPhoto(orderId: string, photoId: string): Promise<PhotoMeta> {
  const response = await apiRequest('GET', PhotoAPI.getPhoto(orderId, photoId));
  return response.json();
}

export async function uploadPhoto(
  orderId: string, 
  file: File,
  onProgress?: (progress: number) => void
): Promise<PhotoMeta> {
  const formData = new FormData();
  formData.append('photos', file); // Backend expects 'photos' field name
  
  const xhr = new XMLHttpRequest();
  
  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          // Backend returns array for multiple uploads, get first photo
          const photos = Array.isArray(result) ? result : [result];
          resolve(photos[0]);
        } catch (error) {
          reject(new PhotoApiError('Invalid response format', xhr.status));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new PhotoApiError(error.message || 'Upload failed', xhr.status, error.errors));
        } catch {
          reject(new PhotoApiError(`Upload failed: ${xhr.statusText}`, xhr.status));
        }
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new PhotoApiError('Upload failed', 0));
    });
    
    xhr.open('POST', PhotoAPI.uploadPhoto(orderId));
    
    // Set credentials for session auth
    xhr.withCredentials = true;
    
    // Set dev auth headers if enabled
    if (DEV_AUTH.enabled) {
      xhr.setRequestHeader(DEV_AUTH.headerName, DEV_AUTH.userId);
    }
    
    xhr.send(formData);
  });
}

export async function updatePhoto(
  orderId: string, 
  photoId: string, 
  updates: Partial<Pick<PhotoMeta, 'category' | 'caption'>>
): Promise<PhotoMeta> {
  const response = await apiRequest('PUT', PhotoAPI.updatePhoto(orderId, photoId), updates);
  return response.json();
}

export async function deletePhoto(orderId: string, photoId: string): Promise<void> {
  await apiRequest('DELETE', PhotoAPI.deletePhoto(orderId, photoId));
}

// Photo processing operations
export async function setPhotoMasks(
  orderId: string, 
  photoId: string, 
  masks: PhotoMeta['masks']
): Promise<PhotoMeta> {
  const response = await apiRequest('POST', PhotoAPI.setMasks(orderId, photoId), masks);
  return response.json();
}

export async function processPhoto(orderId: string, photoId: string): Promise<PhotoMeta> {
  const response = await apiRequest('POST', PhotoAPI.processBlur(orderId, photoId));
  return response.json();
}

export async function bulkUpdatePhotos(
  orderId: string, 
  request: BulkUpdateRequest
): Promise<PhotoMeta[]> {
  const response = await apiRequest('POST', PhotoAPI.bulkUpdate(orderId), request);
  return response.json();
}

// Addenda operations
export async function getPhotoAddenda(orderId: string): Promise<PhotoAddenda | null> {
  try {
    const response = await apiRequest('GET', PhotoAPI.addendaGet(orderId));
    return response.json();
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null; // No addenda exists yet
    }
    throw error;
  }
}

export async function savePhotoAddenda(orderId: string, addenda: PhotoAddenda): Promise<PhotoAddenda> {
  const response = await apiRequest('PUT', PhotoAPI.addendaPut(orderId), addenda);
  return response.json();
}

export async function exportPhotoAddenda(orderId: string): Promise<{ pdfPath: string; downloadUrl: string }> {
  const response = await apiRequest('POST', PhotoAPI.addendaExport(orderId));
  return response.json();
}

// QC operations
export async function getPhotosQcSummary(orderId: string): Promise<PhotosQcSummary> {
  const response = await apiRequest('GET', PhotoAPI.qcSummary(orderId));
  return response.json();
}

// File URL generation
export function getPhotoUrl(orderId: string, photoId: string): string {
  return PhotoAPI.getPhotoFile(orderId, photoId);
}

// Utility functions
export function isPhotoApiError(error: unknown): error is PhotoApiError {
  return error instanceof PhotoApiError;
}

export function isAuthError(error: unknown): boolean {
  return isPhotoApiError(error) && (error.status === 401 || error.status === 403);
}

// Export the error class for type checking
export { PhotoApiError };