import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Download, 
  FileText, 
  Image, 
  Package, 
  Send,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { audit } from '../../../../lib/audit';
import { telemetry } from '../../../../lib/telemetry';
import type { DeliveryRequest, DeliveryClient, DeliveryPackage, PackageItem } from '../../../../types/delivery';

// Form validation schema - matching server expectations
const deliveryFormSchema = z.object({
  clientProfileId: z.string().min(1, 'Please select a client'),
  includeWorkfile: z.boolean().default(false),
  includeMismo: z.boolean().default(false),
  finalize: z.boolean().default(true),
  formats: z.array(z.enum(['uad_xml', 'photos', 'workfile_zip'])).optional().default(['uad_xml', 'workfile_zip']),
});

type DeliveryFormValues = z.infer<typeof deliveryFormSchema>;

interface DeliveryDrawerProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
}

const formatOptions = [
  {
    id: 'uad_xml' as const,
    label: 'MISMO UAD XML',
    description: 'Standard appraisal data export',
    icon: FileText,
  },
  {
    id: 'photos' as const,
    label: 'Property Photos',
    description: 'All property images and documentation',
    icon: Image,
  },
  {
    id: 'workfile_zip' as const,
    label: 'Complete Workfile',
    description: 'ZIP package with all order data',
    icon: Package,
  },
];

