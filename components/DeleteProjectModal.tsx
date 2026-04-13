'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

interface DeleteProjectModalProps {
  project: { id: string; name: string; columnCount?: number } | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (projectId: string) => Promise<void>;
}

export function DeleteProjectModal({
  project,
  open,
  onClose,
  onConfirm,
}: DeleteProjectModalProps): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!project) return;

    setLoading(true);
    setError('');

    try {
      await onConfirm(project.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete process');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete process
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. Actions linked to this process will no longer appear under this workflow on the board.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-800 dark:text-red-200">
              <strong>Process:</strong> {project?.name}
            </p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">
              The board configuration with {project?.columnCount ?? 0} columns will be removed.
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete process
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

