'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTaskContext, Customer } from '@/components/TaskContext';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface DeleteCustomerModalProps {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}

export function DeleteCustomerModal({ customer, open, onClose }: DeleteCustomerModalProps) {
  const { deleteCustomer, customerSingularLabel } = useTaskContext();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!customer) return;

    setLoading(true);
    try {
      await deleteCustomer(customer.id);
      toast.success('Customer deleted successfully');
      onClose();
    } catch (error: any) {
      toast.error(error.message || `Failed to delete ${customerSingularLabel.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Delete {customerSingularLabel}
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{customer?.name}</strong>? This action cannot be undone. Actions
            linked to this {customerSingularLabel.toLowerCase()} will no longer have one assigned.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              `Delete ${customerSingularLabel}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
