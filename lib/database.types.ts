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
      attachments: {
        Row: { id: string; task_id: string | null; organization_id: string; team_id: string; uploaded_by: string; filename: string; mime_type: string; size_bytes: number; stored_bytes: number | null; object_key: string; thumbnail_key: string | null; staging_key: string; status: 'pending' | 'processing' | 'ready' | 'deleting'; width: number | null; height: number | null; checksum: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; task_id: string; organization_id: string; team_id: string; uploaded_by: string; filename: string; mime_type: string; size_bytes: number; object_key: string; thumbnail_key?: string | null; staging_key: string; status?: 'pending' | 'processing' | 'ready' | 'deleting' }
        Update: { filename?: string; mime_type?: string; stored_bytes?: number; thumbnail_key?: string | null; status?: 'pending' | 'processing' | 'ready' | 'deleting'; width?: number | null; height?: number | null; checksum?: string; updated_at?: string }
      }
      attachment_links: {
        Row: { id: string; attachment_id: string; task_id: string; note_id: string | null; checklist_item_id: string | null; created_at: string }
        Insert: { id?: string; attachment_id: string; task_id: string; note_id?: string | null; checklist_item_id?: string | null }
        Update: { note_id?: string | null; checklist_item_id?: string | null }
      }
      process_properties: {
        Row: { id: string; project_id: string; name: string; type: 'single_select'; position: number; archived_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; project_id: string; name: string; type?: 'single_select'; position?: number; archived_at?: string | null; created_at?: string; updated_at?: string }
        Update: { name?: string; position?: number; archived_at?: string | null; updated_at?: string }
      }
      process_property_options: {
        Row: { id: string; project_id: string; property_id: string; label: string; color: string; position: number; archived_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; project_id: string; property_id: string; label: string; color?: string; position?: number; archived_at?: string | null; created_at?: string; updated_at?: string }
        Update: { label?: string; color?: string; position?: number; archived_at?: string | null; updated_at?: string }
      }
      action_property_values: {
        Row: { task_id: string; project_id: string; property_id: string; option_id: string; created_at: string; updated_at: string }
        Insert: { task_id: string; project_id: string; property_id: string; option_id: string; created_at?: string; updated_at?: string }
        Update: { option_id?: string; updated_at?: string }
      }
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
          reminders: Json
          assignee_id: string | null
          customer_id: string | null
          project_id: string | null
          checklist_blocks: Json | null
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
          reminders?: Json
          assignee_id?: string | null
          customer_id?: string | null
          project_id?: string | null
          checklist_blocks?: Json | null
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
          reminders?: Json
          assignee_id?: string | null
          customer_id?: string | null
          project_id?: string | null
          checklist_blocks?: Json | null
          board_position?: number
          team_id?: string
          organization_id?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      work_schedules: {
        Row: {
          id: string
          organization_id: string
          team_id: string
          task_id: string
          checklist_item_id: string | null
          schedule_type: 'one_off' | 'recurring'
          schedule_date: string
          schedule_time: string | null
          time_zone: string | null
          recurrence_frequency: 'daily' | 'weekly' | null
          recurrence_interval: number
          recurrence_weekdays: number[]
          ends_on: string | null
          reminder_rules: Json
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          team_id: string
          task_id: string
          checklist_item_id?: string | null
          schedule_type: 'one_off' | 'recurring'
          schedule_date: string
          schedule_time?: string | null
          time_zone?: string | null
          recurrence_frequency?: 'daily' | 'weekly' | null
          recurrence_interval?: number
          recurrence_weekdays?: number[]
          ends_on?: string | null
          reminder_rules?: Json
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          team_id?: string
          task_id?: string
          checklist_item_id?: string | null
          schedule_type?: 'one_off' | 'recurring'
          schedule_date?: string
          schedule_time?: string | null
          time_zone?: string | null
          recurrence_frequency?: 'daily' | 'weekly' | null
          recurrence_interval?: number
          recurrence_weekdays?: number[]
          ends_on?: string | null
          reminder_rules?: Json
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      work_occurrences: {
        Row: {
          id: string
          schedule_id: string
          occurrence_date: string
          effective_date: string
          state: 'pending' | 'completed' | 'skipped'
          completed_at: string | null
          rescheduled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          schedule_id: string
          occurrence_date: string
          effective_date: string
          state?: 'pending' | 'completed' | 'skipped'
          completed_at?: string | null
          rescheduled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          schedule_id?: string
          occurrence_date?: string
          effective_date?: string
          state?: 'pending' | 'completed' | 'skipped'
          completed_at?: string | null
          rescheduled_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      notes: {
        Row: {
          id: string
          task_id: string
          organization_id: string
          team_id: string
          author_id: string
          title: string
          type: 'note' | 'learning' | 'idea' | 'decision'
          content: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          task_id: string
          organization_id: string
          team_id: string
          author_id: string
          title?: string
          type?: 'note' | 'learning' | 'idea' | 'decision'
          content?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          organization_id?: string
          team_id?: string
          author_id?: string
          title?: string
          type?: 'note' | 'learning' | 'idea' | 'decision'
          content?: Json
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
      reorder_process_property_items: {
        Args: { p_project_id: string; p_property_id: string | null; p_ids: string[] }
        Returns: undefined
      }
      work_schedule_matches_date: {
        Args: {
          input_schedule_type: string
          input_schedule_date: string
          input_ends_on: string | null
          input_frequency: string | null
          input_interval: number
          input_weekdays: number[]
          candidate_date: string
        }
        Returns: boolean
      }
    }
    Enums: {
      task_priority: 'low' | 'medium' | 'high' | 'urgent'
      user_role: 'owner' | 'admin' | 'member'
      team_role: 'admin' | 'member' | 'viewer'
    }
  }
}
