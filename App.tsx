import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  SafeAreaView,
  StatusBar,
  Modal,
  useWindowDimensions,
  Animated,
  RefreshControl,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Meal,
  createSupabaseClient,
  SUPABASE_MEALS_SQL,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
} from './supabase';
import {
  CameraIcon,
  GalleryIcon,
  HistoryIcon,
  SettingsIcon,
  FlameIcon,
  RefreshIcon,
  PlateIcon,
  ProteinIcon,
  CarbsIcon,
  FatIcon,
  CoachIcon,
  CloudIcon,
  KeyIcon,
  EyeIcon,
  CpuIcon,
  FlaskIcon,
  SaveIcon,
  CheckIcon,
  CloseIcon,
  AlertIcon,
  InfoIcon,
  ChevronIcon,
} from './Icons';

// Strict 4-Color Palette: 50%, 30%, 10%, 10%
const C50 = '#F9E6A8';        // 50% - Dominant Background & Canvas
const C30 = '#F2A900';        // 30% - Cards, Surfaces & Containers
const C10_ACCENT = '#CC6F00'; // 10% - Borders, Dividers & Accents
const C10_DARK = '#4D2A00';   // 10% - Typography, Icons & Focal Contrast

// Gemini model routing (verified Oct 2026: stable 3.x-flash = 503 overload,
// gemini-3-flash-preview = 200 OK). Single attempt per tap — no silent retry.
const MAIN_MODEL = 'gemini-3-flash-preview';
const FALLBACK_MODEL = 'gemini-3.6-flash';
const LEGACY_MODEL = 'gemini-3.8-flash';
const GEMINI_TIMEOUT_MS = 120000;
const PING_TIMEOUT_MS = 30000;

// Groq alternative (OpenAI-compatible chat completions + vision).
// Only vision-capable model per Groq docs: qwen/qwen3.8-27b (JSON mode, base64 data URL).
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GROQ_TIMEOUT_MS = 120000;

type AIProvider = 'gemini' | 'groq';

const isAbortError = (err: any): boolean => {
  const name = String(err?.name || '');
  const msg = String(err?.message || err || '').toLowerCase();
  return name === 'AbortError' || msg.includes('aborted') || msg.includes('abort');
};

