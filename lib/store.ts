// In-memory data store (will be replaced with database later)
// This provides a centralized place for all data operations

import { Task, Team, TeamMember, TaskStatus, TaskPriority } from './types';
import { addDays } from 'date-fns';

// In-memory stores
let tasks: Task[] = [];
let teams: Team[] = [];
let initialized = false;

// Initialize with mock data
function initializeData() {
  if (initialized) return;
  
  const now = new Date();
  
  // Create mock teams
  const productTeam: Team = {
    id: 'team-1',
    name: 'Product Team',
    description: 'Building the next generation of productivity tools',
    createdBy: 'user-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    members: [
      {
        id: 'user-1',
        name: 'Alex Johnson',
        email: 'alex@example.com',
        role: 'admin',
        avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
        isOnline: true,
        joinedAt: new Date('2024-01-01'),
      },
      {
        id: 'user-2',
        name: 'Sarah Chen',
        email: 'sarah.chen@company.com',
        role: 'member',
        avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
        isOnline: true,
        joinedAt: new Date('2024-01-01'),
      },
      {
        id: 'user-3',
        name: 'Marcus Johnson',
        email: 'marcus.johnson@company.com',
        role: 'member',
        avatar: 'https://images.pexels.com/photos/1516680/pexels-photo-1516680.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
        isOnline: true,
        joinedAt: new Date('2024-01-01'),
      },
      {
        id: 'user-4',
        name: 'Emily Rodriguez',
        email: 'emily.rodriguez@company.com',
        role: 'member',
        avatar: 'https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
        isOnline: false,
        joinedAt: new Date('2024-01-01'),
      },
      {
        id: 'user-5',
        name: 'David Kim',
        email: 'david.kim@company.com',
        role: 'admin',
        avatar: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
        isOnline: true,
        joinedAt: new Date('2024-01-01'),
      },
    ],
  };

  const designTeam: Team = {
    id: 'team-2',
    name: 'Design Team',
    description: 'Creating beautiful and intuitive user experiences',
    createdBy: 'user-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    members: [
      {
        id: 'user-1',
        name: 'Alex Johnson',
        email: 'alex@example.com',
        role: 'admin',
        avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
        isOnline: true,
        joinedAt: new Date('2024-01-01'),
      },
      {
        id: 'user-6',
        name: 'Jessica Park',
        email: 'jessica.park@company.com',
        role: 'admin',
        avatar: 'https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
        isOnline: true,
        joinedAt: new Date('2024-01-01'),
      },
      {
        id: 'user-7',
        name: 'Ryan Thompson',
        email: 'ryan.thompson@company.com',
        role: 'member',
        avatar: 'https://images.pexels.com/photos/1300402/pexels-photo-1300402.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
        isOnline: false,
        joinedAt: new Date('2024-01-01'),
      },
    ],
  };

  teams = [productTeam, designTeam];

  // Create mock tasks
  tasks = [
    {
      id: 'task-1',
      title: 'Redesign user onboarding experience',
      description: 'Create comprehensive wireframes and interactive prototypes for the new user onboarding flow. Include user research findings and accessibility considerations.',
      status: 'progress',
      priority: 'high',
      dueDate: addDays(now, 5),
      assigneeId: 'user-2',
      teamId: 'team-1',
      boardPosition: 0,
      createdBy: 'user-1',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-02'),
      attachments: ['wireframes_v2.fig', 'user_research.pdf'],
      comments: [
        {
          id: 'comment-1',
          text: 'Great progress on the wireframes! The flow looks much more intuitive now.',
          authorId: 'user-1',
          createdAt: new Date('2025-01-02T10:30:00'),
        },
      ],
    },
    {
      id: 'task-2',
      title: 'Implement dark mode theme system',
      description: 'Add comprehensive dark theme support across the entire application with proper color contrast ratios and smooth transitions.',
      status: 'review',
      priority: 'medium',
      dueDate: addDays(now, 3),
      assigneeId: 'user-3',
      teamId: 'team-1',
      boardPosition: 0,
      createdBy: 'user-1',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-03'),
      attachments: ['theme_colors.json'],
      comments: [
        {
          id: 'comment-2',
          text: 'The implementation looks solid. Just need to test on mobile devices.',
          authorId: 'user-5',
          createdAt: new Date('2025-01-03T14:15:00'),
        },
        {
          id: 'comment-3',
          text: 'I can help with the mobile testing once this is ready.',
          authorId: 'user-4',
          createdAt: new Date('2025-01-03T14:20:00'),
        },
      ],
    },
    {
      id: 'task-3',
      title: 'Complete API documentation',
      description: 'Document all REST API endpoints with comprehensive examples, error codes, and authentication details for external developers.',
      status: 'todo',
      priority: 'medium',
      dueDate: addDays(now, 10),
      assigneeId: 'user-4',
      teamId: 'team-1',
      boardPosition: 0,
      createdBy: 'user-1',
      createdAt: new Date('2025-01-02'),
      updatedAt: new Date('2025-01-02'),
      attachments: [],
      comments: [],
    },
    {
      id: 'task-4',
      title: 'Performance optimization sprint',
      description: 'Optimize application performance focusing on initial load times and runtime efficiency. Target: <2s initial load.',
      status: 'progress',
      priority: 'urgent',
      dueDate: addDays(now, 1),
      assigneeId: 'user-5',
      teamId: 'team-1',
      boardPosition: 1,
      createdBy: 'user-1',
      createdAt: new Date('2025-01-03'),
      updatedAt: new Date('2025-01-04'),
      attachments: ['performance_audit.pdf', 'lighthouse_report.html'],
      comments: [
        {
          id: 'comment-4',
          text: 'Initial audit shows we can improve bundle size by 40% with code splitting.',
          authorId: 'user-5',
          createdAt: new Date('2025-01-04T09:00:00'),
        },
      ],
    },
    {
      id: 'task-5',
      title: 'User feedback integration',
      description: 'Implement in-app feedback system with rating prompts and suggestion collection.',
      status: 'done',
      priority: 'low',
      dueDate: addDays(now, -5),
      assigneeId: 'user-2',
      teamId: 'team-1',
      boardPosition: 0,
      createdBy: 'user-1',
      createdAt: new Date('2024-12-28'),
      updatedAt: new Date('2025-01-05'),
      attachments: ['feedback_mockups.png'],
      comments: [
        {
          id: 'comment-5',
          text: 'Deployed to production! Already seeing positive user responses.',
          authorId: 'user-2',
          createdAt: new Date('2025-01-05T16:30:00'),
        },
      ],
    },
    {
      id: 'task-6',
      title: 'Mobile app icon design',
      description: 'Design new app icon that works across all platforms and sizes. Include adaptive icon for Android.',
      status: 'review',
      priority: 'medium',
      dueDate: addDays(now, 7),
      assigneeId: 'user-6',
      teamId: 'team-2',
      boardPosition: 0,
      createdBy: 'user-1',
      createdAt: new Date('2025-01-04'),
      updatedAt: new Date('2025-01-05'),
      attachments: ['icon_concepts_v3.ai', 'platform_variations.zip'],
      comments: [
        {
          id: 'comment-6',
          text: 'Love the direction! The gradient version really stands out.',
          authorId: 'user-1',
          createdAt: new Date('2025-01-05T11:45:00'),
        },
      ],
    },
    {
      id: 'task-7',
      title: 'Brand guidelines update',
      description: 'Update brand guidelines to include new color palette, typography, and component specifications.',
      status: 'todo',
      priority: 'low',
      assigneeId: 'user-7',
      teamId: 'team-2',
      boardPosition: 0,
      createdBy: 'user-1',
      createdAt: new Date('2025-01-05'),
      updatedAt: new Date('2025-01-05'),
      attachments: [],
      comments: [],
    },
  ];

  initialized = true;
}

