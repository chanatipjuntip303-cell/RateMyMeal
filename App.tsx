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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase, Meal } from './supabase';
import {
  CameraIcon,
  GalleryIcon,
  HistoryIcon,
  SettingsIcon,
  FlameIcon,
  RefreshIcon,
  SwapIcon,
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
  const [recentMeals, setRecentMeals] = useState<Meal[]>([]);
  const [refreshingHistory, setRefreshingHistory] = useState<boolean>(false);
  const [expandedRoastId, setExpandedRoastId] = useState<string | null>(null);

  // Model & 503 Handling States
  const [currentModel, setCurrentModel] = useState<string>('gemini-3.8-flash');
  const [resultModel, setResultModel] = useState<string | null>(null);
  const [show503Modal, setShow503Modal] = useState<boolean>(false);
  const [pendingBase64, setPendingBase64] = useState<string | null>(null);
  const [switchedToLowerModel, setSwitchedToLowerModel] = useState<boolean>(false);

  // Settings UI State
  const [showApiKeyText, setShowApiKeyText] = useState<boolean>(false);

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
    fetchRecentMeals();
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

  const fetchRecentMeals = async () => {
    setRefreshingHistory(true);
    try {
      const { data, error } = await supabase
        .from('meals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setRecentMeals(data as Meal[]);
      }
    } catch (err) {
      console.warn('Failed to fetch recent meals from Supabase', err);
    } finally {
      setRefreshingHistory(false);
    }
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
        quality: 0.6,
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
          analyzeMealWithGemini(selectedAsset.base64, currentModel);
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
        message: 'กรุณากรอก Gemini API Key เพื่อให้ AI เริ่มวิเคราะห์จานอาหาร',
        confirmText: 'ไปหน้าตั้งค่า',
        cancelText: 'ยกเลิก',
        onConfirm: () => setActiveTab('settings'),
      });
      return;
    }

    const modelToUse = modelOverride || currentModel || 'gemini-3.8-flash';
    setLoading(true);
    setLoadingStep(
      isFallbackAttempt
        ? `กำลังสลับใช้โมเดล ${modelToUse} (โมเดลสำรองช่วง Traffic เต็ม)...`
        : 'เทรนเนอร์กำลังจ้องดูจานข้าวของคุณ...'
    );
    setSyncStatus('idle');

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
      let result;
      try {
        result = await model.generateContent([prompt, imagePart]);
      } catch (geminiErr: any) {
        if (is503Error(geminiErr)) {
          console.warn('Gemini 503 Traffic Overload encountered:', geminiErr);
          setLoading(false);
          setPendingBase64(base64Data);
          setShow503Modal(true);
          return;
        }

        if (
          geminiErr?.message?.includes('404') ||
          geminiErr?.message?.includes('not found') ||
          geminiErr?.message?.includes('no longer available')
        ) {
          const fallbackModel = genAI.getGenerativeModel({
            model: 'gemini-flash-latest',
            generationConfig: {
              responseMimeType: 'application/json',
            },
          });
          result = await fallbackModel.generateContent([prompt, imagePart]);
        } else {
          throw geminiErr;
        }
      }

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
        isFallbackAttempt || modelToUse.includes('3.6') || modelToUse.includes('8b');
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

      // Auto-sync to Supabase meals table
      setSyncStatus('syncing');
      const { error: dbError } = await supabase.from('meals').insert([
        {
          dish_name: parsed.dish_name || 'อาหารไม่ระบุชื่อ',
          calories: Math.round(Number(parsed.calories) || 0),
          protein: parseFloat(String(parsed.protein || 0)),
          carbs: parseFloat(String(parsed.carbs || 0)),
          fat: parseFloat(String(parsed.fat || 0)),
          health_score: Math.min(10, Math.max(1, Math.round(Number(parsed.health_score) || 5))),
          roast_comment: parsed.roast_comment || '',
        },
      ]);

      if (dbError) {
        console.warn('Supabase insert warning:', dbError.message);
        setSyncStatus('error');
        showToast('ไม่สามารถบันทึกประวัติลง Supabase ได้', 'warning', 'Sync Issue');
      } else {
        setSyncStatus('synced');
        fetchRecentMeals();
      }
    } catch (err: any) {
      console.error('Analysis error:', err);
      if (is503Error(err)) {
        console.warn('Gemini 503 Error caught in outer block:', err);
        setLoading(false);
        setPendingBase64(base64Data);
        setShow503Modal(true);
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

  const handleSwitchToLowerModel = () => {
    setShow503Modal(false);
    const lowerModel = 'gemini-3.6-flash';
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
              {geminiApiKey
                ? switchedToLowerModel
                  ? '3.6 Flash'
                  : '3.8 Flash'
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
                    style={[styles.actionBtn, styles.btnSecondary]}
                    onPress={() => pickImage(false)}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <SwapIcon size={16} color={C10_DARK} />
                    <Text style={styles.btnSecondaryText}>เปลี่ยนรูป</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnPrimary]}
                    onPress={() => {
                      if (imageBase64) analyzeMealWithGemini(imageBase64, currentModel);
                    }}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <RefreshIcon size={16} color={C50} />
                    <Text style={styles.btnPrimaryText}>สแกนซ้ำ</Text>
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
                        resultModel.includes('3.6') ||
                        resultModel.includes('8b')
                          ? 'FALLBACK'
                          : 'AI'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modelInfoLabel}>
                        {switchedToLowerModel ||
                        resultModel.includes('3.6') ||
                        resultModel.includes('8b')
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
                      <Text style={styles.roastAuthorSub}>ประเมินความฟิตของจานนี้</Text>
                    </View>
                  </View>

                  <View style={styles.roastBubble}>
                    <View style={styles.speechBubblePointer} />
                    <Text style={[styles.roastComment, isCompact && { fontSize: 14 }]}>
                      "{mealData.roast_comment}"
                    </Text>
                  </View>
                </View>

                {/* Supabase Sync Status Indicator */}
                <View style={styles.syncRow}>
                  <CloudIcon size={14} color={syncStatus === 'synced' ? C10_DARK : C10_ACCENT} />
                  {syncStatus === 'syncing' && (
                    <Text style={styles.syncSyncing}>กำลังบันทึกข้อมูลลง Supabase...</Text>
                  )}
                  {syncStatus === 'synced' && (
                    <Text style={styles.syncSuccess}>ซิงค์เข้าฐานข้อมูล Supabase เรียบร้อย</Text>
                  )}
                  {syncStatus === 'error' && (
                    <Text style={styles.syncError}>ซิงค์ข้อมูลเข้า Supabase ไม่สำเร็จ</Text>
                  )}
                </View>
              </View>
            )}
          </View>
        )}

        {/* TAB 2: MEAL HISTORY LOG */}
        {activeTab === 'history' && (
          <View style={styles.tabContentWrapper}>
            <View style={styles.historyHeaderBar}>
              <View>
                <Text style={styles.sectionHeading}>ประวัติมื้อที่เคยโดนสวด</Text>
                <Text style={styles.sectionSubHeading}>
                  บันทึกทั้งหมด {recentMeals.length} มื้อล่าสุดจาก Supabase
                </Text>
              </View>

              <TouchableOpacity
                style={styles.refreshIconBtn}
                onPress={fetchRecentMeals}
                disabled={refreshingHistory}
                activeOpacity={0.7}
              >
                <RefreshIcon size={14} color={C10_DARK} />
                <Text style={styles.refreshIconText}>รีเฟรช</Text>
              </TouchableOpacity>
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

              <TextInput
                style={styles.settingsInput}
                value={geminiApiKey}
                onChangeText={setGeminiApiKey}
                placeholder="ระบุ Gemini API Key (AIzaSy...)"
                placeholderTextColor={C10_ACCENT}
                secureTextEntry={!showApiKeyText}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.settingsInputHint}>
                รับ API Key ฟรีได้ที่ Google AI Studio (ai.google.dev)
              </Text>
            </View>

            {/* Model Selection Card */}
            <View style={styles.settingsCard}>
              <View style={styles.settingsCardTitleRow}>
                <CpuIcon size={16} color={C10_DARK} />
                <Text style={styles.settingsCardTitle}>โมเดล AI ที่ต้องการใช้งาน</Text>
              </View>
              <Text style={styles.settingsCardSub}>
                เลือกโมเดลสำหรับการตรวจจับรูปภาพอาหารและสร้างคำบ่น Roast
              </Text>

              <View style={styles.modelOptionsContainer}>
                {/* Model 1: 3.8 Flash */}
                <TouchableOpacity
                  style={[
                    styles.modelOptionCard,
                    currentModel === 'gemini-3.8-flash' && styles.modelOptionCardActive,
                  ]}
                  onPress={() => {
                    setCurrentModel('gemini-3.8-flash');
                    setSwitchedToLowerModel(false);
                    showToast('สลับใช้โมเดลหลัก: gemini-3.8-flash', 'info');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.modelOptionTop}>
                    <View style={styles.modelIndicatorPill}>
                      <Text style={styles.modelIndicatorText}>MAIN</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modelOptionName}>Gemini 3.8 Flash</Text>
                      <Text style={styles.modelOptionTagPrimary}>โมเดลหลัก (แนะนำ)</Text>
                    </View>
                    {currentModel === 'gemini-3.8-flash' && (
                      <View style={styles.activeCheckCircle}>
                        <CheckIcon size={12} color={C50} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.modelOptionDesc}>
                    วิเคราะห์วัตถุดิบแม่นยำ ละเอียด และเขียนประโยค Roast สไตล์เทรนเนอร์ได้แสบที่สุด
                  </Text>
                </TouchableOpacity>

                {/* Model 2: 3.6 Flash */}
                <TouchableOpacity
                  style={[
                    styles.modelOptionCard,
                    currentModel === 'gemini-3.6-flash' && styles.modelOptionCardActive,
                  ]}
                  onPress={() => {
                    setCurrentModel('gemini-3.6-flash');
                    setSwitchedToLowerModel(true);
                    showToast('สลับใช้โมเดลสำรอง: gemini-3.6-flash', 'info');
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
                    {currentModel === 'gemini-3.6-flash' && (
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
            </View>

            {/* Supabase Connection Status Card */}
            <View style={styles.settingsCard}>
              <View style={styles.settingsCardTitleRow}>
                <CloudIcon size={16} color={C10_DARK} />
                <Text style={styles.settingsCardTitle}>Supabase Cloud Database</Text>
              </View>
              <View style={styles.supabaseStatusRow}>
                <View style={styles.supabaseDotOnline} />
                <Text style={styles.supabaseStatusText}>
                  เชื่อมต่อตาราง meals เรียบร้อย (Auto-sync Enabled)
                </Text>
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
                      'คุณมีรูปภาพอาหารค้างอยู่ ต้องการส่งให้ Gemini วิเคราะห์ด้วยการตั้งค่าใหม่นี้ทันทีหรือไม่?',
                    confirmText: 'วิเคราะห์ทันที',
                    cancelText: 'ภายหลัง',
                    onConfirm: () => {
                      setActiveTab('scan');
                      analyzeMealWithGemini(dataToUse, currentModel);
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
              ขณะนี้โมเดลหลัก (
              <Text style={{ color: C10_DARK, fontWeight: '700' }}>{currentModel}</Text>
              ) มีผู้ใช้งานพร้อมกันจำนวนมากจนคิวประมวลผลเต็ม คุณต้องการดำเนินการอย่างไร?
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
                  <Text style={{ color: C10_DARK, fontWeight: '700' }}>Gemini 3.6 Flash</Text>{' '}
                  (โมเดลรุ่นรอง ประมวลผลไว รองรับ Traffic ได้สูงกว่า)
                </Text>
                <View style={styles.optionBadgeNotice}>
                  <InfoIcon size={12} color={C10_DARK} />
                  <Text style={styles.optionBadgeNoticeText}>
                    ระบบจะระบุชื่อโมเดลนี้ในผลการวิเคราะห์ให้ทราบ
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Switch to another API Key */}
              <TouchableOpacity
                style={styles.optionBtnSecondary}
                onPress={handleSwitchApiKey}
                activeOpacity={0.8}
              >
                <View style={styles.optionHeader}>
                  <Text style={styles.optionTagSecondary}>OPTION 2</Text>
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
    padding: 12,
    gap: 10,
    backgroundColor: C30,
  },
  actionBtn: {
    flexDirection: 'row',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
    fontSize: 14,
  },
  btnSecondary: {
    backgroundColor: C50,
    flex: 1,
    borderTopLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 6,
    borderWidth: 1.5,
    borderColor: C10_ACCENT,
  },
  btnSecondaryText: {
    color: C10_DARK,
    fontWeight: '800',
    fontSize: 14,
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
