export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          name: string
          organization_id: string
          team_id: string | null
          column_config: Json
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          organization_id: string
          team_id?: string | null
          column_config?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          organization_id?: string
          team_id?: string | null
          column_config?: Json
          created_at?: string
        }
      }
      users: {
        Row: {
          id: string
          email: string
          name: string
          avatar_url: string | null
          organization_id: string
          role: 'owner' | 'admin' | 'member'
          is_online: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          name: string
          avatar_url?: string | null
          organization_id: string
          role?: 'owner' | 'admin' | 'member'
          is_online?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          avatar_url?: string | null
          organization_id?: string
          role?: 'owner' | 'admin' | 'member'
          is_online?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      teams: {
        Row: {
          id: string
          name: string
          description: string | null
          organization_id: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          organization_id: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          organization_id?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      team_members: {
        Row: {
          id: string
          team_id: string
          user_id: string
          role: 'admin' | 'member' | 'viewer'
          joined_at: string
        }
        Insert: {
          id?: string
          team_id: string
          user_id: string
          role?: 'admin' | 'member' | 'viewer'
          joined_at?: string
        }
        Update: {
          id?: string
          team_id?: string
          user_id?: string
          role?: 'admin' | 'member' | 'viewer'
          joined_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          status: string
          priority: 'low' | 'medium' | 'high' | 'urgent'
          due_date: string | null
          assignee_id: string | null
          customer_id: string | null
          project_id: string | null
          journal_logs: Json
          learnings: string | null
          board_position: number
          team_id: string
          organization_id: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          status?: string
          priority?: 'low' | 'medium' | 'high' | 'urgent'
          due_date?: string | null
          assignee_id?: string | null
          customer_id?: string | null
          project_id?: string | null
          journal_logs?: Json
          learnings?: string | null
          board_position?: number
          team_id: string
          organization_id: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          status?: string
          priority?: 'low' | 'medium' | 'high' | 'urgent'
          due_date?: string | null
          assignee_id?: string | null
          customer_id?: string | null
          project_id?: string | null
          journal_logs?: Json
          learnings?: string | null
          board_position?: number
          team_id?: string
          organization_id?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      comments: {
        Row: {
          id: string
          task_id: string
          author_id: string
          text: string
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          author_id: string
          text: string
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          author_id?: string
          text?: string
          created_at?: string
        }
      }
      invitations: {
        Row: {
          id: string
          email: string
          organization_id: string
          team_id: string | null
          role: 'admin' | 'member' | 'viewer'
          invited_by: string
          token: string
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          organization_id: string
          team_id?: string | null
          role?: 'admin' | 'member' | 'viewer'
          invited_by: string
          token: string
          expires_at: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          organization_id?: string
          team_id?: string | null
          role?: 'admin' | 'member' | 'viewer'
          invited_by?: string
          token?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      task_priority: 'low' | 'medium' | 'high' | 'urgent'
      user_role: 'owner' | 'admin' | 'member'
      team_role: 'admin' | 'member' | 'viewer'
    }
  }
}
