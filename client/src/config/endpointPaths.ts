/**
 * Single source of truth for API endpoint paths
 * Edit this file if your actual API endpoints differ from the defaults
 */

export const PhotoAPI = {
  // Photo CRUD operations
  listPhotos: (orderId: string) => `/api/orders/${orderId}/photos`,
  getPhoto: (orderId: string, photoId: string) => `/api/orders/${orderId}/photos/${photoId}`,
  uploadPhoto: (orderId: string) => `/api/orders/${orderId}/photos/upload`,
  updatePhoto: (orderId: string, photoId: string) => `/api/orders/${orderId}/photos/${photoId}`,
  deletePhoto: (orderId: string, photoId: string) => `/api/orders/${orderId}/photos/${photoId}`,
  
  // Photo file access
  getPhotoFile: (orderId: string, photoId: string) => `/api/orders/${orderId}/photos/${photoId}/file`,
  
  // Photo processing operations
  setMasks: (orderId: string, photoId: string) => `/api/orders/${orderId}/photos/${photoId}/masks`,
  processBlur: (orderId: string, photoId: string) => `/api/orders/${orderId}/photos/${photoId}/process`,
  bulkUpdate: (orderId: string) => `/api/orders/${orderId}/photos/bulk-update`,
  
  // Addenda operations
  addendaGet: (orderId: string) => `/api/orders/${orderId}/photos/addenda`,
  addendaPut: (orderId: string) => `/api/orders/${orderId}/photos/addenda`,
  addendaExport: (orderId: string) => `/api/orders/${orderId}/photos/addenda/export`,
  
  // QC operations
  qcSummary: (orderId: string) => `/api/orders/${orderId}/photos/qc`,
} as const;

export const DeliveryAPI = {
  profiles: () => `/api/delivery/clients`,
  request: (orderId: string) => `/api/orders/${orderId}/delivery/request`,
  status: (orderId: string) => `/api/orders/${orderId}/delivery/status`,
  download: (orderId: string, file: string) => `/api/orders/${orderId}/delivery/download?file=${encodeURIComponent(file)}`
} as const;