export function DeliveryDrawer({ orderId, isOpen, onClose }: DeliveryDrawerProps) {
  const [requestStatus, setRequestStatus] = useState<'idle' | 'requesting' | 'success' | 'error'>('idle');
  const [deliveryPackage, setDeliveryPackage] = useState<DeliveryPackage | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliveryFormSchema),
    mode: 'onChange',
    defaultValues: {
      clientProfileId: '',
      includeWorkfile: true,
      includeMismo: true,
      finalize: true,
      formats: ['uad_xml', 'workfile_zip'],
    },
  });

  // Load delivery clients
  const { data: clients = [], isLoading: loadingClients } = useQuery<DeliveryClient[]>({
    queryKey: ['/api/delivery/clients'],
    enabled: isOpen,
  });

  // Request delivery mutation
  const requestDeliveryMutation = useMutation({
    mutationFn: async (data: DeliveryFormValues) => {
      const deliveryRequest: DeliveryRequest = {
        orderId,
        clientProfileId: data.clientProfileId,
        formats: data.formats,
        finalize: data.finalize,
      };
      
      const response = await apiRequest('POST', '/api/delivery/request', deliveryRequest);
      return await response.json();
    },
    onSuccess: (data: DeliveryPackage) => {
      // Audit logging for delivery request
      audit({
        userId: 'current-user', // Will be populated by server with actual user
        role: 'appraiser',
        action: 'delivery.request',
        orderId: orderId!,
        path: 'delivery.request_package',
        after: { 
          packageId: data.id,
          clientId: data.clientId,
          formatCount: data.formats.length,
          totalSize: data.totalSize,
          itemCount: data.items.length
        }
      });

      // Telemetry for delivery package size
      telemetry.deliverySize(data.totalSize);

      setRequestStatus('success');
      setDeliveryPackage(data);
      toast({
        title: 'Delivery Requested Successfully',
        description: `Package ${data.id} is ready for download.`,
      });
      
      // Invalidate delivery-related queries
      queryClient.invalidateQueries({ queryKey: ['/api/delivery/orders', orderId, 'deliveries'] });
    },
    onError: (error: any) => {
      setRequestStatus('error');
      toast({
        title: 'Delivery Request Failed',
        description: error.message || 'There was an error processing your delivery request.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: DeliveryFormValues) => {
    setRequestStatus('requesting');
    requestDeliveryMutation.mutate(data);
  };

  const handleClose = () => {
    setRequestStatus('idle');
    setDeliveryPackage(null);
    form.reset();
    onClose();
  };

  const handleDownload = (filename?: string) => {
    if (!deliveryPackage) return;
    
    const downloadUrl = filename 
      ? `/api/delivery/download/${deliveryPackage.id}/${filename}`
      : `/api/delivery/download/${deliveryPackage.id}`;
    
    window.open(downloadUrl, '_blank');
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Request Delivery
          </DrawerTitle>
          <DrawerDescription>
            Export and deliver order {orderId} in the specified formats
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto">
          {requestStatus === 'success' && deliveryPackage ? (
            // Success view with download options
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Delivery Package Ready</span>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">Package Details</h4>
                    <p className="text-sm text-muted-foreground">ID: {deliveryPackage.id}</p>
                  </div>
                  <Badge variant="secondary">{deliveryPackage.status}</Badge>
                </div>
                
                <div className="space-y-2">
                  <h5 className="text-sm font-medium">Available Files:</h5>
                  {deliveryPackage.packageItems.map((item: PackageItem, index: number) => (
                    <div key={index} className="flex items-center justify-between py-2 px-3 bg-background rounded border">
                      <div className="flex items-center gap-2">
                        {item.type === 'uad_xml' && <FileText className="h-4 w-4 text-blue-500" />}
                        {(item.type === 'photos' || item.type === 'photo') && <Image className="h-4 w-4 text-green-500" />}
                        {item.type === 'workfile_zip' && <Package className="h-4 w-4 text-purple-500" />}
                        <div>
                          <p className="text-sm font-medium">{item.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {(item.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(item.filename)}
                        data-testid={`button-download-${item.type}`}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // Request form
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Client Selection */}
                <FormField
                  control={form.control}
                  name="clientProfileId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Client</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={loadingClients || requestStatus === 'requesting'}>
                        <FormControl>
                          <SelectTrigger data-testid="select-client">
                            <SelectValue placeholder="Select delivery client" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Format Selection */}
                <FormField
                  control={form.control}
                  name="formats"
                  render={() => (
                    <FormItem>
                      <FormLabel>Export Formats</FormLabel>
                      <div className="space-y-3">
                        {formatOptions.map((option) => (
                          <FormField
                            key={option.id}
                            control={form.control}
                            name="formats"
                            render={({ field }) => {
                              const Icon = option.icon;
                              return (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(option.id)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...field.value, option.id])
                                          : field.onChange(
                                              field.value?.filter((value) => value !== option.id)
                                            );
                                      }}
                                      disabled={requestStatus === 'requesting'}
                                      data-testid={`checkbox-format-${option.id}`}
                                    />
                                  </FormControl>
                                  <div className="flex items-start gap-3">
                                    <Icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
                                    <div className="space-y-1 leading-none">
                                      <FormLabel className="text-sm font-medium">
                                        {option.label}
                                      </FormLabel>
                                      <p className="text-xs text-muted-foreground">
                                        {option.description}
                                      </p>
                                    </div>
                                  </div>
                                </FormItem>
                              );
                            }}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Delivery Method */}
                <FormField
                  control={form.control}
                  name="includeMismo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Method</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={requestStatus === 'requesting'}>
                        <FormControl>
                          <SelectTrigger data-testid="select-delivery-method">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="download">Direct Download</SelectItem>
                          <SelectItem value="email">Email Delivery</SelectItem>
                          <SelectItem value="ftp">FTP Upload</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {requestStatus === 'error' && (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">Please check your selections and try again.</span>
                  </div>
                )}
              </form>
            </Form>
          )}
        </div>

        <DrawerFooter>
          {requestStatus === 'success' ? (
            <Button onClick={handleClose} data-testid="button-close">
              Close
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                onClick={form.handleSubmit(onSubmit)}
                disabled={requestStatus === 'requesting'}
                data-testid="button-request-delivery"
              >
                {requestStatus === 'requesting' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Request Delivery
                  </>
                )}
              </Button>
            </div>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}