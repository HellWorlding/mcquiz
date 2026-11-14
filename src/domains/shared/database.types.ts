
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_questions": {
                  Row: {
                    "answer": string | null,"created_at": string,"id": string,"question": string,"question_id": string | null,"sources": NonNullable<Json>,"subject_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer"?: string | null,"created_at"?: string,"id"?: string,"question": string,"question_id"?: string | null,"sources"?: NonNullable<Json>,"subject_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "answer"?: string | null,"created_at"?: string,"id"?: string,"question"?: string,"question_id"?: string | null,"sources"?: NonNullable<Json>,"subject_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_questions_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_questions_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_questions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"attempts": {
                  Row: {
                    "confused": boolean,"created_at": string,"id": string,"is_correct": boolean | null,"question_id": string,"selected_ord": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confused"?: boolean,"created_at"?: string,"id"?: string,"is_correct"?: boolean | null,"question_id": string,"selected_ord"?: number | null,"user_id": string
                  }
                  Update: {
                    "confused"?: boolean,"created_at"?: string,"id"?: string,"is_correct"?: boolean | null,"question_id"?: string,"selected_ord"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempts_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"board_posts": {
                  Row: {
                    "admin_reply": string | null,"body": string,"created_at": string,"id": string,"kind": string,"status": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_reply"?: string | null,"body": string,"created_at"?: string,"id"?: string,"kind"?: string,"status"?: string,"title": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "admin_reply"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "board_posts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"choices": {
                  Row: {
                    "explanation": string | null,"id": string,"ord": number,"question_id": string,"text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "explanation"?: string | null,"id"?: string,"ord": number,"question_id": string,"text": string
                  }
                  Update: {
                    "explanation"?: string | null,"id"?: string,"ord"?: number,"question_id"?: string,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "choices_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"collection_items": {
                  Row: {
                    "added_at": string,"collection_id": string,"question_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"collection_id": string,"question_id": string
                  }
                  Update: {
                    "added_at"?: string,"collection_id"?: string,"question_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_items_collection_id_fkey"
      columns: ["collection_id"]
isOneToOne: false
      referencedRelation: "collections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_items_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"collections": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"parent_id": string | null,"scope": string,"sort": number,"subject_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"parent_id"?: string | null,"scope"?: string,"sort"?: number,"subject_id": string,"title": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"parent_id"?: string | null,"scope"?: string,"sort"?: number,"subject_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "collections_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collections_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "collections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collections_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "ai_limit": number | null,"created_at": string,"display_name": string | null,"email": string | null,"id": string,"is_admin": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_limit"?: number | null,"created_at"?: string,"display_name"?: string | null,"email"?: string | null,"id": string,"is_admin"?: boolean
                  }
                  Update: {
                    "ai_limit"?: number | null,"created_at"?: string,"display_name"?: string | null,"email"?: string | null,"id"?: string,"is_admin"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"question_marks": {
                  Row: {
                    "at": string,"kind": string,"question_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"kind": string,"question_id": string,"user_id": string
                  }
                  Update: {
                    "at"?: string,"kind"?: string,"question_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_marks_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_marks_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"question_notes": {
                  Row: {
                    "content": string,"created_at": string,"question_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"question_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"question_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_notes_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_notes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"question_reports": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"message": string,"question_id": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"message": string,"question_id": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"message"?: string,"question_id"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_reports_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_reports_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"question_sets": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"source_filename": string | null,"subject_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"source_filename"?: string | null,"subject_id": string,"title": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"source_filename"?: string | null,"subject_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_sets_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_sets_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                },"questions": {
                  Row: {
                    "choice_count": number,"correct_choice": number | null,"created_at": string,"difficulty": string | null,"explanation": string | null,"hint": string | null,"id": string,"needs_review": boolean,"ord": number,"points": number | null,"prompt": string,"set_id": string,"source_page": number | null,"source_quote": string | null,"subject_id": string,"tags": (string)[],"topic": string | null,"trap_types": (string)[],"unit_confidence": number | null,"unit_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "choice_count"?: number,"correct_choice"?: number | null,"created_at"?: string,"difficulty"?: string | null,"explanation"?: string | null,"hint"?: string | null,"id"?: string,"needs_review"?: boolean,"ord"?: number,"points"?: number | null,"prompt": string,"set_id": string,"source_page"?: number | null,"source_quote"?: string | null,"subject_id": string,"tags"?: (string)[],"topic"?: string | null,"trap_types"?: (string)[],"unit_confidence"?: number | null,"unit_id"?: string | null
                  }
                  Update: {
                    "choice_count"?: number,"correct_choice"?: number | null,"created_at"?: string,"difficulty"?: string | null,"explanation"?: string | null,"hint"?: string | null,"id"?: string,"needs_review"?: boolean,"ord"?: number,"points"?: number | null,"prompt"?: string,"set_id"?: string,"source_page"?: number | null,"source_quote"?: string | null,"subject_id"?: string,"tags"?: (string)[],"topic"?: string | null,"trap_types"?: (string)[],"unit_confidence"?: number | null,"unit_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_set_id_fkey"
      columns: ["set_id"]
isOneToOne: false
      referencedRelation: "question_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"quiz_sessions": {
                  Row: {
                    "answers": NonNullable<Json>,"created_at": string,"finished": boolean,"id": string,"position": number,"question_ids": (string)[],"subject_id": string | null,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answers"?: NonNullable<Json>,"created_at"?: string,"finished"?: boolean,"id"?: string,"position"?: number,"question_ids": (string)[],"subject_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"created_at"?: string,"finished"?: boolean,"id"?: string,"position"?: number,"question_ids"?: (string)[],"subject_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_sessions_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quiz_sessions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"source_chunks": {
                  Row: {
                    "content": string,"id": string,"ord": number,"page": number | null,"source_id": string,"subject_id": string,"tsv": unknown,"unit_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"id"?: string,"ord": number,"page"?: number | null,"source_id": string,"subject_id": string,"tsv"?: never,"unit_id"?: string | null
                  }
                  Update: {
                    "content"?: string,"id"?: string,"ord"?: number,"page"?: number | null,"source_id"?: string,"subject_id"?: string,"tsv"?: never,"unit_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_chunks_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_chunks_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_chunks_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"sources": {
                  Row: {
                    "content": string,"created_at": string,"id": string,"kind": string,"page_range": string | null,"subject_id": string,"title": string,"tsv": unknown,"unit_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"id"?: string,"kind"?: string,"page_range"?: string | null,"subject_id": string,"title": string,"tsv"?: never,"unit_id"?: string | null
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"page_range"?: string | null,"subject_id"?: string,"title"?: string,"tsv"?: never,"unit_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sources_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sources_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"subject_files": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"page_from": number | null,"page_offset": number,"page_to": number | null,"pages": number | null,"storage_path": string,"subject_id": string,"title": string | null,"unit_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name"?: string,"page_from"?: number | null,"page_offset"?: number,"page_to"?: number | null,"pages"?: number | null,"storage_path": string,"subject_id": string,"title"?: string | null,"unit_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"page_from"?: number | null,"page_offset"?: number,"page_to"?: number | null,"pages"?: number | null,"storage_path"?: string,"subject_id"?: string,"title"?: string | null,"unit_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "subject_files_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subject_files_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"subject_members": {
                  Row: {
                    "created_at": string,"subject_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"subject_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"subject_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subject_members_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subject_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"subjects": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"visibility"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"visibility"?: string
                  }
                  Relationships: [
                    
                  ]
                },"units": {
                  Row: {
                    "created_at": string,"id": string,"no": number | null,"parent_id": string | null,"sort": number,"subject_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"no"?: number | null,"parent_id"?: string | null,"sort"?: number,"subject_id": string,"title": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"no"?: number | null,"parent_id"?: string | null,"sort"?: number,"subject_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "units_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "units_subject_id_fkey"
      columns: ["subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "board_posts_view": {
                  Row: {
                    "admin_reply": string | null,"author": string | null,"body": string,"created_at": string,"id": string,"kind": string,"status": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "board_posts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "can_edit_collection":
{ Args: { "cid": string }; Returns: boolean
                           },
"can_read_collection":
{ Args: { "cid": string }; Returns: boolean
                           },
"can_read_subject":
{ Args: { "sid": string }; Returns: boolean
                           },
"classify_unit":
{ Args: { "p_subject": string,"p_tokens": (string)[] }; Returns: {
              "score": number,"unit_id": string
            }[]
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_question_stats":
{ Args: { "p_subject": string }; Returns: {
              "attempt_count": number,"confused_after": boolean,"difficulty": string,"last_correct": boolean,"last_graded_at": string,"last_weak_at": string,"question_id": string,"saved": boolean,"set_id": string,"tags": (string)[],"topic": string,"trap_types": (string)[],"unit_id": string,"wrong_after": boolean,"wrong_count": number
            }[]
                           },
"my_subject_activity":
{ Args: Record<PropertyKey, never>; Returns: {
              "attempt_count": number,"last_at": string,"subject_id": string,"weak_count": number
            }[]
                           },
"my_unit_progress":
{ Args: { "p_subject": string }; Returns: {
              "answered": number,"covered": number,"session_id": string,"unit_id": string
            }[]
                           },
"my_unit_round_scores":
{ Args: { "p_subject": string }; Returns: {
              "n": number,"n_correct": number,"round_no": number,"unit_id": string
            }[]
                           },
"my_unit_rounds":
{ Args: { "p_subject": string }; Returns: {
              "attempts": number,"n": number,"n_correct": number,"unit_id": string
            }[]
                           },
"my_unseen_questions":
{ Args: { "p_subject": string }; Returns: {
              "id": string,"set_id": string,"tags": (string)[],"unit_id": string
            }[]
                           },
"question_counts_by_unit":
{ Args: { "p_subject": string }; Returns: {
              "n": number,"unit_id": string
            }[]
                           },
"search_chunks":
{ Args: { "p_limit"?: number,"p_subject": string,"p_tokens": (string)[],"p_unit_ids"?: (string)[] }; Returns: {
              "chunk_id": string,"content": string,"kind": string,"ord": number,"page": number,"score": number,"source_id": string,"source_title": string,"unit_id": string,"unit_no": number
            }[]
                           },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           },
"unit_subtree":
{ Args: { "root_ids": (string)[] }; Returns: string[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