// Abortable timeout: the timer actually cancels the underlying request,
// so timed-out uploads don't pile up in the background and clog the uplink.
const runWithAbort = async <T,>(
  ms: number,
  label: string,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<{ value: T; elapsedMs: number }> => {
  const ctrl = new AbortController();
  const t0 = Date.now();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const value = await fn(ctrl.signal);
    return { value, elapsedMs: Date.now() - t0 };
  } catch (err: any) {
    if (ctrl.signal.aborted || isAbortError(err)) {
      throw new Error(`${label} timeout (${Math.round(ms / 1000)}s, aborted) — server queued or upload stalled, no background retry left running`);
    }
    (err as any).elapsedMs = Date.now() - t0;
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const elapsedOf = (err: any): string =>
  typeof err?.elapsedMs === 'number' ? ` after ${(err.elapsedMs / 1000).toFixed(1)}s` : '';

const imgKB = (b64: string): string => `${Math.round((b64.length * 3) / 4 / 1024)}KB`;

const is404Error = (err: any): boolean => {
  if (!err) return false;
  const status = err?.status || err?.statusCode || err?.response?.status;
  if (status === 404) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('404') || msg.includes('not found') || msg.includes('no longer available');
};

const isRateLimitError = (err: any): boolean => {
  if (!err) return false;
  const status = err?.status || err?.statusCode || err?.response?.status;
  if (status === 429) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('quota') || msg.includes('too many requests');
};

const stripJsonFences = (raw: string): string => {
  const t = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  return s >= 0 && e > s ? t.slice(s, e + 1) : t;
};

type TabType = 'scan' | 'history' | 'settings';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
}

interface DialogState {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export default function App() {
  const { width: windowWidth } = useWindowDimensions();

  // Responsive breakpoints
  const isCompact = windowWidth < 380;
  const contentWidth = Math.min(windowWidth - 32, 560);
  const imagePreviewHeight = Math.min(contentWidth * 0.75, 320);

  // Tab Navigation State
  const [activeTab, setActiveTab] = useState<TabType>('scan');

  // Core Data States
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('พร้อมวิเคราะห์');
  const [mealData, setMealData] = useState<Meal | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [geminiApiKey, setGeminiApiKey] = useState<string>(
    process.env.EXPO_PUBLIC_GEMINI_API_KEY || ''
  );
  const [groqApiKey, setGroqApiKey] = useState<string>(
    process.env.EXPO_PUBLIC_GROQ_API_KEY || ''
  );
  const [aiProvider, setAiProvider] = useState<AIProvider>('gemini');
  const [groqModel] = useState<string>(GROQ_MODEL);
  const [recentMeals, setRecentMeals] = useState<Meal[]>([]);
  const [refreshingHistory, setRefreshingHistory] = useState<boolean>(false);
  const [expandedRoastId, setExpandedRoastId] = useState<string | null>(null);

  // Model & 503 Handling States
  const [currentModel, setCurrentModel] = useState<string>(MAIN_MODEL);
  const [resultModel, setResultModel] = useState<string | null>(null);
  const [show503Modal, setShow503Modal] = useState<boolean>(false);
  const [pendingBase64, setPendingBase64] = useState<string | null>(null);
  const [switchedToLowerModel, setSwitchedToLowerModel] = useState<boolean>(false);

  // Settings UI State
  const [showApiKeyText, setShowApiKeyText] = useState<boolean>(false);
  const [showGroqKeyText, setShowGroqKeyText] = useState<boolean>(false);
  const [pinging, setPinging] = useState<boolean>(false);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);
  const LOCAL_MEALS_KEY = '@rate_my_meal_history';

  // Personal Supabase Configuration States
  const [supabaseUrl, setSupabaseUrl] = useState<string>('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>('');
  const [showSupabaseKeyText, setShowSupabaseKeyText] = useState<boolean>(false);
  const [showSupabaseGuideModal, setShowSupabaseGuideModal] = useState<boolean>(false);
  const [testingSupabase, setTestingSupabase] = useState<boolean>(false);
  const [supabaseStatus, setSupabaseStatus] = useState<'not_configured' | 'connected' | 'error'>('not_configured');
  const [supabaseClientInstance, setSupabaseClientInstance] = useState<SupabaseClient | null>(null);

  const STORAGE_SUPABASE_URL_KEY = '@user_supabase_url';
  const STORAGE_SUPABASE_KEY_KEY = '@user_supabase_anon_key';
  const STORAGE_GEMINI_KEY = '@user_gemini_api_key';
  const STORAGE_GROQ_KEY = '@user_groq_api_key';

  // Custom Toast & Dialog States
  const [toast, setToast] = useState<ToastState | null>(null);
  const [customDialog, setCustomDialog] = useState<DialogState | null>(null);

  // Toast animation
  const toastFadeAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for AI coach thinking card
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Bottom Tab Bar Sliding Transition Animation
  const tabAnimValue = useRef(new Animated.Value(0)).current;
  const [navBarWidth, setNavBarWidth] = useState<number>(0);

  // Tab switch spring animation
  useEffect(() => {
    const targetIndex = activeTab === 'scan' ? 0 : activeTab === 'history' ? 1 : 2;
    Animated.spring(tabAnimValue, {
      toValue: targetIndex,
      friction: 8,
      tension: 65,
      useNativeDriver: true,
    }).start();
  }, [activeTab]);

  useEffect(() => {
    const initCredentialsAndMeals = async () => {
      let client: SupabaseClient | null = null;
      try {
        // Load custom Gemini and Groq API keys if saved by user
        const storedGemini = await AsyncStorage.getItem(STORAGE_GEMINI_KEY);
        if (storedGemini) {
          setGeminiApiKey(storedGemini);
        }
        const storedGroq = await AsyncStorage.getItem(STORAGE_GROQ_KEY);
        if (storedGroq) {
          setGroqApiKey(storedGroq);
        }

        const storedUrl = await AsyncStorage.getItem(STORAGE_SUPABASE_URL_KEY);
        const storedKey = await AsyncStorage.getItem(STORAGE_SUPABASE_KEY_KEY);
        const urlToUse = storedUrl || DEFAULT_SUPABASE_URL;
        const keyToUse = storedKey || DEFAULT_SUPABASE_ANON_KEY;
        if (urlToUse && keyToUse) {
          setSupabaseUrl(urlToUse);
          setSupabaseAnonKey(keyToUse);
          client = createSupabaseClient(urlToUse, keyToUse);
          if (client) {
            setSupabaseClientInstance(client);
            setSupabaseStatus('connected');
          }
        }
      } catch (e) {
        console.warn('Failed to load stored credentials', e);
      }
      fetchRecentMeals(client);
    };
    initCredentialsAndMeals();
  }, []);

  // Loading pulse animation
  useEffect(() => {
    if (loading) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [loading]);

  // Toast auto-dismiss effect
  useEffect(() => {
    if (toast) {
      Animated.timing(toastFadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(toastFadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start(() => setToast(null));
      }, 3500);

      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info',
    title?: string
  ) => {
    setToast({ id: Date.now(), message, type, title });
  };

  const showConfirmDialog = (options: Omit<DialogState, 'visible'>) => {
    setCustomDialog({ ...options, visible: true });
  };

  const fetchRecentMeals = async (clientOverride?: SupabaseClient | null) => {
    setRefreshingHistory(true);
    const activeClient = clientOverride !== undefined ? clientOverride : supabaseClientInstance;
    try {
      // 1. First load from local storage for instant display
      let localList: Meal[] = [];
      const raw = await AsyncStorage.getItem(LOCAL_MEALS_KEY);
      if (raw) {
        localList = JSON.parse(raw) as Meal[];
        setRecentMeals(localList);
      } else {
        setRecentMeals([]);
      }

      // 2. If personal Supabase is connected, fetch from cloud and merge to local cache
      if (activeClient) {
        const { data, error } = await activeClient
          .from('meals')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          const cloudMeals = data as Meal[];
          await AsyncStorage.setItem(LOCAL_MEALS_KEY, JSON.stringify(cloudMeals));
          setRecentMeals(cloudMeals);
          setSupabaseStatus('connected');
        } else if (error) {
          console.warn('Supabase fetch error:', error.message);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch meals', err);
    } finally {
      setRefreshingHistory(false);
    }
  };

  const saveMealLocally = async (newMeal: Meal) => {
    setSyncStatus('syncing');
    try {
      // 1. Always save to local storage first (ensures offline access)
      const raw = await AsyncStorage.getItem(LOCAL_MEALS_KEY);
      const list: Meal[] = raw ? JSON.parse(raw) : [];
      const updated = [newMeal, ...list.filter((m) => m.created_at !== newMeal.created_at).slice(0, 49)];
      await AsyncStorage.setItem(LOCAL_MEALS_KEY, JSON.stringify(updated));
      setRecentMeals(updated);

      // 2. If personal Supabase is connected, backup to cloud
      if (supabaseClientInstance) {
        const { error: dbError } = await supabaseClientInstance.from('meals').insert([
          {
            dish_name: newMeal.dish_name || 'อาหารไม่ระบุชื่อ',
            calories: Math.round(Number(newMeal.calories) || 0),
            protein: parseFloat(String(newMeal.protein || 0)),
            carbs: parseFloat(String(newMeal.carbs || 0)),
            fat: parseFloat(String(newMeal.fat || 0)),
            health_score: Math.min(10, Math.max(1, Math.round(Number(newMeal.health_score) || 5))),
            roast_comment: newMeal.roast_comment || '',
            created_at: newMeal.created_at || new Date().toISOString(),
          },
        ]);

        if (dbError) {
          console.warn('Supabase cloud sync warning:', dbError.message);
          setSyncStatus('error');
          showToast('บันทึกลงเครื่องแล้ว แต่ซิงค์ขึ้น Supabase ไม่สำเร็จ', 'warning', 'Sync Issue');
        } else {
          setSyncStatus('synced');
        }
      } else {
        setSyncStatus('synced');
      }
    } catch (err) {
      console.warn('Failed to save meal', err);
      setSyncStatus('error');
      showToast('ไม่สามารถบันทึกประวัติได้', 'warning', 'Storage Issue');
    }
  };

  const testSupabaseConnection = async () => {
    const url = supabaseUrl.trim();
    const key = supabaseAnonKey.trim();
    if (!url || !key) {
      showToast('กรุณากรอก Supabase URL และ Anon Key ก่อนกดทดสอบ', 'warning', 'ต้องระบุข้อมูล');
      return;
    }
    setTestingSupabase(true);
    try {
      const client = createSupabaseClient(url, key);
      if (!client) {
        throw new Error('รูปแบบ URL ไม่ถูกต้อง (เช่น https://xxxx.supabase.co)');
      }

      // Query 1 row from meals table to verify both connection AND table existence
      const { data, error } = await client.from('meals').select('id').limit(1);
      if (error) {
        if (
          error.code === '42P01' ||
          error.message?.includes('does not exist') ||
          error.message?.includes('relation "meals"')
        ) {
          setSupabaseStatus('error');
          showConfirmDialog({
            title: 'ยังไม่พบตาราง meals!',
            message:
              'เชื่อมต่อไปยัง Supabase ได้แล้ว แต่ยังไม่มีตาราง "meals" ในฐานข้อมูล\n\nต้องการเปิด Guide เพื่อดูคำสั่ง SQL สร้างตารางในคลิกเดียวหรือไม่?',
            confirmText: 'เปิด Guide ดูคำสั่ง SQL',
            cancelText: 'ปิด',
            onConfirm: () => setShowSupabaseGuideModal(true),
          });
          return;
        }
        throw error;
      }

      // Success: Save credentials to local storage
      setSupabaseClientInstance(client);
      setSupabaseStatus('connected');
      await AsyncStorage.setItem(STORAGE_SUPABASE_URL_KEY, url);
      await AsyncStorage.setItem(STORAGE_SUPABASE_KEY_KEY, key);

      // Check if there are local meals to offer uploading
      const raw = await AsyncStorage.getItem(LOCAL_MEALS_KEY);
      const locals: Meal[] = raw ? JSON.parse(raw) : [];

      if (locals.length > 0) {
        showConfirmDialog({
          title: 'เชื่อมต่อ Supabase สำเร็จ! 🎉',
          message: `พบประวัติมื้ออาหาร ${locals.length} มื้อในเครื่อง ต้องการอัปโหลดสำรองข้อมูลขึ้น Supabase ส่วนตัวของคุณตอนนี้เลยหรือไม่?`,
          confirmText: 'อัปโหลดสำรองข้อมูล',
          cancelText: 'ไว้ภายหลัง',
          onConfirm: () => uploadLocalMealsToCloud(client, locals),
        });
      } else {
        showToast('เชื่อมต่อ Supabase และพบตาราง meals พร้อมใช้งานแล้ว!', 'success', 'เชื่อมต่อสำเร็จ');
        fetchRecentMeals(client);
      }
    } catch (err: any) {
      console.warn('Supabase test failed:', err);
      setSupabaseStatus('error');
      showToast(err.message || 'ไม่สามารถเชื่อมต่อได้ ตรวจสอบ URL และ Key', 'error', 'เชื่อมต่อไม่สำเร็จ');
    } finally {
      setTestingSupabase(false);
    }
  };

  const uploadLocalMealsToCloud = async (client: SupabaseClient, meals: Meal[]) => {
    try {
      showToast(`กำลังอัปโหลด ${meals.length} มื้อขึ้น Supabase...`, 'info', 'กำลังสำรองข้อมูล');
      const payload = meals.map((m) => ({
        dish_name: m.dish_name || 'อาหารไม่ระบุชื่อ',
        calories: Math.round(Number(m.calories) || 0),
        protein: parseFloat(String(m.protein || 0)),
        carbs: parseFloat(String(m.carbs || 0)),
        fat: parseFloat(String(m.fat || 0)),
        health_score: Math.min(10, Math.max(1, Math.round(Number(m.health_score) || 5))),
        roast_comment: m.roast_comment || '',
        created_at: m.created_at || new Date().toISOString(),
      }));
      const { error } = await client.from('meals').insert(payload);
      if (error) throw error;
      showToast(`สำรองข้อมูล ${meals.length} มื้อขึ้น Supabase เรียบร้อย!`, 'success', 'สำรองข้อมูลสำเร็จ');
      fetchRecentMeals(client);
    } catch (e: any) {
      showToast(e.message || 'อัปโหลดสำรองข้อมูลไม่สำเร็จ', 'error', 'เกิดข้อผิดพลาด');
    }
  };

  const clearLocalMeals = () => {
    showConfirmDialog({
      title: 'ล้างประวัติมื้ออาหาร?',
      message: 'คุณต้องการลบประวัติมื้ออาหารทั้งหมดออกจากเครื่องนี้ใช่หรือไม่? ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้',
      confirmText: 'ลบทั้งหมด',
      cancelText: 'ยกเลิก',
      onConfirm: async () => {
        try {
          await AsyncStorage.removeItem(LOCAL_MEALS_KEY);
          setRecentMeals([]);
          showToast('ลบประวัติมื้ออาหารทั้งหมดเรียบร้อยแล้ว', 'info', 'ล้างข้อมูลสำเร็จ');
        } catch (e) {
          showToast('ไม่สามารถลบประวัติได้', 'error');
        }
      },
    });
  };

  const handleReportRoast = (comment: string) => {
    showConfirmDialog({
      title: 'รายงานข้อความ AI ไม่เหมาะสม',
      message: `คุณต้องการรายงานข้อความของเทรนเนอร์ AI ว่ามีเนื้อหาไม่เหมาะสม (เช่น คำหยาบคาย, Body shaming หรือคำแนะนำที่ไม่ปลอดภัย) ใช่หรือไม่?\n\n"${comment.slice(0, 80)}..."`,
      confirmText: 'ยืนยันรายงาน',
      cancelText: 'ยกเลิก',
      onConfirm: () => {
        showToast(
          'ระบบบันทึกรายงานของคุณแล้ว เราจะนำไปปรับปรุงตัวกรองความปลอดภัยของ AI ให้ดียิ่งขึ้น',
          'success',
          'รายงานสำเร็จ'
        );
      },
    });
  };

  const is503Error = (err: any): boolean => {
    if (!err) return false;
    const status = err?.status || err?.statusCode || err?.response?.status;
    if (status === 503) return true;
    const msg = String(err?.message || err || '').toLowerCase();
    return (
      msg.includes('503') ||
      msg.includes('service unavailable') ||
      msg.includes('overloaded') ||
      msg.includes('high demand') ||
      msg.includes('resource has been exhausted') ||
      msg.includes('capacity') ||
      msg.includes('traffic') ||
      msg.includes('temporarily unavailable')
    );
  };

  const pickImage = async (useCamera: boolean = false) => {
    try {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showToast(
            'กรุณาเปิดการอนุญาตการเข้าถึงกล้องถ่ายรูปในการตั้งค่า',
            'warning',
            'ต้องการการอนุญาตกล้อง'
          );
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showToast(
            'กรุณาเปิดการอนุญาตการเข้าถึงคลังภาพในการตั้งค่า',
            'warning',
            'ต้องการการอนุญาตคลังภาพ'
          );
          return;
        }
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.4,
        base64: true,
      };

      const result = useCamera
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        setImageUri(selectedAsset.uri);
        setImageBase64(selectedAsset.base64 || null);
        setPendingBase64(selectedAsset.base64 || null);
        setMealData(null);
        setResultModel(null);
        setSwitchedToLowerModel(false);
        setSyncStatus('idle');

        if (selectedAsset.base64) {
          analyzeMeal(selectedAsset.base64, currentModel);
        }
      }
    } catch (err) {
      showToast('ไม่สามารถเลือกรูปภาพได้ กรุณาลองใหม่อีกครั้ง', 'error', 'เกิดข้อผิดพลาด');
      console.error(err);
    }
  };

  const analyzeMealWithGemini = async (
    base64Data: string,
    modelOverride?: string,
    isFallbackAttempt: boolean = false
  ) => {
    const keyToUse = geminiApiKey.trim();
    if (!keyToUse) {
      showConfirmDialog({
        title: 'ต้องระบุ Gemini API Key',
        message:
          'Rate My Meal ใช้ AI ในการวิเคราะห์สารอาหารและคำนวณแคลอรี่ กรุณาระบุ Gemini API Key ของคุณในหน้าตั้งค่า (สามารถกดรับฟรีได้ใน 1 นาทีที่ Google AI Studio ไม่ต้องผูกบัตร)',
        confirmText: 'ไปหน้าตั้งค่าเพื่อกรอก Key',
        cancelText: 'ยกเลิก',
        onConfirm: () => setActiveTab('settings'),
      });
      return;
    }

    const modelToUse = modelOverride || currentModel || MAIN_MODEL;
    setLoading(true);
    setLoadingStep(
      isFallbackAttempt
        ? `กำลังสลับใช้โมเดล ${modelToUse} (โมเดลสำรองช่วง Traffic เต็ม)...`
        : 'เทรนเนอร์กำลังจ้องดูจานข้าวของคุณ...'
    );
    setSyncStatus('idle');

    // Single-attempt log so Google console counts match taps (1 tap = 1 request).
    console.log(`[Gemini] attempt=1 model=${modelToUse} img=${imgKB(base64Data)} fallback=${isFallbackAttempt}`);

    try {
      const genAI = new GoogleGenerativeAI(keyToUse);
      const model = genAI.getGenerativeModel({
        model: modelToUse,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const prompt = `วิเคราะห์อาหารในภาพนี้อย่างแม่นยำ คำนวณแคลอรี่และสารอาหารหลัก (กรัม) 
พร้อมเขียนคอมเมนต์ Roast แสบๆ สไตล์เทรนเนอร์สายฟิตเนสปากร้ายแต่หวังดี
(ข้อกำหนดความปลอดภัยและนโยบาย: ห้ามใช้คำหยาบคายรุนแรง ห้ามเหยียดรูปร่างหรือล้อเลียนปมด้อยเด็ดขาด (No Body Shaming) และห้ามแนะนำพฤติกรรมการอดอาหารที่เป็นอันตราย ให้เน้นขำขัน เสียดสีเชิงบวก และแนะนำการปรับอาหารอย่างสร้างสรรค์)
ตอบกลับเป็น JSON Format เดียวตามนี้:
{
  "dish_name": string,
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "health_score": number (1-10),
  "roast_comment": string (ภาษาไทย)
}`;

      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg',
        },
      };

      setLoadingStep('กำลังคำนวณแคลอรี่ & เตรียมประโยคเชือดเฉือน...');
      // ONE request only: abortable timeout cancels the upload on expiry,
      // so timed-out attempts don't pile up in the background.
      // No silent auto-retry here — retry only via explicit 503-modal action.
      const { value: result, elapsedMs } = await runWithAbort(
        GEMINI_TIMEOUT_MS,
        `Gemini ${modelToUse}`,
        (signal) => model.generateContent([prompt, imagePart], { signal })
      );
      console.log(`[Gemini] success model=${modelToUse} img=${imgKB(base64Data)} in=${(elapsedMs / 1000).toFixed(1)}s`);

      const responseText = result.response.text();
      const serverModelVersion = (result.response as any)?.modelVersion;
      const verifiedModelName = serverModelVersion
        ? `${modelToUse} (v: ${serverModelVersion})`
        : modelToUse;

      let parsed: Meal;
      try {
        parsed = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError, responseText);
        throw new Error('รูปแบบข้อมูล AI ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
      }

      const isLowerFallback =
        isFallbackAttempt || modelToUse === FALLBACK_MODEL || modelToUse === LEGACY_MODEL;
      setMealData(parsed);
      setResultModel(verifiedModelName);
      setCurrentModel(modelToUse);
      setSwitchedToLowerModel(isLowerFallback);

      if (isLowerFallback) {
        showToast(
          `ประมวลผลด้วยโมเดลสำรอง ${verifiedModelName} เรียบร้อย`,
          'info',
          'Traffic Fallback Active'
        );
      } else {
        showToast(`วิเคราะห์ ${parsed.dish_name} สำเร็จ!`, 'success', 'วิเคราะห์เสร็จสิ้น');
      }

      // Save locally to device storage
      const newMealItem: Meal = {
        id: String(Date.now()),
        dish_name: parsed.dish_name || 'อาหารไม่ระบุชื่อ',
        calories: Math.round(Number(parsed.calories) || 0),
        protein: parseFloat(String(parsed.protein || 0)),
        carbs: parseFloat(String(parsed.carbs || 0)),
        fat: parseFloat(String(parsed.fat || 0)),
        health_score: Math.min(10, Math.max(1, Math.round(Number(parsed.health_score) || 5))),
        roast_comment: parsed.roast_comment || '',
        created_at: new Date().toISOString(),
      };
      await saveMealLocally(newMealItem);
    } catch (err: any) {
      console.error('Analysis error:', err);
      console.log(`[Gemini] failed model=${modelToUse} img=${imgKB(base64Data)}${elapsedOf(err)} err=${String(err?.message || err).slice(0, 200)}`);
      if (is503Error(err)) {
        console.warn('Gemini 503 Error caught:', err);
        setPendingBase64(base64Data);
        setShow503Modal(true);
        return;
      }
      if (is404Error(err)) {
        setPendingBase64(base64Data);
        showToast(
          `โมเดล ${modelToUse} ใช้ไม่ได้ (404) — ลองสลับเป็น ${MAIN_MODEL} ในหน้า Settings`,
          'error',
          'โมเดลไม่พร้อมใช้งาน'
        );
        setSyncStatus('error');
        return;
      }
      showToast(
        err.message || 'ไม่สามารถวิเคราะห์อาหารได้ กรุณาตรวจสอบรูปภาพและ API Key',
        'error',
        'วิเคราะห์ไม่สำเร็จ'
      );
      setSyncStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const analyzeMealWithGroq = async (base64Data: string) => {
    const keyToUse = groqApiKey.trim();
    if (!keyToUse) {
      showConfirmDialog({
        title: 'ต้องระบุ Groq API Key',
        message: 'กรุณากรอก Groq API Key (ฟรีที่ console.groq.com/keys) เพื่อใช้โมเดลสำรอง',
        confirmText: 'ไปหน้าตั้งค่า',
        cancelText: 'ยกเลิก',
        onConfirm: () => setActiveTab('settings'),
      });
      return;
    }

    setLoading(true);
    setLoadingStep('กำลังส่งรูปให้ Groq วิเคราะห์ (โมเดลสำรอง)...');
    setSyncStatus('idle');
    console.log(`[Groq] attempt=1 model=${groqModel} img=${imgKB(base64Data)}`);

    try {
      const prompt = `วิเคราะห์อาหารในภาพนี้อย่างแม่นยำ คำนวณแคลอรี่และสารอาหารหลัก (กรัม) พร้อมเขียนคอมเมนต์ Roast แสบๆ สไตล์เทรนเนอร์สายฟิตเนสปากร้ายแต่หวังดี (ข้อกำหนดความปลอดภัยและนโยบาย: ห้ามมีคำหยาบคายรุนแรง ห้ามเหยียดรูปร่างหรือล้อเลียนปมด้อยเด็ดขาด (No Body Shaming) และห้ามแนะนำพฤติกรรมการอดอาหารที่เป็นอันตราย ให้เน้นขำขัน เสียดสีเชิงบวก และแนะนำการปรับอาหารอย่างสร้างสรรค์) ตอบกลับเป็น JSON เท่านั้นตามนี้: {"dish_name": string, "calories": number, "protein": number, "carbs": number, "fat": number, "health_score": number (1-10), "roast_comment": string (ภาษาไทย)}`;

      setLoadingStep('กำลังคำนวณแคลอรี่ & เตรียมประโยคเชือดเฉือน...');
      const { value: res, elapsedMs } = await runWithAbort(
        GROQ_TIMEOUT_MS,
        `Groq ${groqModel}`,
        (signal) =>
          fetch(GROQ_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${keyToUse}`,
            },
            body: JSON.stringify({
              model: groqModel,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    {
                      type: 'image_url',
                      image_url: { url: `data:image/jpeg;base64,${base64Data}` },
                    },
                  ],
                },
              ],
              temperature: 0.3,
              max_completion_tokens: 1024,
              response_format: { type: 'json_object' },
            }),
            signal,
          })
      );

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err: any = new Error(`Groq ${res.status} — ${body.slice(0, 200) || res.statusText}`);
        err.status = res.status;
        throw err;
      }

      const json = await res.json();
      const content: string = json?.choices?.[0]?.message?.content || '';
      if (!content) throw new Error('Groq ตอบกลับว่างเปล่า กรุณาลองใหม่');
      console.log(`[Groq] success model=${groqModel} img=${imgKB(base64Data)} in=${(elapsedMs / 1000).toFixed(1)}s`);

      let parsed: Meal;
      try {
        parsed = JSON.parse(stripJsonFences(content));
      } catch (parseError) {
        console.error('Groq JSON Parse Error:', parseError, content);
        throw new Error('รูปแบบข้อมูล Groq ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
      }

      setMealData(parsed);
      setResultModel(`groq/${groqModel}`);
      setSwitchedToLowerModel(true);
      showToast(`วิเคราะห์ ${parsed.dish_name} สำเร็จด้วย Groq!`, 'success', 'วิเคราะห์เสร็จสิ้น');

      // Save locally to device storage
      const newMealItem: Meal = {
        id: String(Date.now()),
        dish_name: parsed.dish_name || 'อาหารไม่ระบุชื่อ',
        calories: Math.round(Number(parsed.calories) || 0),
        protein: parseFloat(String(parsed.protein || 0)),
        carbs: parseFloat(String(parsed.carbs || 0)),
        fat: parseFloat(String(parsed.fat || 0)),
        health_score: Math.min(10, Math.max(1, Math.round(Number(parsed.health_score) || 5))),
        roast_comment: parsed.roast_comment || '',
        created_at: new Date().toISOString(),
      };
      await saveMealLocally(newMealItem);
    } catch (err: any) {
      console.error('Groq analysis error:', err);
      console.log(`[Groq] failed model=${groqModel} img=${imgKB(base64Data)}${elapsedOf(err)} err=${String(err?.message || err).slice(0, 200)}`);
      if (err?.status === 401) {
        showToast('Groq API Key ไม่ถูกต้อง กรุณาตรวจสอบในหน้า Settings', 'error', 'Groq 401');
      } else if (isRateLimitError(err) || is503Error(err)) {
        setPendingBase64(base64Data);
        setShow503Modal(true);
        showToast('Groq ติด rate limit/503 — ลองสลับกลับ Gemini หรือรอซักครู่', 'warning', 'Groq Busy');
      } else {
        showToast(err.message || 'Groq วิเคราะห์ไม่สำเร็จ', 'error', 'วิเคราะห์ไม่สำเร็จ');
      }
      setSyncStatus('error');
    } finally {
      setLoading(false);
    }
  };

  // Router: 1 tap = 1 request on the selected provider. No cross-provider auto-retry.
  const analyzeMeal = async (base64Data: string, modelOverride?: string, isFallback = false) => {
    if (aiProvider === 'groq') {
      await analyzeMealWithGroq(base64Data);
    } else {
      await analyzeMealWithGemini(base64Data, modelOverride, isFallback);
    }
  };

  // Text-only ping: isolates phone->API network path from image-upload issues.
  // Tiny payload (~50 bytes) — if this succeeds but image analysis times out,
  // the problem is payload size/upload, not the network being "slow".
  const pingProvider = async () => {
    if (pinging) return;
    setPinging(true);
    try {
      if (aiProvider === 'groq') {
        const key = groqApiKey.trim();
        if (!key) {
          showToast('กรอก Groq API Key ก่อนปิง', 'warning', 'ต้องระบุ Key');
          return;
        }
        const { elapsedMs } = await runWithAbort(
          PING_TIMEOUT_MS,
          'Groq ping',
          (signal) =>
            fetch(GROQ_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
              body: JSON.stringify({
                model: groqModel,
                messages: [{ role: 'user', content: 'reply with {"ok":1}' }],
                max_completion_tokens: 16,
              }),
              signal,
            }).then(async (r) => {
              if (!r.ok) {
                const e: any = new Error(`Groq ping ${r.status}`);
                e.status = r.status;
                throw e;
              }
              return r;
            })
        );
        const msg = `Groq ping OK in ${(elapsedMs / 1000).toFixed(1)}s — network fine, suspect image upload/size`;
        console.log(`[Ping] groq ok in=${(elapsedMs / 1000).toFixed(1)}s`);
        setLastPing(msg);
        showToast(msg, 'success', 'Ping สำเร็จ');
      } else {
        const key = geminiApiKey.trim();
        if (!key) {
          showToast('กรอก Gemini API Key ก่อนปิง', 'warning', 'ต้องระบุ Key');
          return;
        }
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: currentModel });
        const { elapsedMs } = await runWithAbort(
          PING_TIMEOUT_MS,
          `Gemini ${currentModel} ping`,
          (signal) => model.generateContent('reply with {"ok":1}', { signal }).then((r) => r)
        );
        const msg = `Gemini ping OK in ${(elapsedMs / 1000).toFixed(1)}s — network fine, suspect image upload/size`;
        console.log(`[Ping] gemini ${currentModel} ok in=${(elapsedMs / 1000).toFixed(1)}s`);
        setLastPing(msg);
        showToast(msg, 'success', 'Ping สำเร็จ');
      }
    } catch (err: any) {
      const msg = `Ping ล้มเหลว${elapsedOf(err)}: ${String(err?.message || err).slice(0, 160)}`;
      console.log(`[Ping] ${aiProvider} failed${elapsedOf(err)} err=${String(err?.message || err).slice(0, 160)}`);
      setLastPing(msg);
      showToast(msg, 'error', 'Ping ล้มเหลว — network หรือ server จริง');
    } finally {
      setPinging(false);
    }
  };

  // Raw GET ping: plain fetch, no SDK, no auth, no POST body.
  // Mirrors the PC-verified request — separates "app runtime can't reach host"
  // from "SDK/POST/auth problem".
  const pingRaw = async () => {
    if (pinging) return;
    setPinging(true);
    try {
      const targets = [
        { name: 'Google', url: `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey.trim()}&pageSize=1` },
        { name: 'Groq', url: 'https://api.groq.com/openai/v1/models' },
        { name: 'GoogleWeb', url: 'https://www.google.com/generate_204' },
        { name: 'Supabase', url: `${process.env.EXPO_PUBLIC_SUPABASE_URL || ''}/rest/v1/` },
      ];
      const lines: string[] = [];
      for (const t of targets) {
        try {
          const { elapsedMs } = await runWithAbort(
            PING_TIMEOUT_MS,
            `${t.name} raw`,
            (signal) => fetch(t.url, { method: 'GET', signal }).then(async (r) => {
              await r.text().catch(() => '');
              return r;
            })
          );
          const line = `${t.name} GET OK in ${(elapsedMs / 1000).toFixed(1)}s`;
          console.log(`[PingRaw] ${line}`);
          lines.push(line);
        } catch (e: any) {
          const line = `${t.name} GET failed${elapsedOf(e)}: ${String(e?.message || e).slice(0, 120)}`;
          console.log(`[PingRaw] ${line}`);
          lines.push(line);
        }
      }
      const msg = lines.join(' | ');
      setLastPing(msg);
      showToast(msg, lines.every((l) => l.includes('OK')) ? 'success' : 'error', 'Raw ping');
    } finally {
      setPinging(false);
    }
  };

  const handleSwitchToGroq = () => {
    setShow503Modal(false);
    if (!groqApiKey.trim()) {
      setAiProvider('groq');
      setActiveTab('settings');
      showToast('กรอก Groq API Key ฟรีก่อนใช้งาน (console.groq.com/keys)', 'info', 'ต้องระบุ Key');
      return;
    }
    setAiProvider('groq');
    const dataToUse = pendingBase64 || imageBase64;
    if (dataToUse) {
      analyzeMealWithGroq(dataToUse);
    } else {
      showToast(`สลับไปใช้ Groq (${GROQ_MODEL}) เรียบร้อย`, 'info', 'เปลี่ยน provider แล้ว');
    }
  };

  const handleSwitchToLowerModel = () => {
    setShow503Modal(false);
    // Route to the verified-working model first; only then fall back further.
    const lowerModel = currentModel !== MAIN_MODEL ? MAIN_MODEL : FALLBACK_MODEL;
    setAiProvider('gemini');
    setCurrentModel(lowerModel);
    setSwitchedToLowerModel(true);
    const dataToUse = pendingBase64 || imageBase64;
    if (dataToUse) {
      analyzeMealWithGemini(dataToUse, lowerModel, true);
    } else {
      showToast(`ตั้งค่าเป็น ${lowerModel} เรียบร้อย กรุณาเลือกรูปภาพ`, 'info', 'เปลี่ยนโมเดลแล้ว');
    }
  };

  const handleSwitchApiKey = () => {
    setShow503Modal(false);
    setActiveTab('settings');
  };

  const calculateMacroPercentages = (protein: number, carbs: number, fat: number) => {
    const p = Math.max(0, protein);
    const c = Math.max(0, carbs);
    const f = Math.max(0, fat);
    const total = p + c + f;
    if (total === 0) return { pPct: 33, cPct: 34, fPct: 33 };
    const pPct = Math.round((p / total) * 100);
    const cPct = Math.round((c / total) * 100);
    const fPct = Math.max(0, 100 - pPct - cPct);
    return { pPct, cPct, fPct };
  };

  // Tab Bar Sliding Capsule Width
  const effectiveBarWidth = navBarWidth > 0 ? navBarWidth : Math.min(contentWidth, 500);
  const computedTabWidth = Math.max(0, (effectiveBarWidth - 16) / 3);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C50} />

      {/* App Header */}
      <View style={[styles.header, { maxWidth: contentWidth }]}>
        {/* Tier 1: Brand Identity & Model Status Pill */}
        <View style={styles.headerTopRow}>
          <View style={styles.titleRow}>
            <View style={styles.logoBadge}>
              <FlameIcon size={16} color={C10_DARK} />
              <Text style={styles.logoBadgeText}>RMM</Text>
            </View>
            <Text style={[styles.title, isCompact && { fontSize: 18 }]}>RATE MY MEAL</Text>
          </View>

          {/* Model & Key Status Badge Button */}
          <TouchableOpacity
            style={styles.headerStatusPill}
            onPress={() => setActiveTab('settings')}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.headerStatusIndicator,
                {
                  backgroundColor: geminiApiKey
                    ? switchedToLowerModel
                      ? C10_ACCENT
                      : C10_DARK
                    : C10_ACCENT,
                },
              ]}
            />
            <Text style={styles.headerStatusText}>
              {geminiApiKey || groqApiKey
                ? aiProvider === 'groq'
                  ? 'Groq Qwen'
                  : currentModel.replace('gemini-', '').replace('-flash', ' Flash')
                : 'ตั้งค่า Key'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tier 2: Subtitle Banner */}
        <View style={styles.headerBottomRow}>
          <Text style={styles.subtitle} numberOfLines={1} adjustsFontSizeToFit>
            AI Roast & Macro Coach • เทรนเนอร์สายโหด
          </Text>
        </View>
      </View>

      {/* Main Body Content based on Active Tab */}
      <ScrollView
        contentContainerStyle={[styles.container, { maxWidth: contentWidth }]}
        bounces={true}
        showsVerticalScrollIndicator={false}
        refreshControl={
          activeTab === 'history' ? (
            <RefreshControl
              refreshing={refreshingHistory}
              onRefresh={fetchRecentMeals}
              tintColor={C10_DARK}
              colors={[C10_DARK]}
            />
          ) : undefined
        }
      >
        {/* TAB 1: SCAN FOOD */}
        {activeTab === 'scan' && (
          <View style={styles.tabContentWrapper}>
            {imageUri ? (
              <View style={styles.previewContainer}>
                <Image
                  source={{ uri: imageUri }}
                  style={[styles.previewImage, { height: imagePreviewHeight }]}
                  resizeMode="cover"
                />
                <View style={styles.actionBtnRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnCameraAction]}
                    onPress={() => pickImage(true)}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <CameraIcon size={15} color={C50} />
                    <Text style={styles.btnCameraActionText}>ถ่ายใหม่</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnSecondary]}
                    onPress={() => pickImage(false)}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <GalleryIcon size={15} color={C10_DARK} />
                    <Text style={styles.btnSecondaryText}>คลังภาพ</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnSecondary]}
                    onPress={() => {
                      if (imageBase64) analyzeMeal(imageBase64, currentModel);
                    }}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <RefreshIcon size={15} color={C10_DARK} />
                    <Text style={styles.btnSecondaryText}>สแกนซ้ำ</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.heroDropZone}>
                <View style={styles.scannerGraphicBox}>
                  <View style={styles.scannerCornerTopLeft} />
                  <View style={styles.scannerCornerTopRight} />
                  <View style={styles.scannerCornerBottomLeft} />
                  <View style={styles.scannerCornerBottomRight} />
                  <CameraIcon size={26} color={C10_DARK} />
                  <Text style={styles.scannerGraphicText}>MEAL SCAN</Text>
                </View>

                <Text style={[styles.heroTitle, isCompact && { fontSize: 17 }]}>
                  ให้ AI วิเคราะห์มื้อนี้ & รับฟังคำด่า
                </Text>
                <Text style={styles.heroSubtitle}>
                  ถ่ายรูปจานข้าวของคุณแบบชัดๆ ให้เทรนเนอร์ตรวจเช็กแคลอรี่และสารอาหาร
                </Text>

                {/* Big Shutter Button */}
                <TouchableOpacity
                  style={[styles.heroShutterBtn, isCompact && { paddingVertical: 14 }]}
                  onPress={() => pickImage(true)}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <CameraIcon size={20} color={C50} />
                  <Text style={styles.heroShutterText}>เปิดกล้องถ่ายรูปจานนี้</Text>
                </TouchableOpacity>

                {/* Secondary Gallery Button */}
                <TouchableOpacity
                  style={styles.heroGalleryBtn}
                  onPress={() => pickImage(false)}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <GalleryIcon size={18} color={C10_DARK} />
                  <Text style={styles.heroGalleryText}>เลือกจากคลังภาพ</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Loading / AI Analyzing State */}
            {loading && (
              <Animated.View
                style={[
                  styles.loadingCard,
                  {
                    transform: [{ scale: pulseAnim }],
                  },
                ]}
              >
                <View style={styles.loadingSpinnerWrapper}>
                  <ActivityIndicator size="large" color={C10_DARK} />
                </View>
                <Text style={styles.loadingStepTitle}>เทรนเนอร์กำลังตรวจสอบ</Text>
                <Text style={styles.loadingStepSub}>{loadingStep}</Text>

                <View style={styles.stepDotsRow}>
                  <View style={[styles.stepDot, styles.stepDotActive]} />
                  <View
                    style={[
                      styles.stepDot,
                      loadingStep.includes('คำนวณ') && styles.stepDotActive,
                    ]}
                  />
                  <View style={styles.stepDot} />
                </View>
              </Animated.View>
            )}

            {/* AI Roast Result Hero Card */}
            {mealData && !loading && (
              <View style={styles.resultCard}>
                {resultModel && (
                  <View style={styles.modelInfoCard}>
                    <View style={styles.modelInfoBadge}>
                      <CpuIcon size={13} color={C50} />
                      <Text style={styles.modelInfoBadgeText}>
                        {switchedToLowerModel ||
                        resultModel.includes(FALLBACK_MODEL) ||
                        resultModel.includes(LEGACY_MODEL) ||
                        resultModel.includes('groq')
                          ? 'FALLBACK'
                          : 'AI'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modelInfoLabel}>
                        {switchedToLowerModel ||
                        resultModel.includes(FALLBACK_MODEL) ||
                        resultModel.includes(LEGACY_MODEL) ||
                        resultModel.includes('groq')
                          ? 'Traffic Fallback (รุ่นสำรองประมวลผลไว):'
                          : 'ผลลัพธ์นี้วิเคราะห์โดย AI โมเดล:'}
                      </Text>
                      <Text style={styles.modelInfoValue}>{resultModel}</Text>
                    </View>
                  </View>
                )}

                {/* Dish Identity & Health Score Meter */}
                <View style={styles.resultHeader}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={styles.dishBadgeRow}>
                      <PlateIcon size={14} color={C10_DARK} />
                      <Text style={styles.dishBadge}>เมนูที่ระบุได้</Text>
                    </View>
                    <Text style={[styles.dishName, isCompact && { fontSize: 20 }]}>
                      {mealData.dish_name}
                    </Text>
                  </View>

                  <View style={styles.scoreBadge}>
                    <Text style={styles.scoreNumber}>{mealData.health_score}</Text>
                    <Text style={styles.scoreMax}>/10 คะแนน</Text>
                  </View>
                </View>

                {/* Calories Mega Banner */}
                <View style={styles.caloriesBanner}>
                  <View style={styles.caloriesHeaderRow}>
                    <FlameIcon size={14} color={C10_ACCENT} />
                    <Text style={styles.caloriesLabel}>พลังงานทั้งหมดโดยประมาณ</Text>
                  </View>
                  <View style={styles.caloriesRow}>
                    <Text style={[styles.caloriesValue, isCompact && { fontSize: 36 }]}>
                      {mealData.calories}
                    </Text>
                    <Text style={styles.caloriesUnit}>KCAL</Text>
                  </View>
                </View>

                {/* Dynamic Visual Macro Ratio Bar */}
                {(() => {
                  const { pPct, cPct, fPct } = calculateMacroPercentages(
                    mealData.protein,
                    mealData.carbs,
                    mealData.fat
                  );
                  return (
                    <View style={styles.macroRatioSection}>
                      <View style={styles.macroRatioHeader}>
                        <Text style={styles.macroRatioTitle}>สัดส่วนสารอาหาร (Macro Ratio)</Text>
                        <Text style={styles.macroRatioTotal}>
                          รวม {Math.round(mealData.protein + mealData.carbs + mealData.fat)}g
                        </Text>
                      </View>

                      <View style={styles.macroRatioBarContainer}>
                        <View
                          style={[
                            styles.macroRatioSegment,
                            { flex: pPct, backgroundColor: C10_DARK },
                          ]}
                        />
                        <View
                          style={[
                            styles.macroRatioSegment,
                            { flex: cPct, backgroundColor: C10_ACCENT },
                          ]}
                        />
                        <View
                          style={[
                            styles.macroRatioSegment,
                            { flex: fPct, backgroundColor: C30 },
                          ]}
                        />
                      </View>

                      <View style={styles.macroRatioPercentRow}>
                        <Text style={[styles.macroRatioPercentText, { color: C10_DARK }]}>
                          โปรตีน {pPct}%
                        </Text>
                        <Text style={[styles.macroRatioPercentText, { color: C10_ACCENT }]}>
                          คาร์บ {cPct}%
                        </Text>
                        <Text style={[styles.macroRatioPercentText, { color: C10_DARK }]}>
                          ไขมัน {fPct}%
                        </Text>
                      </View>
                    </View>
                  );
                })()}

                {/* Macro Nutrients Grid */}
                <View style={styles.macrosContainer}>
                  <View style={[styles.macroItem, { borderLeftColor: C10_DARK }]}>
                    <View style={styles.macroTitleRow}>
                      <ProteinIcon size={13} color={C10_DARK} />
                      <Text style={styles.macroTitle}>โปรตีน (P)</Text>
                    </View>
                    <Text style={[styles.macroValue, { color: C10_DARK }]}>
                      {mealData.protein} <Text style={styles.unitText}>g</Text>
                    </Text>
                  </View>

                  <View style={[styles.macroItem, { borderLeftColor: C10_ACCENT }]}>
                    <View style={styles.macroTitleRow}>
                      <CarbsIcon size={13} color={C10_ACCENT} />
                      <Text style={styles.macroTitle}>คาร์บ (C)</Text>
                    </View>
                    <Text style={[styles.macroValue, { color: C10_ACCENT }]}>
                      {mealData.carbs} <Text style={styles.unitText}>g</Text>
                    </Text>
                  </View>

                  <View style={[styles.macroItem, { borderLeftColor: C10_DARK }]}>
                    <View style={styles.macroTitleRow}>
                      <FatIcon size={13} color={C10_DARK} />
                      <Text style={styles.macroTitle}>ไขมัน (F)</Text>
                    </View>
                    <Text style={[styles.macroValue, { color: C10_DARK }]}>
                      {mealData.fat} <Text style={styles.unitText}>g</Text>
                    </Text>
                  </View>
                </View>

                {/* Trainer Roast Speech Bubble Section */}
                <View style={styles.roastSection}>
                  <View style={styles.roastHeader}>
                    <View style={styles.roastAvatarBadge}>
                      <CoachIcon size={15} color={C50} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.roastAuthor}>คำบ่นจากเทรนเนอร์สายโหด:</Text>
                      <Text style={styles.roastAuthorSub}>ประเมินความฟิตของจานนี้ (AI Coach)</Text>
                    </View>
                    {/* AIGC In-app Report Button */}
                    <TouchableOpacity
                      style={styles.roastReportBtn}
                      onPress={() => handleReportRoast(mealData.roast_comment)}
                      activeOpacity={0.7}
                    >
                      <AlertIcon size={11} color={C10_ACCENT} />
                      <Text style={styles.roastReportText}>รายงาน</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.roastBubble}>
                    <View style={styles.speechBubblePointer} />
                    <Text style={[styles.roastComment, isCompact && { fontSize: 14 }]}>
                      "{mealData.roast_comment}"
                    </Text>
                  </View>
                </View>

                {/* Health & AI Medical Disclaimer */}
                <View style={styles.disclaimerBox}>
                  <InfoIcon size={13} color={C10_DARK} />
                  <Text style={styles.disclaimerText}>
                    ข้อจำกัดความรับผิดชอบ: ข้อมูลโภชนาการและคำแนะนำวิเคราะห์โดย AI เพื่อการประเมินเบื้องต้น ไม่ใช่คำแนะนำทางการแพทย์หรือนักกำหนดอาหารวิชาชีพ
                  </Text>
                </View>

                {/* Local Storage & Personal Cloud Sync Status Indicator */}
                <View style={styles.syncRow}>
                  {supabaseClientInstance ? (
                    <CloudIcon size={14} color={syncStatus === 'synced' ? C10_DARK : C10_ACCENT} />
                  ) : (
                    <SaveIcon size={14} color={C10_DARK} />
                  )}
                  {syncStatus === 'syncing' && (
                    <Text style={styles.syncSyncing}>
                      {supabaseClientInstance
                        ? 'กำลังบันทึกลงเครื่อง & ซิงค์ขึ้น Supabase ส่วนตัว...'
                        : 'กำลังบันทึกข้อมูลลงเครื่อง...'}
                    </Text>
                  )}
                  {syncStatus === 'synced' && (
                    <Text style={styles.syncSuccess}>
                      {supabaseClientInstance
                        ? 'ซิงค์เข้า Supabase ส่วนตัวเรียบร้อย (Cloud Backup)'
                        : 'บันทึกลงประวัติส่วนตัวบนเครื่องเรียบร้อย (Local Storage)'}
                    </Text>
                  )}
                  {syncStatus === 'error' && (
                    <Text style={styles.syncError}>
                      {supabaseClientInstance
                        ? 'บันทึกลงเครื่องแล้ว แต่ซิงค์ขึ้น Supabase ไม่สำเร็จ'
                        : 'บันทึกข้อมูลลงเครื่องไม่สำเร็จ'}
                    </Text>
                  )}
                </View>

                {/* Mega CTA Button: Next Meal Scan */}
                <TouchableOpacity
                  style={styles.nextMealBtn}
                  onPress={() => pickImage(true)}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <View style={styles.nextMealBtnIconBadge}>
                    <CameraIcon size={20} color={C50} />
                  </View>
                  <View style={styles.nextMealBtnContent}>
                    <Text style={styles.nextMealBtnTitle}>ถ่ายรูปมื้อถัดไป</Text>
                    <Text style={styles.nextMealBtnSubtitle}>เตรียมมื้อต่อไปให้เทรนเนอร์ตรวจ</Text>
                  </View>
                  <ChevronIcon size={16} color={C50} direction="right" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* TAB 2: MEAL HISTORY LOG */}
        {activeTab === 'history' && (
          <View style={styles.tabContentWrapper}>
            <View style={styles.historyHeaderBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionHeading}>ประวัติมื้อที่เคยบันทึก</Text>
                <Text style={styles.sectionSubHeading}>
                  {recentMeals.length} มื้อล่าสุด {supabaseClientInstance ? '• ซิงค์คลาวด์แล้ว ☁️' : '• บันทึกในเครื่อง'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {recentMeals.length > 0 && (
                  <TouchableOpacity
                    style={[styles.refreshIconBtn, { backgroundColor: '#FAD28C' }]}
                    onPress={clearLocalMeals}
                    activeOpacity={0.7}
                  >
                    <CloseIcon size={12} color={C10_DARK} />
                    <Text style={styles.refreshIconText}>ล้างประวัติ</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.refreshIconBtn}
                  onPress={() => fetchRecentMeals()}
                  disabled={refreshingHistory}
                  activeOpacity={0.7}
                >
                  <RefreshIcon size={14} color={C10_DARK} />
                  <Text style={styles.refreshIconText}>รีเฟรช</Text>
                </TouchableOpacity>
              </View>
            </View>

            {recentMeals.length === 0 ? (
              <View style={styles.emptyHistoryBox}>
                <View style={styles.emptyGraphicCircle}>
                  <PlateIcon size={28} color={C10_DARK} />
                </View>
                <Text style={styles.emptyHistoryTitle}>ยังไม่มีประวัติมื้ออาหาร</Text>
                <Text style={styles.emptyHistorySub}>
                  ถ่ายภาพมื้อแรกของคุณเพื่อให้เทรนเนอร์เริ่มบันทึกและ Roast มื้ออาหาร
                </Text>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnPrimary, { marginTop: 16 }]}
                  onPress={() => setActiveTab('scan')}
                >
                  <CameraIcon size={16} color={C50} />
                  <Text style={styles.btnPrimaryText}>ไปที่หน้าสแกนอาหาร</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.historyList}>
                {recentMeals.map((item, index) => {
                  const itemId = item.id || `meal-${index}`;
                  const isExpanded = expandedRoastId === itemId;
                  const dateStr = item.created_at
                    ? new Date(item.created_at).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'เมื่อสักครู่';

                  return (
                    <TouchableOpacity
                      key={itemId}
                      style={styles.historyCard}
                      onPress={() => setExpandedRoastId(isExpanded ? null : itemId)}
                      activeOpacity={0.85}
                    >
                      {/* Top Row: Dish Name + Score Badge */}
                      <View style={styles.historyCardTop}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.historyDishTitle}>{item.dish_name}</Text>
                          <View style={styles.historyDateRow}>
                            <HistoryIcon size={12} color={C10_ACCENT} />
                            <Text style={styles.historyDateText}>{dateStr}</Text>
                          </View>
                        </View>

                        <View style={styles.historyScoreBadge}>
                          <Text style={styles.historyScoreNumber}>{item.health_score}</Text>
                          <Text style={styles.historyScoreSub}>/10</Text>
                        </View>
                      </View>

                      {/* Middle Row: Calories & Macro chips */}
                      <View style={styles.historyStatsRow}>
                        <View style={styles.historyCalChip}>
                          <FlameIcon size={14} color={C10_ACCENT} />
                          <Text style={styles.historyCalNumber}>{item.calories}</Text>
                          <Text style={styles.historyCalLabel}>KCAL</Text>
                        </View>

                        <View style={styles.historyMacroPills}>
                          <Text style={[styles.macroPill, { color: C10_DARK }]}>
                            P: {item.protein}g
                          </Text>
                          <Text style={[styles.macroPill, { color: C10_ACCENT }]}>
                            C: {item.carbs}g
                          </Text>
                          <Text style={[styles.macroPill, { color: C10_DARK }]}>
                            F: {item.fat}g
                          </Text>
                        </View>
                      </View>

                      {/* Bottom Row: Roast comment */}
                      <View style={styles.historyRoastBubble}>
                        <Text
                          style={styles.historyRoastText}
                          numberOfLines={isExpanded ? undefined : 2}
                        >
                          "{item.roast_comment}"
                        </Text>
                        <View style={styles.historyExpandHintRow}>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              handleReportRoast(item.roast_comment);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                          >
                            <AlertIcon size={10} color={C10_ACCENT} />
                            <Text style={[styles.historyExpandHint, { color: C10_ACCENT }]}>รายงาน</Text>
                          </TouchableOpacity>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Text style={styles.historyExpandHint}>
                              {isExpanded ? 'แตะเพื่อย่อ' : 'แตะเพื่ออ่านเต็ม'}
                            </Text>
                            <ChevronIcon
                              size={10}
                              color={C10_ACCENT}
                              direction={isExpanded ? 'up' : 'down'}
                            />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* TAB 3: SETTINGS & MODEL AI */}
        {activeTab === 'settings' && (
          <View style={styles.tabContentWrapper}>
            <View style={styles.settingsHeader}>
              <Text style={styles.sectionHeading}>ตั้งค่า AI & โมเดลประมวลผล</Text>
              <Text style={styles.sectionSubHeading}>
                กำหนดค่า Gemini API Key และจัดการระบบสำรองฉุกเฉิน
              </Text>
            </View>

            {/* API Key Configuration Card */}
            <View style={styles.settingsCard}>
              <View style={styles.settingsCardHeader}>
                <View style={styles.settingsCardTitleRow}>
                  <KeyIcon size={16} color={C10_DARK} />
                  <Text style={styles.settingsCardTitle}>Gemini API Key</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={[
                      styles.cloudStatusBadge,
                      geminiApiKey.trim() ? styles.cloudStatusConnected : styles.cloudStatusError,
                    ]}
                  >
                    <Text style={styles.cloudStatusBadgeText}>
                      {geminiApiKey.trim() ? '● มี Key แล้ว' : '○ ต้องระบุ Key'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.showKeyToggleBtn}
                    onPress={() => setShowApiKeyText(!showApiKeyText)}
                    activeOpacity={0.7}
                  >
                    <EyeIcon size={15} color={C10_DARK} closed={!showApiKeyText} />
                    <Text style={styles.showKeyToggleText}>
                      {showApiKeyText ? 'ซ่อน' : 'แสดง'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TextInput
                style={styles.settingsInput}
                value={geminiApiKey}
                onChangeText={(text) => {
                  setGeminiApiKey(text);
                  AsyncStorage.setItem(STORAGE_GEMINI_KEY, text).catch(() => {});
                }}
                placeholder="ระบุ Gemini API Key (AIzaSy...)"
                placeholderTextColor={C10_ACCENT}
                secureTextEntry={!showApiKeyText}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.settingsInputHint}>
                สร้าง Key ฟรี ไม่ต้องผูกบัตรได้ที่ Google AI Studio
              </Text>
              <TouchableOpacity
                style={[styles.guideStepBtn, { backgroundColor: C30, marginTop: 8 }]}
                onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}
                activeOpacity={0.8}
              >
                <KeyIcon size={14} color={C10_DARK} />
                <Text style={styles.guideStepBtnText}>รับ Gemini API Key ฟรีที่ Google AI Studio ↗</Text>
              </TouchableOpacity>
            </View>

            {/* Groq API Key Card (free alternative) */}
            <View style={styles.settingsCard}>
              <View style={styles.settingsCardHeader}>
                <View style={styles.settingsCardTitleRow}>
                  <KeyIcon size={16} color={C10_DARK} />
                  <Text style={styles.settingsCardTitle}>Groq API Key (สำรองฟรี)</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={[
                      styles.cloudStatusBadge,
                      groqApiKey.trim() ? styles.cloudStatusConnected : styles.cloudStatusOffline,
                    ]}
                  >
                    <Text style={styles.cloudStatusBadgeText}>
                      {groqApiKey.trim() ? '● มี Key แล้ว' : '○ ยังไม่มี Key'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.showKeyToggleBtn}
                    onPress={() => setShowGroqKeyText(!showGroqKeyText)}
                    activeOpacity={0.7}
                  >
                    <EyeIcon size={15} color={C10_DARK} closed={!showGroqKeyText} />
                    <Text style={styles.showKeyToggleText}>
                      {showGroqKeyText ? 'ซ่อน' : 'แสดง'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TextInput
                style={styles.settingsInput}
                value={groqApiKey}
                onChangeText={(text) => {
                  setGroqApiKey(text);
                  AsyncStorage.setItem(STORAGE_GROQ_KEY, text).catch(() => {});
                }}
                placeholder="ระบุ Groq API Key (gsk_...)"
                placeholderTextColor={C10_ACCENT}
                secureTextEntry={!showGroqKeyText}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.settingsInputHint}>
                ฟรี ไม่ต้องผูกบัตร — ขอได้ที่ console.groq.com/keys (30 req/min, 1,000 req/day)
              </Text>
              <TouchableOpacity
                style={[styles.guideStepBtn, { backgroundColor: C30, marginTop: 8 }]}
                onPress={() => Linking.openURL('https://console.groq.com/keys')}
                activeOpacity={0.8}
              >
                <KeyIcon size={14} color={C10_DARK} />
                <Text style={styles.guideStepBtnText}>รับ Groq API Key ฟรีที่ console.groq.com ↗</Text>
              </TouchableOpacity>
            </View>

            {/* Provider Selection Card */}
            <View style={styles.settingsCard}>
              <View style={styles.settingsCardTitleRow}>
                <CpuIcon size={16} color={C10_DARK} />
                <Text style={styles.settingsCardTitle}>ผู้ให้บริการ AI (Provider)</Text>
              </View>
              <Text style={styles.settingsCardSub}>
                เลือก Gemini (หลัก) หรือ Groq Qwen สำรองฟรีเมื่อ Gemini 503 overload
              </Text>

              <View style={styles.modelOptionsContainer}>
                <TouchableOpacity
                  style={[
                    styles.modelOptionCard,
                    aiProvider === 'gemini' && styles.modelOptionCardActive,
                  ]}
                  onPress={() => {
                    setAiProvider('gemini');
                    showToast(`ใช้ Gemini (${currentModel})`, 'info');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.modelOptionTop}>
                    <View style={styles.modelIndicatorPill}>
                      <Text style={styles.modelIndicatorText}>GEMINI</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modelOptionName}>Google Gemini</Text>
                      <Text style={styles.modelOptionTagPrimary}>หลัก — คุณภาพ Roast ดีสุด</Text>
                    </View>
                    {aiProvider === 'gemini' && (
                      <View style={styles.activeCheckCircle}>
                        <CheckIcon size={12} color={C50} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.modelOptionDesc}>
                    ช่วงนี้รุ่น stable อาจ 503 — ถ้าติดให้สลับไป Groq ชั่วคราว
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modelOptionCard,
                    aiProvider === 'groq' && styles.modelOptionCardActive,
                  ]}
                  onPress={() => {
                    setAiProvider('groq');
                    showToast(`ใช้ Groq (${GROQ_MODEL}) — เร็ว ฟรี`, 'info');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.modelOptionTop}>
                    <View style={styles.modelIndicatorPill}>
                      <Text style={styles.modelIndicatorText}>GROQ</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modelOptionName}>Groq Qwen 3.8 27B</Text>
                      <Text style={styles.modelOptionTagSecondary}>สำรองฟรี — เร็ว ไม่ 503</Text>
                    </View>
                    {aiProvider === 'groq' && (
                      <View style={styles.activeCheckCircle}>
                        <CheckIcon size={12} color={C50} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.modelOptionDesc}>
                    {`Vision + JSON mode ผ่าน ${GROQ_MODEL} ต้องมี Groq Key (gsk_...)`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Model Selection Card (Gemini only) */}
            <View style={styles.settingsCard}>
              <View style={styles.settingsCardTitleRow}>
                <CpuIcon size={16} color={C10_DARK} />
                <Text style={styles.settingsCardTitle}>โมเดล AI ที่ต้องการใช้งาน</Text>
              </View>
              <Text style={styles.settingsCardSub}>
                เลือกโมเดลสำหรับการตรวจจับรูปภาพอาหารและสร้างคำบ่น Roast
              </Text>

              <View style={styles.modelOptionsContainer}>
                {/* Model 1: 3-flash-preview (verified working Oct 2026) */}
                <TouchableOpacity
                  style={[
                    styles.modelOptionCard,
                    currentModel === MAIN_MODEL && styles.modelOptionCardActive,
                  ]}
                  onPress={() => {
                    setCurrentModel(MAIN_MODEL);
                    setSwitchedToLowerModel(false);
                    showToast(`สลับใช้โมเดลหลัก: ${MAIN_MODEL}`, 'info');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.modelOptionTop}>
                    <View style={styles.modelIndicatorPill}>
                      <Text style={styles.modelIndicatorText}>MAIN</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modelOptionName}>Gemini 3 Flash Preview</Text>
                      <Text style={styles.modelOptionTagPrimary}>โมเดลหลัก (แนะนำ — ใช้งานได้จริง)</Text>
                    </View>
                    {currentModel === MAIN_MODEL && (
                      <View style={styles.activeCheckCircle}>
                        <CheckIcon size={12} color={C50} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.modelOptionDesc}>
                    โมเดลหลักที่ทดสอบแล้วว่าตอบสนองปกติช่วงที่รุ่น stable 503 overload
                  </Text>
                </TouchableOpacity>

                {/* Model 2: 3.8 Flash (legacy, currently 503) */}
                <TouchableOpacity
                  style={[
                    styles.modelOptionCard,
                    currentModel === LEGACY_MODEL && styles.modelOptionCardActive,
                  ]}
                  onPress={() => {
                    setCurrentModel(LEGACY_MODEL);
                    setSwitchedToLowerModel(true);
                    showToast(`สลับใช้โมเดล: ${LEGACY_MODEL} (อาจติด 503)`, 'info');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.modelOptionTop}>
                    <View style={styles.modelIndicatorPill}>
                      <Text style={styles.modelIndicatorText}>LEGACY</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modelOptionName}>Gemini 3.8 Flash</Text>
                      <Text style={styles.modelOptionTagSecondary}>โมเดลเดิม (ช่วงนี้ 503 บ่อย)</Text>
                    </View>
                    {currentModel === LEGACY_MODEL && (
                      <View style={styles.activeCheckCircle}>
                        <CheckIcon size={12} color={C50} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.modelOptionDesc}>
                    วิเคราะห์ละเอียด แต่ช่วง Oct 2026 เซิร์ฟเวอร์มักตอบ 503 high demand
                  </Text>
                </TouchableOpacity>

                {/* Model 3: 3.6 Flash */}
                <TouchableOpacity
                  style={[
                    styles.modelOptionCard,
                    currentModel === FALLBACK_MODEL && styles.modelOptionCardActive,
                  ]}
                  onPress={() => {
                    setCurrentModel(FALLBACK_MODEL);
                    setSwitchedToLowerModel(true);
                    showToast(`สลับใช้โมเดลสำรอง: ${FALLBACK_MODEL}`, 'info');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.modelOptionTop}>
                    <View style={styles.modelIndicatorPill}>
                      <Text style={styles.modelIndicatorText}>FAST</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modelOptionName}>Gemini 3.6 Flash</Text>
                      <Text style={styles.modelOptionTagSecondary}>โมเดลสำรอง (Traffic Fast)</Text>
                    </View>
                    {currentModel === FALLBACK_MODEL && (
                      <View style={styles.activeCheckCircle}>
                        <CheckIcon size={12} color={C50} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.modelOptionDesc}>
                    ประมวลผลฉับไว โควตาสูง สำหรับใช้งานเวลาโมเดลหลักหนาแน่น (Error 503)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Error 503 Traffic Simulator Card */}
            <View style={styles.settingsCard}>
              <View style={styles.settingsCardTitleRow}>
                <FlaskIcon size={16} color={C10_DARK} />
                <Text style={styles.settingsCardTitle}>ทดสอบระบบความทนทาน (Resilience)</Text>
              </View>
              <Text style={styles.settingsCardSub}>
                ทดสอบจำลองเหตุการณ์ Error 503 เพื่อตรวจดูขั้นตอนการสลับโมเดลอัตโนมัติ
              </Text>

              <TouchableOpacity
                style={styles.simulate503Btn}
                onPress={() => setShow503Modal(true)}
                activeOpacity={0.75}
              >
                <FlaskIcon size={15} color={C10_DARK} />
                <Text style={styles.simulate503Text}>
                  จำลองสถานการณ์เซิร์ฟเวอร์เต็ม (Error 503 Simulator)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.simulate503Btn, { marginTop: 10 }]}
                onPress={pingProvider}
                disabled={pinging}
                activeOpacity={0.75}
              >
                <CpuIcon size={15} color={C10_DARK} />
                <Text style={styles.simulate503Text}>
                  {pinging
                    ? 'กำลังปิง...'
                    : `ปิง ${aiProvider === 'groq' ? `Groq (${GROQ_MODEL})` : `Gemini (${currentModel})`} แบบ text-only`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.simulate503Btn, { marginTop: 10 }]}
                onPress={pingRaw}
                disabled={pinging}
                activeOpacity={0.75}
              >
                <CloudIcon size={15} color={C10_DARK} />
                <Text style={styles.simulate503Text}>
                  {pinging ? 'กำลังปิง...' : 'ปิงแบบ GET ธรรมดา (ไม่ใช้ SDK)'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.settingsInputHint}>
                ปิงส่งข้อความ ~50 bytes ไม่ส่งรูป — ถ้าปิงผ่านแต่สแกนรูป timeout แปลว่าเป็นที่ขนาดรูป/upload ไม่ใช่เน็ตช้า
              </Text>
              {lastPing && (
                <Text style={[styles.settingsInputHint, { marginTop: 6 }]}>{lastPing}</Text>
              )}
            </View>

            {/* Personal Supabase Cloud Database Configuration Card */}
            <View style={styles.settingsCard}>
              <View style={styles.settingsCardHeader}>
                <View style={styles.settingsCardTitleRow}>
                  <CloudIcon size={16} color={C10_DARK} />
                  <Text style={styles.settingsCardTitle}>Supabase ส่วนตัว (Cloud Backup)</Text>
                </View>
                <View
                  style={[
                    styles.cloudStatusBadge,
                    supabaseStatus === 'connected'
                      ? styles.cloudStatusConnected
                      : supabaseStatus === 'error'
                      ? styles.cloudStatusError
                      : styles.cloudStatusOffline,
                  ]}
                >
                  <Text style={styles.cloudStatusBadgeText}>
                    {supabaseStatus === 'connected'
                      ? '● เชื่อมต่อแล้ว'
                      : supabaseStatus === 'error'
                      ? '● ติดปัญหา'
                      : '○ บันทึกในเครื่อง'}
                  </Text>
                </View>
              </View>

              <Text style={styles.settingsCardSub}>
                เชื่อมต่อ Supabase ฟรีของคุณเพื่อสำรองข้อมูลประวัติอาหารอัตโนมัติ ข้อมูลไม่หาย เปลี่ยนเครื่องก็ดึงกลับมาได้ตลอดเวลา
              </Text>

              {/* 3-Step Guide Open Button */}
              <TouchableOpacity
                style={[styles.simulate503Btn, { backgroundColor: '#FAD28C', marginBottom: 12 }]}
                onPress={() => setShowSupabaseGuideModal(true)}
                activeOpacity={0.75}
              >
                <InfoIcon size={15} color={C10_DARK} />
                <Text style={[styles.simulate503Text, { fontWeight: '800' }]}>
                  📖 วิธีสร้าง Supabase ฟรีของตัวเอง (3 ขั้นตอนง่ายๆ) ↗
                </Text>
              </TouchableOpacity>

              {/* Supabase URL Input */}
              <Text style={styles.settingsInputLabel}>Supabase Project URL</Text>
              <TextInput
                style={styles.settingsInput}
                value={supabaseUrl}
                onChangeText={(text) => {
                  setSupabaseUrl(text);
                  setSupabaseStatus('not_configured');
                }}
                placeholder="https://xxxxxxxxxxxx.supabase.co"
                placeholderTextColor={C10_ACCENT}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Supabase Anon Key Input with Eye Toggle */}
              <View style={[styles.settingsCardHeader, { marginTop: 8 }]}>
                <Text style={styles.settingsInputLabel}>Supabase Anon / Public Key</Text>
                <TouchableOpacity
                  style={styles.showKeyToggleBtn}
                  onPress={() => setShowSupabaseKeyText(!showSupabaseKeyText)}
                  activeOpacity={0.7}
                >
                  <EyeIcon size={14} color={C10_DARK} closed={!showSupabaseKeyText} />
                  <Text style={styles.showKeyToggleText}>
                    {showSupabaseKeyText ? 'ซ่อน' : 'แสดง'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.settingsInput}
                value={supabaseAnonKey}
                onChangeText={(text) => {
                  setSupabaseAnonKey(text);
                  setSupabaseStatus('not_configured');
                }}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                placeholderTextColor={C10_ACCENT}
                secureTextEntry={!showSupabaseKeyText}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Action Buttons: Test Connection & Cloud Backup */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnPrimary, { flex: 1, paddingVertical: 10 }]}
                  onPress={testSupabaseConnection}
                  disabled={testingSupabase}
                  activeOpacity={0.8}
                >
                  {testingSupabase ? (
                    <ActivityIndicator size="small" color={C50} />
                  ) : (
                    <>
                      <CpuIcon size={14} color={C50} />
                      <Text style={styles.btnPrimaryText}>ทดสอบการเชื่อมต่อ</Text>
                    </>
                  )}
                </TouchableOpacity>

                {supabaseClientInstance && recentMeals.length > 0 && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnSecondary, { flex: 1, paddingVertical: 10 }]}
                    onPress={() => uploadLocalMealsToCloud(supabaseClientInstance, recentMeals)}
                    activeOpacity={0.8}
                  >
                    <CloudIcon size={14} color={C10_DARK} />
                    <Text style={styles.btnSecondaryText}>สำรอง {recentMeals.length} มื้อ</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Local Storage & Privacy Policy Card */}
            <View style={styles.settingsCard}>
              <View style={styles.settingsCardTitleRow}>
                <SaveIcon size={16} color={C10_DARK} />
                <Text style={styles.settingsCardTitle}>ข้อมูลส่วนบุคคล & ความเป็นส่วนตัว</Text>
              </View>
              <Text style={styles.settingsCardSub}>
                ประวัติมื้ออาหารทั้งหมดถูกจัดเก็บอยู่บนเครื่องของคุณเท่านั้น (Local Storage) ไม่มีการส่งข้อมูลประวัติออกนอกเครื่อง
              </Text>
              <View style={styles.supabaseStatusRow}>
                <View style={styles.supabaseDotOnline} />
                <Text style={styles.supabaseStatusText}>
                  สถานะ: Local Storage บนเครื่อง (100% Privacy)
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.simulate503Btn, { flex: 1 }]}
                  onPress={() => setShowPrivacyModal(true)}
                  activeOpacity={0.75}
                >
                  <InfoIcon size={14} color={C10_DARK} />
                  <Text style={styles.simulate503Text}>นโยบายความเป็นส่วนตัว</Text>
                </TouchableOpacity>
                {recentMeals.length > 0 && (
                  <TouchableOpacity
                    style={[styles.simulate503Btn, { flex: 1, backgroundColor: '#FAD28C' }]}
                    onPress={clearLocalMeals}
                    activeOpacity={0.75}
                  >
                    <CloseIcon size={14} color={C10_DARK} />
                    <Text style={styles.simulate503Text}>ล้างประวัติทั้งหมด</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.actionBtn, styles.btnPrimary, { marginTop: 8 }]}
              onPress={() => {
                showToast('บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success', 'ตั้งค่าสำเร็จ');
                const dataToUse = pendingBase64 || imageBase64;
                if (dataToUse) {
                  showConfirmDialog({
                    title: 'ต้องการวิเคราะห์รูปภาพทันที?',
                    message:
                      'คุณมีรูปภาพอาหารค้างอยู่ ต้องการส่งให้ AI วิเคราะห์ด้วยการตั้งค่าใหม่นี้ทันทีหรือไม่?',
                    confirmText: 'วิเคราะห์ทันที',
                    cancelText: 'ภายหลัง',
                    onConfirm: () => {
                      setActiveTab('scan');
                      analyzeMeal(dataToUse, currentModel);
                    },
                  });
                }
              }}
              activeOpacity={0.85}
            >
              <SaveIcon size={18} color={C50} />
              <Text style={styles.btnPrimaryText}>บันทึกการตั้งค่า</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* BOTTOM SEGMENTED TAB BAR */}
      <View style={styles.bottomNavContainer}>
        <View
          style={[styles.bottomNavBar, { maxWidth: contentWidth }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - navBarWidth) > 1) {
              setNavBarWidth(w);
            }
          }}
        >
          {/* Animated Sliding Capsule Pill */}
          {computedTabWidth > 0 && (
            <Animated.View
              style={[
                styles.navSlidingPill,
                {
                  width: computedTabWidth,
                  transform: [
                    {
                      translateX: tabAnimValue.interpolate({
                        inputRange: [0, 1, 2],
                        outputRange: [0, computedTabWidth, computedTabWidth * 2],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}

          <TouchableOpacity
            style={styles.navTabItem}
            onPress={() => setActiveTab('scan')}
            activeOpacity={0.7}
          >
            <CameraIcon size={18} color={activeTab === 'scan' ? C10_DARK : C10_ACCENT} />
            <Text style={[styles.navTabText, activeTab === 'scan' && styles.navTabTextActive]}>
              สแกนอาหาร
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTabItem}
            onPress={() => setActiveTab('history')}
            activeOpacity={0.7}
          >
            <HistoryIcon size={18} color={activeTab === 'history' ? C10_DARK : C10_ACCENT} />
            <Text style={[styles.navTabText, activeTab === 'history' && styles.navTabTextActive]}>
              ประวัติ ({recentMeals.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTabItem}
            onPress={() => setActiveTab('settings')}
            activeOpacity={0.7}
          >
            <SettingsIcon size={18} color={activeTab === 'settings' ? C10_DARK : C10_ACCENT} />
            <Text style={[styles.navTabText, activeTab === 'settings' && styles.navTabTextActive]}>
              ตั้งค่า AI
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* IN-APP FLOATING TOAST NOTIFICATION */}
      {toast && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              opacity: toastFadeAnim,
              transform: [
                {
                  translateY: toastFadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.toastBubble}
            onPress={() => setToast(null)}
            activeOpacity={0.9}
          >
            <View style={styles.toastStatusTag}>
              {toast.type === 'success' && <CheckIcon size={13} color={C50} />}
              {toast.type === 'error' && <CloseIcon size={13} color={C50} />}
              {toast.type === 'warning' && <AlertIcon size={13} color={C50} />}
              {toast.type === 'info' && <InfoIcon size={13} color={C50} />}
              <Text style={styles.toastStatusTagText}>
                {toast.type === 'error'
                  ? 'ERR'
                  : toast.type === 'warning'
                  ? 'WARN'
                  : toast.type === 'success'
                  ? 'OK'
                  : 'INFO'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              {toast.title && <Text style={styles.toastTitle}>{toast.title}</Text>}
              <Text style={styles.toastMessage}>{toast.message}</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* CUSTOM THEMED CONFIRMATION / ALERT DIALOG */}
      {customDialog && (
        <Modal
          visible={customDialog.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setCustomDialog(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.customDialogContent, { maxWidth: contentWidth }]}>
              <View style={styles.dialogIconCircle}>
                <AlertIcon size={24} color={C10_DARK} />
              </View>
              <Text style={styles.dialogTitle}>{customDialog.title}</Text>
              <Text style={styles.dialogMessage}>{customDialog.message}</Text>

              <View style={styles.dialogActionRow}>
                {customDialog.cancelText && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnSecondary, { flex: 1, marginRight: 8 }]}
                    onPress={() => {
                      if (customDialog.onCancel) customDialog.onCancel();
                      setCustomDialog(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <CloseIcon size={14} color={C10_DARK} />
                    <Text style={styles.btnSecondaryText}>{customDialog.cancelText}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnPrimary, { flex: 1 }]}
                  onPress={() => {
                    customDialog.onConfirm();
                    setCustomDialog(null);
                  }}
                  activeOpacity={0.8}
                >
                  <CheckIcon size={14} color={C50} />
                  <Text style={styles.btnPrimaryText}>
                    {customDialog.confirmText || 'ตกลง'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 503 HIGH TRAFFIC RESOLUTION MODAL */}
      <Modal
        visible={show503Modal}
        transparent
        animationType="fade"
        onRequestClose={() => setShow503Modal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal503Content, { maxWidth: contentWidth }]}>
            <View style={styles.modal503IconRow}>
              <View style={styles.modal503BadgePill}>
                <AlertIcon size={14} color={C50} />
                <Text style={styles.modal503BadgePillText}>TRAFFIC 503</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modal503Title}>เซิร์ฟเวอร์หนาแน่น (Error 503)</Text>
                <Text style={styles.modal503Badge}>High Demand / Capacity Reached</Text>
              </View>
            </View>

            <Text style={styles.modal503Text}>
              ขณะนี้ {aiProvider === 'groq' ? `Groq (${groqModel})` : `โมเดลหลัก (${currentModel})`} มีผู้ใช้งานพร้อมกันจำนวนมากจนคิวประมวลผลเต็ม คุณต้องการดำเนินการอย่างไร?
            </Text>

            <View style={styles.modal503Options}>
              {/* Option 1: Switch to lower model */}
              <TouchableOpacity
                style={styles.optionBtnPrimary}
                onPress={handleSwitchToLowerModel}
                activeOpacity={0.8}
              >
                <View style={styles.optionHeader}>
                  <Text style={styles.optionTag}>OPTION 1</Text>
                  <Text style={styles.optionTitle}>เปลี่ยนไปใช้โมเดลที่ต่ำกว่า</Text>
                </View>
                <Text style={styles.optionDesc}>
                  สลับไปใช้{' '}
                  <Text style={{ color: C10_DARK, fontWeight: '700' }}>{currentModel !== MAIN_MODEL ? MAIN_MODEL : FALLBACK_MODEL}</Text>{' '}
                  (โมเดลที่ทดสอบแล้วว่าตอบสนองปกติ — 1 แตะ = 1 request ไม่ยิงซ้ำ)
                </Text>
                <View style={styles.optionBadgeNotice}>
                  <InfoIcon size={12} color={C10_DARK} />
                  <Text style={styles.optionBadgeNoticeText}>
                    ระบบจะระบุชื่อโมเดลนี้ในผลการวิเคราะห์ให้ทราบ
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Switch to Groq free alternative */}
              <TouchableOpacity
                style={styles.optionBtnPrimary}
                onPress={handleSwitchToGroq}
                activeOpacity={0.8}
              >
                <View style={styles.optionHeader}>
                  <Text style={styles.optionTag}>OPTION 2</Text>
                  <Text style={styles.optionTitle}>สลับไปใช้ Groq (สำรองฟรี)</Text>
                </View>
                <Text style={styles.optionDesc}>
                  ใช้ <Text style={{ color: C10_DARK, fontWeight: '700' }}>{GROQ_MODEL}</Text> วิเคราะห์รูปเดิมต่อทันที — เร็ว ฟรี ไม่ต้องรอ Gemini หาย overload
                </Text>
              </TouchableOpacity>

              {/* Option 3: Switch to another API Key */}
              <TouchableOpacity
                style={styles.optionBtnSecondary}
                onPress={handleSwitchApiKey}
                activeOpacity={0.8}
              >
                <View style={styles.optionHeader}>
                  <Text style={styles.optionTagSecondary}>OPTION 3</Text>
                  <Text style={styles.optionTitle}>เปลี่ยนไปใช้ API Key อื่น</Text>
                </View>
                <Text style={styles.optionDesc}>
                  สลับไปใช้ API Key ตัวอื่นของคุณ เพื่อกระจายโควตาและหลีกเลี่ยงข้อจำกัดการเรียกใช้งาน
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShow503Modal(false)}
              activeOpacity={0.7}
            >
              <CloseIcon size={14} color={C10_ACCENT} />
              <Text style={styles.cancelBtnText}>ยกเลิก</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PRIVACY POLICY MODAL (Google Play Policy Compliant) */}
      <Modal
        visible={showPrivacyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPrivacyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal503Content, { maxWidth: contentWidth, maxHeight: '85%' }]}>
            <View style={styles.modal503IconRow}>
              <View style={[styles.modal503BadgePill, { backgroundColor: C10_DARK }]}>
                <InfoIcon size={14} color={C50} />
                <Text style={styles.modal503BadgePillText}>PRIVACY</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modal503Title}>นโยบายความเป็นส่วนตัว</Text>
                <Text style={styles.modal503Badge}>Privacy Policy & Data Safety</Text>
              </View>
            </View>

            <ScrollView style={{ marginVertical: 12 }} showsVerticalScrollIndicator={false}>
              <View style={styles.privacySection}>
                <Text style={styles.privacySectionTitle}>1. การประมวลผลรูปภาพอาหาร (Image Processing)</Text>
                <Text style={styles.privacySectionBody}>
                  แอปพลิเคชันจะส่งรูปภาพอาหารที่คุณเลือกหรือถ่ายไปยังบริการ AI (Google Gemini หรือ Groq) ผ่านการเชื่อมต่อแบบเข้ารหัส (HTTPS) เพื่อวัตถุประสงค์ในการวิเคราะห์ปริมาณแคลอรี่และสารอาหารเท่านั้น โดยจะไม่มีการบันทึกหรือจัดเก็บไฟล์ภาพถ่ายของคุณลงในฐานข้อมูลหรือเซิร์ฟเวอร์ภายนอกใดๆ
                </Text>
              </View>

              <View style={styles.privacySection}>
                <Text style={styles.privacySectionTitle}>2. การจัดเก็บข้อมูลประวัติ (Local Storage Only)</Text>
                <Text style={styles.privacySectionBody}>
                  ข้อมูลมื้ออาหาร เช่น ชื่ออาหาร, แคลอรี่, สารอาหาร (โปรตีน, คาร์บ, ไขมัน) และข้อความ Roast จะถูกจัดเก็บไว้เฉพาะในหน่วยความจำของอุปกรณ์ (Local Storage) ของคุณเท่านั้น ไม่มีการส่งประวัติอาหารออกไปยังระบบคลาวด์ภายนอก
                </Text>
              </View>

              <View style={styles.privacySection}>
                <Text style={styles.privacySectionTitle}>3. สิทธิ์การเข้าถึงอุปกรณ์ (App Permissions)</Text>
                <Text style={styles.privacySectionBody}>
                  • กล้อง (Camera): ใช้เฉพาะเมื่อคุณกดปุ่มถ่ายรูปอาหารเพื่อส่งวิเคราะห์{'\n'}
                  • คลังภาพ (Photos): ใช้เฉพาะเมื่อคุณเลือกรูปภาพอาหารที่มีอยู่แล้ว{'\n'}
                  แอปไม่มีการเข้าถึงไมโครโฟน ตำแหน่งที่ตั้ง หรือข้อมูลระบุตัวตนส่วนบุคคลอื่นใด
                </Text>
              </View>

              <View style={styles.privacySection}>
                <Text style={styles.privacySectionTitle}>4. สิทธิ์การลบข้อมูล (User Data Deletion)</Text>
                <Text style={styles.privacySectionBody}>
                  คุณสามารถลบข้อมูลประวัติอาหารทั้งหมดออกจากอุปกรณ์ของคุณได้อย่างสมบูรณ์ตลอดเวลา ด้วยการกดปุ่ม "ล้างประวัติ" ในหน้าประวัติหรือหน้าตั้งค่า
                </Text>
              </View>

              <View style={styles.privacySection}>
                <Text style={styles.privacySectionTitle}>5. ข้อจำกัดความรับผิดชอบทางการแพทย์ (Medical Disclaimer)</Text>
                <Text style={styles.privacySectionBody}>
                  ข้อมูลและคำแนะนำทั้งหมดในแอปสร้างขึ้นโดยปัญญาประดิษฐ์ (AI) เพื่อการประเมินเบื้องต้นและความบันเทิง ไม่ใช่คำแนะนำทางการแพทย์ คำวินิจฉัยโรค หรือคำแนะนำจากนักกำหนดอาหารวิชาชีพ
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.actionBtn, styles.btnPrimary, { width: '100%', marginTop: 4 }]}
              onPress={() => setShowPrivacyModal(false)}
              activeOpacity={0.8}
            >
              <CheckIcon size={14} color={C50} />
              <Text style={styles.btnPrimaryText}>เข้าใจและรับทราบ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3-STEP PERSONAL SUPABASE SETUP GUIDE MODAL */}
      <Modal
        visible={showSupabaseGuideModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSupabaseGuideModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal503Content, { maxWidth: contentWidth, maxHeight: '88%' }]}>
            <View style={styles.modal503IconRow}>
              <View style={[styles.modal503BadgePill, { backgroundColor: C10_DARK }]}>
                <CloudIcon size={14} color={C50} />
                <Text style={styles.modal503BadgePillText}>SUPABASE GUIDE</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modal503Title}>วิธีสร้าง Supabase ส่วนตัว</Text>
                <Text style={styles.modal503Badge}>สำรองข้อมูลฟรีตลอดชีพ (3 ขั้นตอนง่ายๆ)</Text>
              </View>
            </View>

            <ScrollView style={{ marginVertical: 12 }} showsVerticalScrollIndicator={false}>
              {/* Step 1 */}
              <View style={styles.guideStepCard}>
                <View style={styles.guideStepNumberBadge}>
                  <Text style={styles.guideStepNumberText}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guideStepTitle}>สมัครและสร้างโปรเจกต์ใหม่</Text>
                  <Text style={styles.guideStepDesc}>
                    ไปที่ Supabase (ฟรี ไม่ต้องผูกบัตร) กดปุ่ม "New Project" ตั้งชื่อ เช่น RateMyMeal และตั้งรหัสผ่านฐานข้อมูล
                  </Text>
                  <TouchableOpacity
                    style={[styles.guideStepBtn, { backgroundColor: C30 }]}
                    onPress={() => Linking.openURL('https://supabase.com/dashboard/projects')}
                    activeOpacity={0.8}
                  >
                    <CloudIcon size={14} color={C10_DARK} />
                    <Text style={styles.guideStepBtnText}>เปิดเว็บ Supabase Dashboard ↗</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Step 2 */}
              <View style={styles.guideStepCard}>
                <View style={styles.guideStepNumberBadge}>
                  <Text style={styles.guideStepNumberText}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guideStepTitle}>สร้างตาราง meals ใน 1 คลิก</Text>
                  <Text style={styles.guideStepDesc}>
                    ไปที่เมนู <Text style={{ fontWeight: '800' }}>SQL Editor</Text> แถบซ้ายบน Supabase แล้วกดปุ่มคัดลอกด้านล่างนี้ นำไปวางแล้วกดปุ่ม <Text style={{ fontWeight: '800' }}>Run</Text>
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.guideStepBtn,
                      { backgroundColor: C50, borderColor: C10_DARK, borderWidth: 1.5 },
                    ]}
                    onPress={async () => {
                      await Clipboard.setStringAsync(SUPABASE_MEALS_SQL);
                      showToast(
                        'คัดลอกคำสั่ง SQL เรียบร้อย! นำไปวางใน SQL Editor แล้วกด Run ได้เลย',
                        'success',
                        'คัดลอกสำเร็จ'
                      );
                    }}
                    activeOpacity={0.8}
                  >
                    <CheckIcon size={14} color={C10_DARK} />
                    <Text style={[styles.guideStepBtnText, { fontWeight: '800' }]}>
                      📋 คัดลอกคำสั่ง SQL สร้างตาราง (Copy SQL)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Step 3 */}
              <View style={styles.guideStepCard}>
                <View style={styles.guideStepNumberBadge}>
                  <Text style={styles.guideStepNumberText}>3</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guideStepTitle}>นำ URL และ Key มากรอกในแอป</Text>
                  <Text style={styles.guideStepDesc}>
                    ไปที่เมนู <Text style={{ fontWeight: '800' }}>Project Settings</Text> (ไอคอนเฟืองล่างซ้าย) → หัวข้อ <Text style={{ fontWeight: '800' }}>API</Text> คัดลอกค่า <Text style={{ fontWeight: '800' }}>Project URL</Text> และ <Text style={{ fontWeight: '800' }}>anon public key</Text> มากรอกในแอป แล้วกด "ทดสอบการเชื่อมต่อ"
                  </Text>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.actionBtn, styles.btnPrimary, { width: '100%', marginTop: 4 }]}
              onPress={() => setShowSupabaseGuideModal(false)}
              activeOpacity={0.8}
            >
              <CheckIcon size={14} color={C50} />
              <Text style={styles.btnPrimaryText}>เข้าใจแล้ว / ไปกรอกข้อมูล</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C50,
  },
  header: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: C10_ACCENT,
    backgroundColor: C50,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  headerBottomRow: {
    width: '100%',
    marginTop: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginRight: 10,
  },
  logoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: C30,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    marginRight: 10,
    gap: 4,
  },
  logoBadgeText: {
    color: C10_DARK,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: C10_DARK,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    color: C10_ACCENT,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C30,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    flexShrink: 0,
  },
  headerStatusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  headerStatusText: {
    color: C10_DARK,
    fontSize: 11,
    fontWeight: '800',
  },
  container: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
    backgroundColor: C50,
  },
  tabContentWrapper: {
    width: '100%',
  },

  /* Hero Drop Zone - Athletic Stadium Frame */
  heroDropZone: {
    backgroundColor: C30,
    borderRadius: 32,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: C10_ACCENT,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  scannerGraphicBox: {
    width: 90,
    height: 70,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: C50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    gap: 4,
  },
  scannerCornerTopLeft: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 14,
    height: 14,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: C10_DARK,
  },
  scannerCornerTopRight: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: C10_DARK,
  },
  scannerCornerBottomLeft: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 14,
    height: 14,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: C10_DARK,
  },
  scannerCornerBottomRight: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: C10_DARK,
  },
  scannerGraphicText: {
    color: C10_DARK,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: C10_DARK,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 13,
    color: C10_DARK,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 22,
    paddingHorizontal: 12,
  },
  heroShutterBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C10_DARK,
    paddingVertical: 16,
    borderRadius: 999,
    marginBottom: 12,
    gap: 8,
    borderBottomWidth: 4,
    borderBottomColor: C10_ACCENT,
    shadowColor: C10_DARK,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  heroShutterText: {
    color: C50,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  heroGalleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderTopLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 6,
    backgroundColor: C50,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    gap: 6,
  },
  heroGalleryText: {
    color: C10_DARK,
    fontSize: 13,
    fontWeight: '700',
  },

  /* Image Preview */
  previewContainer: {
    width: '100%',
    backgroundColor: C30,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: C10_ACCENT,
    overflow: 'hidden',
    marginBottom: 20,
  },
  previewImage: {
    width: '100%',
    backgroundColor: C50,
  },
  actionBtnRow: {
    flexDirection: 'row',
    padding: 10,
    gap: 6,
    backgroundColor: C30,
  },
  actionBtn: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  btnCameraAction: {
    backgroundColor: C10_DARK,
    flex: 1.1,
    borderRadius: 999,
    borderBottomWidth: 3,
    borderBottomColor: C10_ACCENT,
  },
  btnCameraActionText: {
    color: C50,
    fontWeight: '900',
    fontSize: 13,
  },
  btnPrimary: {
    backgroundColor: C10_DARK,
    flex: 1,
    borderRadius: 999,
    borderBottomWidth: 3,
    borderBottomColor: C10_ACCENT,
  },
  btnPrimaryText: {
    color: C50,
    fontWeight: '900',
    fontSize: 13,
  },
  btnSecondary: {
    backgroundColor: C50,
    flex: 1,
    borderTopLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 6,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
  },
  btnSecondaryText: {
    color: C10_DARK,
    fontWeight: '800',
    fontSize: 13,
  },
  nextMealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C10_DARK,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 18,
    borderBottomWidth: 4,
    borderBottomColor: C10_ACCENT,
    shadowColor: C10_DARK,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  nextMealBtnIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(249, 230, 168, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(249, 230, 168, 0.3)',
  },
  nextMealBtnContent: {
    flex: 1,
  },
  nextMealBtnTitle: {
    color: C50,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  nextMealBtnSubtitle: {
    color: C50,
    opacity: 0.8,
    fontSize: 11,
    fontWeight: '600',
  },

  /* Loading State */
  loadingCard: {
    backgroundColor: C30,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: C10_ACCENT,
  },
  loadingSpinnerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  loadingStepTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: C10_DARK,
    marginBottom: 6,
  },
  loadingStepSub: {
    color: C10_DARK,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
    fontWeight: '600',
  },
  stepDotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C50,
    borderWidth: 1,
    borderColor: C10_ACCENT,
  },
  stepDotActive: {
    backgroundColor: C10_DARK,
    width: 20,
  },

  /* Result Hero Card - Asymmetric Athletic Container */
  resultCard: {
    backgroundColor: C30,
    borderTopLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderWidth: 2,
    borderColor: C10_ACCENT,
    padding: 18,
    marginBottom: 20,
  },
  modelInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1.5,
    backgroundColor: C50,
    borderColor: C10_ACCENT,
  },
  modelInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: C10_DARK,
    marginRight: 10,
    gap: 4,
  },
  modelInfoBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: C50,
  },
  modelInfoLabel: {
    fontSize: 11,
    color: C10_ACCENT,
    fontWeight: '700',
  },
  modelInfoValue: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
    color: C10_DARK,
  },

  /* Dish Title & Health Score */
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dishBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  dishBadge: {
    color: C10_DARK,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dishName: {
    color: C10_DARK,
    fontSize: 22,
    fontWeight: '900',
  },

  /* Health Score Circular Medal */
  scoreBadge: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2.5,
    borderColor: C10_DARK,
    backgroundColor: C50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C10_DARK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  scoreNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: C10_DARK,
    lineHeight: 26,
  },
  scoreMax: {
    fontSize: 9,
    color: C10_ACCENT,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  /* Calories Stadium Banner */
  caloriesBanner: {
    backgroundColor: C50,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: C10_ACCENT,
  },
  caloriesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  caloriesLabel: {
    color: C10_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },
  caloriesRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  caloriesValue: {
    color: C10_DARK,
    fontSize: 40,
    fontWeight: '900',
    marginRight: 6,
  },
  caloriesUnit: {
    color: C10_ACCENT,
    fontSize: 15,
    fontWeight: '900',
  },

  /* Dynamic Macro Ratio Bar */
  macroRatioSection: {
    marginBottom: 14,
    backgroundColor: C50,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
  },
  macroRatioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  macroRatioTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: C10_DARK,
  },
  macroRatioTotal: {
    fontSize: 11,
    fontWeight: '700',
    color: C10_ACCENT,
  },
  macroRatioBarContainer: {
    height: 12,
    borderRadius: 6,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: C50,
    borderWidth: 1,
    borderColor: C10_ACCENT,
    marginBottom: 8,
  },
  macroRatioSegment: {
    height: '100%',
  },
  macroRatioPercentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroRatioPercentText: {
    fontSize: 10,
    fontWeight: '800',
  },

  /* Macro Nutrients Asymmetric Cards */
  macrosContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  macroItem: {
    flex: 1,
    backgroundColor: C50,
    padding: 10,
    borderTopLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 6,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: C10_ACCENT,
  },
  macroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  macroTitle: {
    fontSize: 10,
    color: C10_ACCENT,
    fontWeight: '800',
  },
  macroValue: {
    fontSize: 15,
    fontWeight: '900',
  },
  unitText: {
    fontSize: 11,
    fontWeight: '700',
    color: C10_ACCENT,
  },

  /* Trainer Roast Speech Bubble with Pointer */
  roastSection: {
    marginBottom: 14,
  },
  roastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  roastAvatarBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C10_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  roastAvatarText: {
    color: C50,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  roastAuthor: {
    color: C10_DARK,
    fontSize: 13,
    fontWeight: '900',
  },
  roastAuthorSub: {
    color: C10_ACCENT,
    fontSize: 10,
    fontWeight: '700',
  },
  roastBubble: {
    backgroundColor: C50,
    borderColor: C10_DARK,
    borderWidth: 2,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 20,
    padding: 16,
    position: 'relative',
  },
  speechBubblePointer: {
    position: 'absolute',
    top: -8,
    left: 14,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: C10_DARK,
  },
  roastComment: {
    color: C10_DARK,
    fontSize: 15,
    lineHeight: 23,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  roastReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: C50,
    borderWidth: 1,
    borderColor: C10_ACCENT,
  },
  roastReportText: {
    color: C10_ACCENT,
    fontSize: 10,
    fontWeight: '700',
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F5DC96',
    borderWidth: 1,
    borderColor: C10_ACCENT,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    marginBottom: 6,
  },
  disclaimerText: {
    flex: 1,
    color: C10_DARK,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  privacySection: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2A900',
  },
  privacySectionTitle: {
    color: C10_DARK,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  privacySectionBody: {
    color: C10_DARK,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },

  /* Supabase Sync Indicator */
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    gap: 6,
  },
  syncSyncing: {
    color: C10_ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },
  syncSuccess: {
    color: C10_DARK,
    fontSize: 12,
    fontWeight: '800',
  },
  syncError: {
    color: C10_ACCENT,
    fontSize: 12,
    fontWeight: '800',
  },

  /* History Tab Styles */
  historyHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '900',
    color: C10_DARK,
  },
  sectionSubHeading: {
    fontSize: 12,
    color: C10_ACCENT,
    marginTop: 2,
    fontWeight: '700',
  },
  refreshIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C30,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    gap: 6,
  },
  refreshIconText: {
    color: C10_DARK,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyHistoryBox: {
    backgroundColor: C30,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: C10_ACCENT,
    padding: 32,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyGraphicCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: C10_DARK,
    backgroundColor: C50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyHistoryTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: C10_DARK,
    marginBottom: 6,
  },
  emptyHistorySub: {
    fontSize: 13,
    color: C10_DARK,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '600',
  },
  historyList: {
    gap: 12,
  },
  historyCard: {
    backgroundColor: C30,
    borderTopLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    padding: 14,
  },
  historyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyDishTitle: {
    color: C10_DARK,
    fontSize: 16,
    fontWeight: '900',
  },
  historyDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  historyDateText: {
    fontSize: 11,
    color: C10_ACCENT,
    fontWeight: '700',
  },
  historyScoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: C10_DARK,
    backgroundColor: C50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyScoreNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: C10_DARK,
    lineHeight: 18,
  },
  historyScoreSub: {
    fontSize: 8,
    color: C10_ACCENT,
    fontWeight: '900',
  },
  historyStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    backgroundColor: C50,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C10_ACCENT,
  },
  historyCalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C30,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  historyCalNumber: {
    color: C10_DARK,
    fontSize: 15,
    fontWeight: '900',
  },
  historyCalLabel: {
    color: C10_ACCENT,
    fontSize: 10,
    fontWeight: '800',
  },
  historyMacroPills: {
    flexDirection: 'row',
    gap: 8,
  },
  macroPill: {
    fontSize: 11,
    fontWeight: '800',
  },
  historyRoastBubble: {
    backgroundColor: C50,
    borderLeftWidth: 3.5,
    borderLeftColor: C10_DARK,
    padding: 10,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderWidth: 1,
    borderColor: C10_ACCENT,
  },
  historyRoastText: {
    color: C10_DARK,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  historyExpandHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  historyExpandHint: {
    color: C10_ACCENT,
    fontSize: 10,
    fontWeight: '800',
  },

  /* Settings Tab Styles - Asymmetric & Pill Controls */
  settingsHeader: {
    marginBottom: 16,
  },
  settingsCard: {
    backgroundColor: C30,
    borderTopLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    padding: 16,
    marginBottom: 16,
  },
  settingsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  settingsCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  settingsCardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: C10_DARK,
  },
  settingsCardSub: {
    fontSize: 12,
    color: C10_DARK,
    lineHeight: 17,
    marginBottom: 12,
    fontWeight: '600',
  },
  showKeyToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  showKeyToggleText: {
    color: C10_DARK,
    fontSize: 12,
    fontWeight: '800',
  },
  settingsInput: {
    backgroundColor: C50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    color: C10_DARK,
    padding: 12,
    fontSize: 14,
    marginBottom: 6,
    fontWeight: '700',
  },
  settingsInputHint: {
    fontSize: 11,
    color: C10_DARK,
    fontWeight: '600',
  },
  modelOptionsContainer: {
    gap: 10,
  },
  modelOptionCard: {
    backgroundColor: C50,
    borderTopLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 6,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    padding: 12,
  },
  modelOptionCardActive: {
    borderColor: C10_DARK,
    borderWidth: 2.5,
  },
  modelOptionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  modelIndicatorPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: C30,
    borderWidth: 1,
    borderColor: C10_ACCENT,
    marginRight: 10,
  },
  modelIndicatorText: {
    fontSize: 9,
    fontWeight: '900',
    color: C10_DARK,
  },
  modelOptionName: {
    fontSize: 14,
    fontWeight: '900',
    color: C10_DARK,
  },
  modelOptionTagPrimary: {
    fontSize: 10,
    color: C10_ACCENT,
    fontWeight: '800',
  },
  modelOptionTagSecondary: {
    fontSize: 10,
    color: C10_ACCENT,
    fontWeight: '800',
  },
  activeCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C10_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelOptionDesc: {
    fontSize: 12,
    color: C10_DARK,
    lineHeight: 16,
    fontWeight: '600',
  },
  simulate503Btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C50,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  simulate503Text: {
    color: C10_DARK,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  supabaseStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  supabaseDotOnline: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C10_DARK,
    marginRight: 8,
  },
  supabaseStatusText: {
    color: C10_DARK,
    fontSize: 12,
    fontWeight: '700',
  },
  /* Cloud Status Badges */
  cloudStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  cloudStatusConnected: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2E7D32',
  },
  cloudStatusError: {
    backgroundColor: '#FFEBEE',
    borderColor: '#C62828',
  },
  cloudStatusOffline: {
    backgroundColor: C50,
    borderColor: C10_ACCENT,
  },
  cloudStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: C10_DARK,
  },
  settingsInputLabel: {
    color: C10_DARK,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
  },
  /* Guide Modal Styles */
  guideStepCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: C50,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  guideStepNumberBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C10_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  guideStepNumberText: {
    color: C50,
    fontWeight: '900',
    fontSize: 13,
  },
  guideStepTitle: {
    color: C10_DARK,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  guideStepDesc: {
    color: C10_DARK,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  guideStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
    marginTop: 2,
  },
  guideStepBtnText: {
    color: C10_DARK,
    fontSize: 12,
    fontWeight: '700',
  },

  /* Floating Stadium Bottom Navigation Bar */
  bottomNavContainer: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    alignItems: 'center',
    zIndex: 999,
  },
  bottomNavBar: {
    width: '100%',
    maxWidth: 500,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: C30,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: C10_ACCENT,
    paddingVertical: 6,
    paddingHorizontal: 8,
    shadowColor: C10_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    position: 'relative',
  },
  navSlidingPill: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 8,
    borderRadius: 999,
    backgroundColor: C50,
    borderWidth: 1.5,
    borderColor: C10_DARK,
    shadowColor: C10_DARK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  navTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 999,
    gap: 3,
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  navTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: C10_ACCENT,
  },
  navTabTextActive: {
    color: C10_DARK,
    fontWeight: '900',
  },

  /* In-App Floating Toast */
  toastContainer: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  toastBubble: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C30,
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: C10_DARK,
    shadowColor: C10_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  toastStatusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: C10_DARK,
    marginRight: 10,
    gap: 4,
  },
  toastStatusTagText: {
    fontSize: 10,
    fontWeight: '900',
    color: C50,
  },
  toastTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: C10_DARK,
    marginBottom: 2,
  },
  toastMessage: {
    fontSize: 12,
    color: C10_DARK,
    lineHeight: 16,
    fontWeight: '700',
  },

  /* Custom Themed Dialog */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(77, 42, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  customDialogContent: {
    width: '100%',
    backgroundColor: C50,
    borderRadius: 22,
    padding: 22,
    borderWidth: 2,
    borderColor: C10_ACCENT,
    alignItems: 'center',
  },
  dialogIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C30,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: C10_DARK,
    textAlign: 'center',
    marginBottom: 8,
  },
  dialogMessage: {
    fontSize: 13,
    color: C10_DARK,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
    fontWeight: '600',
  },
  dialogActionRow: {
    width: '100%',
    flexDirection: 'row',
  },

  /* 503 High Traffic Resolution Modal */
  modal503Content: {
    backgroundColor: C50,
    borderRadius: 22,
    padding: 22,
    width: '100%',
    borderWidth: 2.5,
    borderColor: C10_ACCENT,
  },
  modal503IconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modal503BadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: C10_DARK,
    marginRight: 10,
    gap: 4,
  },
  modal503BadgePillText: {
    color: C50,
    fontWeight: '900',
    fontSize: 11,
  },
  modal503Title: {
    fontSize: 18,
    fontWeight: '900',
    color: C10_DARK,
  },
  modal503Badge: {
    fontSize: 11,
    fontWeight: '800',
    color: C10_ACCENT,
    marginTop: 2,
  },
  modal503Text: {
    fontSize: 13,
    color: C10_DARK,
    lineHeight: 20,
    marginBottom: 16,
    fontWeight: '600',
  },
  modal503Options: {
    gap: 12,
    marginBottom: 16,
  },
  optionBtnPrimary: {
    backgroundColor: C30,
    borderWidth: 2,
    borderColor: C10_DARK,
    borderRadius: 14,
    padding: 14,
  },
  optionBtnSecondary: {
    backgroundColor: C50,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
    borderRadius: 14,
    padding: 14,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  optionTag: {
    fontSize: 10,
    fontWeight: '900',
    color: C50,
    backgroundColor: C10_DARK,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  optionTagSecondary: {
    fontSize: 10,
    fontWeight: '900',
    color: C10_DARK,
    backgroundColor: C30,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: C10_DARK,
  },
  optionDesc: {
    fontSize: 12,
    color: C10_DARK,
    lineHeight: 18,
    fontWeight: '600',
  },
  optionBadgeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: C50,
    borderWidth: 1,
    borderColor: C10_ACCENT,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
    gap: 4,
  },
  optionBadgeNoticeText: {
    fontSize: 11,
    color: C10_DARK,
    fontWeight: '800',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  cancelBtnText: {
    color: C10_ACCENT,
    fontSize: 13,
    fontWeight: '800',
  },
});
