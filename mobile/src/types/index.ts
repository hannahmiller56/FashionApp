export type GenerationMode = 'closet_only' | 'allow_extras';

export type ClosetCategory =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'shoes'
  | 'accessories';

export interface ClosetItem {
  id: string;
  user_id?: string;
  image_url: string;
  category: ClosetCategory;
  color: string;
  style_tags: string[];
  is_worn?: boolean;
  worn_at?: string | null;
  created_at?: string;
}

export interface GenerationResult {
  id: string;
  image_url: string;
  prompt: string;
  mode: GenerationMode;
  recipe_simplified: {
    closet_item_ids: string[];
    non_closet_notes: string[];
  };
  model_version: string;
  created_at?: string;
}

export interface SavedLook {
  id: string;
  image_url: string;
  prompt_text: string;
  recipe_simplified: GenerationResult['recipe_simplified'];
  calendar_date?: string;
  model_version: string;
  created_at?: string;
}
