'use client';

import { Menu, Search, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { NotificationBell } from '@/components/NotificationBell';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { useState, useRef, useEffect } from 'react';
import { useTaskContext } from '@/components/TaskContext';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  onSidebarToggle: () => void;
}

export function Header({ onSidebarToggle }: HeaderProps) {
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const { tasks, teams } = useTaskContext();
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Filter results based on search query
  const searchResults = searchQuery.length >= 2 ? {
    tasks: tasks.filter(t => 
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 5),
    teams: teams.filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 3),
  } : { tasks: [], teams: [] };

  const hasResults = searchResults.tasks.length > 0 || searchResults.teams.length > 0;

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="flex h-16 items-center px-4 sm:px-6 gap-3 sm:gap-4">
        {/* Mobile sidebar toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          onClick={onSidebarToggle}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Search */}
        <div className="flex-1 max-w-md relative" ref={searchRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search actions, teams..."
              className="pl-10 pr-10 h-10 bg-muted/50 border-0 focus-visible:ring-1"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setShowResults(false); }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showResults && searchQuery.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
              {!hasResults ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No results found for "{searchQuery}"
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {searchResults.tasks.length > 0 && (
                    <div>
                      <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-gray-50 dark:bg-gray-750">
                        Actions
                      </div>
                      {searchResults.tasks.map(task => (
                        <button
                          key={task.id}
                          onClick={() => {
                            setShowResults(false);
                            setSearchQuery('');
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                        >
                          <span className={`w-2 h-2 rounded-full ${
                            task.status === 'done' ? 'bg-green-500' :
                            task.status === 'progress' ? 'bg-blue-500' :
                            task.status === 'review' ? 'bg-orange-500' : 'bg-gray-400'
                          }`} />
                          <span className="text-sm truncate">{task.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.teams.length > 0 && (
                    <div>
                      <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-gray-50 dark:bg-gray-750">
                        Teams
                      </div>
                      {searchResults.teams.map(team => (
                        <button
                          key={team.id}
                          onClick={() => {
                            setShowResults(false);
                            setSearchQuery('');
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                        >
                          {team.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Create task button */}
          <Button 
            size="sm" 
            onClick={() => setShowCreateTask(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium hidden sm:flex"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Action
          </Button>
          
          {/* Mobile create task button */}
          <Button 
            size="sm" 
            onClick={() => setShowCreateTask(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium sm:hidden p-2"
          >
            <Plus className="h-4 w-4" />
          </Button>

          {/* Notifications */}
          <NotificationBell />

          {/* Theme toggle */}
          <ThemeToggle />

          {/* User menu */}
          <UserMenu />
        </div>
      </div>

      {/* Create task modal */}
      <CreateTaskModal 
        open={showCreateTask} 
        onClose={() => setShowCreateTask(false)} 
      />
    </header>
  );
}