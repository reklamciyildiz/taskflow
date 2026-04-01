'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, CheckCircle2, Clock, Users, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationPanelProps {
  onClose: () => void;
}

const mockNotifications = [
  {
    id: '1',
    type: 'task_completed',
    title: 'Action completed ✅',
    message: 'Sarah Chen completed "User feedback integration"',
    time: '5 minutes ago',
    avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
    unread: true
  },
  {
    id: '2',
    type: 'comment',
    title: 'New Comment 💬',
    message: 'David Kim commented on "Performance optimization sprint"',
    time: '32 minutes ago',
    avatar: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
    unread: true
  },
  {
    id: '3',
    type: 'task_assigned',
    title: 'New Assignment 📋',
    message: 'You were assigned to "Mobile app icon design"',
    time: '1 hour ago',
    avatar: 'https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
    unread: true
  },
  {
    id: '4',
    type: 'deadline',
    title: 'Deadline Alert ⏰',
    message: 'Action "Performance optimization sprint" is due in 2 days',
    time: '3 hours ago',
    avatar: null,
    unread: false
  },
  {
    id: '5',
    type: 'team_join',
    title: 'Team Update 👥',
    message: 'Emily Rodriguez joined the Product Team',
    time: '1 day ago',
    avatar: 'https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
    unread: false
  },
  {
    id: '6',
    type: 'mention',
    title: 'You were mentioned 🏷️',
    message: 'Marcus Johnson mentioned you in "Dark mode implementation"',
    time: '2 days ago',
    avatar: 'https://images.pexels.com/photos/1516680/pexels-photo-1516680.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
    unread: false
  }
];

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'task_completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'comment':
      return <MessageCircle className="h-4 w-4 text-blue-500" />;
    case 'task_assigned':
      return <Users className="h-4 w-4 text-purple-500" />;
    case 'deadline':
      return <Clock className="h-4 w-4 text-orange-500" />;
    case 'team_join':
      return <Users className="h-4 w-4 text-purple-500" />;
    case 'mention':
      return <MessageCircle className="h-4 w-4 text-indigo-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
};

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const unreadCount = mockNotifications.filter(n => n.unread).length;

  return (
    <div className="absolute top-full right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] bg-card border rounded-lg shadow-lg z-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Notifications</CardTitle>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-80 overflow-y-auto">
          {mockNotifications.map((notification) => (
            <div
              key={notification.id}
              className={cn(
                "flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0",
                notification.unread && "bg-muted/30"
              )}
            >
              <div className="flex-shrink-0 mt-0.5">
                {notification.avatar ? (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={notification.avatar} />
                    <AvatarFallback className="text-xs">
                      {notification.message.split(' ')[0].charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    {getNotificationIcon(notification.type)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-xs">{notification.title}</p>
                  {notification.unread && (
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {notification.message}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {notification.time}
                </p>
              </div>
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t">
          <Button variant="ghost" size="sm" className="w-full text-xs">
            Mark all as read
          </Button>
        </div>
      </CardContent>
    </div>
  );
}