import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';
import { Pacifico_400Regular, useFonts as usePacificoFonts } from '@expo-google-fonts/pacifico';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../constants/theme';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  autoTagClosetItem,
  createPasswordAccountForDemo,
  listClosetItems,
  listSavedLooks,
  requestGeneration,
  resolveImageUrlForDisplay,
  saveLook,
  upsertClosetItem
} from '../services/api';
import type { ClosetCategory, ClosetItem, GenerationMode, GenerationResult, SavedLook } from '../types';

const tabs = ['Generate', 'Closet', 'Calendar', 'Settings'] as const;
type Tab = (typeof tabs)[number];
type TabIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
const tabIcons: Record<Tab, { active: TabIconName; inactive: TabIconName; label: string }> = {
  Generate: { active: 'mirror-rectangle', inactive: 'mirror-rectangle', label: 'Generate' },
  Closet: { active: 'hanger', inactive: 'hanger', label: 'Closet' },
  Calendar: { active: 'calendar', inactive: 'calendar-blank-outline', label: 'Calendar' },
  Settings: { active: 'cog', inactive: 'cog-outline', label: 'Settings' }
};

const categories: ClosetCategory[] = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessories'];
const closetBottomIcon = require('../../assets/icons/closet_bottom.png');
const closetDressIcon = require('../../assets/icons/closet_dress.png');
const closetOuterwearIcon = require('../../assets/icons/closet_outerwear.png');
type ClosetCategoryIconKind = 'material' | 'png';
type ClosetCategoryMeta = {
  label: string;
  iconKind: ClosetCategoryIconKind;
  materialIcon?: TabIconName;
  pngIcon?: number;
};

const closetCategoryMeta: Record<ClosetCategory, ClosetCategoryMeta> = {
  top: { label: 'Tops', iconKind: 'material', materialIcon: 'tshirt-crew-outline' },
  bottom: { label: 'Bottoms', iconKind: 'png', pngIcon: closetBottomIcon, materialIcon: 'human-male-board' },
  dress: { label: 'Dresses', iconKind: 'png', pngIcon: closetDressIcon, materialIcon: 'human-female-dance' },
  outerwear: { label: 'Outerwear', iconKind: 'png', pngIcon: closetOuterwearIcon, materialIcon: 'coat-rack' },
  shoes: { label: 'Shoes', iconKind: 'material', materialIcon: 'shoe-heel' },
  accessories: { label: 'Accessories', iconKind: 'material', materialIcon: 'sunglasses' }
};
const authRedirectUrl = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || 'fashionapp://auth/callback';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCalendarKey(key: string): string {
  if (key === 'unassigned') return 'Unassigned';
  return key;
}

function readParam(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0];
  return null;
}

function looksLikeJwt(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

type AuthCallbackPayload =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string }
  | { kind: 'otp_hash'; tokenHash: string; otpType: string; source: 'token_hash' | 'token' };

type GenerationFeedback = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

type ClosetTabKey = ClosetCategory | 'search';
type ClosetSortOption = 'color' | 'newest' | 'oldest';

function extractSessionFromUrl(url: string): AuthCallbackPayload | null {
  const parsed = Linking.parse(url);
  const queryParams = (parsed.queryParams || {}) as Record<string, unknown>;
  const fragmentParams = new URLSearchParams(url.split('#')[1] || '');

  const accessToken = readParam(queryParams, 'access_token') || fragmentParams.get('access_token');
  const refreshToken = readParam(queryParams, 'refresh_token') || fragmentParams.get('refresh_token');
  const code = readParam(queryParams, 'code') || fragmentParams.get('code');
  const tokenHashFromHash = readParam(queryParams, 'token_hash') || fragmentParams.get('token_hash');
  const tokenHashFromToken = readParam(queryParams, 'token') || fragmentParams.get('token');
  const tokenHash = tokenHashFromHash || tokenHashFromToken;
  const otpType = readParam(queryParams, 'type') || fragmentParams.get('type');

  if (accessToken && refreshToken && looksLikeJwt(accessToken)) {
    return { kind: 'tokens', accessToken, refreshToken };
  }

  if (code) {
    return { kind: 'code', code };
  }

  if (tokenHash && otpType) {
    return {
      kind: 'otp_hash',
      tokenHash,
      otpType,
      source: tokenHashFromHash ? 'token_hash' : 'token'
    };
  }

  return null;
}

function formatActionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutPrefix = raw
    .replace(/^error:\s*/i, '')
    .replace(/^Function\s+[a-z-]+\s+failed\s+\(\d+\):\s*/i, '')
    .trim();
  return withoutPrefix || 'Unknown error';
}

