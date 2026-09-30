import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  SafeAreaView,
  StatusBar,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase, Meal } from './supabase';

export default function App() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('พร้อมวิเคราะห์');
  const [mealData, setMealData] = useState<Meal | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [geminiApiKey, setGeminiApiKey] = useState<string>(
    process.env.EXPO_PUBLIC_GEMINI_API_KEY || ''
  );
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [recentMeals, setRecentMeals] = useState<Meal[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // Model & 503 Handling States
  const [currentModel, setCurrentModel] = useState<string>('gemini-3.8-flash');
  const [resultModel, setResultModel] = useState<string | null>(null);
  const [show503Modal, setShow503Modal] = useState<boolean>(false);
  const [pendingBase64, setPendingBase64] = useState<string | null>(null);
  const [switchedToLowerModel, setSwitchedToLowerModel] = useState<boolean>(false);

  useEffect(() => {
    fetchRecentMeals();
  }, []);

  const fetchRecentMeals = async () => {
    try {
      const { data, error } = await supabase
        .from('meals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        setRecentMeals(data as Meal[]);
      }
    } catch (err) {
      console.warn('Failed to fetch recent meals from Supabase', err);
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
          Alert.alert('ต้องการการอนุญาต', 'กรุณาอนุญาตการเข้าถึงกล้องถ่ายรูป');
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('ต้องการการอนุญาต', 'กรุณาอนุญาตการเข้าถึงคลังภาพ');
          return;
        }
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.6, // Per AGENTS.md rule: compress to quality 0.6
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
      Alert.alert('เกิดข้อผิดพลาด', 'ไม่สามารถเลือกรูปภาพได้');
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
      setShowKeyModal(true);
      Alert.alert('ต้องระบุ Gemini API Key', 'กรุณากรอก Gemini API Key เพื่อเริ่มวิเคราะห์');
      return;
    }

    const modelToUse = modelOverride || currentModel || 'gemini-3.8-flash';
    setLoading(true);
    setLoadingStep(
      isFallbackAttempt
        ? `กำลังสลับใช้โมเดล ${modelToUse} (โมเดลสำรองช่วง Traffic เต็ม)... ⚡`
        : 'เทรนเนอร์กำลังจ้องดูจานข้าวของคุณ... 👀'
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

      setLoadingStep('กำลังคำนวณแคลอรี่ & เตรียมประโยคเชือดเฉือน... 🔥');
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

      const isLowerFallback = isFallbackAttempt || modelToUse.includes('3.6') || modelToUse.includes('8b');
      setMealData(parsed);
      setResultModel(verifiedModelName);
      setCurrentModel(modelToUse);
      setSwitchedToLowerModel(isLowerFallback);

      if (isLowerFallback) {
        Alert.alert(
          '✨ วิเคราะห์สำเร็จด้วยโมเดลสำรอง',
          `ผลลัพธ์นี้ประมวลผลโดยโมเดล: ${verifiedModelName}\n(เปลี่ยนมาใช้เนื่องจากโมเดลหลัก Traffic เต็ม / Error 503)`
        );
      }

      // Auto-sync to Supabase meals table
      setSyncStatus('syncing');
      const { data: insertedData, error: dbError } = await supabase
        .from('meals')
        .insert([
          {
            dish_name: parsed.dish_name || 'อาหารไม่ระบุชื่อ',
            calories: Math.round(Number(parsed.calories) || 0),
            protein: parseFloat(String(parsed.protein || 0)),
            carbs: parseFloat(String(parsed.carbs || 0)),
            fat: parseFloat(String(parsed.fat || 0)),
            health_score: Math.min(10, Math.max(1, Math.round(Number(parsed.health_score) || 5))),
            roast_comment: parsed.roast_comment || '',
          },
        ])
        .select();

      if (dbError) {
        console.warn('Supabase insert warning:', dbError.message);
        setSyncStatus('error');
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
      Alert.alert(
        'วิเคราะห์ไม่สำเร็จ',
        err.message || 'ไม่สามารถวิเคราะห์อาหารได้ กรุณาตรวจสอบรูปภาพและ API Key'
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
      Alert.alert(
        'สลับไปใช้โมเดลที่ต่ำกว่าแล้ว',
        `ตั้งค่าโมเดลเป็น ${lowerModel} เรียบร้อย กรุณาถ่ายหรือเลือกรูปภาพเพื่อเริ่มวิเคราะห์`
      );
    }
  };

  const handleSwitchApiKey = () => {
    setShow503Modal(false);
    setShowKeyModal(true);
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return '#10B981'; // Green
    if (score >= 5) return '#F59E0B'; // Amber
    return '#EF4444'; // Red
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#121214" />
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.logoIcon}>🔥</Text>
            <View>
              <Text style={styles.title}>RATE MY MEAL</Text>
              <Text style={styles.subtitle}>AI Roast & Macro Coach (เทรนเนอร์ปากจัด)</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.keyBtn}
            onPress={() => setShowKeyModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.keyBtnText}>
              ⚙️ {geminiApiKey ? 'API Key OK' : 'ตั้งค่า Key'}
              {currentModel.includes('3.6') ? ' ⚡(3.6)' : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Image Picker Section */}
        <View style={styles.imageCard}>
          {imageUri ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
              <View style={styles.actionBtnRow}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={() => pickImage(false)}
                  disabled={loading}
                >
                  <Text style={styles.btnSecondaryText}>🖼️ เปลี่ยนรูป</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => {
                    if (imageBase64) analyzeMealWithGemini(imageBase64, currentModel);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.btnPrimaryText}>⚡ สแกนซ้ำ</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderEmoji}>🥗 🍗 🍕</Text>
              <Text style={styles.placeholderTitle}>ถ่ายหรือเลือกรูปมื้ออาหารของคุณ</Text>
              <Text style={styles.placeholderSub}>
                เตรียมใจให้พร้อมรับคำด่าจากเทรนเนอร์สายโหด!
              </Text>

              <View style={styles.pickerActions}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary, { flex: 1, marginRight: 8 }]}
                  onPress={() => pickImage(true)}
                  disabled={loading}
                >
                  <Text style={styles.btnPrimaryText}>📸 ถ่ายรูป</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary, { flex: 1, marginLeft: 8 }]}
                  onPress={() => pickImage(false)}
                  disabled={loading}
                >
                  <Text style={styles.btnSecondaryText}>🖼️ คลังภาพ</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Loading Indicator */}
        {loading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#FF5722" />
            <Text style={styles.loadingText}>{loadingStep}</Text>
          </View>
        )}

        {/* Roast Result Card */}
        {mealData && !loading && (
          <View style={styles.resultCard}>
            {/* Model Origin Badge */}
            {resultModel && (
              <View
                style={[
                  styles.modelInfoCard,
                  switchedToLowerModel || resultModel.includes('3.6') || resultModel.includes('8b')
                    ? styles.modelInfoCardFallback
                    : styles.modelInfoCardNormal,
                ]}
              >
                <Text style={styles.modelInfoEmoji}>
                  {switchedToLowerModel || resultModel.includes('3.6') || resultModel.includes('8b') ? '⚡' : '🤖'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modelInfoLabel}>
                    {switchedToLowerModel || resultModel.includes('3.6') || resultModel.includes('8b')
                      ? 'ผลลัพธ์นี้ได้จากโมเดลระดับต่ำกว่า (Traffic Fallback):'
                      : 'ผลลัพธ์นี้ประมวลผลโดยโมเดล:'}
                  </Text>
                  <Text
                    style={[
                      styles.modelInfoValue,
                      {
                        color:
                          switchedToLowerModel || resultModel.includes('3.6') || resultModel.includes('8b')
                            ? '#FBBF24'
                            : '#34D399',
                      },
                    ]}
                  >
                    {resultModel}
                    {switchedToLowerModel || resultModel.includes('3.6')
                      ? ' (Gemini 3.6 Flash: โหมดสำรองช่วง Traffic เต็ม)'
                      : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Dish Title & Health Score */}
            <View style={styles.resultHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.dishBadge}>🍽️ จานนี้คือ</Text>
                <Text style={styles.dishName}>{mealData.dish_name}</Text>
              </View>
              <View
                style={[
                  styles.scoreBadge,
                  { borderColor: getScoreColor(mealData.health_score) },
                ]}
              >
                <Text
                  style={[
                    styles.scoreNumber,
                    { color: getScoreColor(mealData.health_score) },
                  ]}
                >
                  {mealData.health_score}
                </Text>
                <Text style={styles.scoreMax}>/10 คะแนน</Text>
              </View>
            </View>

            {/* Calories Banner */}
            <View style={styles.caloriesBanner}>
              <Text style={styles.caloriesLabel}>พลังงานทั้งหมดโดยประมาณ</Text>
              <View style={styles.caloriesRow}>
                <Text style={styles.caloriesValue}>{mealData.calories}</Text>
                <Text style={styles.caloriesUnit}>KCAL</Text>
              </View>
            </View>

            {/* Macro Nutrients */}
            <View style={styles.macrosContainer}>
              <View style={[styles.macroItem, { borderLeftColor: '#3B82F6' }]}>
                <Text style={styles.macroTitle}>โปรตีน (Protein)</Text>
                <Text style={[styles.macroValue, { color: '#60A5FA' }]}>
                  {mealData.protein} <Text style={styles.unitText}>g</Text>
                </Text>
              </View>
              <View style={[styles.macroItem, { borderLeftColor: '#F59E0B' }]}>
                <Text style={styles.macroTitle}>คาร์บ (Carbs)</Text>
                <Text style={[styles.macroValue, { color: '#FBBF24' }]}>
                  {mealData.carbs} <Text style={styles.unitText}>g</Text>
                </Text>
              </View>
              <View style={[styles.macroItem, { borderLeftColor: '#EC4899' }]}>
                <Text style={styles.macroTitle}>ไขมัน (Fat)</Text>
                <Text style={[styles.macroValue, { color: '#F472B6' }]}>
                  {mealData.fat} <Text style={styles.unitText}>g</Text>
                </Text>
              </View>
            </View>

            {/* Trainer Roast Bubble */}
            <View style={styles.roastBubble}>
              <View style={styles.roastHeader}>
                <Text style={styles.roastIcon}>🗣️</Text>
                <Text style={styles.roastAuthor}>คำบ่นจากเทรนเนอร์สายโหด:</Text>
              </View>
              <Text style={styles.roastComment}>"{mealData.roast_comment}"</Text>
            </View>

            {/* Supabase Sync Status */}
            <View style={styles.syncRow}>
              {syncStatus === 'syncing' && (
                <Text style={styles.syncSyncing}>⏳ กำลังบันทึกข้อมูลลง Supabase...</Text>
              )}
              {syncStatus === 'synced' && (
                <Text style={styles.syncSuccess}>✅ ซิงค์เข้าฐานข้อมูล Supabase เรียบร้อย</Text>
              )}
              {syncStatus === 'error' && (
                <Text style={styles.syncError}>⚠️ ซิงค์ข้อมูลเข้า Supabase ไม่สำเร็จ</Text>
              )}
            </View>
          </View>
        )}

        {/* Recent Meals Section */}
        {recentMeals.length > 0 && (
          <View style={styles.historySection}>
            <TouchableOpacity
              style={styles.historyHeader}
              onPress={() => setShowHistory(!showHistory)}
              activeOpacity={0.7}
            >
              <Text style={styles.historyTitle}>📜 ประวัติมื้อที่เคยโดนสวด ({recentMeals.length})</Text>
              <Text style={styles.historyToggle}>{showHistory ? '▲ ย่อ' : '▼ ดู'}</Text>
            </TouchableOpacity>

            {showHistory && (
              <View style={styles.historyList}>
                {recentMeals.map((item, index) => (
                  <View key={item.id || index} style={styles.historyItem}>
                    <View style={styles.historyTop}>
                      <Text style={styles.historyDish}>{item.dish_name}</Text>
                      <Text
                        style={[
                          styles.historyScore,
                          { color: getScoreColor(item.health_score) },
                        ]}
                      >
                        {item.health_score}/10
                      </Text>
                    </View>
                    <Text style={styles.historyCal}>{item.calories} kcal | P: {item.protein}g C: {item.carbs}g F: {item.fat}g</Text>
                    <Text style={styles.historyRoast} numberOfLines={2}>
                      💬 {item.roast_comment}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Gemini API Key Configuration Modal */}
      <Modal
        visible={showKeyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowKeyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔑 ตั้งค่า Gemini API & โมเดล</Text>
            <Text style={styles.modalSubtitle}>
              ระบุ API Key และเลือกโมเดล AI สำหรับประมวลผลรูปภาพอาหาร
            </Text>

            <Text style={styles.inputLabel}>Gemini API Key</Text>
            <TextInput
              style={styles.modalInput}
              value={geminiApiKey}
              onChangeText={setGeminiApiKey}
              placeholder="AIzaSy..."
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.inputLabel}>โมเดลที่ต้องการใช้งาน</Text>
            <View style={styles.modelSelectorRow}>
              <TouchableOpacity
                style={[
                  styles.modelSelectBtn,
                  currentModel === 'gemini-3.8-flash' && styles.modelSelectBtnActive,
                ]}
                onPress={() => {
                  setCurrentModel('gemini-3.8-flash');
                  setSwitchedToLowerModel(false);
                }}
              >
                <Text
                  style={[
                    styles.modelSelectBtnText,
                    currentModel === 'gemini-3.8-flash' && styles.modelSelectBtnTextActive,
                  ]}
                >
                  ⚡ 3.8 Flash (โมเดลหลัก)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modelSelectBtn,
                  currentModel === 'gemini-3.6-flash' && styles.modelSelectBtnActive,
                ]}
                onPress={() => {
                  setCurrentModel('gemini-3.6-flash');
                  setSwitchedToLowerModel(true);
                }}
              >
                <Text
                  style={[
                    styles.modelSelectBtnText,
                    currentModel === 'gemini-3.6-flash' && styles.modelSelectBtnTextActive,
                  ]}
                >
                  🚀 3.6 Flash (โมเดลต่ำกว่า/สำรอง)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Test Simulation Button */}
            <TouchableOpacity
              style={styles.testSimulateBtn}
              onPress={() => {
                setShowKeyModal(false);
                setTimeout(() => {
                  setShow503Modal(true);
                }, 200);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.testSimulateBtnText}>
                🧪 จำลองสถานการณ์ Error 503 (ทดสอบปุ่มถามสลับโมเดล)
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                onPress={() => {
                  setShowKeyModal(false);
                  Alert.alert('บันทึกแล้ว', 'ตั้งค่า API Key และโมเดลเรียบร้อย');
                  const dataToUse = pendingBase64 || imageBase64;
                  if (dataToUse) {
                    Alert.alert(
                      'ต้องการวิเคราะห์รูปภาพทันที?',
                      'คุณมีรูปภาพค้างอยู่ ต้องการส่งให้ Gemini วิเคราะห์ด้วยการตั้งค่าใหม่นี้ทันทีหรือไม่?',
                      [
                        { text: 'ภายหลัง', style: 'cancel' },
                        {
                          text: 'วิเคราะห์ทันที',
                          onPress: () => analyzeMealWithGemini(dataToUse, currentModel),
                        },
                      ]
                    );
                  }
                }}
              >
                <Text style={styles.btnPrimaryText}>บันทึก</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 503 High Traffic Resolution Modal */}
      <Modal
        visible={show503Modal}
        transparent
        animationType="fade"
        onRequestClose={() => setShow503Modal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal503Content}>
            <View style={styles.modal503IconRow}>
              <Text style={styles.modal503Emoji}>🚦</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.modal503Title}>เซิร์ฟเวอร์หนาแน่น (Error 503)</Text>
                <Text style={styles.modal503Badge}>Traffic เต็มชั่วคราว / High Demand</Text>
              </View>
            </View>

            <Text style={styles.modal503Text}>
              ขณะนี้โมเดลหลัก (<Text style={{ color: '#FAFAFA', fontWeight: '700' }}>{currentModel}</Text>) มีผู้ใช้งานพร้อมกันจำนวนมากจนคิวประมวลผลเต็ม (Error 503) คุณต้องการดำเนินการอย่างไร?
            </Text>

            <View style={styles.modal503Options}>
              {/* Option 1: Switch to lower model */}
              <TouchableOpacity
                style={styles.optionBtnPrimary}
                onPress={handleSwitchToLowerModel}
                activeOpacity={0.8}
              >
                <View style={styles.optionHeader}>
                  <Text style={styles.optionIcon}>⚡</Text>
                  <Text style={styles.optionTitle}>เปลี่ยนไปใช้โมเดลที่ต่ำกว่า</Text>
                </View>
                <Text style={styles.optionDesc}>
                  สลับไปใช้ <Text style={{ color: '#FBBF24', fontWeight: '700' }}>Gemini 3.6 Flash</Text> (โมเดลรุ่นรอง ประมวลผลไว รองรับ Traffic ได้สูงกว่า)
                </Text>
                <View style={styles.optionBadgeNotice}>
                  <Text style={styles.optionBadgeNoticeText}>
                    📢 จะระบุชื่อโมเดลนี้ในผลการวิเคราะห์ให้ทราบ
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
                  <Text style={styles.optionIcon}>🔑</Text>
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
              <Text style={styles.cancelBtnText}>✕ ยกเลิก</Text>
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
    backgroundColor: '#121214',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingVertical: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIcon: {
    fontSize: 32,
    marginRight: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F4F4F5',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#A1A1AA',
    marginTop: 2,
  },
  keyBtn: {
    backgroundColor: '#27272A',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  keyBtnText: {
    color: '#E4E4E7',
    fontSize: 12,
    fontWeight: '600',
  },
  imageCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    overflow: 'hidden',
    marginBottom: 16,
  },
  placeholderBox: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FAFAFA',
    textAlign: 'center',
    marginBottom: 6,
  },
  placeholderSub: {
    fontSize: 13,
    color: '#A1A1AA',
    textAlign: 'center',
    marginBottom: 20,
  },
  pickerActions: {
    flexDirection: 'row',
    width: '100%',
  },
  previewContainer: {
    width: '100%',
  },
  previewImage: {
    width: '100%',
    height: 240,
    backgroundColor: '#09090B',
  },
  actionBtnRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  btn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#FF5722',
    flex: 1,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  btnSecondary: {
    backgroundColor: '#27272A',
    flex: 1,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  btnSecondaryText: {
    color: '#F4F4F5',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingCard: {
    backgroundColor: '#18181B',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  loadingText: {
    color: '#F4F4F5',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  resultCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    padding: 16,
    marginBottom: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  dishBadge: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  dishName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  scoreBadge: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: '#121214',
  },
  scoreNumber: {
    fontSize: 22,
    fontWeight: '900',
  },
  scoreMax: {
    fontSize: 10,
    color: '#A1A1AA',
  },
  caloriesBanner: {
    backgroundColor: '#27272A',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  caloriesLabel: {
    color: '#A1A1AA',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  caloriesRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  caloriesValue: {
    color: '#FF7043',
    fontSize: 34,
    fontWeight: '900',
    marginRight: 6,
  },
  caloriesUnit: {
    color: '#FAFAFA',
    fontSize: 14,
    fontWeight: '700',
  },
  macrosContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  macroItem: {
    flex: 1,
    backgroundColor: '#121214',
    padding: 10,
    borderRadius: 10,
    borderLeftWidth: 4,
  },
  macroTitle: {
    fontSize: 11,
    color: '#A1A1AA',
    marginBottom: 4,
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  unitText: {
    fontSize: 12,
    fontWeight: 'normal',
    color: '#71717A',
  },
  roastBubble: {
    backgroundColor: '#2A1810',
    borderColor: '#78350F',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  roastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  roastIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  roastAuthor: {
    color: '#FB923C',
    fontSize: 13,
    fontWeight: '700',
  },
  roastComment: {
    color: '#FED7AA',
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  syncRow: {
    alignItems: 'center',
    paddingTop: 4,
  },
  syncSyncing: {
    color: '#A1A1AA',
    fontSize: 12,
  },
  syncSuccess: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  syncError: {
    color: '#EF4444',
    fontSize: 12,
  },
  historySection: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    padding: 16,
    marginBottom: 20,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyTitle: {
    color: '#FAFAFA',
    fontSize: 14,
    fontWeight: '700',
  },
  historyToggle: {
    color: '#A1A1AA',
    fontSize: 12,
  },
  historyList: {
    marginTop: 12,
    gap: 10,
  },
  historyItem: {
    backgroundColor: '#121214',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyDish: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  historyScore: {
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },
  historyCal: {
    color: '#A1A1AA',
    fontSize: 12,
    marginBottom: 4,
  },
  historyRoast: {
    color: '#D4D4D8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FAFAFA',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#A1A1AA',
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: '#121214',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3F3F46',
    color: '#FAFAFA',
    padding: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D4D4D8',
    marginBottom: 6,
  },
  modelSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modelSelectBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3F3F46',
    backgroundColor: '#121214',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelSelectBtnActive: {
    borderColor: '#FF5722',
    backgroundColor: '#FF572220',
  },
  modelSelectBtnText: {
    fontSize: 12,
    color: '#A1A1AA',
    fontWeight: '600',
    textAlign: 'center',
  },
  modelSelectBtnTextActive: {
    color: '#FF7043',
    fontWeight: '700',
  },
  testSimulateBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B60',
    backgroundColor: '#78350F25',
    alignItems: 'center',
    marginBottom: 16,
  },
  testSimulateBtnText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  modelInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
  },
  modelInfoCardNormal: {
    backgroundColor: '#064E3B20',
    borderColor: '#065F46',
  },
  modelInfoCardFallback: {
    backgroundColor: '#78350F25',
    borderColor: '#D97706',
  },
  modelInfoEmoji: {
    fontSize: 22,
    marginRight: 10,
  },
  modelInfoLabel: {
    fontSize: 11,
    color: '#A1A1AA',
    fontWeight: '600',
  },
  modelInfoValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  modal503Content: {
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  modal503IconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modal503Emoji: {
    fontSize: 34,
    marginRight: 12,
  },
  modal503Title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FEF3C7',
  },
  modal503Badge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
    marginTop: 2,
  },
  modal503Text: {
    fontSize: 13,
    color: '#D4D4D8',
    lineHeight: 20,
    marginBottom: 16,
  },
  modal503Options: {
    gap: 12,
    marginBottom: 16,
  },
  optionBtnPrimary: {
    backgroundColor: '#27272A',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    padding: 14,
  },
  optionBtnSecondary: {
    backgroundColor: '#27272A',
    borderWidth: 1,
    borderColor: '#52525B',
    borderRadius: 14,
    padding: 14,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  optionIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FAFAFA',
  },
  optionDesc: {
    fontSize: 12,
    color: '#A1A1AA',
    lineHeight: 18,
  },
  optionBadgeNotice: {
    marginTop: 8,
    backgroundColor: '#451A03',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  optionBadgeNoticeText: {
    fontSize: 11,
    color: '#FDE68A',
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#A1A1AA',
    fontSize: 13,
    fontWeight: '600',
  },
});
