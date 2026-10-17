import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { DancingScript_400Regular } from '@expo-google-fonts/dancing-script';
import { Pacifico_400Regular } from '@expo-google-fonts/pacifico';
import { Sacramento_400Regular } from '@expo-google-fonts/sacramento';
import { Allura_400Regular } from '@expo-google-fonts/allura';
import { useFonts } from 'expo-font';
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type Tab = 'Closet' | 'Generate' | 'Calendar' | 'Settings';
type Mode = 'closet_only' | 'allow_extras';
type Subject = 'mannequin' | 'personal';

type MockResult = {
  id: string;
  title: string;
  context: string;
  model: string;
  notes: string[];
};

type MockSaved = {
  id: string;
  prompt: string;
  date: string;
  model: string;
};
type MockClosetItem = {
  id: string;
  category: string;
  color: string;
  tags: string;
};
type LogoOption = {
  id: string;
  label: string;
  subtitle: string;
};

const tabs: Tab[] = ['Generate', 'Closet', 'Calendar', 'Settings'];
type TabIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
const tabIcons: Record<Tab, { active: TabIconName; inactive: TabIconName; label: string }> = {
  Generate: { active: 'mirror-rectangle', inactive: 'mirror-rectangle', label: 'Generate' },
  Closet: { active: 'hanger', inactive: 'hanger', label: 'Closet' },
  Calendar: { active: 'calendar', inactive: 'calendar-blank-outline', label: 'Calendar' },
  Settings: { active: 'cog', inactive: 'cog-outline', label: 'Settings' }
};

const theme = {
  color: {
    bg: '#f5efe8',
    bgAlt: '#f0e8df',
    card: '#fffdf9',
    border: '#ddcdbf',
    text: '#231f1a',
    muted: '#73675b',
    accent: '#c14f86',
    accentSoft: '#f4dce8',
    ok: '#2f7f4f',
    okSoft: '#dfeee5',
    danger: '#a6372f',
    dangerSoft: '#f4d8d2',
    shadow: '#2e2216'
  },
  space: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    pill: 999
  }
};

const mockCloset: MockClosetItem[] = [
  { id: 'c-1', category: 'top', color: 'oat', tags: 'minimal, knit' },
  { id: 'c-2', category: 'bottom', color: 'charcoal', tags: 'tailored, wide-leg' },
  { id: 'c-3', category: 'outerwear', color: 'camel', tags: 'structured, wool' },
  { id: 'c-4', category: 'shoes', color: 'black', tags: 'loafer, polished' }
];

const mockResults: MockResult[] = [
  {
    id: 'r-1',
    title: 'Smart dinner layering look',
    context: 'Neutral base with camel overlayer and polished shoes.',
    model: 'gpt-image-1 / v1.0-demo',
    notes: ['Added minimal gold hoops', 'Used closet top and bottom']
  },
  {
    id: 'r-2',
    title: 'Refined city daytime fit',
    context: 'Tailored silhouette with soft contrast and clean lines.',
    model: 'gpt-image-1 / v1.0-demo',
    notes: ['No non-closet items', 'Emphasis on silhouette balance']
  }
];

const mockSaved: MockSaved[] = [
  { id: 's-1', prompt: 'Smart casual dinner outfit in neutral tones', date: '2026-02-23', model: 'gpt-image-1' },
  { id: 's-2', prompt: 'Workday layers with polished accessories', date: '2026-02-26', model: 'gpt-image-1' },
  { id: 's-3', prompt: 'Warm weekend city walk outfit', date: '2026-03-01', model: 'gpt-image-1' }
];

