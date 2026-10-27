'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { useTaskContext } from '@/components/TaskContext';
import { Loader2, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { resolveActionLifecycle } from '@/lib/stage-lifecycle';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
}

export function ExportModal({ open, onClose }: ExportModalProps): JSX.Element {
  const { tasks, currentTeam, projects, generalBoardColumns } = useTaskContext();
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [loading, setLoading] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);

  const teamTasks = tasks.filter(task => task.teamId === currentTeam?.id);

  const handleExport = async () => {
    setLoading(true);
    
    try {
      let filteredTasks = teamTasks;
      
      if (!includeCompleted) {
        filteredTasks = filteredTasks.filter(t => !resolveActionLifecycle(t, projects, generalBoardColumns).isTerminal);
      }

      if (format === 'csv') {
        exportCSV(filteredTasks);
      } else {
        exportJSON(filteredTasks);
      }

      toast.success(`Exported ${filteredTasks.length} tasks as ${format.toUpperCase()}`);
      onClose();
    } catch (error) {
      toast.error('Failed to export tasks');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = (tasksToExport: typeof teamTasks) => {
    const headers = ['Title', 'Description', 'Status', 'Priority', 'Due Date', 'Assignee', 'Created At'];
    const rows = tasksToExport.map(task => [
      `"${task.title.replace(/"/g, '""')}"`,
      `"${(task.description || '').replace(/"/g, '""')}"`,
      task.status,
      task.priority,
      task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '',
      currentTeam?.members.find(m => m.id === task.assigneeId)?.name || 'Unassigned',
      new Date(task.createdAt).toLocaleDateString()
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csvContent, `actiproc-export-${Date.now()}.csv`, 'text/csv');
  };

  const exportJSON = (tasksToExport: typeof teamTasks) => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      team: currentTeam?.name,
      totalTasks: tasksToExport.length,
      tasks: tasksToExport.map(task => ({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        assignee: currentTeam?.members.find(m => m.id === task.assigneeId)?.name || null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      }))
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    downloadFile(jsonContent, `actiproc-export-${Date.now()}.json`, 'application/json');
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Tasks
          </DialogTitle>
          <DialogDescription>
            Export your team's tasks to a file for backup or analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format Selection */}
          <div className="space-y-3">
            <Label>Export Format</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as 'csv' | 'json')}>
              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium">CSV (Excel)</p>
                    <p className="text-xs text-muted-foreground">Best for spreadsheets and data analysis</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="json" id="json" />
                <Label htmlFor="json" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-medium">JSON</p>
                    <p className="text-xs text-muted-foreground">Best for developers and integrations</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label>Options</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="include-completed" 
                  checked={includeCompleted}
                  onCheckedChange={(checked) => setIncludeCompleted(checked as boolean)}
                />
                <Label htmlFor="include-completed" className="text-sm cursor-pointer">
                  Include completed tasks
                </Label>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{teamTasks.length}</span> tasks will be exported from{' '}
              <span className="font-medium text-foreground">{currentTeam?.name}</span>
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