// Task operations
export const taskStore = {
  getAll: (): Task[] => {
    initializeData();
    return [...tasks];
  },

  getByTeam: (teamId: string): Task[] => {
    initializeData();
    return tasks.filter(t => t.teamId === teamId);
  },

  getById: (id: string): Task | undefined => {
    initializeData();
    return tasks.find(t => t.id === id);
  },

  create: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'attachments' | 'comments' | 'boardPosition'>): Task => {
    initializeData();
    const newTask: Task = {
      ...task,
      boardPosition: 0,
      id: `task-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      attachments: [],
      comments: [],
    };
    tasks.push(newTask);
    return newTask;
  },

  update: (id: string, updates: Partial<Task>): Task | null => {
    initializeData();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return null;
    
    tasks[index] = {
      ...tasks[index],
      ...updates,
      updatedAt: new Date(),
    };
    return tasks[index];
  },

  delete: (id: string): boolean => {
    initializeData();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return false;
    
    tasks.splice(index, 1);
    return true;
  },

  addComment: (taskId: string, comment: { text: string; authorId: string }): Task | null => {
    initializeData();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return null;

    task.comments.push({
      id: `comment-${Date.now()}`,
      text: comment.text,
      authorId: comment.authorId,
      createdAt: new Date(),
    });
    task.updatedAt = new Date();
    return task;
  },
};

// Team operations
export const teamStore = {
  getAll: (): Team[] => {
    initializeData();
    return [...teams];
  },

  getById: (id: string): Team | undefined => {
    initializeData();
    return teams.find(t => t.id === id);
  },

  getByUserId: (userId: string): Team[] => {
    initializeData();
    return teams.filter(t => t.members.some(m => m.id === userId));
  },

  create: (team: Omit<Team, 'id' | 'createdAt' | 'updatedAt' | 'members'>): Team => {
    initializeData();
    const newTeam: Team = {
      ...team,
      id: `team-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      members: [],
    };
    teams.push(newTeam);
    return newTeam;
  },

  update: (id: string, updates: Partial<Team>): Team | null => {
    initializeData();
    const index = teams.findIndex(t => t.id === id);
    if (index === -1) return null;
    
    teams[index] = {
      ...teams[index],
      ...updates,
      updatedAt: new Date(),
    };
    return teams[index];
  },

  delete: (id: string): boolean => {
    initializeData();
    const index = teams.findIndex(t => t.id === id);
    if (index === -1) return false;
    
    // Also delete all tasks for this team
    tasks = tasks.filter(t => t.teamId !== id);
    teams.splice(index, 1);
    return true;
  },

  // Member operations
  addMember: (teamId: string, member: Omit<TeamMember, 'id' | 'isOnline' | 'joinedAt'>): TeamMember | null => {
    initializeData();
    const team = teams.find(t => t.id === teamId);
    if (!team) return null;

    const newMember: TeamMember = {
      ...member,
      id: `user-${Date.now()}`,
      isOnline: false,
      joinedAt: new Date(),
      avatar: member.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}`,
    };
    team.members.push(newMember);
    team.updatedAt = new Date();
    return newMember;
  },

  updateMember: (teamId: string, memberId: string, updates: Partial<TeamMember>): TeamMember | null => {
    initializeData();
    const team = teams.find(t => t.id === teamId);
    if (!team) return null;

    const memberIndex = team.members.findIndex(m => m.id === memberId);
    if (memberIndex === -1) return null;

    team.members[memberIndex] = {
      ...team.members[memberIndex],
      ...updates,
    };
    team.updatedAt = new Date();
    return team.members[memberIndex];
  },

  removeMember: (teamId: string, memberId: string): boolean => {
    initializeData();
    const team = teams.find(t => t.id === teamId);
    if (!team) return false;

    const memberIndex = team.members.findIndex(m => m.id === memberId);
    if (memberIndex === -1) return false;

    team.members.splice(memberIndex, 1);
    team.updatedAt = new Date();
    return true;
  },

  getMembers: (teamId: string): TeamMember[] => {
    initializeData();
    const team = teams.find(t => t.id === teamId);
    return team?.members || [];
  },
};
