export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bridge_errors: {
        Row: {
          error_type: string
          id: string
          message: string
          occurred_at: string
          payload: Json | null
          resolved_at: string | null
          source: string
          sysme_id_linea: string | null
          sysme_id_venta: string | null
        }
        Insert: {
          error_type: string
          id?: string
          message: string
          occurred_at?: string
          payload?: Json | null
          resolved_at?: string | null
          source: string
          sysme_id_linea?: string | null
          sysme_id_venta?: string | null
        }
        Update: {
          error_type?: string
          id?: string
          message?: string
          occurred_at?: string
          payload?: Json | null
          resolved_at?: string | null
          source?: string
          sysme_id_linea?: string | null
          sysme_id_venta?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
          reference: string | null
          supplier_id: string | null
          tax: number
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string | null
          expense_date: string
          id?: string
          reference?: string | null
          supplier_id?: string | null
          tax?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          reference?: string | null
          supplier_id?: string | null
          tax?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          barcode: string | null
          category_id: string
          cost_price: number
          created_at: string
          deleted_at: string | null
          id: string
          image: string | null
          min_stock: number
          name: string
          sale_price: number
          sku: string
          stock: number
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          category_id: string
          cost_price: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          image?: string | null
          min_stock?: number
          name: string
          sale_price: number
          sku: string
          stock?: number
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          category_id?: string
          cost_price?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          image?: string | null
          min_stock?: number
          name?: string
          sale_price?: number
          sku?: string
          stock?: number
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_lines: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_id: string
          quantity: number
          tax_rate: number
          total: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_id: string
          quantity: number
          tax_rate?: number
          total: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_id?: string
          quantity?: number
          tax_rate?: number
          total?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          id: string
          invoice_number: string | null
          notes: string | null
          purchase_date: string
          status: string
          subtotal: number
          supplier_id: string
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          purchase_date: string
          status?: string
          subtotal?: number
          supplier_id: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          purchase_date?: string
          status?: string
          subtotal?: number
          supplier_id?: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lines: {
        Row: {
          created_at: string
          discount: number
          gross_margin_percent: number | null
          gross_profit: number | null
          id: string
          product_id: string
          quantity: number
          sale_id: string
          sysme_id_linea: string | null
          sysme_id_venta: string | null
          tax_rate: number
          total_cost: number | null
          total_sale: number
          unit_cost_at_time: number | null
          unit_sale_price: number
        }
        Insert: {
          created_at?: string
          discount?: number
          gross_margin_percent?: number | null
          gross_profit?: number | null
          id?: string
          product_id: string
          quantity: number
          sale_id: string
          sysme_id_linea?: string | null
          sysme_id_venta?: string | null
          tax_rate?: number
          total_cost?: number | null
          total_sale: number
          unit_cost_at_time?: number | null
          unit_sale_price: number
        }
        Update: {
          created_at?: string
          discount?: number
          gross_margin_percent?: number | null
          gross_profit?: number | null
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          sysme_id_linea?: string | null
          sysme_id_venta?: string | null
          tax_rate?: number
          total_cost?: number | null
          total_sale?: number
          unit_cost_at_time?: number | null
          unit_sale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cancelled_at: string | null
          created_at: string
          id: string
          payment_method: string | null
          sale_date: string
          source: string
          status: string
          subtotal: number
          sysme_id_tiquet: string | null
          sysme_id_venta: string | null
          sysme_serie: string | null
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          payment_method?: string | null
          sale_date: string
          source: string
          status?: string
          subtotal?: number
          sysme_id_tiquet?: string | null
          sysme_id_venta?: string | null
          sysme_serie?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          payment_method?: string | null
          sale_date?: string
          source?: string
          status?: string
          subtotal?: number
          sysme_id_tiquet?: string | null
          sysme_id_venta?: string | null
          sysme_serie?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: string
          previous_stock: number
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          resulting_stock: number
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type: string
          previous_stock: number
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          resulting_stock: number
          source: string
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string
          previous_stock?: number
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          resulting_stock?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_key: string
          event_type: string
          id: string
          payload: Json | null
          processed_at: string | null
          source: string
          source_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_key: string
          event_type: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          source: string
          source_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_key?: string
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          source?: string
          source_id?: string | null
          status?: string
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          id: string
          integration_name: string
          last_error: string | null
          last_finalized_sale_id: string | null
          last_sync_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          id?: string
          integration_name: string
          last_error?: string | null
          last_finalized_sale_id?: string | null
          last_sync_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          id?: string
          integration_name?: string
          last_error?: string | null
          last_finalized_sale_id?: string | null
          last_sync_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      sysme_product_map: {
        Row: {
          active: boolean
          created_at: string
          id: string
          id_centro: string
          id_complementog: string
          id_empresa: string
          id_tipo_comg: string
          product_id: string
          sysme_barcode: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          id_centro: string
          id_complementog: string
          id_empresa: string
          id_tipo_comg: string
          product_id: string
          sysme_barcode?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          id_centro?: string
          id_complementog?: string
          id_empresa?: string
          id_tipo_comg?: string
          product_id?: string
          sysme_barcode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sysme_product_map_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