const logoOptions: LogoOption[] = [
  { id: 'rose_classic', label: 'Rose Script', subtitle: 'Closet companion' },
  { id: 'sweet_caps', label: 'Sweet Signature', subtitle: 'Closet companion' },
  { id: 'dolly_serif', label: 'Dolly Cursive', subtitle: 'Style planner' },
  { id: 'soft_italic', label: 'Soft Monogram', subtitle: 'Look curator' },
  { id: 'bubble_bold', label: 'Bubble Signature', subtitle: 'Cute closet AI' },
  { id: 'ribbon_mini', label: 'Ribbon Script', subtitle: 'Outfit edits' },
  { id: 'clean_cute', label: 'Clean Cursive', subtitle: 'Plan your fits' },
  { id: 'dreamy_shadow', label: 'Dream Script', subtitle: 'Daily looks' },
  { id: 'label_stamp', label: 'Label Signature', subtitle: 'Wardrobe picks' },
  { id: 'studio_modern', label: 'Studio Script', subtitle: 'Smart styling' }
];

function formatCalendarKey(key: string): string {
  if (key === 'unassigned') return 'Unassigned';
  return key;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function HangerHLogo({ size = 18, color = '#c14f86' }: { size?: number; color?: string }) {
  const frame = Math.round(size * 1.9);
  return (
    <View style={{ width: frame, height: frame, position: 'relative' }}>
      <MaterialCommunityIcons
        name="hanger"
        size={Math.round(size * 1.65)}
        color={color}
        style={{
          position: 'absolute',
          left: Math.round(size * 0.14),
          top: Math.round(size * -0.22),
          transform: [{ rotate: '-45deg' }]
        }}
      />
    </View>
  );
}

function AppButton({
  label,
  onPress,
  variant = 'primary'
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'success' && styles.buttonSuccess,
        pressed && styles.buttonPressed
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' ? styles.buttonSecondaryText : null
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? styles.chipActive : null]}>
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeaderWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function SurfaceCard({ children }: { children: ReactNode }) {
  return <View style={styles.surfaceCard}>{children}</View>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <SurfaceCard>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{description}</Text>
    </SurfaceCard>
  );
}

function LoadingState() {
  return (
    <SurfaceCard>
      <Text style={styles.emptyTitle}>Loading style workspace...</Text>
      <Text style={styles.emptyDesc}>Preparing your closet, prompts, and saved looks.</Text>
    </SurfaceCard>
  );
}

function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <SurfaceCard>
      <Text style={styles.emptyTitle}>Could not refresh this panel</Text>
      <Text style={styles.emptyDesc}>This is sandbox UI only. No backend request was sent.</Text>
      <View style={styles.stateButtonWrap}>
        <AppButton label="Try again" variant="secondary" onPress={onRetry} />
      </View>
    </SurfaceCard>
  );
}

