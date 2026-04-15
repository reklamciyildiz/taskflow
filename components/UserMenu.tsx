'use client';

import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Settings, LogOut, User, LogIn } from 'lucide-react';
import { useTaskContext } from '@/components/TaskContext';
import { useView } from '@/components/ViewContext';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function UserMenu() {
  const { currentUser } = useTaskContext();
  const { setCurrentView } = useView();
  const { data: session, status } = useSession();
  const router = useRouter();

  // Use session user if available, otherwise fall back to context user
  const user = session?.user || currentUser;
  const isAuthenticated = status === 'authenticated';

  // Show sign in button if not authenticated
  if (!user && status !== 'loading') {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/auth/signin" className="flex items-center gap-2">
          <LogIn className="h-4 w-4" />
          Sign In
        </Link>
      </Button>
    );
  }

  if (!user) return null;

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/auth/signin' });
  };

  // Get avatar URL - session user has 'image', TeamMember has 'avatar'
  const avatarUrl = 'image' in user ? user.image : 'avatar' in user ? user.avatar : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src={avatarUrl || ''} alt={user.name || 'User'} />
            <AvatarFallback>{(user.name || 'U').charAt(0)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
            <div className="flex items-center gap-1 mt-1">
              <div className={`w-2 h-2 rounded-full ${isAuthenticated ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-xs text-muted-foreground">
                {isAuthenticated ? 'Online' : 'Demo Mode'}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setCurrentView('profile');
            router.push('/profile');
          }}
          className="cursor-pointer"
        >
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setCurrentView('settings');
            router.push('/settings');
          }}
          className="cursor-pointer"
        >
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isAuthenticated ? (
          <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600 focus:text-red-600">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/auth/signin" className="flex items-center">
              <LogIn className="mr-2 h-4 w-4" />
              <span>Sign in</span>
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}