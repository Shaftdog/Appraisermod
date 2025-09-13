/**
 * Hook for managing photo addenda with auto-save
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PhotoAddenda, PhotoMeta } from '@/types/photos';
import * as photoApi from '@/lib/photoApi';
import { useToast } from '@/hooks/use-toast';

interface UseAddendaReturn {
  addenda: PhotoAddenda | null;
  isLoading: boolean;
  error: Error | null;
  save: (addenda: PhotoAddenda) => void;
  isSaving: boolean;
  isDirty: boolean;
}

// Debounce helper
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function useAddenda(orderId: string): UseAddendaReturn {
  const [localAddenda, setLocalAddenda] = useState<PhotoAddenda | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch addenda from server
  const { 
    data: serverAddenda, 
    isLoading, 
    error 
  } = useQuery({
    queryKey: ['/api/photos', orderId, 'addenda'],
    queryFn: () => photoApi.getPhotoAddenda(orderId),
    enabled: !!orderId,
  });

  // Initialize local state when server data loads
  useEffect(() => {
    if (serverAddenda && !localAddenda) {
      setLocalAddenda(serverAddenda);
    }
  }, [serverAddenda, localAddenda]);

  // Create default addenda if none exists
  useEffect(() => {
    if (!isLoading && !serverAddenda && !localAddenda) {
      const defaultAddenda: PhotoAddenda = {
        orderId,
        pages: [],
        updatedAt: new Date().toISOString()
      };
      setLocalAddenda(defaultAddenda);
    }
  }, [isLoading, serverAddenda, localAddenda, orderId]);

  // Debounced auto-save (1000ms delay)
  const debouncedAddenda = useDebounce(localAddenda, 1000);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (addenda: PhotoAddenda) => photoApi.savePhotoAddenda(orderId, addenda),
    onSuccess: (savedAddenda) => {
      // Update query cache
      queryClient.setQueryData(['/api/photos', orderId, 'addenda'], savedAddenda);
      setIsDirty(false);
      // No success toast for auto-save to avoid spam
    },
    onError: (error) => {
      toast({
        title: "Auto-save failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Auto-save effect
  useEffect(() => {
    if (debouncedAddenda && isDirty) {
      saveMutation.mutate(debouncedAddenda);
    }
  }, [debouncedAddenda, isDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save function (marks as dirty and triggers auto-save)
  const save = useCallback((addenda: PhotoAddenda) => {
    setLocalAddenda(addenda);
    setIsDirty(true);
  }, []);

  return {
    addenda: localAddenda,
    isLoading,
    error,
    save,
    isSaving: saveMutation.isPending,
    isDirty
  };
}

/**
 * Helper hook to create a photo lookup map
 */
export function usePhotoMap(photos: PhotoMeta[]): Record<string, PhotoMeta> {
  return useMemo(() => {
    return photos.reduce((acc, photo) => {
      acc[photo.id] = photo;
      return acc;
    }, {} as Record<string, PhotoMeta>);
  }, [photos]);
}