function parseStyleTagsFromInput(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function withTimeoutFallback<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

function isMissingIsWornColumnError(error: unknown): boolean {
  const message = formatActionError(error).toLowerCase();
  return (message.includes('is_worn') || message.includes('worn_at')) && message.includes('column');
}

function formatWornDateLabel(wornAt: string | null | undefined): string {
  if (!wornAt) return '';
  const date = new Date(wornAt);
  if (Number.isNaN(date.getTime())) return '';
  return `Worn ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })}`;
}

function renderClosetCategoryIcon(category: ClosetCategory, color: string, size: number) {
  const categoryMeta = closetCategoryMeta[category];
  if (categoryMeta.iconKind === 'png' && categoryMeta.pngIcon) {
    return (
      <Image
        source={categoryMeta.pngIcon}
        style={{ width: size, height: size, tintColor: color }}
        resizeMode="contain"
      />
    );
  }

  return (
    <MaterialCommunityIcons
      name={categoryMeta.materialIcon || 'hanger'}
      size={size}
      color={color}
    />
  );
}

function renderClosetTabIcon(tabKey: ClosetTabKey, color: string, size: number) {
  if (tabKey === 'search') {
    return <MaterialCommunityIcons name="magnify" size={size} color={color} />;
  }
  return renderClosetCategoryIcon(tabKey, color, size);
}

function ClosetItemCard(props: {
  item: ClosetItem;
  thumbnailUrl?: string;
  onLongPress: () => void;
  onToggleWorn: (item: ClosetItem, nextIsWorn: boolean) => void;
}) {
  const { item, thumbnailUrl, onLongPress, onToggleWorn } = props;
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_, gesture) => {
          translateX.setValue(gesture.dx);
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldToggle = Math.abs(gesture.dx) >= 30;
          if (shouldToggle) {
            const direction = gesture.dx >= 0 ? 1 : -1;
            const nextIsWorn = !Boolean(item.is_worn);
            onToggleWorn(item, nextIsWorn);
            Animated.sequence([
              Animated.timing(translateX, {
                toValue: direction * 72,
                duration: 110,
                useNativeDriver: true
              }),
              Animated.timing(translateX, {
                toValue: 0,
                duration: 130,
                useNativeDriver: true
              })
            ]).start();
            return;
          }

          Animated.spring(translateX, {
            toValue: 0,
            speed: 22,
            bounciness: 0,
            useNativeDriver: true
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            speed: 22,
            bounciness: 0,
            useNativeDriver: true
          }).start();
        }
      }),
    [item, onToggleWorn, translateX]
  );

  const isWorn = Boolean(item.is_worn);
  const actionText = isWorn ? 'Mark unworn' : 'Mark worn';
  const wornDateLabel = formatWornDateLabel(item.worn_at);
  const swipeBackdropOpacity = translateX.interpolate({
    inputRange: [-84, -14, 0, 14, 84],
    outputRange: [1, 0.35, 0, 0.35, 1],
    extrapolate: 'clamp'
  });
  const swipeRowOpacity = translateX.interpolate({
    inputRange: [-110, -18, 0, 18, 110],
    outputRange: [0.64, 0.88, 1, 0.88, 0.64],
    extrapolate: 'clamp'
  });

  return (
    <View style={styles.closetSwipeRow}>
      <Animated.View
        style={[
          styles.closetSwipeBackdrop,
          isWorn ? styles.closetSwipeBackdropWorn : styles.closetSwipeBackdropUnworn,
          { opacity: swipeBackdropOpacity }
        ]}
      >
        <MaterialCommunityIcons
          name={isWorn ? 'hanger' : 'check-circle-outline'}
          size={16}
          color={isWorn ? colors.subtext : colors.accent}
        />
        <Text style={styles.closetSwipeBackdropText}>{actionText}</Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.closetItemRow,
          isWorn ? styles.closetItemRowWorn : null,
          { transform: [{ translateX }], opacity: swipeRowOpacity }
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={styles.closetItemPressable}
          onLongPress={onLongPress}
          delayLongPress={220}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.color} ${item.category}`}
        >
          <View style={styles.closetThumbnailWrap}>
            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={[styles.closetThumbnailImage, isWorn ? styles.closetThumbnailImageWorn : null]} />
            ) : (
              <View style={[styles.closetThumbnailPlaceholder, isWorn ? styles.closetThumbnailPlaceholderWorn : null]}>
                {renderClosetCategoryIcon(item.category, colors.subtext, 18)}
              </View>
            )}
          </View>
          <View style={[styles.closetItemMeta, isWorn && wornDateLabel ? styles.closetItemMetaWithDate : null]}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.cardTitle, isWorn ? styles.closetItemTitleWorn : null]}>
              {item.color} {item.category}
            </Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.muted, isWorn ? styles.closetItemTextWorn : null]}>
              {item.style_tags.join(', ') || 'No tags'}
            </Text>
          </View>
          {isWorn && wornDateLabel ? (
            <Text style={styles.closetWornDateText}>{wornDateLabel}</Text>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function CoreApp() {
  const [pacificoLoaded] = usePacificoFonts({
    Pacifico_400Regular
  });
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('Generate');
  const [loading, setLoading] = useState(true);

  const [closetItems, setClosetItems] = useState<ClosetItem[]>([]);
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([]);
  const [results, setResults] = useState<GenerationResult[]>([]);

  const [prompt, setPrompt] = useState('Surprise me!');
  const [mode, setMode] = useState<GenerationMode>('closet_only');
  const [subjectMode, setSubjectMode] = useState<'mannequin' | 'personal'>('mannequin');

  const [uploadUri, setUploadUri] = useState('');
  const [uploadCategory, setUploadCategory] = useState<ClosetCategory | null>(null);
  const [uploadColor, setUploadColor] = useState('');
  const [uploadStyleTags, setUploadStyleTags] = useState('');
  const [editingClosetItem, setEditingClosetItem] = useState<ClosetItem | null>(null);
  const [editCategory, setEditCategory] = useState<ClosetCategory>('top');
  const [editColor, setEditColor] = useState('');
  const [editStyleTags, setEditStyleTags] = useState('');
  const [selectedClosetTab, setSelectedClosetTab] = useState<ClosetTabKey>('top');
  const [closetThumbnailUrls, setClosetThumbnailUrls] = useState<Record<string, string>>({});
  const [closetSearchQuery, setClosetSearchQuery] = useState('');
  const [closetSortMenuOpen, setClosetSortMenuOpen] = useState(false);
  const [closetSortOption, setClosetSortOption] = useState<ClosetSortOption>('color');
  const closetThumbnailSignature = useMemo(
    () => closetItems.map((item) => `${item.id}:${item.image_url}`).join('|'),
    [closetItems]
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generationFeedback, setGenerationFeedback] = useState<GenerationFeedback>({
    status: 'idle',
    message: ''
  });
  const [selectedCalendarKey, setSelectedCalendarKey] = useState<string | null>(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isPromptMounted, setIsPromptMounted] = useState(false);
  const [isClosetOpen, setIsClosetOpen] = useState(false);
  const [isClosetMounted, setIsClosetMounted] = useState(false);
  const promptBaseTranslateY = useRef(new Animated.Value(36)).current;
  const promptDragTranslateY = useRef(new Animated.Value(0)).current;
  const promptBackdropOpacity = useRef(new Animated.Value(0)).current;
  const closetBaseTranslateY = useRef(new Animated.Value(36)).current;
  const closetDragTranslateY = useRef(new Animated.Value(0)).current;
  const closetBackdropOpacity = useRef(new Animated.Value(0)).current;
  const resultSwipeX = useRef(new Animated.Value(0)).current;
  const resultSwipeY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void hydrate();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }

    let mounted = true;

    async function applySessionFromUrl(url: string) {
      try {
        const parsedSession = extractSessionFromUrl(url);
        if (!parsedSession) return;

        let authError: Error | null = null;

        if (parsedSession.kind === 'tokens') {
          const { error } = await supabase.auth.setSession({
            access_token: parsedSession.accessToken,
            refresh_token: parsedSession.refreshToken
          });
          authError = error;
        } else if (parsedSession.kind === 'code') {
          const { error } = await supabase.auth.exchangeCodeForSession(parsedSession.code);
          authError = error;
        } else if (parsedSession.kind === 'otp_hash') {
          const primaryAttempt = await supabase.auth.verifyOtp({
            token_hash: parsedSession.tokenHash,
            type: parsedSession.otpType as
              | 'signup'
              | 'magiclink'
              | 'invite'
              | 'recovery'
              | 'email_change'
              | 'email'
          });

          if (primaryAttempt.error && parsedSession.source === 'token') {
            const loginEmail = email.trim() || null;
            if (loginEmail) {
              const secondaryAttempt = await supabase.auth.verifyOtp({
                email: loginEmail,
                token: parsedSession.tokenHash,
                type: parsedSession.otpType as
                  | 'signup'
                  | 'magiclink'
                  | 'invite'
                  | 'recovery'
                  | 'email_change'
                  | 'email'
              });
              authError = secondaryAttempt.error;
            } else {
              authError = primaryAttempt.error;
            }
          } else {
            authError = primaryAttempt.error;
          }
        }

        if (authError) {
          Alert.alert('Auth callback error', authError.message);
          return;
        }

        if (mounted) {
          const {
            data: { user },
            error: userError
          } = await supabase.auth.getUser();
          if (userError) {
            setAuthEmail(null);
            Alert.alert('Auth callback error', userError.message);
            return;
          }
          setAuthEmail(user?.email || null);
          await hydrate();
        }
      } catch (error) {
        Alert.alert('Auth callback failed', String(error));
      }
    }

    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error && mounted) {
        if (data.session?.access_token) {
          const {
            data: { user },
            error: userError
          } = await supabase.auth.getUser();
          if (userError) {
            await supabase.auth.signOut();
            setAuthEmail(null);
          } else {
            setAuthEmail(user?.email || null);
          }
        } else {
          setAuthEmail(null);
        }
      }

      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await applySessionFromUrl(initialUrl);
      }

      if (mounted) setAuthReady(true);
    })();

    const { data: authSubscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (!session?.access_token) {
        setAuthEmail(null);
        return;
      }
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();
      if (userError) {
        setAuthEmail(null);
        return;
      }
      setAuthEmail(user?.email || null);
    });

    const linkSubscription = Linking.addEventListener('url', ({ url }: { url: string }) => {
      void applySessionFromUrl(url);
    });

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, []);

  async function hydrate() {
    setLoading(true);
    try {
      const [closet, looks] = await Promise.all([
        withTimeoutFallback(listClosetItems(), 8000, [] as ClosetItem[]),
        withTimeoutFallback(listSavedLooks(), 8000, [] as SavedLook[])
      ]);
      setClosetItems(closet);
      setSavedLooks(looks);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function hydrateClosetThumbs() {
      if (closetItems.length === 0) {
        if (active) setClosetThumbnailUrls({});
        return;
      }

      const entries = await Promise.all(
        closetItems.map(async (item) => {
          try {
            const resolvedUrl = await resolveImageUrlForDisplay(item.image_url);
            return [item.id, resolvedUrl] as const;
          } catch {
            return [item.id, item.image_url.startsWith('supabase://') ? '' : item.image_url] as const;
          }
        })
      );

      if (!active) return;
      setClosetThumbnailUrls(Object.fromEntries(entries));
    }

    void hydrateClosetThumbs();

    return () => {
      active = false;
    };
  }, [closetThumbnailSignature]);

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo library access to upload clothing images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9
    });

    if (!result.canceled && result.assets.length > 0) {
      setUploadUri(result.assets[0].uri);
    }
  }

  async function addClosetItem() {
    if (!uploadUri) {
      Alert.alert('Missing image', 'Select a clothing image first.');
      return;
    }

    if (isSupabaseConfigured) {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Sign-in required', 'Sign in from Settings before adding an item to your closet.');
        setTab('Settings');
        return;
      }
    }

    setBusy(true);
    try {
      const normalizedColor = uploadColor.trim().toLowerCase();
      const normalizedStyleTags = parseStyleTagsFromInput(uploadStyleTags);
      const detectCategory = !uploadCategory;
      const detectColor = !normalizedColor;
      const detectStyleTags = normalizedStyleTags.length === 0;

      const created = await upsertClosetItem({
        image_url: uploadUri,
        category: uploadCategory || 'top',
        color: normalizedColor || 'unknown',
        style_tags: normalizedStyleTags
      });

      setClosetItems((prev) => [created, ...prev]);
      setSelectedClosetTab(created.category);
      setUploadUri('');
      setUploadCategory(null);
      setUploadColor('');
      setUploadStyleTags('');
      setIsClosetOpen(false);
      Alert.alert('Added', 'Item added to your closet.');
      if (detectCategory || detectColor || detectStyleTags) {
        void (async () => {
          try {
            const tagged = await autoTagClosetItem({
              closetItemId: created.id,
              detectCategory,
              detectColor,
              detectStyleTags
            });
            if (!tagged) return;
            setClosetItems((prev) => prev.map((item) => (item.id === tagged.id ? tagged : item)));
            if (detectCategory) {
              setSelectedClosetTab(tagged.category);
            }
          } catch {
            // Best-effort auto-tagging; keep user flow fast even if tagging fails.
          }
        })();
      }
    } catch (error) {
      const reason = formatActionError(error);
      if (reason.toLowerCase().includes('signed in')) {
        Alert.alert('Sign-in required', 'Sign in from Settings before adding an item to your closet.');
        setTab('Settings');
        return;
      }
      Alert.alert('Upload failed', reason);
    } finally {
      setBusy(false);
    }
  }

  function openClosetItemEditor(item: ClosetItem) {
    setEditingClosetItem(item);
    setEditCategory(item.category);
    setEditColor(item.color || '');
    setEditStyleTags((item.style_tags || []).join(', '));
  }

  function closeClosetItemEditor() {
    setEditingClosetItem(null);
    setEditCategory('top');
    setEditColor('');
    setEditStyleTags('');
  }

  async function saveClosetItemEdits() {
    if (!editingClosetItem) return;

    const normalizedColor = editColor.trim().toLowerCase();
    if (!normalizedColor) {
      Alert.alert('Color required', 'Enter a color to save changes.');
      return;
    }

    setBusy(true);
    try {
      const updated = await upsertClosetItem({
        id: editingClosetItem.id,
        image_url: editingClosetItem.image_url,
        category: editCategory,
        color: normalizedColor,
        style_tags: parseStyleTagsFromInput(editStyleTags)
      });

      setClosetItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      closeClosetItemEditor();
      Alert.alert('Updated', 'Closet item updated.');
    } catch (error) {
      Alert.alert('Update failed', formatActionError(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleClosetItemWorn(item: ClosetItem, nextIsWorn: boolean) {
    const previousIsWorn = Boolean(item.is_worn);
    const previousWornAt = item.worn_at || null;
    const nextWornAt = nextIsWorn ? new Date().toISOString() : null;
    Vibration.vibrate(12);
    setClosetItems((prev) =>
      prev.map((entry) =>
        entry.id === item.id
          ? { ...entry, is_worn: nextIsWorn, worn_at: nextWornAt }
          : entry
      )
    );

    try {
      const updated = await upsertClosetItem({
        id: item.id,
        image_url: item.image_url,
        category: item.category,
        color: item.color,
        style_tags: item.style_tags,
        is_worn: nextIsWorn,
        worn_at: nextWornAt
      });

      setClosetItems((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (error) {
      if (isMissingIsWornColumnError(error)) {
        return;
      }
      setClosetItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? { ...entry, is_worn: previousIsWorn, worn_at: previousWornAt }
            : entry
        )
      );
      Alert.alert('Update failed', formatActionError(error));
    }
  }

  async function generateLooks() {
    if (!prompt.trim()) {
      setGenerationFeedback({ status: 'error', message: 'Write a style prompt before generating.' });
      Alert.alert('Prompt required', 'Write a style prompt before generating.');
      return;
    }

    if (subjectMode === 'personal') {
      const message =
        'Personal mode requires your own reference photo. This build does not include personal photo upload yet, so switch Subject to mannequin.';
      setGenerationFeedback({ status: 'error', message });
      Alert.alert('Personal reference required', message);
      return;
    }

    if (mode === 'closet_only') {
      const hasTop = closetItems.some((item) => item.category === 'top');
      const hasBottom = closetItems.some((item) => item.category === 'bottom');
      const hasDress = closetItems.some((item) => item.category === 'dress');

      if (!(hasDress || (hasTop && hasBottom))) {
        setGenerationFeedback({
          status: 'error',
          message: 'Closet-only needs either top + bottom or a dress before generation.'
        });
        Alert.alert('Missing required items', 'Add a top + bottom or a dress for closet-only mode.');
        return;
      }
    }

    setGenerationFeedback({
      status: 'loading',
      message: 'Generating look with closet image references...'
    });
    setBusy(true);
    try {
      const generated = await requestGeneration({
        prompt,
        mode,
        closetItems,
        subjectMode
      });
      setResults((prev) => [...generated, ...prev]);
      setTab('Generate');
      setIsPromptOpen(false);
      setGenerationFeedback({
        status: 'success',
        message: generated.length > 0 ? `Generated ${generated.length} look${generated.length > 1 ? 's' : ''}.` : 'Generation completed with no results.'
      });
    } catch (error) {
      const reason = formatActionError(error);
      setGenerationFeedback({
        status: 'error',
        message: `Generation failed: ${reason}`
      });
      Alert.alert('Generation failed', reason);
    } finally {
      setBusy(false);
    }
  }

  async function saveResult(result: GenerationResult) {
    setBusy(true);
    try {
      const calendarDate = todayISO();
      const saved = await saveLook({
        result,
        calendarDate
      });
      setSavedLooks((prev) => [saved, ...prev]);
      setResults((prev) => prev.filter((item) => item.id !== result.id));
      Alert.alert('Saved', `Look saved for ${calendarDate}.`);
    } catch (error) {
      Alert.alert('Save failed', String(error));
    } finally {
      setBusy(false);
    }
  }

  function trashResult(resultId: string) {
    setResults((prev) => prev.filter((item) => item.id !== resultId));
  }

  function resetResultSwipe() {
    resultSwipeX.setValue(0);
    resultSwipeY.setValue(0);
  }

  function animateResultOff(direction: 'left' | 'right', onDone: () => void) {
    Animated.timing(resultSwipeX, {
      toValue: direction === 'right' ? 420 : -420,
      duration: 180,
      useNativeDriver: true
    }).start(() => {
      onDone();
      resetResultSwipe();
    });
  }

  async function sendMagicLink() {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase missing',
        'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to run auth.'
      );
      return;
    }
    if (!email.trim()) {
      Alert.alert('Email required', 'Enter your email to receive a magic link.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: authRedirectUrl
        }
      });
      if (error) throw error;
      Alert.alert('Email sent', `Check your inbox and open the link on this device.\nRedirect: ${authRedirectUrl}`);
    } catch (error) {
      Alert.alert('Auth failed', String(error));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPassword() {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase missing',
        'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to run auth.'
      );
      return;
    }
    if (!email.trim() || !password) {
      Alert.alert('Credentials required', 'Enter email and password.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (error) throw error;
      const {
        data: { user }
      } = await supabase.auth.getUser();
      setAuthEmail(user?.email || null);
      await hydrate();
      Alert.alert('Signed in', `Welcome ${user?.email || ''}`.trim());
    } catch (error) {
      Alert.alert('Sign in failed', String(error));
    } finally {
      setBusy(false);
    }
  }

  async function signUpWithPassword() {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase missing',
        'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to run auth.'
      );
      return;
    }
    if (!email.trim() || !password) {
      Alert.alert('Credentials required', 'Enter email and password.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    setBusy(true);
    try {
      try {
        await createPasswordAccountForDemo({
          email: normalizedEmail,
          password
        });
      } catch (error) {
        const reason = formatActionError(error).toLowerCase();
        if (!(reason.includes('already') || reason.includes('exists') || reason.includes('registered'))) {
          throw error;
        }
      }

      await supabase.auth.signOut();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });
      if (signInError) throw signInError;
      const {
        data: { user }
      } = await supabase.auth.getUser();
      setAuthEmail(user?.email || normalizedEmail);
      await hydrate();
      Alert.alert('Account ready', `Signed in as ${user?.email || normalizedEmail}`);
    } catch (error) {
      Alert.alert('Sign up failed', String(error));
    } finally {
      setBusy(false);
    }
  }

  async function signInAnonymously() {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase missing',
        'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to run auth.'
      );
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      const {
        data: { user }
      } = await supabase.auth.getUser();
      setAuthEmail(user?.email || '(anonymous user)');
      await hydrate();
      Alert.alert('Signed in', 'Anonymous dev session started.');
    } catch (error) {
      Alert.alert(
        'Anonymous sign-in failed',
        `${String(error)}\nEnable Anonymous provider in Supabase Auth settings first.`
      );
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await supabase.auth.signOut();
      setAuthEmail(null);
      Alert.alert('Signed out', 'Session cleared.');
    } catch (error) {
      Alert.alert('Sign out failed', String(error));
    } finally {
      setBusy(false);
    }
  }

  const filteredClosetItems = useMemo(() => {
    const query = closetSearchQuery.trim().toLowerCase();
    return closetItems
      .filter((item) => (selectedClosetTab === 'search' ? true : item.category === selectedClosetTab))
      .filter((item) => {
        if (selectedClosetTab !== 'search') return true;
        if (!query) return true;
        const haystack = `${item.color} ${item.category} ${(item.style_tags || []).join(' ')}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice()
      .sort((a, b) => {
        if (closetSortOption === 'newest') {
          return (b.created_at || '').localeCompare(a.created_at || '');
        }
        if (closetSortOption === 'oldest') {
          return (a.created_at || '').localeCompare(b.created_at || '');
        }
        const colorCompare = a.color.localeCompare(b.color, undefined, { sensitivity: 'base' });
        if (colorCompare !== 0) return colorCompare;
        return (a.created_at || '').localeCompare(b.created_at || '');
      });
  }, [closetItems, selectedClosetTab, closetSearchQuery, closetSortOption]);

  const calendarBuckets = useMemo(() => {
    return savedLooks.reduce<Record<string, SavedLook[]>>((acc, look) => {
      const key = look.calendar_date || 'unassigned';
      if (!acc[key]) acc[key] = [];
      acc[key].push(look);
      return acc;
    }, {});
  }, [savedLooks]);

  const calendarEntries = useMemo(() => {
    return Object.entries(calendarBuckets).sort((a, b) => {
      if (a[0] === 'unassigned') return 1;
      if (b[0] === 'unassigned') return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [calendarBuckets]);

  useEffect(() => {
    if (calendarEntries.length === 0) {
      setSelectedCalendarKey(null);
      return;
    }
    if (!selectedCalendarKey || !calendarEntries.some(([key]) => key === selectedCalendarKey)) {
      setSelectedCalendarKey(calendarEntries[0][0]);
    }
  }, [calendarEntries, selectedCalendarKey]);

  const selectedCalendarLooks = useMemo(() => {
    if (!selectedCalendarKey) return [];
    const match = calendarEntries.find(([key]) => key === selectedCalendarKey);
    return match ? match[1] : [];
  }, [calendarEntries, selectedCalendarKey]);

  const calendarTileSize = Math.floor((Dimensions.get('window').width - 32 - 28) / 3);

  useEffect(() => {
    if (isPromptOpen) {
      setIsPromptMounted(true);
      promptBaseTranslateY.setValue(36);
      promptDragTranslateY.setValue(0);
      promptBackdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(promptBackdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true
        }),
        Animated.spring(promptBaseTranslateY, {
          toValue: 0,
          damping: 18,
          stiffness: 180,
          mass: 0.8,
          useNativeDriver: true
        })
      ]).start();
      return;
    }

    if (!isPromptMounted) return;
    Animated.parallel([
      Animated.timing(promptBackdropOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true
      }),
      Animated.timing(promptBaseTranslateY, {
        toValue: 36,
        duration: 180,
        useNativeDriver: true
      })
    ]).start(() => {
      promptDragTranslateY.setValue(0);
      setIsPromptMounted(false);
    });
  }, [isPromptMounted, isPromptOpen, promptBackdropOpacity, promptBaseTranslateY, promptDragTranslateY]);

  const promptPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          promptDragTranslateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 110 || gesture.vy > 1.1) {
            setIsPromptOpen(false);
            return;
          }
          Animated.spring(promptDragTranslateY, {
            toValue: 0,
            damping: 16,
            stiffness: 220,
            mass: 0.8,
            useNativeDriver: true
          }).start();
        }
      }),
    [promptDragTranslateY]
  );

  useEffect(() => {
    if (isClosetOpen) {
      setIsClosetMounted(true);
      closetBaseTranslateY.setValue(36);
      closetDragTranslateY.setValue(0);
      closetBackdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(closetBackdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true
        }),
        Animated.spring(closetBaseTranslateY, {
          toValue: 0,
          damping: 18,
          stiffness: 180,
          mass: 0.8,
          useNativeDriver: true
        })
      ]).start();
      return;
    }

    if (!isClosetMounted) return;
    Animated.parallel([
      Animated.timing(closetBackdropOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true
      }),
      Animated.timing(closetBaseTranslateY, {
        toValue: 36,
        duration: 180,
        useNativeDriver: true
      })
    ]).start(() => {
      closetDragTranslateY.setValue(0);
      setIsClosetMounted(false);
    });
  }, [closetBackdropOpacity, closetBaseTranslateY, closetDragTranslateY, isClosetMounted, isClosetOpen]);

  const closetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          closetDragTranslateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 110 || gesture.vy > 1.1) {
            setIsClosetOpen(false);
            return;
          }
          Animated.spring(closetDragTranslateY, {
            toValue: 0,
            damping: 16,
            stiffness: 220,
            mass: 0.8,
            useNativeDriver: true
          }).start();
        }
      }),
    [closetDragTranslateY]
  );

  const topResult = results[0];
  const nextResult = results[1];

  useEffect(() => {
    resetResultSwipe();
  }, [topResult?.id]);

  const resultPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          tab === 'Generate' &&
          !!topResult &&
          Math.abs(gesture.dx) > 6 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_, gesture) => {
          resultSwipeX.setValue(gesture.dx);
          resultSwipeY.setValue(gesture.dy * 0.2);
        },
        onPanResponderRelease: (_, gesture) => {
          if (!topResult || busy) {
            Animated.spring(resultSwipeX, { toValue: 0, useNativeDriver: true }).start();
            Animated.spring(resultSwipeY, { toValue: 0, useNativeDriver: true }).start();
            return;
          }
          if (gesture.dx > 120) {
            animateResultOff('right', () => void saveResult(topResult));
            return;
          }
          if (gesture.dx < -120) {
            animateResultOff('left', () => trashResult(topResult.id));
            return;
          }
          Animated.spring(resultSwipeX, {
            toValue: 0,
            damping: 18,
            stiffness: 220,
            mass: 0.7,
            useNativeDriver: true
          }).start();
          Animated.spring(resultSwipeY, {
            toValue: 0,
            damping: 18,
            stiffness: 220,
            mass: 0.7,
            useNativeDriver: true
          }).start();
        }
      }),
    [busy, resultSwipeX, resultSwipeY, tab, topResult]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerBrandWrap}>
            <View style={styles.headerBrandTextWrap}>
              <Text style={[styles.headerTitle, pacificoLoaded ? styles.logoTitleSweetCaps : null]}>
                Hannah&apos;s Helper
              </Text>
              <Text style={styles.headerMeta}>CLOSET COMPANION</Text>
            </View>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>Dev Build</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: 120 + insets.bottom }]}
      >
        {loading ? <Text style={styles.muted}>Loading workspace...</Text> : null}

        {tab === 'Closet' ? (
          <View style={styles.closetPanelWrap}>
            <View style={styles.closetTabsOutsideWrap}>
              <View style={styles.closetTabsHeaderRow}>
                <ScrollView
                  style={styles.closetTabsScroller}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.closetCategoryTabsRow}
                >
                  {([...categories, 'search'] as const).map((tabKey) => {
                    const active = selectedClosetTab === tabKey;
                    const tabLabel =
                      tabKey === 'search'
                        ? 'Search'
                        : closetCategoryMeta[tabKey].label;

                    return (
                      <Pressable
                        key={tabKey}
                        style={[
                          styles.closetCategoryTab,
                          active ? styles.closetCategoryTabActive : styles.closetCategoryTabInactive,
                          active ? styles.closetCategoryTabActiveConnected : null
                        ]}
                        onPress={() => setSelectedClosetTab(tabKey)}
                      >
                        <View
                          style={[
                            styles.closetCategoryTabBottomExtension,
                            active
                              ? styles.closetCategoryTabBottomExtensionActive
                              : styles.closetCategoryTabBottomExtensionInactive
                          ]}
                        />
                        {renderClosetTabIcon(tabKey, active ? colors.accent : colors.text, 16)}
                        {active ? (
                          <Text style={styles.closetCategoryTabTextActive}>
                            {tabLabel}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            <View style={[styles.section, styles.closetSection]}>
              <View style={styles.closetSortOverlay}>
                <Pressable
                  style={[styles.closetToolButton, closetSortMenuOpen ? styles.closetToolButtonActive : null]}
                  onPress={() => setClosetSortMenuOpen((current) => !current)}
                >
                  <MaterialCommunityIcons
                    name="sort-variant"
                    size={18}
                    color={closetSortMenuOpen ? colors.accent : colors.text}
                  />
                </Pressable>
              </View>
              {selectedClosetTab === 'search' ? (
                <TextInput
                  style={styles.closetSearchInput}
                  value={closetSearchQuery}
                  onChangeText={setClosetSearchQuery}
                  placeholder="Search all clothes by color, category, or tag"
                  placeholderTextColor={colors.subtext}
                  autoCapitalize="none"
                />
              ) : null}
              {closetSortMenuOpen ? (
                <View style={styles.closetSortMenu}>
                  {([
                    { id: 'color', label: 'Color' },
                    { id: 'newest', label: 'Newest' },
                    { id: 'oldest', label: 'Oldest' }
                  ] as const).map((option) => (
                    <Pressable
                      key={option.id}
                      style={[
                        styles.closetSortOption,
                        closetSortOption === option.id ? styles.closetSortOptionActive : null
                      ]}
                      onPress={() => {
                        setClosetSortOption(option.id);
                        setClosetSortMenuOpen(false);
                      }}
                    >
                      <Text
                        style={
                          closetSortOption === option.id
                            ? styles.closetSortOptionTextActive
                            : styles.closetSortOptionText
                        }
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {filteredClosetItems.length === 0 ? (
                <Text style={[styles.muted, styles.closetEmptyStateText]}>
                  {selectedClosetTab === 'search'
                    ? closetSearchQuery.trim()
                      ? `No items match "${closetSearchQuery.trim()}".`
                      : 'No closet items yet.'
                    : `No items in ${closetCategoryMeta[selectedClosetTab].label.toLowerCase()} yet.`}
                </Text>
              ) : null}

              <View style={styles.closetList}>
                {filteredClosetItems.map((item) => (
                  <ClosetItemCard
                    key={item.id}
                    item={item}
                    thumbnailUrl={closetThumbnailUrls[item.id]}
                    onLongPress={() => openClosetItemEditor(item)}
                    onToggleWorn={toggleClosetItemWorn}
                  />
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {tab === 'Generate' ? (
          <View style={styles.section}>
            {generationFeedback.status !== 'idle' ? (
              <View
                style={[
                  styles.generationBanner,
                  generationFeedback.status === 'error'
                    ? styles.generationBannerError
                    : generationFeedback.status === 'success'
                      ? styles.generationBannerSuccess
                      : styles.generationBannerLoading
                ]}
              >
                {generationFeedback.status === 'loading' ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : null}
                <Text style={styles.generationBannerText}>{generationFeedback.message}</Text>
              </View>
            ) : null}

            {topResult ? (
              <View style={styles.deckWrap}>
                {nextResult ? (
                  <View style={[styles.card, styles.deckNextCard]}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {nextResult.prompt}
                    </Text>
                    {nextResult.image_url ? <Image source={{ uri: nextResult.image_url }} style={styles.deckImage} resizeMode="contain" /> : null}
                  </View>
                ) : null}

                <Animated.View
                  style={[
                    styles.card,
                    styles.deckCard,
                    {
                      transform: [
                        { translateX: resultSwipeX },
                        { translateY: resultSwipeY },
                        {
                          rotate: resultSwipeX.interpolate({
                            inputRange: [-200, 0, 200],
                            outputRange: ['-10deg', '0deg', '10deg']
                          })
                        }
                      ]
                    }
                  ]}
                  {...resultPanResponder.panHandlers}
                >
                  <Animated.View
                    style={[
                      styles.swipeBadge,
                      styles.swipeBadgeLeft,
                      {
                        opacity: resultSwipeX.interpolate({
                          inputRange: [-150, -20, 0],
                          outputRange: [1, 0.2, 0],
                          extrapolate: 'clamp'
                        })
                      }
                    ]}
                  >
                    <Text style={styles.swipeBadgeText}>PASS</Text>
                  </Animated.View>
                  <Animated.View
                    style={[
                      styles.swipeBadge,
                      styles.swipeBadgeRight,
                      {
                        opacity: resultSwipeX.interpolate({
                          inputRange: [0, 20, 150],
                          outputRange: [0, 0.2, 1],
                          extrapolate: 'clamp'
                        })
                      }
                    ]}
                  >
                    <Text style={styles.swipeBadgeText}>SAVE</Text>
                  </Animated.View>

                  <Text style={styles.cardTitle}>{topResult.prompt}</Text>
                  {topResult.image_url ? <Image source={{ uri: topResult.image_url }} style={styles.resultImage} resizeMode="contain" /> : null}
                  <Text style={styles.muted}>Model: {topResult.model_version}</Text>
                  <Text style={styles.muted}>
                    Non-closet notes: {topResult.recipe_simplified.non_closet_notes.join('; ') || 'None'}
                  </Text>
                </Animated.View>

                <View style={styles.deckActions}>
                  <Pressable
                    style={[styles.actionButton, styles.actionDanger]}
                    onPress={() => animateResultOff('left', () => trashResult(topResult.id))}
                  >
                    <Text style={styles.actionButtonText}>Pass</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.actionOk]}
                    onPress={() => animateResultOff('right', () => void saveResult(topResult))}
                    disabled={busy}
                  >
                    <Text style={styles.actionButtonText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Text style={styles.muted}>No generated looks yet. Tap + to open prompt.</Text>
            )}
          </View>
        ) : null}

        {tab === 'Calendar' ? (
          <View style={styles.section}>
            {calendarEntries.length === 0 ? <Text style={styles.muted}>No calendar assignments yet.</Text> : null}
            <View style={styles.calendarGrid}>
              {calendarEntries.map(([date, looks]) => {
                const active = selectedCalendarKey === date;
                const coverLook = looks[0];
                return (
                  <Pressable
                    key={date}
                    style={[styles.calendarTile, active ? styles.calendarTileActive : null, { width: calendarTileSize, height: calendarTileSize }]}
                    onPress={() => setSelectedCalendarKey(date)}
                  >
                    {coverLook.image_url ? (
                      <Image source={{ uri: coverLook.image_url }} style={styles.calendarTileImage} />
                    ) : (
                      <View style={styles.calendarTilePlaceholder}>
                        <MaterialCommunityIcons name="tshirt-crew-outline" size={20} color={colors.subtext} />
                      </View>
                    )}
                    <View style={styles.calendarTileMeta}>
                      <Text style={styles.calendarTileDate}>{formatCalendarKey(date)}</Text>
                      {looks.length > 1 ? <Text style={styles.calendarTileCount}>{looks.length}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {selectedCalendarLooks.length > 0 ? (
              <View style={styles.calendarExpanded}>
                <Text style={styles.sectionSubtitle}>{formatCalendarKey(selectedCalendarKey || '')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarExpandedRow}>
                  {selectedCalendarLooks.map((look) => (
                    <View key={look.id} style={styles.calendarLookCard}>
                      {look.image_url ? <Image source={{ uri: look.image_url }} style={styles.calendarLookImage} resizeMode="contain" /> : null}
                      <Text style={styles.cardTitle}>{look.prompt_text.slice(0, 80)}</Text>
                      <Text style={styles.muted}>Model: {look.model_version}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === 'Settings' ? (
          <View style={styles.section}>
            <Pressable style={styles.secondaryButton} onPress={() => void signInAnonymously()} disabled={busy}>
              <Text style={styles.secondaryButtonText}>Continue as Guest (Dev)</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {tab === 'Generate' || tab === 'Closet' ? (
        <Pressable
          style={[styles.generateFab, { bottom: 84 + insets.bottom }]}
          onPress={() => (tab === 'Generate' ? setIsPromptOpen(true) : setIsClosetOpen(true))}
          accessibilityLabel={tab === 'Generate' ? 'Open prompt' : 'Add closet item'}
        >
          <MaterialCommunityIcons name="plus" size={28} color="#fff" />
        </Pressable>
      ) : null}

      <Modal visible={isPromptMounted} transparent animationType="none" onRequestClose={() => setIsPromptOpen(false)}>
        <Animated.View style={[styles.modalBackdrop, { opacity: promptBackdropOpacity }]} />
        <Animated.View
          style={[
            styles.modalCard,
            {
              bottom: 24 + insets.bottom,
              transform: [{ translateY: Animated.add(promptBaseTranslateY, promptDragTranslateY) }]
            }
          ]}
          {...promptPanResponder.panHandlers}
        >
          <Text style={styles.sectionTitle}>Style Studio</Text>

          <TextInput
            style={[styles.input, styles.inputMulti]}
            multiline
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe your look: vibe, occasion, colors, and must-use closet pieces."
            placeholderTextColor={colors.subtext}
          />

          <Text style={styles.label}>Styling mode</Text>
          <View style={styles.rowWrap}>
            {([
              { value: 'closet_only', label: 'closet only' },
              { value: 'allow_extras', label: 'recommendations' }
            ] as const).map((option) => (
              <Pressable
                key={option.value}
                style={[styles.chip, mode === option.value ? styles.chipActive : null]}
                onPress={() => setMode(option.value)}
              >
                <Text style={mode === option.value ? styles.chipTextActive : styles.chipText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.rowButtons}>
            <Pressable style={[styles.actionButton, styles.actionOk]} onPress={() => void generateLooks()} disabled={busy}>
              <Text style={styles.actionButtonText}>
                {generationFeedback.status === 'loading' ? 'Generating...' : 'Generate'}
              </Text>
            </Pressable>
          </View>
          {generationFeedback.status === 'loading' ? (
            <View style={styles.inlineStatus}>
              <ActivityIndicator size="small" color={colors.text} />
              <Text style={styles.muted}>Working on your look now. This can take several seconds.</Text>
            </View>
          ) : null}
        </Animated.View>
      </Modal>

      <Modal visible={isClosetMounted} transparent animationType="none" onRequestClose={() => setIsClosetOpen(false)}>
        <Animated.View style={[styles.modalBackdrop, { opacity: closetBackdropOpacity }]} />
        <Animated.View
          style={[
            styles.modalCard,
            {
              bottom: 24 + insets.bottom,
              transform: [{ translateY: Animated.add(closetBaseTranslateY, closetDragTranslateY) }]
            }
          ]}
          {...closetPanResponder.panHandlers}
        >
          <Text style={styles.sectionTitle}>Add Closet Item</Text>

          <Pressable style={styles.secondaryButton} onPress={pickImage}>
            <Text style={styles.secondaryButtonText}>{uploadUri ? 'Change Photo' : 'Pick Clothing Photo'}</Text>
          </Pressable>
          {uploadUri ? <Image source={{ uri: uploadUri }} style={styles.preview} /> : null}

          <Text style={styles.label}>Category</Text>
          <View style={styles.rowWrap}>
            {categories.map((cat) => (
              <Pressable
                key={cat}
                style={[styles.chip, uploadCategory === cat ? styles.chipActive : null]}
                onPress={() => setUploadCategory(cat)}
              >
                <Text style={uploadCategory === cat ? styles.chipTextActive : styles.chipText}>{cat}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Color</Text>
          <TextInput
            style={styles.input}
            value={uploadColor}
            onChangeText={setUploadColor}
            placeholder="(auto detect if left blank)"
            placeholderTextColor={colors.subtext}
          />

          <Text style={styles.label}>Style tags (comma separated)</Text>
          <TextInput
            style={styles.input}
            value={uploadStyleTags}
            onChangeText={setUploadStyleTags}
            placeholder="(auto detect if left blank)"
            placeholderTextColor={colors.subtext}
          />

          <View style={styles.rowButtons}>
            <Pressable style={[styles.actionButton, styles.actionOk]} onPress={() => void addClosetItem()} disabled={busy}>
              <Text style={styles.actionButtonText}>Add to Closet</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Modal>

      <Modal visible={!!editingClosetItem} transparent animationType="fade" onRequestClose={closeClosetItemEditor}>
        <Pressable style={styles.modalBackdrop} onPress={closeClosetItemEditor} />
        <View style={[styles.modalCard, { bottom: 24 + insets.bottom }]}>
          <Text style={styles.sectionTitle}>Edit Closet Item</Text>
          {editingClosetItem ? (
            <Text style={styles.muted}>Long press opened: {editingClosetItem.category}</Text>
          ) : null}

          <Text style={styles.label}>Category</Text>
          <View style={styles.rowWrap}>
            {categories.map((cat) => (
              <Pressable
                key={`edit-${cat}`}
                style={[styles.chip, editCategory === cat ? styles.chipActive : null]}
                onPress={() => setEditCategory(cat)}
              >
                <Text style={editCategory === cat ? styles.chipTextActive : styles.chipText}>{cat}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Color</Text>
          <TextInput style={styles.input} value={editColor} onChangeText={setEditColor} />

          <Text style={styles.label}>Style tags (comma separated)</Text>
          <TextInput style={styles.input} value={editStyleTags} onChangeText={setEditStyleTags} />

          <View style={styles.rowButtons}>
            <Pressable style={[styles.actionButton, styles.actionNeutral]} onPress={closeClosetItemEditor} disabled={busy}>
              <Text style={styles.actionButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.actionOk]} onPress={() => void saveClosetItemEdits()} disabled={busy}>
              <Text style={styles.actionButtonText}>{busy ? 'Saving...' : 'Save Changes'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={[styles.tabBar, { paddingBottom: 14 + insets.bottom }]}>
        {tabs.map((label) => (
          <View key={label} style={styles.tabItem}>
            <Pressable
              style={({ pressed }) => [styles.tabButton, pressed ? styles.tabButtonPressed : null]}
              onPress={() => setTab(label)}
              accessibilityRole="button"
              accessibilityLabel={tabIcons[label].label}
            >
              {tab === label ? <View style={styles.tabActivePill} /> : null}
              {label === 'Generate' && tab === label ? (
                <View style={styles.generateTabIconWrap}>
                  <MaterialCommunityIcons
                    name={tabIcons[label].active}
                    size={22}
                    color={colors.accent}
                  />
                  <View style={styles.generateTabMaskSquare} />
                  <MaterialCommunityIcons
                    name="account"
                    size={18}
                    color={colors.accent}
                    style={styles.generateTabSilhouette}
                  />
                </View>
              ) : (
                <MaterialCommunityIcons
                  name={tab === label ? tabIcons[label].active : tabIcons[label].inactive}
                  size={22}
                  color={tab === label ? colors.accent : colors.subtext}
                  style={label === 'Closet' && tab === label ? styles.closetTabIconTilt : null}
                />
              )}
            </Pressable>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerBrandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0
  },
  headerBrandTextWrap: {
    gap: 1
  },
  headerTitle: {
    fontSize: 29,
    letterSpacing: 0.8,
    color: colors.accent,
  },
  logoTitleSweetCaps: {
    fontFamily: 'Pacifico_400Regular'
  },
  headerMeta: {
    color: '#74685f',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3
  },
  headerBadge: {
    borderWidth: 1,
    borderColor: '#d8bfd0',
    borderRadius: 999,
    backgroundColor: '#efd8e5',
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  headerBadgeText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700'
  },
  content: {
    flex: 1
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 14
  },
  section: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text
  },
  sectionSubtitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text
  },
  closetPanelWrap: {
    gap: 0
  },
  closetTabsOutsideWrap: {
    marginBottom: -35,
    gap: 0
  },
  closetTabsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  closetTabsScroller: {
    flex: 1,
    overflow: 'visible'
  },
  closetCategoryTabsRow: {
    gap: 4,
    paddingHorizontal: 4,
    paddingBottom: 34,
    alignItems: 'flex-end'
  },
  closetCategoryTab: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: '#f7f7f7',
    minHeight: 38,
    borderBottomWidth: 1
  },
  closetCategoryTabInactive: {
    width: 36
  },
  closetCategoryTabBottomExtension: {
    position: 'absolute',
    left: -1,
    right: -1,
    bottom: -34,
    height: 34,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border
  },
  closetCategoryTabBottomExtensionInactive: {
    backgroundColor: '#f7f7f7',
  },
  closetCategoryTabBottomExtensionActive: {
    backgroundColor: colors.panel
  },
  closetCategoryTabActive: {
    flexDirection: 'row',
    gap: 5,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderBottomColor: colors.panel,
    paddingHorizontal: 10
  },
  closetCategoryTabActiveConnected: {
    marginBottom: 1,
    borderBottomWidth: 0,
    zIndex: 2
  },
  closetCategoryTabTextActive: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700'
  },
  closetSection: {
    gap: 10,
    position: 'relative',
    paddingTop: 12
  },
  closetSortOverlay: {
    position: 'absolute',
    top: 16,
    right: 18,
    zIndex: 3
  },
  closetToolButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff'
  },
  closetToolButtonActive: {
    borderColor: colors.accent,
    backgroundColor: '#fdeff4'
  },
  closetSearchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    marginRight: 48
  },
  closetSortMenu: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap'
  },
  closetSortOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff'
  },
  closetSortOptionActive: {
    borderColor: colors.accent,
    backgroundColor: '#fdeff4'
  },
  closetSortOptionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600'
  },
  closetSortOptionTextActive: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700'
  },
  closetEmptyStateText: {
    marginTop: 16
  },
  closetList: {
    gap: 8
  },
  closetSwipeRow: {
    position: 'relative',
    borderRadius: 12
  },
  closetSwipeBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  closetSwipeBackdropUnworn: {
    backgroundColor: '#f6f0f4'
  },
  closetSwipeBackdropWorn: {
    backgroundColor: '#efefef'
  },
  closetSwipeBackdropText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.subtext
  },
  closetItemRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 10,
    height: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  closetItemRowWorn: {
    backgroundColor: '#f7eff3',
    borderColor: '#e2cfd8'
  },
  closetItemPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    position: 'relative',
    paddingRight: 4
  },
  closetThumbnailWrap: {
    width: 62,
    height: 62,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f1f1f1'
  },
  closetThumbnailImage: {
    width: '100%',
    height: '100%'
  },
  closetThumbnailImageWorn: {
    opacity: 0.72
  },
  closetThumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closetThumbnailPlaceholderWorn: {
    opacity: 0.72
  },
  closetItemMeta: {
    flex: 1,
    gap: 3
  },
  closetItemMetaWithDate: {
    paddingRight: 82
  },
  closetItemTitleWorn: {
    color: '#8f6f7d'
  },
  closetItemTextWorn: {
    color: '#a08492'
  },
  closetWornDateText: {
    position: 'absolute',
    right: 2,
    bottom: 0,
    fontSize: 11,
    fontWeight: '600',
    color: '#b28a9c'
  },
  muted: {
    color: colors.subtext
  },
  generationBanner: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  generationBannerLoading: {
    backgroundColor: '#f9f4db',
    borderColor: '#e8d38a'
  },
  generationBannerSuccess: {
    backgroundColor: '#e7f7ef',
    borderColor: '#88cfaa'
  },
  generationBannerError: {
    backgroundColor: '#fdecec',
    borderColor: '#e2a2a2'
  },
  generationBannerText: {
    color: colors.text,
    fontSize: 13,
    flex: 1
  },
  label: {
    marginTop: 2,
    color: colors.text,
    fontWeight: '600'
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    padding: 12,
    color: colors.text
  },
  inputMulti: {
    minHeight: 96,
    textAlignVertical: 'top'
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700'
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: colors.accent,
    fontWeight: '600'
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff'
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  chipText: {
    color: colors.text
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700'
  },
  rowWrap: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap'
  },
  preview: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    backgroundColor: '#eee'
  },
  resultImage: {
    width: '100%',
    height: 430,
    borderRadius: 12,
    backgroundColor: '#eee'
  },
  deckImage: {
    width: '100%',
    height: 340,
    borderRadius: 12,
    backgroundColor: '#eee'
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    backgroundColor: '#fff'
  },
  deckWrap: {
    marginTop: 8,
    gap: 10
  },
  deckCard: {
    zIndex: 2
  },
  deckNextCard: {
    marginHorizontal: 12,
    opacity: 0.6,
    marginBottom: -250
  },
  swipeBadge: {
    position: 'absolute',
    top: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderRadius: 8
  },
  swipeBadgeLeft: {
    left: 14,
    borderColor: colors.danger
  },
  swipeBadgeRight: {
    right: 14,
    borderColor: colors.ok
  },
  swipeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text
  },
  cardTitle: {
    fontWeight: '700',
    color: colors.text
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8
  },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  actionDanger: {
    backgroundColor: colors.danger
  },
  actionOk: {
    backgroundColor: colors.ok
  },
  actionNeutral: {
    backgroundColor: colors.subtext
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12
  },
  deckActions: {
    flexDirection: 'row',
    gap: 8
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#fff',
    paddingBottom: 14,
    paddingTop: 10
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 0
  },
  tabButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    position: 'relative'
  },
  tabActivePill: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f4dce8'
  },
  tabButtonPressed: {
    opacity: 0.9
  },
  generateTabIconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  generateTabSilhouette: {
    position: 'absolute',
    left: 2,
    bottom: -2
  },
  generateTabMaskSquare: {
    position: 'absolute',
    width: 7,
    height: 12,
    backgroundColor: '#f4dce8',
    top: 5,
    left: 8
  },
  closetTabIconTilt: {
    transform: [{ rotate: '10deg' }]
  },
  generateFab: {
    position: 'absolute',
    bottom: 84,
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)'
  },
  modalCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    maxHeight: '82%',
    backgroundColor: colors.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  calendarTile: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#eee'
  },
  calendarTileActive: {
    borderColor: colors.accent,
    borderWidth: 2
  },
  calendarTileImage: {
    width: '100%',
    height: '100%'
  },
  calendarTilePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f2'
  },
  calendarTileMeta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4
  },
  calendarTileDate: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700'
  },
  calendarTileCount: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700'
  },
  calendarExpanded: {
    marginTop: 6,
    gap: 8
  },
  calendarExpandedRow: {
    gap: 10,
    paddingRight: 4
  },
  calendarLookCard: {
    width: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    gap: 6,
    backgroundColor: '#fff'
  },
  calendarLookImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#eee'
  }
});