function FloatingTabBar({ tab, onSelect }: { tab: Tab; onSelect: (next: Tab) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.floatingTabWrap, { bottom: theme.space.md + insets.bottom }]}>
      {tabs.map((item) => (
        <Pressable
          key={item}
          style={styles.tabHit}
          onPress={() => onSelect(item)}
          accessibilityRole="button"
          accessibilityLabel={tabIcons[item].label}
        >
          <View style={[styles.tabPill, tab === item ? styles.tabPillActive : null]}>
            <MaterialCommunityIcons
              name={tab === item ? tabIcons[item].active : tabIcons[item].inactive}
              size={20}
              color={tab === item ? '#fff' : theme.color.muted}
            />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export default function MockupApp() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    GreatVibes_400Regular,
    DancingScript_400Regular,
    Pacifico_400Regular,
    Sacramento_400Regular,
    Allura_400Regular
  });
  const [tab, setTab] = useState<Tab>('Generate');
  const [mode, setMode] = useState<Mode>('closet_only');
  const [subject, setSubject] = useState<Subject>('mannequin');
  const [prompt, setPrompt] = useState('smart casual dinner outfit in neutral tones');
  const [closetList, setClosetList] = useState<MockClosetItem[]>(mockCloset);
  const [closetCategory, setClosetCategory] = useState('top');
  const [closetColor, setClosetColor] = useState('black');
  const [closetTags, setClosetTags] = useState('minimal, casual');
  const [resultQueue, setResultQueue] = useState<MockResult[]>(mockResults);
  const [saved, setSaved] = useState<MockSaved[]>(mockSaved);
  const [logoChoice, setLogoChoice] = useState('sweet_caps');
  const [loading] = useState(false);
  const [showError, setShowError] = useState(false);
  const [selectedCalendarKey, setSelectedCalendarKey] = useState<string | null>(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isPromptMounted, setIsPromptMounted] = useState(false);
  const [isClosetOpen, setIsClosetOpen] = useState(false);
  const [isClosetMounted, setIsClosetMounted] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  const promptBaseTranslateY = useRef(new Animated.Value(36)).current;
  const promptDragTranslateY = useRef(new Animated.Value(0)).current;
  const promptBackdropOpacity = useRef(new Animated.Value(0)).current;
  const closetBaseTranslateY = useRef(new Animated.Value(36)).current;
  const closetDragTranslateY = useRef(new Animated.Value(0)).current;
  const closetBackdropOpacity = useRef(new Animated.Value(0)).current;
  const resultSwipeX = useRef(new Animated.Value(0)).current;
  const resultSwipeY = useRef(new Animated.Value(0)).current;

  const activeLogo = useMemo(
    () => logoOptions.find((option) => option.id === logoChoice) || logoOptions[0],
    [logoChoice]
  );

  function logoTitleStyleFor(id: string) {
    switch (id) {
      case 'sweet_caps':
        return styles.logoTitleSweetCaps;
      case 'dolly_serif':
        return styles.logoTitleDollySerif;
      case 'soft_italic':
        return styles.logoTitleSoftItalic;
      case 'bubble_bold':
        return styles.logoTitleBubbleBold;
      case 'ribbon_mini':
        return styles.logoTitleRibbonMini;
      case 'clean_cute':
        return styles.logoTitleCleanCute;
      case 'dreamy_shadow':
        return styles.logoTitleDreamyShadow;
      case 'label_stamp':
        return styles.logoTitleLabelStamp;
      case 'studio_modern':
        return styles.logoTitleStudioModern;
      default:
        return styles.logoTitleRoseClassic;
    }
  }

  function logoFontStyleFor(id: string) {
    switch (id) {
      case 'sweet_caps':
      case 'studio_modern':
        return styles.logoFontDancingScript;
      case 'dolly_serif':
      case 'bubble_bold':
        return styles.logoFontPacifico;
      case 'soft_italic':
      case 'clean_cute':
        return styles.logoFontAllura;
      case 'ribbon_mini':
      case 'label_stamp':
        return styles.logoFontSacramento;
      case 'dreamy_shadow':
      case 'rose_classic':
      default:
        return styles.logoFontGreatVibes;
    }
  }

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [tab, fade]);

  const calendarBuckets = useMemo(() => {
    return saved.reduce<Record<string, MockSaved[]>>((acc, look) => {
      if (!acc[look.date]) acc[look.date] = [];
      acc[look.date].push(look);
      return acc;
    }, {});
  }, [saved]);

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

  const calendarTileSize = Math.floor((Dimensions.get('window').width - 40 - 16) / 3);

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

  const topResult = resultQueue[0];
  const nextResult = resultQueue[1];

  useEffect(() => {
    resultSwipeX.setValue(0);
    resultSwipeY.setValue(0);
  }, [resultSwipeX, resultSwipeY, topResult?.id]);

  function animateResultOff(direction: 'left' | 'right', onDone: () => void) {
    Animated.timing(resultSwipeX, {
      toValue: direction === 'right' ? 420 : -420,
      duration: 180,
      useNativeDriver: true
    }).start(() => {
      onDone();
      resultSwipeX.setValue(0);
      resultSwipeY.setValue(0);
    });
  }

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
          if (!topResult) return;
          if (gesture.dx > 120) {
            animateResultOff('right', () => handleSave(topResult));
            return;
          }
          if (gesture.dx < -120) {
            animateResultOff('left', () => handleTrash(topResult.id));
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
    [resultSwipeX, resultSwipeY, tab, topResult]
  );

  function handleAddClosetItem() {
    const next: MockClosetItem = {
      id: `c-${Date.now()}`,
      category: closetCategory,
      color: closetColor.trim().toLowerCase() || 'black',
      tags: closetTags.trim() || 'minimal'
    };
    setClosetList((prev) => [next, ...prev]);
    setIsClosetOpen(false);
  }

  function handleGenerateMock() {
    const deviceDate = todayISO();
    const next: MockResult = {
      id: `r-${Date.now()}`,
      title: prompt.trim() || 'Generated look',
      context: mode === 'closet_only' ? 'Built strictly from closet items.' : 'Used closet with optional extras.',
      model: 'gpt-image-1 / v1.0-demo',
      notes: [`subject: ${subject}`, `date: ${deviceDate}`]
    };
    setResultQueue((prev) => [next, ...prev]);
    setTab('Generate');
    setIsPromptOpen(false);
  }

  function handleTrash(id: string) {
    setResultQueue((prev) => prev.filter((item) => item.id !== id));
  }

  function handleSave(result: MockResult) {
    const deviceDate = todayISO();
    const nextSaved: MockSaved = {
      id: `saved-${Date.now()}`,
      prompt: result.title,
      model: 'gpt-image-1',
      date: deviceDate
    };

    setSaved((prev) => [nextSaved, ...prev]);
    setResultQueue((prev) => prev.filter((item) => item.id !== result.id));
    Alert.alert('Saved in sandbox', `Look added to ${deviceDate}.`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      <View style={styles.topRail}>
        <View style={styles.brandWrap}>
          <View style={styles.brandMark}>
            <HangerHLogo size={18} color={theme.color.accent} />
          </View>
          <View>
            <Text
              style={[
                styles.appTitle,
                logoTitleStyleFor(activeLogo.id),
                fontsLoaded ? logoFontStyleFor(activeLogo.id) : null
              ]}
            >
              Hannah's Helper
            </Text>
            <Text style={styles.appSub}>{activeLogo.subtitle}</Text>
          </View>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Sandbox</Text>
        </View>
      </View>

      <Animated.View style={[styles.body, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
        <ScrollView contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
          {loading ? <LoadingState /> : null}
          {showError ? <ErrorState onRetry={() => setShowError(false)} /> : null}

          {tab === 'Closet' ? (
            <View style={styles.stack}>
              <SectionHeader title={`Current Items (${closetList.length})`} />
              {closetList.map((item) => (
                <SurfaceCard key={item.id}>
                  <View style={styles.itemRowTop}>
                    <Text style={styles.cardTitle}>{item.category.toUpperCase()}</Text>
                    <Text style={styles.mutedText}>{item.color}</Text>
                  </View>
                  <Text style={styles.mutedText}>{item.tags}</Text>
                </SurfaceCard>
              ))}
            </View>
          ) : null}

          {tab === 'Generate' ? (
            <View style={styles.stack}>
              {!topResult ? (
                <EmptyState
                  title="No queued results"
                  description="Tap + at the bottom center to open prompt."
                />
              ) : (
                <View style={styles.deckWrap}>
                  {nextResult ? (
                    <SurfaceCard>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {nextResult.title}
                      </Text>
                      <Text style={styles.mutedText}>{nextResult.context}</Text>
                    </SurfaceCard>
                  ) : null}

                  <Animated.View
                    style={[
                      styles.surfaceCard,
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

                    <Text style={styles.cardTitle}>{topResult.title}</Text>
                    <Text style={styles.mutedText}>{topResult.context}</Text>
                    <View style={styles.mockLookBlock}>
                      <View style={styles.lookAccentLeft} />
                      <View style={styles.lookCenter}>
                        <Text style={styles.lookCenterLabel}>Rendered Outfit Preview</Text>
                      </View>
                      <View style={styles.lookAccentRight} />
                    </View>
                    <Text style={styles.metaText}>{topResult.model}</Text>
                    <Text style={styles.metaText}>Notes: {topResult.notes.join(' | ')}</Text>

                    <View style={styles.buttonRowSplit}>
                      <AppButton label="Pass" variant="danger" onPress={() => animateResultOff('left', () => handleTrash(topResult.id))} />
                      <AppButton label="Save" variant="success" onPress={() => animateResultOff('right', () => handleSave(topResult))} />
                    </View>
                  </Animated.View>
                </View>
              )}
            </View>
          ) : null}

          {tab === 'Calendar' ? (
            <View style={styles.stack}>
              {calendarEntries.length === 0 ? (
                <EmptyState title="No saved looks yet" description="Save a generated outfit to see it here." />
              ) : null}
              <View style={styles.calendarGrid}>
                {calendarEntries.map(([date, looks]) => {
                  const active = selectedCalendarKey === date;
                  return (
                    <Pressable
                      key={date}
                      style={[
                        styles.calendarTile,
                        active ? styles.calendarTileActive : null,
                        { width: calendarTileSize, height: calendarTileSize }
                      ]}
                      onPress={() => setSelectedCalendarKey(date)}
                    >
                      <View style={styles.calendarTilePreview}>
                        <Text style={styles.calendarTilePreviewText}>{looks[0].prompt.slice(0, 24)}</Text>
                      </View>
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
                      <SurfaceCard key={look.id}>
                        <Text style={styles.cardTitle}>{look.prompt}</Text>
                        <Text style={styles.mutedText}>Model: {look.model}</Text>
                      </SurfaceCard>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          ) : null}

          {tab === 'Settings' ? (
            <View style={styles.stack}>
              <SurfaceCard>
                <Text style={styles.cardTitle}>Logo Lab</Text>
                <Text style={styles.mutedText}>Tap any option to preview it live.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.logoRow}>
                  {logoOptions.map((option) => (
                    <Pressable
                      key={option.id}
                      style={[styles.logoOptionCard, logoChoice === option.id ? styles.logoOptionCardActive : null]}
                      onPress={() => setLogoChoice(option.id)}
                    >
                      <View style={styles.logoMiniMark}>
                        <HangerHLogo size={14} color={theme.color.accent} />
                      </View>
                      <Text
                        style={[
                          styles.logoMiniTitle,
                          logoTitleStyleFor(option.id),
                          fontsLoaded ? logoFontStyleFor(option.id) : null
                        ]}
                      >
                        Hannah's Helper
                      </Text>
                      <Text style={styles.logoMiniSub}>{option.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </SurfaceCard>

              <SurfaceCard>
                <Text style={styles.cardTitle}>Magic Link Sign-in</Text>
                <TextInput
                  placeholder="you@example.com"
                  placeholderTextColor={theme.color.muted}
                  style={styles.input}
                />
                <View style={styles.stateButtonWrap}>
                  <AppButton label="Send Magic Link" />
                </View>
              </SurfaceCard>

              <SurfaceCard>
                <Text style={styles.cardTitle}>Usage</Text>
                <Text style={styles.mutedText}>Generation usage is tracked for demo telemetry.</Text>
              </SurfaceCard>

              <SurfaceCard>
                <Text style={styles.cardTitle}>Privacy</Text>
                <Text style={styles.mutedText}>Delete-all-data flow available in backend function.</Text>
                <View style={styles.stateButtonWrap}>
                  <AppButton label="Simulate Error State" variant="secondary" onPress={() => setShowError(true)} />
                </View>
              </SurfaceCard>
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>

      {tab === 'Generate' || tab === 'Closet' ? (
        <Pressable
          style={[styles.generateFab, { bottom: 86 + insets.bottom }]}
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
            { transform: [{ translateY: Animated.add(promptBaseTranslateY, promptDragTranslateY) }] }
          ]}
          {...promptPanResponder.panHandlers}
        >
          <SectionHeader title="Prompt Window" subtitle="Create a look, then review it in the feed." />

          <Text style={styles.label}>Prompt</Text>
          <TextInput
            style={styles.textArea}
            multiline
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe the look you want"
            placeholderTextColor={theme.color.muted}
          />

          <Text style={styles.label}>Subject Mode</Text>
          <View style={styles.rowWrap}>
            <Chip label="mannequin" active={subject === 'mannequin'} onPress={() => setSubject('mannequin')} />
            <Chip label="personal" active={subject === 'personal'} onPress={() => setSubject('personal')} />
          </View>

          <Text style={styles.label}>Generation Mode</Text>
          <View style={styles.rowWrap}>
            <Chip label="closet_only" active={mode === 'closet_only'} onPress={() => setMode('closet_only')} />
            <Chip label="allow_extras" active={mode === 'allow_extras'} onPress={() => setMode('allow_extras')} />
          </View>

          <View style={styles.buttonRowSplit}>
            <AppButton label="Generate" onPress={handleGenerateMock} />
          </View>
        </Animated.View>
      </Modal>

      <Modal visible={isClosetMounted} transparent animationType="none" onRequestClose={() => setIsClosetOpen(false)}>
        <Animated.View style={[styles.modalBackdrop, { opacity: closetBackdropOpacity }]} />
        <Animated.View
          style={[
            styles.modalCard,
            { transform: [{ translateY: Animated.add(closetBaseTranslateY, closetDragTranslateY) }] }
          ]}
          {...closetPanResponder.panHandlers}
        >
          <SectionHeader title="Add Closet Item" subtitle="One item per entry." />
          <View style={styles.photoPlaceholder}>
            <Text style={styles.placeholderLabel}>Photo Preview Area</Text>
          </View>
          <Text style={styles.label}>Category</Text>
          <View style={styles.rowWrap}>
            {['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessories'].map((cat) => (
              <Chip key={cat} label={cat} active={cat === closetCategory} onPress={() => setClosetCategory(cat)} />
            ))}
          </View>
          <Text style={styles.label}>Color</Text>
          <TextInput style={styles.input} value={closetColor} onChangeText={setClosetColor} />
          <Text style={styles.label}>Style tags</Text>
          <TextInput style={styles.input} value={closetTags} onChangeText={setClosetTags} />
          <View style={styles.buttonRowSplit}>
            <AppButton label="Add to Closet" onPress={handleAddClosetItem} />
          </View>
        </Animated.View>
      </Modal>

      <FloatingTabBar tab={tab} onSelect={setTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.color.bg
  },
  topRail: {
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.color.bgAlt,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm
  },
  brandMark: {
    width: 34,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  appTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    color: theme.color.text,
    letterSpacing: -0.4
  },
  appSub: {
    marginTop: 2,
    fontSize: 12,
    color: theme.color.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  logoFontGreatVibes: {
    fontFamily: 'GreatVibes_400Regular'
  },
  logoFontDancingScript: {
    fontFamily: 'DancingScript_400Regular'
  },
  logoFontPacifico: {
    fontFamily: 'Pacifico_400Regular'
  },
  logoFontSacramento: {
    fontFamily: 'Sacramento_400Regular'
  },
  logoFontAllura: {
    fontFamily: 'Allura_400Regular'
  },
  logoTitleRoseClassic: {
    color: '#b24778',
    fontStyle: 'italic',
    fontSize: 30,
    letterSpacing: 0.2
  },
  logoTitleSweetCaps: {
    fontSize: 31,
    fontStyle: 'italic',
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#b34d82',
    textShadowColor: '#efc8da',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  logoTitleDollySerif: {
    fontSize: 31,
    fontStyle: 'italic',
    letterSpacing: 0.4,
    color: '#8f4f70'
  },
  logoTitleSoftItalic: {
    fontStyle: 'italic',
    fontSize: 29,
    letterSpacing: 0.3,
    color: '#a04d7a'
  },
  logoTitleBubbleBold: {
    fontSize: 30,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#bf4f8a'
  },
  logoTitleRibbonMini: {
    fontSize: 29,
    fontStyle: 'italic',
    letterSpacing: 0.8,
    color: '#9f567c'
  },
  logoTitleCleanCute: {
    fontSize: 29,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#9f4f73'
  },
  logoTitleDreamyShadow: {
    fontStyle: 'italic',
    fontSize: 30,
    color: '#a84f81',
    textShadowColor: '#e9bfd3',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8
  },
  logoTitleLabelStamp: {
    letterSpacing: 0.9,
    fontSize: 28,
    fontStyle: 'italic',
    color: '#b85d89'
  },
  logoTitleStudioModern: {
    fontSize: 29,
    fontStyle: 'italic',
    letterSpacing: 0.4,
    color: '#974f78'
  },
  badge: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.accentSoft,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.color.border
  },
  badgeText: {
    color: theme.color.accent,
    fontSize: 12,
    fontWeight: '700'
  },
  body: {
    flex: 1
  },
  scrollInner: {
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.lg,
    paddingBottom: 140,
    gap: theme.space.md
  },
  stack: {
    gap: theme.space.md
  },
  sectionHeaderWrap: {
    gap: theme.space.xs
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 28,
    color: theme.color.text,
    fontWeight: '800',
    letterSpacing: -0.3
  },
  sectionSubtitle: {
    color: theme.color.muted,
    fontSize: 14,
    lineHeight: 20
  },
  surfaceCard: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space.md,
    gap: theme.space.sm,
    shadowColor: theme.color.shadow,
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1
  },
  cardTitle: {
    color: theme.color.text,
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 20
  },
  mutedText: {
    color: theme.color.muted,
    fontSize: 14,
    lineHeight: 20
  },
  metaText: {
    color: theme.color.muted,
    fontSize: 12,
    fontWeight: '600'
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.color.text,
    textTransform: 'uppercase',
    letterSpacing: 0.6
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.sm,
    backgroundColor: '#fff'
  },
  textArea: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.sm,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
    color: theme.color.text
  },
  rowWrap: {
    flexDirection: 'row',
    gap: theme.space.xs,
    flexWrap: 'wrap'
  },
  itemRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  chip: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 8,
    backgroundColor: '#fff',
    minHeight: 38,
    justifyContent: 'center'
  },
  chipActive: {
    backgroundColor: theme.color.accent,
    borderColor: theme.color.accent
  },
  chipText: {
    color: theme.color.text,
    fontSize: 13,
    fontWeight: '600'
  },
  chipTextActive: {
    color: '#fff'
  },
  button: {
    borderRadius: theme.radius.md,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.md,
    flex: 1
  },
  buttonPrimary: {
    backgroundColor: theme.color.accent
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.color.accent
  },
  buttonDanger: {
    backgroundColor: theme.color.danger
  },
  buttonSuccess: {
    backgroundColor: theme.color.ok
  },
  buttonPressed: {
    opacity: 0.88
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14
  },
  buttonSecondaryText: {
    color: theme.color.accent
  },
  buttonRowSplit: {
    flexDirection: 'row',
    gap: theme.space.sm
  },
  stateButtonWrap: {
    marginTop: theme.space.xs
  },
  logoRow: {
    gap: theme.space.sm,
    paddingRight: theme.space.sm
  },
  logoOptionCard: {
    width: 170,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    gap: theme.space.xs,
    backgroundColor: '#fff'
  },
  logoOptionCardActive: {
    borderColor: theme.color.accent,
    backgroundColor: theme.color.accentSoft
  },
  logoMiniMark: {
    width: 28,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoMiniTitle: {
    fontSize: 18,
    lineHeight: 22
  },
  logoMiniSub: {
    color: theme.color.muted,
    fontSize: 12,
    fontWeight: '600'
  },
  photoPlaceholder: {
    height: 160,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.bgAlt,
    justifyContent: 'center',
    alignItems: 'center'
  },
  placeholderLabel: {
    color: theme.color.muted,
    fontSize: 13,
    fontWeight: '600'
  },
  mockLookBlock: {
    height: 320,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.color.border
  },
  deckWrap: {
    gap: theme.space.sm
  },
  lookAccentLeft: {
    width: 22,
    backgroundColor: theme.color.dangerSoft
  },
  lookCenter: {
    flex: 1,
    backgroundColor: theme.color.bgAlt,
    justifyContent: 'center',
    alignItems: 'center'
  },
  lookCenterLabel: {
    fontSize: 13,
    color: theme.color.muted,
    fontWeight: '700'
  },
  lookAccentRight: {
    width: 22,
    backgroundColor: theme.color.okSoft
  },
  swipeBadge: {
    position: 'absolute',
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderRadius: theme.radius.sm,
    zIndex: 2
  },
  swipeBadgeLeft: {
    left: 12,
    borderColor: theme.color.danger
  },
  swipeBadgeRight: {
    right: 12,
    borderColor: theme.color.ok
  },
  swipeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.color.text
  },
  swipeHintRail: {
    flexDirection: 'row',
    gap: theme.space.sm
  },
  leftHint: {
    flex: 1,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.dangerSoft,
    borderWidth: 1,
    borderColor: '#ebc2b9',
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  rightHint: {
    flex: 1,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.okSoft,
    borderWidth: 1,
    borderColor: '#bfdac8',
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  hintText: {
    fontSize: 12,
    color: theme.color.danger,
    fontWeight: '700'
  },
  hintTextRight: {
    color: theme.color.ok,
    textAlign: 'right'
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.xs
  },
  calendarTile: {
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.bgAlt
  },
  calendarTileActive: {
    borderColor: theme.color.accent,
    borderWidth: 2
  },
  calendarTilePreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.xs
  },
  calendarTilePreviewText: {
    color: theme.color.muted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center'
  },
  calendarTileMeta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    gap: theme.space.xs
  },
  calendarExpandedRow: {
    gap: theme.space.sm,
    paddingRight: theme.space.xs
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.color.text
  },
  emptyDesc: {
    color: theme.color.muted,
    lineHeight: 20
  },
  generateFab: {
    position: 'absolute',
    bottom: 86,
    alignSelf: 'center',
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.accent,
    shadowColor: theme.color.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.32)'
  },
  modalCard: {
    position: 'absolute',
    left: theme.space.md,
    right: theme.space.md,
    bottom: theme.space.lg,
    maxHeight: '82%',
    backgroundColor: theme.color.card,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    gap: theme.space.sm
  },
  floatingTabWrap: {
    position: 'absolute',
    left: theme.space.md,
    right: theme.space.md,
    bottom: theme.space.md,
    borderRadius: 26,
    paddingHorizontal: theme.space.xs,
    paddingVertical: theme.space.xs,
    backgroundColor: '#fffaf4',
    borderWidth: 1,
    borderColor: theme.color.border,
    shadowColor: theme.color.shadow,
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.space.xs
  },
  tabHit: {
    minWidth: 82
  },
  tabPill: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.sm,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center'
  },
  tabPillActive: {
    backgroundColor: theme.color.accent
  },
  tabText: {
    fontSize: 12,
    color: theme.color.muted,
    fontWeight: '700'
  },
  tabTextActive: {
    color: '#fff'
  }
});
